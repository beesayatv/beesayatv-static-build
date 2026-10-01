(function(window) {
    'use strict';

    window.BeesayaTrailAtlasMobileLayers = {
        create: function(map) {
            var container = map.getContainer();
            var mobile = window.matchMedia('(max-width: 767px)');
            var moved = [];
            var inertElements = [];
            var panelId = container.id + '-mobile-layers';
            var overlay = document.createElement('div');
            overlay.className = 'beesayatv-mobile-layers-overlay';
            overlay.hidden = true;
            var sheet = document.createElement('section');
            sheet.className = 'beesayatv-mobile-layers-sheet';
            sheet.id = panelId;
            sheet.setAttribute('role', 'dialog');
            sheet.setAttribute('aria-modal', 'true');
            sheet.setAttribute('aria-labelledby', panelId + '-title');
            var heading = document.createElement('h2');
            heading.id = panelId + '-title';
            heading.textContent = 'Map layers';
            var controls = document.createElement('div');
            controls.className = 'beesayatv-mobile-layers-controls';
            var done = document.createElement('button');
            done.type = 'button';
            done.className = 'beesayatv-mobile-layers-done';
            done.textContent = 'Done';
            sheet.append(heading, controls, done);
            overlay.appendChild(sheet);
            container.appendChild(overlay);
            L.DomEvent.disableClickPropagation(overlay);
            L.DomEvent.disableScrollPropagation(overlay);

            var opener;
            var Control = L.Control.extend({
                options: { position: 'topleft' },
                onAdd: function() {
                    var root = L.DomUtil.create('div', 'beesayatv-mobile-layers-control leaflet-control');
                    opener = L.DomUtil.create('button', 'beesayatv-atlas-access-control__toggle', root);
                    opener.type = 'button';
                    opener.textContent = 'Layers';
                    opener.setAttribute('aria-haspopup', 'dialog');
                    opener.setAttribute('aria-controls', panelId);
                    opener.setAttribute('aria-expanded', 'false');
                    L.DomEvent.disableClickPropagation(root);
                    L.DomEvent.on(opener, 'click', open);
                    return root;
                }
            });
            var layerControl = new Control().addTo(map);

            function close(returnFocus) {
                if (overlay.hidden) return;
                overlay.hidden = true;
                opener.setAttribute('aria-expanded', 'false');
                inertElements.forEach(function(item) { item.element.inert = item.wasInert; });
                inertElements = [];
                if (returnFocus !== false && mobile.matches) opener.focus();
            }

            function open() {
                if (!mobile.matches) return;
                overlay.hidden = false;
                opener.setAttribute('aria-expanded', 'true');
                inertElements = Array.from(container.children).filter(function(element) { return element !== overlay; }).map(function(element) {
                    var item = { element: element, wasInert: element.inert };
                    element.inert = true;
                    return item;
                });
                var first = controls.querySelector('button:not(:disabled)');
                (first || done).focus();
            }

            done.addEventListener('click', function() { close(); });
            overlay.addEventListener('click', function(event) { if (event.target === overlay) close(); });
            function outside(event) {
                if (!overlay.hidden && !sheet.contains(event.target) && !opener.contains(event.target)) close(false);
            }
            document.addEventListener('pointerdown', outside);
            overlay.addEventListener('keydown', function(event) {
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
                if (event.key !== 'Tab') return;
                var focusable = Array.from(sheet.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]')).filter(function(element) { return element.getClientRects().length; });
                var first = focusable[0], last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            });

            function updateCount() {
                var count = container.querySelectorAll('.beesayatv-atlas-access-control__toggle[aria-pressed="true"]').length;
                var label = count ? 'Layers · ' + count : 'Layers';
                if (opener.textContent !== label) opener.textContent = label;
                opener.setAttribute('aria-label', count ? 'Map layers, ' + count + ' active' : 'Map layers');
            }

            function relocate() {
                if (mobile.matches) {
                    var originals = Array.from(container.querySelectorAll('.leaflet-top.leaflet-left > .beesayatv-atlas-access-control, .leaflet-top.leaflet-left > .beesayatv-atlas-legend'));
                    originals.sort(function(a, b) { return Number(a.classList.contains('beesayatv-atlas-legend')) - Number(b.classList.contains('beesayatv-atlas-legend')); });
                    originals.forEach(function(element) {
                        var placeholder = document.createComment('Atlas desktop control position');
                        element.parentNode.insertBefore(placeholder, element);
                        moved.push({ element: element, placeholder: placeholder });
                        controls.appendChild(element);
                    });
                } else {
                    close(false);
                    moved.forEach(function(item) {
                        item.placeholder.parentNode.insertBefore(item.element, item.placeholder);
                        item.placeholder.remove();
                    });
                    moved = [];
                }
                updateCount();
            }

            // Observe the actual controls, preserving their existing handlers and state.
            var observer = new MutationObserver(relocate);
            var topLeft = container.querySelector('.leaflet-top.leaflet-left');
            observer.observe(topLeft, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
            observer.observe(controls, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
            mobile.addEventListener('change', relocate);
            relocate();
            map.on('unload', function() {
                close(false);
                observer.disconnect();
                mobile.removeEventListener('change', relocate);
                document.removeEventListener('pointerdown', outside);
                layerControl.remove();
                overlay.remove();
            });
        }
    };
})(window);
