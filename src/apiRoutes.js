// Shared server routes every app-engine app needs (task 598): POST /api/hydrate, /api/dml, /api/report.
//
// Before this, each app carried its own copy (support-app, the library runner, the consulting viewer). One copy lives here.
// createApiRoutes(config, options) returns PLAIN (req, res) handlers plus mount(app), so it does not care which Express version the app runs
// (support-app is on Express 4, the library on 5). The app still owns body parsing: app.use(express.json()) before mounting.
//
// Safety, learned from the copies: the browser sends its whole context store with every request, so engine-owned keys (schema, source, user) are
// written AFTER the client's values and can never be overridden; template names and modes are validated before anything reaches n8n.
//
//   const api = createApiRoutes(config, { getUser: req => 'paul' });   // getUser is optional
//   api.mount(app);                                                    // or: app.post('/api/hydrate', api.hydrate) ...
//
// Hydrate renderer (task 853). Default 'n8n': the app-hydrate-guide workflow, whose renderer is string substitution: one {{#each data}},
// flat {{#if}}, unescaped {{field}}, plus {{{tpl:field}}} select tokens, {{slot:...}} pass-through and group_by header rows.
// renderer: 'handlebars' runs the template's own hydrate SQL through server-query and compiles the styled HTML with Handlebars (nested
// #if / #each / #unless / else, {{field}} HTML-escaped), the way support-app and home-desk hydrate today. It does NOT expand {{{tpl:...}}}
// tokens or group_by rows, so an app opts in only when its templates are written for it.
import Handlebars from 'handlebars';
import { callWorkflow } from './utils/n8nClient.js';

const NAME = /^[A-Za-z0-9_-]+$/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MODES = new Set(['INSERT', 'UPDATE', 'DELETE']);
const RENDERERS = new Set(['n8n', 'handlebars']);

const serverQuery = (query, params) => callWorkflow('server-query', { query, params, source: 'server' });
const firstRow = (r) => (Array.isArray(r) ? r[0] : null);

// server-query answers a query that found nothing with [{}] (one empty object); treat that as no rows.
const rowsOf = (r) => {
  const rows = Array.isArray(r) ? r : [];
  return rows.length === 1 && rows[0] && Object.keys(rows[0]).length === 0 ? [] : rows;
};

// Handlebars hydrate: the template's hydrate SQL (bound by server-query) + app_engine.f_html_styled, compiled with Handlebars.
async function renderHandlebars(schema, template_name, params) {
  const hydrateSql = firstRow(await serverQuery(`SELECT hydrate FROM ${schema}.html_templates WHERE name = :template_name`, { template_name }))?.hydrate;
  const styledHtml = firstRow(await serverQuery(`SELECT app_engine.f_html_styled('${schema}', :template_name) AS html`, { template_name }))?.html;
  if (!styledHtml) return `<div class="hydrate-pending">No template named ${template_name}.</div>`;
  let data = [{}];
  if (hydrateSql) {
    const bound = { ...params };
    // Add New sends mode INSERT but the context store still holds the last clicked row's id: drop it so the form starts blank.
    if (bound.mode === 'INSERT') bound.id = null;
    // Any :param the SQL names that the request did not send is bound to NULL, like the n8n binder (casts such as ::int are skipped).
    for (const m of hydrateSql.matchAll(/(?<![:\w]):([A-Za-z_]\w*)/g)) if (bound[m[1]] === undefined) bound[m[1]] = null;
    data = rowsOf(await serverQuery(hydrateSql, bound));
    if (bound.mode === 'INSERT' && data.length === 0) data = [{}];
  }
  // The first row's fields also sit at the top level (as in the n8n renderer), e.g. an appbar's {{title}}.
  return Handlebars.compile(styledHtml)({ ...(data[0] || {}), data });
}

// Who is acting: only a VERIFIED identity counts. req.accessUser is set by createAccessGuard (the signed Cloudflare Access token); a raw
// Cf-Access-Authenticated-User-Email header is never trusted because anyone who reaches the origin directly can forge it. Else 'system'.
const defaultGetUser = (req) => req.accessUser || 'system';

