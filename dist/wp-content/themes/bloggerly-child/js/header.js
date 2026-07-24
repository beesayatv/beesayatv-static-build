document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.btv-site-header__search, .btv-site-header__atlas').forEach(function (headerAction) {
        headerAction.addEventListener('click', function (event) {
            if (event.detail > 0) {
                headerAction.blur();
            }
        });
    });
});
