export const actionEngineCode = `
      const parseActions = (value) => {
        if (!value) return {};
        try {
          const parsed = JSON.parse(value);
          return typeof parsed === 'object' ? parsed : {};
        } catch {
          return {};
        }
      };

      const getActionValue = (event, wrapper) => {
        const source = event.target instanceof Element
          ? event.target
          : event.target?.parentElement || null;
        if (source?.matches('select, input, textarea')) {
          return source.value ?? '';
        }
        const field = wrapper.querySelector('select, input, textarea');
        return field?.value ?? '';
      };

      const applySwap = (targetId, html, swapMode) => {
        const target = document.getElementById(targetId);
        if (!target) return;
        if (swapMode === 'outerHTML') {
          target.outerHTML = html;
          const replacement = document.getElementById(targetId);
          if (replacement && window.htmx) window.htmx.process(replacement);
          return;
        }
        target.innerHTML = html;
        if (window.htmx) window.htmx.process(target);
      };

      const resolvePlaceholders = (obj, data) => {
        if (typeof obj === 'string') {
          let result = obj;
          for (const [key, val] of Object.entries(data)) {
            const token = '{{' + key + '}}';
            while (result.includes(token)) {
              result = result.replace(token, val ?? '');
            }
          }
          return result;
        }
        if (Array.isArray(obj)) return obj.map(item => resolvePlaceholders(item, data));
        if (obj && typeof obj === 'object') {
          return Object.fromEntries(
            Object.entries(obj).map(([k, v]) => [k, resolvePlaceholders(v, data)])
          );
        }
        return obj;
      };

      const toFieldKey = (label) => {
        return String(label || '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');
      };

      const deriveGridRowData = (gridRow) => {
        if (!gridRow) return {};
        const rawDataset = { ...gridRow.dataset };
        const rowData = {};
        for (const [key, val] of Object.entries(rawDataset)) {
          rowData[key] = val;
          const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          if (snakeKey !== key) rowData[snakeKey] = val;
        }
        if (rawDataset.rowId !== undefined) {
          rowData.id = rawDataset.rowId;
        }
        const table = gridRow.closest('table');
        const headerCells = table ? Array.from(table.querySelectorAll('thead th')) : [];
        const valueCells = Array.from(gridRow.querySelectorAll('td'));
        valueCells.forEach((cell, index) => {
          const fallbackKey = 'col_' + String(index + 1);
          const headerText = headerCells[index]?.textContent || fallbackKey;
          const key = toFieldKey(headerText) || fallbackKey;
          rowData[key] = (cell.textContent || '').trim();
        });
        return rowData;
      };

      const BOUND_EVENT_TYPES = ['change', 'click', 'dblclick', 'input', 'submit'];

      const deriveTrigger = (event, source) => {
        // Explicit data-trigger wins even inside a .grid-row - an element that opts
        // into its own trigger (e.g. a per-row checkbox's "change") must not be
        // swallowed by the row-click catch-all just because it sits inside a row.
        //
        // data-trigger has two different uses in this codebase and they need
        // different handling. hydrateSlots.js builds "<component_name>_click" labels
        // for context buttons app-wide - arbitrary semantic keys, always suffixed
        // "_click", never literally one of the five bound event names, and each such
        // element only ever receives ONE qualifying native event per interaction, so
        // no gating is needed (confirmed live 2026-08-26: gating unconditionally broke
        // every context button, e.g. "<- Ingredients"/"ingredients_nav_click", since a
        // real click event never equals that string).
        // A checkbox's own data-trigger="change" is different: it names a REAL event
        // type, and a checkbox fires click, input, AND change for one toggle - all
        // three are bound on document, so without gating they'd all resolve to the
        // same trigger and fire the action three times per click.
        // Distinguish the two: only gate when the declared value literally IS one of
        // the five bound event names.
        const explicitTrigger = source?.dataset?.trigger || source?.closest('[data-trigger]')?.dataset?.trigger;
        if (explicitTrigger) {
          if (BOUND_EVENT_TYPES.includes(explicitTrigger)) {
            return event.type === explicitTrigger ? explicitTrigger : null;
          }
          return explicitTrigger;
        }
        if (source?.closest('.grid-row')) {
          return event.type === 'dblclick' ? 'row_dblclick' : 'row_click';
        }
        if (source?.matches('select')) return 'select_change';
        if (source?.matches('input, textarea')) return 'input';
        if (event.type === 'submit') return 'submit';
        return 'click';
      };

      const refreshComponents = (componentIds) => {
        if (!Array.isArray(componentIds)) return;
        for (const id of componentIds) {
          const el = document.getElementById(id);
          // 'load' is htmx's one-shot pseudo-event, already consumed at initial
          // insertion - re-triggering it does nothing. 'refresh-component' is a real
          // event htmx binds a genuine listener for (see buildHtmxDiv.js hx-trigger).
          if (el && window.htmx) {
            window.htmx.trigger(el, 'refresh-component');
          }
        }
      };

      const handleActionEvent = async (event) => {
        const source = event.target instanceof Element
          ? event.target
          : event.target?.parentElement || null;
        const wrapper = source?.closest('[data-actions]');
        if (!wrapper) return;

        const trigger = deriveTrigger(event, source);
        const actionConfig = parseActions(wrapper.dataset.actions);

        const actionOrActions = actionConfig[trigger];
        if (!actionOrActions) return;

        const actionsToRun = Array.isArray(actionOrActions) ? actionOrActions : [actionOrActions];
        const gridRow = source?.closest('.grid-row');
        const rowData = deriveGridRowData(gridRow);

        const elementContext = {};
        if (source?.matches('select, input, textarea')) {
          elementContext.selected_value = source.value;
          elementContext.value = source.value;
        }

        if (event.type === 'submit') {
          event.preventDefault();
        }

        for (const action of actionsToRun) {
          const resolvedAction = resolvePlaceholders(action, { ...rowData, ...elementContext });
          const handled = await window.__actionHandlers(resolvedAction, {
            rowData, elementContext, wrapper, event, getActionValue, applySwap, refreshComponents
          });
          if (handled === 'stop') return;
        }
      };

      for (const eventName of ['change', 'click', 'dblclick', 'input', 'submit']) {
        document.addEventListener(eventName, handleActionEvent);
      }
`;
