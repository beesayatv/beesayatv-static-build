document.addEventListener('DOMContentLoaded', function () {
    const toggleButton = document.getElementById('dark-mode-toggle');
    const htmlElement = document.documentElement;
    const currentTheme = localStorage.getItem('theme');

    if (currentTheme) {
        htmlElement.setAttribute('data-theme', currentTheme);
    }

    if (toggleButton) {
        if ('dark' === currentTheme) {
            toggleButton.textContent = bloggerly_script_vars.light_mode;
        }

        toggleButton.addEventListener('click', function () {
            let theme = htmlElement.getAttribute('data-theme');
            if ('dark' === theme) {
                htmlElement.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
                toggleButton.textContent = bloggerly_script_vars.dark_mode;
            } else {
                htmlElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                toggleButton.textContent = bloggerly_script_vars.light_mode;
            }
        });
    }
});

document.addEventListener('DOMContentLoaded', function () {
    const toggle = document.getElementById('menu-toggle');
    const nav = document.getElementById('site-navigation');
    const body = document.body;
    const mobileMediaQuery = window.matchMedia('(max-width: 768px)');

    if (!toggle || !nav) {
        return;
    }

    function getMenuElements() {
        return nav.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
    }

    function isMobileView() {
        return mobileMediaQuery.matches;
    }

    function setMenuState(isOpen) {
        nav.classList.toggle('active', isOpen);
        toggle.classList.toggle('active', isOpen);
        toggle.setAttribute('aria-expanded', String(isOpen));
        toggle.setAttribute(
            'aria-label',
            isOpen ? bloggerly_script_vars.close_menu : bloggerly_script_vars.open_menu
        );
        nav.setAttribute('aria-hidden', String(!isOpen));
        body.classList.toggle('menu-open', isOpen && isMobileView());
    }

    function closeMenu(returnFocus) {
        setMenuState(false);

        if (returnFocus) {
            toggle.focus();
        }
    }

    function openMenu() {
        const menuElements = getMenuElements();

        setMenuState(true);

        if (menuElements.length > 0) {
            menuElements[0].focus();
        } else {
            toggle.focus();
        }
    }

    toggle.addEventListener('click', function () {
        if (nav.classList.contains('active')) {
            closeMenu(false);
            return;
        }

        openMenu();
    });

    document.addEventListener('keydown', function (event) {
        let menuElements;
        let firstElement;
        let lastElement;

        if (!isMobileView() || !nav.classList.contains('active')) {
            return;
        }

        menuElements = getMenuElements();
        firstElement = menuElements[0];
        lastElement = menuElements[menuElements.length - 1];

        if ('Escape' === event.key) {
            event.preventDefault();
            closeMenu(true);
            return;
        }

        if ('Tab' !== event.key) {
            return;
        }

        if (!firstElement || !lastElement) {
            event.preventDefault();
            toggle.focus();
            return;
        }

        if (event.shiftKey) {
            if (document.activeElement === firstElement) {
                event.preventDefault();
                toggle.focus();
                return;
            }

            if (document.activeElement === toggle) {
                event.preventDefault();
                lastElement.focus();
            }

            return;
        }

        if (document.activeElement === lastElement) {
            event.preventDefault();
            toggle.focus();
        }
    });

    document.addEventListener('click', function (event) {
        if (
            isMobileView() &&
            nav.classList.contains('active') &&
            !nav.contains(event.target) &&
            !toggle.contains(event.target)
        ) {
            closeMenu(false);
        }
    });

    mobileMediaQuery.addEventListener('change', function () {
        if (!isMobileView()) {
            setMenuState(false);
            nav.removeAttribute('aria-hidden');
            body.classList.remove('menu-open');
            return;
        }

        if (!nav.classList.contains('active')) {
            nav.setAttribute('aria-hidden', 'true');
        }
    });
});
