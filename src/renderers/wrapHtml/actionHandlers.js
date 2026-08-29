export const actionHandlersCode = `
      window.__actionHandlers = async (resolvedAction, ctx) => {
        const { rowData, elementContext, wrapper, event, getActionValue, applySwap, refreshComponents } = ctx;
        const actionName = String(resolvedAction.action || '').toLowerCase();

        // --- setVals (always runs, then falls through to server action) ---
        if (actionName === 'setvals') {
          const nextValues = resolvedAction.values || resolvedAction.vals || {};
          if (nextValues && typeof nextValues === 'object' && !Array.isArray(nextValues)) {
            window.contextStore = {
              ...(window.contextStore || {}),
              ...nextValues
            };
          }
          // Always fall through to server action to persist via /api/actions
        }

        // --- conditional_setVals ---
        if (actionName === 'conditional_setvals') {
          const fieldVal = resolvedAction.field
            ? (window.contextStore?.[resolvedAction.field] ?? rowData[resolvedAction.field] ?? '')
            : '';
          const isEmpty = fieldVal === '' || fieldVal === null || fieldVal === undefined || fieldVal === 'null';
          const valuesToSet = isEmpty ? resolvedAction.then : resolvedAction.else;
          if (valuesToSet && typeof valuesToSet === 'object') {
            window.contextStore = {
              ...(window.contextStore || {}),
              ...valuesToSet
            };
          }
          return 'handled';
        }

        // --- open_modal ---
        if (resolvedAction.action === 'open_modal') {
          const formTemplate = resolvedAction.form_template;
          const actionValues = resolvedAction.values || {};
          const hydrateData = { ...(window.contextStore || {}), ...elementContext, ...actionValues };
          if (window.formModal && formTemplate) {
            window.formModal.open(formTemplate, hydrateData);
          }
          return 'handled';
        }

        // --- open_inline_form ---
        if (resolvedAction.action === 'open_inline_form') {
          const formTemplate = resolvedAction.form_template;
          const actionValues = resolvedAction.values || {};
          const hydrateData = { ...(window.contextStore || {}), ...elementContext, ...actionValues };
          const panel = document.getElementById('inline_form_panel');
          const container = document.getElementById('inline_form_container');
          if (!panel || !container || !formTemplate) return 'handled';

          const response = await fetch('/api/hydrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template_name: formTemplate, ...hydrateData })
          });

          const formHtml = await response.text();
          container.innerHTML = formHtml;

          if (window.htmx) window.htmx.process(container);

          const mode = hydrateData.mode || window.contextStore?.mode || 'INSERT';
          applyModeVisibility(container, mode);
          hydrateEmbeddedDropdowns(container);

          const form = container.querySelector('form');
          if (form) form.id = 'inline_form_element';

          // Set title
          const headerField = container.querySelector('[data-header-field="true"]');
          const headerValue = headerField?.value || headerField?.textContent || '';
          let title = headerValue.trim()
            ? mode + ' ' + headerValue.trim()
            : mode + ' ' + formTemplate.replace(/_form$/, '').replace(/_/g, ' ');
          const titleEl = document.getElementById('inline_form_title');
          if (titleEl) titleEl.textContent = title;

          panel.classList.remove('hidden');

          // Initialize worker picker if present
          if (container.querySelector('#worker_checkboxes') && typeof initWorkerPicker === 'function') {
            initWorkerPicker();
          }
          return 'handled';
        }

        // --- show_element ---
        if (resolvedAction.action === 'show_element') {
          const el = document.getElementById(resolvedAction.target);
          if (el) el.style.display = resolvedAction.style || 'inline-flex';
          return 'handled';
        }

        // --- hide_element ---
        // Uses classList('hidden'), matching inline_form_panel's own close button
        // (formActions.js ".inline-form-close" handler) and open_inline_form's
        // classList.remove('hidden') - not style.display, which would fight with
        // that class-based convention on the next open.
        if (resolvedAction.action === 'hide_element') {
          const el = document.getElementById(resolvedAction.target);
          if (el) el.classList.add(resolvedAction.hide_class || 'hidden');
          return 'handled';
        }

        // --- open_report ---
        if (resolvedAction.action === 'open_report') {
          const templates = resolvedAction.templates || [];
          const contextData = { ...rowData, ...(window.contextStore || {}), ...elementContext };
          if (window.reportModal && templates.length > 0) {
            window.reportModal.open(templates, contextData);
          }
          return 'handled';
        }

        // --- row_delete ---
        if (resolvedAction.action === 'row_delete') {
          const actionValues = resolvedAction.values || {};
          const pageId = actionValues.page_id || window.__pageContext?.pageId || window.contextStore?.page_id;
          const contextKey = window.__pageContext?.contextKey || 'id';
          const pkVal = window.contextStore?.[contextKey];

          if (!pkVal) {
            alert('Please select a row to delete');
            return 'handled';
          }

          if (!confirm('Are you sure you want to delete this record?')) {
            return 'handled';
          }

          try {
            const response = await fetch('/api/dml', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ page_id: pageId, mode: 'DELETE', f_id: pkVal })
            });
            const result = await response.json();
            if (result.success) {
              window.location.reload();
            } else {
              alert(result.error || 'Delete failed');
            }
          } catch (err) {
            alert('Delete failed: ' + err.message);
          }
          return 'handled';
        }

        // --- dml_direct ---
        if (resolvedAction.action === 'dml_direct') {
          const endpoint = resolvedAction.endpoint || '/api/dml';
          const pageId = resolvedAction.page_id || window.__pageContext?.pageId;
          const mode = resolvedAction.mode || 'INSERT';
          const fields = resolvedAction.fields || {};
          // pk_val normally comes from a grid row's own {{id}} placeholder. A standalone
          // button (not inside a .grid-row) has no rowData to resolve against, so fall back
          // to whatever a prior row_click stashed in contextStore under pk_field (default 'id') -
          // same source row_delete already reads for its own pk lookup.
          const pkField = resolvedAction.pk_field || 'id';
          const pkVal = resolvedAction.pk_val || window.contextStore?.[pkField] || null;
          const refresh = resolvedAction.refresh || [];
          const confirmMsg = resolvedAction.confirm;

          if (confirmMsg && !confirm(confirmMsg)) {
            return 'handled';
          }

          const payload = { mode };
          if (pageId) payload.page_id = parseInt(pageId);
          if (pkVal) payload.map_id = pkVal;
          for (const [key, value] of Object.entries(fields)) {
            payload[key] = value;
          }

          try {
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (result.success) {
              if (refresh.length > 0) {
                refreshComponents(refresh);
              } else {
                window.location.reload();
              }
            } else {
              alert(result.error || mode + ' failed');
            }
          } catch (err) {
            alert(mode + ' failed: ' + err.message);
          }
          return 'handled';
        }

        // --- prompt_post ---
        if (resolvedAction.action === 'prompt_post') {
          const promptText = resolvedAction.prompt || 'Enter a value:';
          const value = window.prompt(promptText);
          if (!value) return 'handled';

          const minLength = resolvedAction.min_length;
          if (minLength && value.length < minLength) {
            alert(resolvedAction.min_length_message || ('Must be at least ' + minLength + ' characters'));
            return 'handled';
          }

          const payload = {};
          for (const key of resolvedAction.context_keys || []) {
            payload[key] = window.contextStore?.[key];
          }
          payload[resolvedAction.field_name || 'value'] = value;

          try {
            const response = await fetch(resolvedAction.endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (result.success) {
              if (resolvedAction.success_message) alert(resolvedAction.success_message);
            } else {
              alert(result.message || resolvedAction.error_message || 'Action failed');
            }
          } catch (err) {
            alert('Request failed: ' + err.message);
          }
          return 'handled';
        }

        // --- server action (default: POST to /api/actions) ---
        if (resolvedAction.targets || (resolvedAction.action && !['open_modal', 'show_element', 'open_report', 'row_delete', 'dml_direct', 'conditional_setvals', 'prompt_post'].includes(resolvedAction.action))) {
          const response = await fetch('/api/actions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              component_id: wrapper.id,
              template_name: wrapper.dataset.templateName,
              value: getActionValue(event, wrapper),
              action: resolvedAction
            })
          });

          if (!response.ok) return 'stop';

          const result = await response.json();

          if (result?.redirectUrl) {
            window.location.href = result.redirectUrl;
            return 'stop';
          }

          const updates = Array.isArray(result?.updates) ? result.updates : [];
          for (const update of updates) {
            applySwap(update.target, update.html, update.swapMode);
          }
          return 'handled';
        }

        return 'continue';
      };
`;
