export const formHydrationCode = `
      const applyModeVisibility = (container, mode) => {
        const normalizedMode = String(mode || 'INSERT').toLowerCase();
        container.querySelectorAll('[data-visible-mode]').forEach((el) => {
          const modes = el.dataset.visibleMode.split(',').map((m) => m.trim().toLowerCase());
          const show = modes.includes(normalizedMode);
          el.style.display = show ? '' : 'none';
          el.querySelectorAll('input, select, textarea').forEach((field) => {
            field.disabled = !show;
          });
        });
      };

      const hydrateEmbeddedDropdowns = async (container) => {
        const placeholders = Array.from(container.querySelectorAll('[data-embed-dropdown]'));
        for (const el of placeholders) {
          const templateName = el.dataset.embedDropdown;
          const fieldName = el.dataset.embedField;
          const currentValue = el.dataset.embedValue;
          if (!templateName || !fieldName) continue;
          try {
            const response = await fetch('/api/hydrate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ template_name: templateName })
            });
            const html = await response.text();
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            const select = tmp.querySelector('select');
            if (select) {
              select.id = fieldName;
              select.name = fieldName;
              if (currentValue) select.value = currentValue;
              el.replaceWith(select);
            }
          } catch (err) {
            // Leave the placeholder in place on failure rather than break the form.
          }
        }
      };
`;
