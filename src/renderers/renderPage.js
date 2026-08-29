import { callWorkflow } from '../utils/n8nClient.js';
import { wrapHtml } from './wrapHtml/index.js';
import { normalizeHtml } from './normalizeHtml.js';
import { resolveLayout } from './resolveLayout.js';
import { hydrateSlots } from './hydrateSlots.js';
import { buildCrudButtons } from './buildCrudButtons.js';

/**
 * @typedef {import('../config.js').AppConfig} AppConfig
 */

/**
 * Builds a renderPage Express middleware + setRoutes pair bound to one app's
 * config. Each app gets its own cachedRoutes closure - no shared module state
 * across apps in the same process.
 *
 * @param {AppConfig} config
 */
export function createRenderPage(config) {
  const {
    schema,
    source,
    loginPath,
    usersTable,
    publicShellTemplate,
    changePasswordPageName,
    changePasswordTemplate,
    appbarTemplate
  } = config;

  let cachedRoutes = [];

  function setRoutes(routes) {
    cachedRoutes = routes;
  }

  async function renderPage(req, res, next) {
    const email = req.session?.current_user_email;
    const route = req.path;

    if (route === '/favicon.ico' || route === '/health') return next();

    const routeInfo = cachedRoutes.find(r => r.route === route);
    if (!routeInfo) return next();

    if (routeInfo.group_name === 'public') {
      const shell = await callWorkflow('hydrate-guide', {
        template_name: publicShellTemplate, source, format: 'html'
      });
      const formTemplate = routeInfo.page_name + '_form';
      const form = await callWorkflow('hydrate-guide', {
        template_name: formTemplate, source, format: 'html'
      });

      const titleResult = await callWorkflow('server-query', {
        query: `SELECT title FROM ${schema}.html_templates WHERE name = '${formTemplate}'`,
        params: {},
        source: 'server'
      });
      const title = Array.isArray(titleResult) ? titleResult[0]?.title || '' : '';

      const shellHtml = normalizeHtml(shell);
      const formHtml = normalizeHtml(form);
      const combined = shellHtml
        .replace('{{slot:title}}', title)
        .replace('{{slot:form}}', formHtml);
      return res.send(wrapHtml(routeInfo.page_name, combined, config));
    }

    if (!email) return res.redirect(loginPath);

    if (route !== '/change-password') {
      try {
        const flagResult = await callWorkflow('server-query', {
          query: `SELECT must_change_password FROM ${usersTable} WHERE email = '${email.replace(/'/g, "''")}'`,
          params: {},
          source: 'server'
        });
        const flagRow = Array.isArray(flagResult) ? flagResult[0] : flagResult;
        if (flagRow?.must_change_password) {
          return res.redirect('/change-password');
        }
      } catch (e) {
        // Non-fatal: if the check itself fails, don't block the whole app on it.
      }
    }

    if (routeInfo.page_name === changePasswordPageName) {
      const shell = await callWorkflow('hydrate-guide', {
        template_name: publicShellTemplate, source, format: 'html'
      });
      const form = await callWorkflow('hydrate-guide', {
        template_name: changePasswordTemplate, source, format: 'html'
      });
      const shellHtml = normalizeHtml(shell);
      const formHtml = normalizeHtml(form);
      const combined = shellHtml
        .replace('{{slot:title}}', 'Change Password')
        .replace('{{slot:form}}', formHtml);
      return res.send(wrapHtml(routeInfo.page_name, combined, config));
    }

    try {
      await callWorkflow('setvals', {
        email,
        vals: [{ param_name: 'page_id', param_val: String(routeInfo.page_id) }]
      });
    } catch (e) {
      return res.status(500).send('Failed to set page context');
    }

    let pageInfo, components, slotActions;
    try {
      const structure = await callWorkflow('page-structure', { email });
      pageInfo = structure?.pageInfo;
      components = structure?.components || [];
      slotActions = structure?.slotActions || structure?.pageInfo?.slotActions || {};
      if (!pageInfo?.templateName) {
        return res.status(404).send('Page template not found');
      }

      components.unshift({
        comp_name: 'appbar',
        template_name: appbarTemplate,
        slot_name: 'appbar',
        page_id: pageInfo.pageID,
        page_title: pageInfo.pageTitle,
        actions: {
          click: [
            {
              action: 'clearvals',
              clear_all: true
            },
            {
              action: 'redirect',
              payload: { url: loginPath }
            }
          ]
        }
      });
    } catch (e) {
      return res.status(500).send('Failed to fetch page structure');
    }

    const templateResult = await callWorkflow('hydrate-guide', {
      template_name: pageInfo.templateName, source, email
    });
    let pageHtml = normalizeHtml(templateResult);

    // Inject CRUD buttons if page is crud type
    const crudButtonsHtml = buildCrudButtons(pageInfo);
    if (crudButtonsHtml) {
      pageHtml = pageHtml.split('{{slot:page-buttons}}').join(crudButtonsHtml);
    } else {
      pageHtml = pageHtml.split('{{slot:page-buttons}}').join('');
    }

    pageHtml = await hydrateSlots(pageHtml, components, slotActions, email);

    let layoutHtml = await resolveLayout(components, config);
    layoutHtml = layoutHtml.replace('{{slot:page}}', pageHtml);

    res.set('Cache-Control', 'no-store');
    const pageMetaScript = `<script>window.__pageContext = { pageId: ${pageInfo.pageID}, contextKey: "${pageInfo.contextKey || 'id'}", form: "${pageInfo.formTemplate || ''}", hideCrud: ${pageInfo.hideCrud || false} };</script>`;
    res.send(wrapHtml(pageInfo.pageTitle || pageInfo.pageName, pageMetaScript + layoutHtml, config));
  }

  return { renderPage, setRoutes };
}
