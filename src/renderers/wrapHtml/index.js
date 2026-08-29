import { actionEngineCode } from './actionEngine.js';
import { actionHandlersCode } from './actionHandlers.js';
import { gridActionsCode } from './gridActions.js';
import { selectActionsCode } from './selectActions.js';
import { formActionsCode } from './formActions.js';
import { reportActionsCode } from './reportActions.js';
import { popActionsCode } from './popActions.js';
import { workerPickerCode } from './workerPicker.js';
import { formHydrationCode } from './formHydration.js';

/**
 * @typedef {import('../../config.js').AppConfig} AppConfig
 */

/**
 * @param {string} title
 * @param {string} body
 * @param {AppConfig} [config] - config.extraScripts (array of raw JS strings)
 *   lets a consuming app inject app-specific snippets (e.g. WhatsFresh's
 *   Best-By-Date auto-calc) without editing engine source.
 */
export function wrapHtml(title, body, config = {}) {
  const { extraScripts = [], loginPath = '/login' } = config;

  const styleRegex = /<style[^>]*>[\s\S]*?<\/style>/gi;
  const styles = [];

  const fallbackUiStyles = `<style></style>`;

  let match;
  while ((match = styleRegex.exec(body)) !== null) {
    styles.push(match[0]);
  }
  const cleanBody = body.replace(styleRegex, '');

  const inlineScript = `
    (() => {
      ${actionEngineCode}
      ${formHydrationCode}
      ${actionHandlersCode}
      ${gridActionsCode}
      ${selectActionsCode}
      ${formActionsCode}
      ${reportActionsCode}
      ${popActionsCode}
      ${workerPickerCode}
      ${extraScripts.join('\n')}

      // Build CRUD buttons dynamically from __pageContext
      document.addEventListener('DOMContentLoaded', () => {
        const ctx = window.__pageContext;
        const container = document.getElementById('crud_buttons');

        if (container && ctx?.form && !ctx.hideCrud) {
          const wrapper = document.createElement('div');
          wrapper.className = 'wf-slot-actions wf-context-btn-group';

          const addBtn = document.createElement('button');
          addBtn.type = 'button';
          addBtn.className = 'wf-slot-action-btn';
          addBtn.textContent = 'Add New';
          addBtn.addEventListener('click', () => {
            window.contextStore = { ...(window.contextStore || {}), mode: 'INSERT', [ctx.contextKey]: null };
            const panel = document.getElementById('inline_form_panel');
            const formContainer = document.getElementById('inline_form_container');
            if (!panel || !formContainer) return;
            fetch('/api/hydrate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ template_name: ctx.form, mode: 'INSERT', ...(window.contextStore || {}) })
            }).then(r => r.text()).then(html => {
              formContainer.innerHTML = html;
              if (window.htmx) window.htmx.process(formContainer);
              applyModeVisibility(formContainer, 'INSERT');
              hydrateEmbeddedDropdowns(formContainer);
              const form = formContainer.querySelector('form');
              if (form) form.id = 'inline_form_element';
              const titleEl = document.getElementById('inline_form_title');
              if (titleEl) titleEl.textContent = 'INSERT ' + ctx.form.replace(/_form$/, '').replace(/_/g, ' ');
              panel.classList.remove('hidden');
            });
          });

          wrapper.appendChild(addBtn);
          container.appendChild(wrapper);
        }

        // Delete now lives as a static button inside the form panel's own
        // action bar (left of Save) instead of the top toolbar - it only
        // ever acts on the single record currently loaded in the form.
        const delBtn = document.getElementById('inline_form_delete');
        if (delBtn && ctx) {
          delBtn.addEventListener('click', async () => {
            const pkVal = window.contextStore?.[ctx.contextKey];
            if (!pkVal) { alert('Please select a row to delete'); return; }
            if (!confirm('Delete this record?')) return;
            const response = await fetch('/api/dml', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ page_id: ctx.pageId, mode: 'DELETE', f_id: pkVal })
            });
            const result = await response.json();
            if (result.success) window.location.reload();
            else alert(result.error || 'Delete failed');
          });
        }
      });
    })();
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'WhatsFresh'}</title>
  <script src="https://unpkg.com/htmx.org@1.9.10"></script>
  <script>
    // Global loading indicator
    (() => {
      const overlay = document.createElement('div');
      overlay.className = 'wf-loading-overlay';
      overlay.innerHTML = '<div class="wf-spinner"></div>';
      document.addEventListener('DOMContentLoaded', () => document.body.appendChild(overlay));

      let activeRequests = 0;
      const show = () => { activeRequests++; overlay.classList.add('active'); };
      const hide = () => { activeRequests = Math.max(0, activeRequests - 1); if (activeRequests === 0) overlay.classList.remove('active'); };

      // A 401 from any session-gated /api/ route means the session died
      // server-side (e.g. a restart dropped it) - bounce to login instead of
      // letting callers show a raw "Unauthorized" alert or render the plain
      // text body into a form. /auth/login itself returns 401 for a normal
      // wrong-password attempt, which is not a dead session, so it's exempt.
      const redirectOn401 = (url, status) => {
        if (status === 401 && !url.includes('/auth/login')) {
          window.location.href = ${JSON.stringify(loginPath)};
          return true;
        }
        return false;
      };

      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (url.startsWith('/api/')) {
          show();
          return originalFetch.apply(this, args).then(response => {
            if (redirectOn401(url, response.status)) {
              return new Promise(() => {}); // navigating away, never resolve
            }
            return response;
          }).finally(hide);
        }
        return originalFetch.apply(this, args);
      };

      // Also cover htmx requests
      document.addEventListener('htmx:beforeRequest', show);
      document.addEventListener('htmx:afterRequest', hide);
      document.addEventListener('htmx:responseError', (e) => {
        hide();
        const xhr = e.detail?.xhr;
        if (xhr) redirectOn401(e.detail?.pathInfo?.requestPath || '', xhr.status);
      });
    })();

    ${inlineScript}
  </script>
  ${fallbackUiStyles}
  ${styles.join('\n')}
</head>
<body>
  ${cleanBody}
</body>
</html>`;
}
