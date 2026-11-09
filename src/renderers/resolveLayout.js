import { callWorkflow } from '../utils/n8nClient.js';
import { buildHtmxDiv } from './buildHtmxDiv.js';
import { normalizeHtml } from './normalizeHtml.js';

/**
 * @typedef {import('../config.js').AppConfig} AppConfig
 */

// The page frame (layout template, nav menu, nav css) is the same for every request of an app, so it is fetched in ONE server-query call and
// kept for a minute (task 815): three sequential calls cost ~360 ms per page. The minute matches loadAppConfig, so a nav or layout edit shows
// within a minute without a restart. Only valid while <schema>.tf_nav_menu_html() is global (support, home_desk: vw_nav_menus has no per-user
// rule). A schema whose nav depends on the user (studio's vw_nav_menus reads app.current_email / c_getval) must not use this cache.
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FRAME_TTL_MS = 60000;
const frameCache = new Map();

export function clearLayoutCache() {
  frameCache.clear();
}

async function fetchFrame(schema, layoutTemplateName, navCssClass) {
  const rows = await callWorkflow('server-query', {
    query: `SELECT (SELECT html FROM ${schema}.html_templates WHERE name = :layout_name) AS html,
                   ${schema}.tf_nav_menu_html() AS nav_html,
                   app_engine.f_css('${schema}', :nav_css_class) AS css`,
    params: { layout_name: layoutTemplateName, nav_css_class: navCssClass },
    source: 'server'
  });
  const row = (Array.isArray(rows) && rows[0]) || {};
  return {
    layoutHtml: normalizeHtml(row.html || ''),
    navHtml: normalizeHtml(row.nav_html || ''),
    navCss: row.css ? `<style>\n${row.css}\n</style>` : ''
  };
}

// Cached per (schema, layout, nav css). Concurrent requests share one in-flight fetch; a failed fetch is not cached.
function loadFrame(schema, layoutTemplateName, navCssClass) {
  const key = `${schema}|${layoutTemplateName}|${navCssClass}`;
  const hit = frameCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.frame;
  const frame = fetchFrame(schema, layoutTemplateName, navCssClass);
  frameCache.set(key, { frame, expires: Date.now() + FRAME_TTL_MS });
  frame.catch(() => { if (frameCache.get(key)?.frame === frame) frameCache.delete(key); });
  return frame;
}

/**
 * @param {object[]} components
 * @param {AppConfig} config
 */
export async function resolveLayout(components, config) {
  const { schema, layoutTemplateName, navCssClass } = config;
  if (!IDENT.test(schema || '')) throw new Error('resolveLayout needs an AppConfig with a plain schema name');

  const { layoutHtml, navHtml, navCss } = await loadFrame(schema, layoutTemplateName, navCssClass);

  const navBarWithCss = navCss + '\n' + navHtml;

  const appbarComponent = components.find(c => c.comp_name === 'appbar');
  const appbarHtml = appbarComponent ? buildHtmxDiv(appbarComponent) : '';
  const combinedAppbar = appbarHtml + '\n' + navBarWithCss;

  return layoutHtml.replace('{{slot:appbar}}', combinedAppbar);
}
