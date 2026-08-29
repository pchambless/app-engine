export const gridActionsCode = `
      const getGridRows = (wrapper) => {
        if (!wrapper) return [];

        const explicitRows = Array.from(wrapper.querySelectorAll('.page-grid .grid-row, .table .grid-row'));
        if (explicitRows.length > 0) {
          return explicitRows;
        }

        return Array.from(wrapper.querySelectorAll('.page-grid tbody tr, .table tbody tr'));
      };

      const filterGridRows = (input) => {
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

        if (!wrapper) return;

        const searchTerm = input.value.trim().toLowerCase();
        const rows = getGridRows(wrapper);

        for (const row of rows) {
          const rowText = row.textContent?.toLowerCase() || '';
          row.style.display = searchTerm === '' || rowText.includes(searchTerm) ? '' : 'none';
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
`;
