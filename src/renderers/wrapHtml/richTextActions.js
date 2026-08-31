export const richTextActionsCode = `
      const initRichTextFields = (root) => {
        const fields = Array.from((root || document).querySelectorAll('[data-rich-text]'));
        for (const textarea of fields) {
          if (textarea.dataset.richTextInit) continue;
          textarea.dataset.richTextInit = 'true';
          textarea.style.display = 'none';

          const mount = document.createElement('div');
          mount.className = 'rich-text-editor';
          textarea.insertAdjacentElement('afterend', mount);

          if (!window.Quill) continue;
          const quill = new window.Quill(mount, {
            theme: 'snow',
            modules: {
              toolbar: [
                [{ header: [1, 2, 3, false] }],
                ['bold', 'italic', 'underline'],
                [{ color: [] }, { background: [] }],
                [{ list: 'ordered' }, { list: 'bullet' }],
                [{ align: [] }],
                ['clean']
              ]
            }
          });
          quill.root.innerHTML = textarea.value || '';
          quill.on('text-change', () => {
            textarea.value = quill.root.innerHTML;
          });
        }
      };

      document.addEventListener('DOMContentLoaded', () => initRichTextFields(document));
`;
