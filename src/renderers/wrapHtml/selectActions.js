export const selectActionsCode = `
      const closeDropdownMenus = () => {
        document.querySelectorAll('.dropdown-menu.open').forEach(function(menu) {
          menu.classList.remove('open');
        });
        document.querySelectorAll('.dropdown-toggle.open').forEach(function(toggle) {
          toggle.classList.remove('open');
        });
      };

      document.addEventListener('click', function(e) {
        const toggle = e.target.closest('.dropdown-toggle');
        if (toggle) {
          e.preventDefault();
          const dropdownId = toggle.getAttribute('data-dropdown');
          const menu = dropdownId ? document.getElementById(dropdownId) : null;
          if (!menu) return;

          const shouldOpen = !menu.classList.contains('open');
          closeDropdownMenus();

          if (shouldOpen) {
            menu.classList.add('open');
            toggle.classList.add('open');
          }
          return;
        }

        if (e.target.closest('.dropdown-menu a')) {
          closeDropdownMenus();
          return;
        }

        if (!e.target.closest('.nav-item')) {
          closeDropdownMenus();
        }
      });
`;
