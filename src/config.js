/**
 * @typedef {Object} AppConfig
 * @property {string} schema - Postgres schema holding html_templates/css/etc for this app (e.g. "studio").
 * @property {string} source - literal passed to the hydrate-guide n8n workflow as `source` (e.g. "wf-server").
 * @property {string} loginPath - redirect target when no session email is present (e.g. "/login").
 * @property {string} usersTable - schema-qualified users table for the must_change_password check (e.g. "whatsfresh.users").
 * @property {string} publicShellTemplate - template name for the public-page shell (e.g. "shell-public").
 * @property {string} changePasswordPageName - route's page_name that triggers the change-password render path.
 * @property {string} changePasswordTemplate - template name for the change-password form.
 * @property {string} appbarTemplate - template name for the synthetic appbar component (e.g. "wf_appbar").
 * @property {string} layoutTemplateName - html_templates row holding the page layout shell (e.g. "wf_layout").
 * @property {string} navCssClass - studio.css row class supplying the nav bar's styles (e.g. "appbar-nav").
 * @property {string[]} [extraScripts] - raw JS strings a consuming app injects into wrapHtml's inline
 *   script bundle for app-specific behavior the generic engine intentionally does not carry
 *   (e.g. WhatsFresh's Best-By-Date auto-calc, previously baked into popActions.js).
 *
 * This is the JS-side mirror of what an app_engine.apps row describes. Whether these should
 * eventually live in app_engine.apps.data (jsonb) instead of being assembled in a consuming
 * app's own code is an open follow-up, not decided yet - no second app exists to know what's
 * actually needed beyond what wf-server's own values would be.
 */

export {};
