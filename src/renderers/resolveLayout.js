import { callWorkflow } from '../utils/n8nClient.js';
import { buildHtmxDiv } from './buildHtmxDiv.js';
import { normalizeHtml } from './normalizeHtml.js';

/**
 * @typedef {import('../config.js').AppConfig} AppConfig
 */

/**
 * @param {object[]} components
 * @param {AppConfig} config
 */
export async function resolveLayout(components, config) {
  const { schema, layoutTemplateName, navCssClass } = config;

  const layoutTemplate = await callWorkflow('server-query', {
    query: `SELECT html FROM ${schema}.html_templates WHERE name = '${layoutTemplateName}'`,
    params: {},
    source: 'server'
  });
  let layoutHtml = normalizeHtml(
    (Array.isArray(layoutTemplate) && layoutTemplate[0]?.html)
      ? layoutTemplate[0].html
      : ''
  );

  const navMenuResult = await callWorkflow('server-query', {
    query: `SELECT ${schema}.tf_nav_menu_html() as nav_html`,
    params: {},
    source: 'server'
  });
  const navHtml = normalizeHtml(
    (Array.isArray(navMenuResult) && navMenuResult[0]?.nav_html)
      ? navMenuResult[0].nav_html
      : ''
  );

  const navCssResult = await callWorkflow('server-query', {
    query: `SELECT app_engine.f_css('${schema}', '${navCssClass}') as css`,
    params: {},
    source: 'server'
  });
  const navCss = (Array.isArray(navCssResult) && navCssResult[0]?.css)
    ? `<style>\n${navCssResult[0].css}\n</style>`
    : '';

  const navBarWithCss = navCss + '\n' + navHtml;

  const appbarComponent = components.find(c => c.comp_name === 'appbar');
  const appbarHtml = appbarComponent ? buildHtmxDiv(appbarComponent) : '';
  const combinedAppbar = appbarHtml + '\n' + navBarWithCss;

  layoutHtml = layoutHtml.replace('{{slot:appbar}}', combinedAppbar);

  return layoutHtml;
}
