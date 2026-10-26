export const gridActionsCode = `
      const getGridRows = (wrapper) => {
        if (!wrapper) return [];

        const explicitRows = Array.from(wrapper.querySelectorAll('.page-grid .grid-row, .table .grid-row'));
        if (explicitRows.length > 0) {
          return explicitRows;
        }

        return Array.from(wrapper.querySelectorAll('.page-grid tbody tr, .table tbody tr'));
      };

      const resolveGridWrapper = (input) => {
        let wrapper = input.closest('[data-template-name]');

        // If not in a component, look for grid in the same page container
        if (!wrapper) {
          const page = input.closest('.crud-page');
          wrapper = page?.querySelector('.page-grid, .table');
        }

        // grid-form-page shell: search box lives in .grid-panel-toolbar,
        // outside the grid component's own [data-template-name] wrapper -
        // find the grid inside the same .grid-panel instead.
        if (!wrapper) {
          const panel = input.closest('.grid-form-page')?.querySelector('.grid-panel');
          wrapper = panel?.querySelector('.page-grid, .table');
        }

        return wrapper || null;
      };

      // FIND MODE (opt-in per grid: data-search-mode="find" on the grid element). The default search FILTERS rows,
      // which hides a hit's siblings and children; on a hierarchy grid that loses what is associated with the hit.
      // Find mode hides nothing: matches are highlighted, a match's descendants are tinted (found a sprint, see its
      // tasks), the first match is scrolled into view, and Enter / Shift+Enter or the arrow buttons step through matches.
      const findState = new WeakMap();
      const FIND_HIT = '#fde68a';
      const FIND_SUB = '#ecfdf5';
      const FIND_CURRENT = 'inset 0 0 0 2px #d97706';

      const isFindMode = (wrapper) => !!wrapper && (
        wrapper.getAttribute('data-search-mode') === 'find' ||
        !!wrapper.querySelector('[data-search-mode="find"]')
      );

      const findCurrent = (input, idx) => {
        const st = findState.get(input);
        if (!st || st.matches.length === 0) return;
        for (const row of st.matches) row.style.boxShadow = '';
        st.idx = (idx + st.matches.length) % st.matches.length;
        const row = st.matches[st.idx];
        row.style.boxShadow = FIND_CURRENT;
        row.scrollIntoView({ block: 'center' });
        const count = st.controls.querySelector('.find-count');
        if (count) count.textContent = (st.idx + 1) + ' of ' + st.matches.length;
      };

      const findGridRows = (input, wrapper) => {
        const rows = getGridRows(wrapper);
        const term = input.value.trim().toLowerCase();
        let controls = input.parentElement.querySelector('.find-controls');

        for (const row of rows) {
          row.style.display = '';
          row.style.backgroundColor = '';
          row.style.boxShadow = '';
        }

        if (term === '') {
          if (controls) controls.style.display = 'none';
          findState.delete(input);
          return;
        }

        if (!controls) {
          controls = document.createElement('span');
          controls.className = 'find-controls';
          controls.style.cssText = 'margin-left:6px; font-size:12px; white-space:nowrap;';
          controls.innerHTML = '<button type="button" data-find="-1" title="Previous match (Shift+Enter)">&#9650;</button> ' +
            '<button type="button" data-find="1" title="Next match (Enter)">&#9660;</button> ' +
            '<span class="find-count"></span>';
          input.insertAdjacentElement('afterend', controls);
        }
        controls.style.display = '';

        const children = new Map();
        for (const row of rows) {
          const parentId = row.getAttribute('data-parent-id');
          if (!parentId) continue;
          if (!children.has(parentId)) children.set(parentId, []);
          children.get(parentId).push(row);
        }

        const matches = rows.filter((row) => (row.textContent || '').toLowerCase().includes(term));
        const hitSet = new Set(matches);

        for (const row of matches) {
          const seen = new Set();
          const stack = [row.getAttribute('data-row-id')];
          while (stack.length) {
            const id = stack.pop();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            for (const child of (children.get(id) || [])) {
              if (!hitSet.has(child)) child.style.backgroundColor = FIND_SUB;
              stack.push(child.getAttribute('data-row-id'));
            }
          }
        }
        for (const row of matches) row.style.backgroundColor = FIND_HIT;

        findState.set(input, { matches, idx: 0, controls });
        const count = controls.querySelector('.find-count');
        if (matches.length === 0) {
          if (count) count.textContent = 'no matches';
          return;
        }
        findCurrent(input, 0);
      };

      const filterGridRows = (input) => {
        const wrapper = resolveGridWrapper(input);

        if (!wrapper) return;

        if (isFindMode(wrapper)) {
          findGridRows(input, wrapper);
          return;
        }

        const searchTerm = input.value.trim().toLowerCase();
        const rows = getGridRows(wrapper);

        if (searchTerm === '') {
          for (const row of rows) row.style.display = '';
          return;
        }

        // Hierarchy-aware: a matched row's ancestors (walked via a hidden
        // data-parent-id attribute) stay visible too, so a search hit shows
        // its place in the hierarchy instead of just the bare matching row -
        // mirrors an Appsmith pattern (hidden parent_id column driving the
        // same reveal). Rows without data-parent-id (flat, non-hierarchical
        // grids - most of them) have no parent to walk to, so this is a
        // no-op there: plain self-match, unchanged from before.
        const byId = new Map();
        for (const row of rows) {
          const id = row.getAttribute('data-row-id');
          if (id) byId.set(id, row);
        }

        const visible = new Set();
        for (const row of rows) {
          const rowText = row.textContent?.toLowerCase() || '';
          if (!rowText.includes(searchTerm)) continue;

          visible.add(row);
          let parentId = row.getAttribute('data-parent-id');
          const seen = new Set();
          while (parentId && !seen.has(parentId)) {
            seen.add(parentId);
            const parentRow = byId.get(parentId);
            if (!parentRow) break;
            visible.add(parentRow);
            parentId = parentRow.getAttribute('data-parent-id');
          }
        }

        for (const row of rows) {
          row.style.display = visible.has(row) ? '' : 'none';
        }
      };

      const handleGridRowSelection = (event) => {
        const source = event.target instanceof Element
          ? event.target
          : event.target?.parentElement || null;
        if (!source) return;

        const row = source.closest('tr');
        if (!row) return;

        // Only select rows in tables/grids (avoid header rows)
        const tbody = row.closest('tbody');
        if (!tbody) return;

        // Find the table/grid wrapper
        const grid = row.closest('.table, .page-grid');
        if (!grid) return;

        // Deselect all other rows in this grid
        const allRows = grid.querySelectorAll('tbody tr');
        allRows.forEach(r => r.classList.remove('selected'));

        // Select the clicked row
        row.classList.add('selected');

        // Show row-click buttons in the nav context-btn group. Targeted by
        // id, not the shared .wf-context-btn-group class - the Add New
        // button wrapper (wrapHtml/index.js) uses that same class, and a
        // scoped lookup can match it instead of the real nav group once
        // Add New lives near the grid (task 220).
        const contextBtnGroup = document.getElementById('context_actions');
        if (contextBtnGroup) {
          contextBtnGroup.classList.add('row-active');
        }
      };

      document.addEventListener('input', function(event) {
        const target = event.target instanceof HTMLInputElement ? event.target : null;
        if (!target?.matches('.grid-search .search-input, .grid-search input[type="search"], .grid-search input[type="text"], .grid-toolbar .search-input')) {
          return;
        }

        filterGridRows(target);
      });

      document.addEventListener('click', handleGridRowSelection);

      document.addEventListener('keydown', function(event) {
        const target = event.target instanceof HTMLInputElement ? event.target : null;
        if (!target || !findState.has(target)) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          findCurrent(target, findState.get(target).idx + (event.shiftKey ? -1 : 1));
        } else if (event.key === 'Escape') {
          target.value = '';
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      document.addEventListener('click', function(event) {
        const source = event.target instanceof Element ? event.target : null;
        const button = source?.closest('.find-controls [data-find]');
        if (!button) return;
        const input = button.closest('.grid-search, .grid-toolbar, .grid-panel-toolbar')?.querySelector('input');
        if (!input || !findState.has(input)) return;
        findCurrent(input, findState.get(input).idx + parseInt(button.getAttribute('data-find'), 10));
      });
`;
