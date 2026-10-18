// Page routes are DATA (guidance 36): one row per page in <schema>.vw_pages, one catch-all handler, no per-page code.
// loadRoutes(config) reads that view and returns the list createRenderPage's setRoutes() expects. Call it once at startup (a new page row
// needs a restart), then:  const { renderPage, setRoutes } = createRenderPage(config); setRoutes(await loadRoutes(config));
import { callWorkflow } from './utils/n8nClient.js';

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export async function loadRoutes(config) {
  if (!config?.schema || !IDENT.test(config.schema)) throw new Error('loadRoutes needs an AppConfig with a plain schema name');
  const rows = await callWorkflow('server-query', {
    query: `SELECT route_path AS route, page_name, page_id, group_name FROM ${config.schema}.vw_pages ORDER BY group_name, page_name`,
    params: {},
    source: 'server'
  });
  return Array.isArray(rows) ? rows : [];
}
