import { callWorkflow } from './utils/n8nClient.js';
import { ENGINE_SOURCE } from './config.js';

// Resolves an app's AppConfig from the app_engine.apps registry by request
// hostname - the DB is the source of truth, not a per-app JS file. One server
// hosts many apps: hostname -> apps row -> config -> renderPage.
// Columns supply schema_name/domain; the remaining fields live in apps.data.

const REQUIRED_DATA_KEYS = ['layoutTemplateName', 'navCssClass', 'loginPath'];
const CACHE_TTL_MS = 60000;
const cache = new Map();

function stripPort(host) {
  return String(host || '').split(':')[0].toLowerCase();
}

export function clearAppConfigCache() {
  cache.clear();
}

export async function loadAppConfig(host) {
  const domain = stripPort(host);
  if (!domain) return null;

  const cached = cache.get(domain);
  if (cached && cached.expires > Date.now()) return cached.config;

  const rows = await callWorkflow('server-query', {
    query: `SELECT app_key, schema_name, domain, data
              FROM app_engine.apps
             WHERE domain = :domain AND deleted_at IS NULL
             LIMIT 1`,
    params: { domain },
    source: 'server'
  });

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || !row.app_key) return null;

  const data = row.data || {};
  const missing = REQUIRED_DATA_KEYS.filter(k => !data[k]);
  if (missing.length > 0) {
    throw new Error(`app_engine.apps[${row.app_key}].data is missing required AppConfig keys: ${missing.join(', ')}`);
  }

  const config = {
    appKey: row.app_key,
    schema: row.schema_name,
    domain: row.domain,
    source: data.source || ENGINE_SOURCE,
    layoutTemplateName: data.layoutTemplateName,
    navCssClass: data.navCssClass,
    loginPath: data.loginPath,
    ...(data.usersTable ? { usersTable: data.usersTable } : {}),
    ...(data.publicShellTemplate ? { publicShellTemplate: data.publicShellTemplate } : {}),
    ...(data.changePasswordPageName ? { changePasswordPageName: data.changePasswordPageName } : {}),
    ...(data.changePasswordTemplate ? { changePasswordTemplate: data.changePasswordTemplate } : {}),
    ...(data.appbarTemplate ? { appbarTemplate: data.appbarTemplate } : {}),
    ...(Array.isArray(data.extraScripts) ? { extraScripts: data.extraScripts } : {}),
    ...(data.noAuth ? { noAuth: true } : {})
  };

  cache.set(domain, { config, expires: Date.now() + CACHE_TTL_MS });
  return config;
}
