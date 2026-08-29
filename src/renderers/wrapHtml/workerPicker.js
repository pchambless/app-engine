// Generic checkbox-multiselect-to-hidden-field widget. The container element
// (id="worker_checkboxes" - a structural convention other engine files key
// off of, e.g. formActions.js/actionHandlers.js checking for its presence
// before calling initWorkerPicker()) supplies which field it drives via
// data attributes, rather than the field name being hardcoded here. A
// template wires it up with:
//   <div id="worker_checkboxes" data-target-field="f_workers" data-display-target="workers_display">
export const workerPickerCode = `
      const initWorkerPicker = () => {
        const container = document.getElementById('worker_checkboxes');
        if (!container) return;

        const targetFieldId = container.dataset.targetField;
        if (!targetFieldId) return;
        const targetField = document.getElementById(targetFieldId);
        if (!targetField) return;

        const displayId = container.dataset.displayTarget;
        const display = displayId ? document.getElementById(displayId) : null;

        // Pre-check boxes based on existing field value
        const existing = (targetField.value || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);

        const checkboxes = container.querySelectorAll('.worker-cb');
        checkboxes.forEach(cb => {
          if (existing.includes(cb.value)) {
            cb.checked = true;
          }
        });

        // On any checkbox change, rebuild the field's comma-joined string
        container.addEventListener('change', (e) => {
          if (!e.target.classList.contains('worker-cb')) return;

          const selected = Array.from(container.querySelectorAll('.worker-cb:checked'))
            .map(cb => cb.value);

          const val = selected.join(', ');
          targetField.value = val;
          if (display) display.textContent = val || '(none selected)';
        });
      };
`;
