// OPTIONAL host-aware runner (Sprint 419) - NOT the deployment model.
//
// DECISION 2026-09-08 (Paul): the deployment model is Model 1 - each app
// (support-app on :3002, a future admin-app on :3003, ...) is its own thin
// repo + own port + own Caddy vhost, and imports app-engine as a LIBRARY
// (createRenderPage, resolveLayout, buildHtmxDiv, ...). app-engine itself is
// a package with no port and no droplet process. "app-engine processes their
// requests" means each app runs app-engine's code in-process, not that
// app-engine runs standalone.
//
// This file is a convenience for local dev / smoke-testing the library
// without standing up a real per-app repo: it resolves the app from the
// request hostname (app_engine.apps row) and renders it generically. It is
// the Model-2 (one shared process, apps-as-data) shape, kept available but
// intentionally NOT deployed. Do not add it to pm2/Caddy without revisiting
// the Model 1 vs Model 2 decision.
import express from 'express';
import {
  createRenderPage,
  loadAppConfig,
  callWorkflow
} from './src/index.js';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// For local dev there is no real vhost, so a Host header of localhost maps to
// this app. In production the real hostname (support.whatsfresh.app) resolves
// directly. Never used when a request carries a known app domain.
const DEFAULT_HOST = process.env.DEFAULT_APP_HOST || 'support.whatsfresh.app';

// Per-app bound renderers, keyed by schema, built lazily on first request.
const apps = new Map(); // schema -> { renderPage, config }

async function getApp(host) {
  const config = await loadAppConfig(host) || await loadAppConfig(DEFAULT_HOST);
  if (!config) return null;
  if (apps.has(config.schema)) return apps.get(config.schema);

  const { renderPage, setRoutes } = createRenderPage(config);

  // Routes are DATA: one per {schema}.pages row. No route column today, so the
  // route is derived from page_name (agile-board -> /agile-board).
  const pages = await callWorkflow('server-query', {
    query: `SELECT id AS page_id, page_name,
                   COALESCE(group_name, '') AS group_name
              FROM ${config.schema}.pages
             WHERE deleted_at IS NULL`,
    params: {},
    source: 'server'
  });
  const routes = (Array.isArray(pages) ? pages : [])
    .filter(p => p.page_name)
    .map(p => ({
      route: '/' + p.page_name,
      page_id: p.page_id,
      page_name: p.page_name,
      group_name: p.group_name
    }));
  setRoutes(routes);

  const bound = { renderPage, config, routes };
  apps.set(config.schema, bound);
  return bound;
}

app.get('/health', (req, res) => res.send('ok'));

// Generic hydrate: template render/data for a single component. Returns finished
// HTML (app-hydrate-guide -> app-styled-html). Context params ride in the body.
app.post('/api/hydrate', async (req, res) => {
  const bound = await getApp(req.hostname);
  if (!bound) return res.status(404).type('text').send('No app for host');
  const { template_name, ...contextParams } = req.body || {};
  if (!template_name) return res.status(400).type('text').send('template_name required');
  try {
    // Forward everything except template_name (schema/source are engine-owned).
    // page_id/page_title are legitimate hydrate params - the appbar binds
    // :page_title for its title, and page-scoped templates bind :page_id -
    // so they must reach app-hydrate-guide's :name binder, not be stripped.
    const result = await callWorkflow('app-hydrate-guide', {
      schema: bound.config.schema,
      source: bound.config.source,
      template_name,
      ...contextParams
    });
    const html = Array.isArray(result) ? (result[0]?.html || '') : (result?.html || result || '');
    res.type('html').send(html);
  } catch (err) {
    console.error('[hydrate] failed', err);
    res.status(500).type('text').send('Hydration failed: ' + err.message);
  }
});

// Generic write path: app-engine-actions wraps app_engine.dml() for any app.
app.post('/api/dml', async (req, res) => {
  const bound = await getApp(req.hostname);
  if (!bound) return res.status(404).json({ success: false, error: 'No app for host' });
  const { page_id, mode, record_id, ...fields } = req.body || {};
  if (!page_id || !mode) return res.json({ success: false, error: 'page_id and mode required' });
  try {
    const result = await callWorkflow('app-engine-actions', {
      schema: bound.config.schema,
      page_id: Number(page_id),
      mode,
      data: fields,
      pk_val: record_id ? Number(record_id) : null,
      user: 'paul'
    });
    res.json(result);
  } catch (err) {
    console.error('[dml] failed', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Everything else: the generic page renderer, resolved per-host.
app.use(async (req, res, next) => {
  const bound = await getApp(req.hostname);
  if (!bound) return res.status(404).type('text').send('No app for host: ' + req.hostname);
  if (req.path === '/') return res.redirect(bound.config.loginPath || '/');
  return bound.renderPage(req, res, next);
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`app-engine server listening on ${PORT} (default host ${DEFAULT_HOST})`));