const htmlOf = (r) => Array.isArray(r) ? (r[0]?.html || '') : (r?.html || (typeof r === 'string' ? r : ''));

export function createApiRoutes(config, options = {}) {
  if (!config?.schema) throw new Error('createApiRoutes needs an AppConfig with a schema');
  const getUser = options.getUser || defaultGetUser;
  const renderer = options.renderer || 'n8n';
  if (!RENDERERS.has(renderer)) throw new Error(`createApiRoutes: renderer must be 'n8n' or 'handlebars' (got ${JSON.stringify(renderer)})`);
  if (renderer === 'handlebars' && !IDENT.test(config.schema)) throw new Error('createApiRoutes: the handlebars renderer needs a plain schema name');
  const engine = { schema: config.schema, source: config.source };
  const fail = (res, status, text) => res.status(status).type('text').send(text);

  // One template, hydrated and styled (by the app-hydrate-guide workflow, or Handlebars when opted in). Context values (id, mode, filters...)
  // ride in the body.
  async function hydrate(req, res) {
    const { template_name, ...context } = req.body || {};
    if (!template_name) return fail(res, 400, 'template_name required');
    if (!NAME.test(template_name)) return fail(res, 400, 'invalid template_name');
    try {
      // user lets a template show who is signed in (:user); like schema/source it is engine-owned, the client cannot set it.
      if (renderer === 'handlebars') {
        const { schema, source, ...clientParams } = context;
        return res.type('html').send(await renderHandlebars(engine.schema, template_name, { ...clientParams, user: getUser(req) }));
      }
      const result = await callWorkflow('app-hydrate-guide', { ...context, ...engine, template_name, user: getUser(req) });
      res.type('html').send(htmlOf(result));
    } catch (err) {
      console.error('[api/hydrate]', template_name, err.message);
      fail(res, 500, 'Hydrate failed');
    }
  }

  // Generic write path: { page_id, mode, record_id, ...fields } -> app_engine.dml via the app-engine-actions workflow.
  async function dml(req, res) {
    const { page_id, mode, record_id, ...fields } = req.body || {};
    const pageId = Number(page_id);
    if (!Number.isInteger(pageId) || pageId <= 0 || !MODES.has(mode)) {
      return res.status(400).json({ success: false, error: 'page_id and a valid mode (INSERT, UPDATE, DELETE) required' });
    }
    const pk = record_id === undefined || record_id === null || record_id === '' ? null : Number(record_id);
    if (pk !== null && !Number.isInteger(pk)) return res.status(400).json({ success: false, error: 'record_id must be an integer' });
    try {
      res.json(await callWorkflow('app-engine-actions', { schema: engine.schema, page_id: pageId, mode, data: fields, pk_val: pk, user: getUser(req) }));
    } catch (err) {
      console.error('[api/dml]', err.message);
      res.status(500).json({ success: false, error: 'Save failed' });
    }
  }

  // Reports: the report modal posts { templates: [...], ...context }; each report template is hydrated and the HTML is joined in order.
  async function report(req, res) {
    const { templates, ...context } = req.body || {};
    if (!Array.isArray(templates) || templates.length === 0) return fail(res, 400, 'templates array required');
    if (!templates.every((t) => typeof t === 'string' && NAME.test(t))) return fail(res, 400, 'invalid template name');
    try {
      const parts = await Promise.all(templates.map(async (template_name) => htmlOf(await callWorkflow('app-hydrate-guide', { ...context, ...engine, template_name }))));
      res.type('html').send(parts.join(''));
    } catch (err) {
      console.error('[api/report]', templates.join(','), err.message);
      fail(res, 500, 'Report generation failed');
    }
  }

  function mount(app) {
    app.post('/api/hydrate', hydrate);
    app.post('/api/dml', dml);
    app.post('/api/report', report);
    return app;
  }

  return { hydrate, dml, report, mount };
}
