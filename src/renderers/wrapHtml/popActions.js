// wf-server's copy of this file also has a "Best By Date auto-calc" block
// (f_event_date/f_best_by_date/f_best_by_days) - that's WhatsFresh batch
// domain logic, not generic engine behavior, and does not belong here.
// A consuming app that needs it supplies it via wrapHtml's extraScripts param.
export const popActionsCode = `
      const ensurePopModalScaffold = async () => {
        const existingModal = document.getElementById("pop_modal");
        const existingContainer = document.getElementById("pop_container");
        if (existingModal && existingContainer) {
          return { modal: existingModal, container: existingContainer };
        }

        const scaffoldResponse = await fetch("/api/hydrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template_name: "pop_modal" })
        });

        if (!scaffoldResponse.ok) {
          throw new Error("Failed to load pop_modal scaffold");
        }

        const scaffoldHtml = await scaffoldResponse.text();
        document.body.insertAdjacentHTML("beforeend", scaffoldHtml);

        return {
          modal: document.getElementById("pop_modal"),
          container: document.getElementById("pop_container")
        };
      };

      const popModal = {
        _onSuccess: null,
        _dropdownSlot: null,

        open: async (templateName, dropdownSlot) => {
          const scaffold = await ensurePopModalScaffold();
          const container = scaffold.container;
          const modal = scaffold.modal;

          if (!container || !modal) return;

          popModal._dropdownSlot = dropdownSlot;

          const response = await fetch("/api/hydrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template_name: templateName, mode: "INSERT" })
          });

          const formHtml = await response.text();
          container.innerHTML = formHtml;

          if (window.htmx) window.htmx.process(container);

          const form = container.querySelector("form");
          if (form) {
            form.id = "pop_form_element";
          }

          const entityName = templateName.replace(/_form$/, "").replace(/_/g, " ");
          const title = "Add " + entityName;
          const modalTitle = document.getElementById("pop_modal_title");
          if (modalTitle) {
            modalTitle.textContent = title;
          }

          modal.classList.remove("hidden");
        },

        close: () => {
          const modal = document.getElementById("pop_modal");
          const container = document.getElementById("pop_container");
          if (modal) modal.classList.add("hidden");
          if (container) container.innerHTML = "";
          popModal._dropdownSlot = null;
        },

        refreshDropdown: async (newId) => {
          const slotName = popModal._dropdownSlot;
          if (!slotName) return;

          // Find the select element inside the dropdown wrapper
          const wrapper = document.querySelector('[data-dropdown-slot="' + slotName + '"]');
          if (!wrapper) return;

          // Read the template name the renderer already emitted, rather than
          // rebuilding it from the slot naming convention. Every select path
          // (buildSelectWidget, buildHtmxDiv) sets
          // data-template-name, and htmx swaps the div's innerHTML, so the
          // attribute survives hydration.
          const widget = wrapper.querySelector("[data-template-name]");
          let templateName = widget && widget.dataset.templateName;
          if (!templateName) {
            templateName = slotName.replace(/^f_/, "");
            console.warn(
              "popModal.refreshDropdown: no data-template-name in slot '" +
                slotName + "', falling back to name derivation -> " + templateName
            );
          }

          // Re-hydrate the dropdown
          const response = await fetch("/api/hydrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template_name: templateName })
          });

          if (!response.ok) return;

          const newHtml = await response.text();

          // Preserve the + button, only replace the select
          const addBtn = wrapper.querySelector(".dd-add-btn");
          const selectEl = wrapper.querySelector("select");
          
          if (selectEl) {
            // Create temp container to parse new HTML
            const temp = document.createElement("div");
            temp.innerHTML = newHtml;
            const newSelect = temp.querySelector("select");
            if (newSelect) {
              selectEl.replaceWith(newSelect);
              // Auto-select the new item
              if (newId) {
                newSelect.value = String(newId);
              }
            }
          } else {
            // No existing select, just inject before the button
            if (addBtn) {
              addBtn.insertAdjacentHTML("beforebegin", newHtml);
            } else {
              wrapper.innerHTML = newHtml;
            }
          }
        }
      };

      window.popModal = popModal;

      // --- Pop Modal Form Submit Handler ---
      document.addEventListener("submit", async (e) => {
        const form = e.target;
        if (!form || form.id !== "pop_form_element") return;
        e.preventDefault();

        const pageId = form.dataset.pageId || window.__popPageId;

        if (!pageId) {
          alert("Error: page context not available for quick add");
          return;
        }

        const formData = new FormData(form);
        const payload = { page_id: parseInt(pageId), mode: "INSERT" };

        for (const [key, value] of formData.entries()) {
          payload[key] = value;
        }

        try {
          const response = await fetch("/api/dml", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

          const result = await response.json();

          if (result.success) {
            const newId = result.data?.id;
            await popModal.refreshDropdown(newId);
            popModal.close();
          } else {
            const errMsg = typeof result.error === "object" ? JSON.stringify(result.error) : (result.error || "Save failed");
            alert(errMsg);
          }
        } catch (err) {
          alert("Save failed: " + err.message);
        }
      });

      // Close handlers for pop modal
      document.addEventListener("click", (e) => {
        if (e.target instanceof Element && e.target.closest(".pop-modal-close")) {
          popModal.close();
        }
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          const popModalEl = document.getElementById("pop_modal");
          if (popModalEl && !popModalEl.classList.contains("hidden")) {
            popModal.close();
          }
        }
      });

      // --- dd-add-btn click handler ---
      document.addEventListener("click", (e) => {
        const btn = e.target instanceof Element ? e.target.closest(".dd-add-btn") : null;
        if (!btn) return;

        const formTemplate = btn.dataset.popForm;
        const popPageId = btn.dataset.popPageId;
        const dropdownSlot = btn.dataset.dropdownSlot;

        if (!formTemplate) return;

        window.__popPageId = popPageId;
        popModal.open(formTemplate, dropdownSlot);
      });

      // --- Auto-generate tooltips for dd-add-btn ---
      document.addEventListener("mouseover", (e) => {
        const btn = e.target instanceof Element ? e.target.closest(".dd-add-btn") : null;
        if (!btn || btn.title) return;
        const formName = btn.dataset.popForm || "";
        const entity = formName.replace(/_form$/, "").replace(/_/g, " ");
        btn.title = "Add new " + entity;
      });
`;
