(function(window, L) {
    'use strict';

    const DEFAULT_SERVICE_COLOR = '#ffffff';
    const DEFAULT_NO_SERVICE_COLOR = '#c62828';
    const DEFAULT_SERVICE_CONTRAST_COLOR = '#14181c';
    const DEFAULT_NO_SERVICE_CONTRAST_COLOR = '#14181c';
    var HEX_COLOR = /^#[0-9a-f]{6}$/i;
    var GRID_METRES = [
        { minimumZoom: 14, size: 175 },
        { minimumZoom: 12, size: 600 },
        { minimumZoom: 10, size: 1500 }
    ];
    var CLOSE_DETAIL_MINIMUM_ZOOM = 16;
    var FULL_DETAIL_MINIMUM_ZOOM = 18;
    // The outer pulse is 17px wide, so 24px keeps repeated pulses separate
    // without making close-detail coverage look disconnected.
    var CLOSE_DETAIL_SPACING_PIXELS = 24;
    var WEB_MERCATOR_LIMIT = 85.05112878;
    var EARTH_RADIUS = 6378137;

    function validColor(value, fallback) {
        return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
    }

    function projectedMetres(latitude, longitude) {
        var limitedLatitude = Math.max(-WEB_MERCATOR_LIMIT, Math.min(WEB_MERCATOR_LIMIT, latitude));
        return {
            x: EARTH_RADIUS * longitude * Math.PI / 180,
            y: EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + limitedLatitude * Math.PI / 360))
        };
    }

    function gridSizeForZoom(zoom) {
        if (zoom >= CLOSE_DETAIL_MINIMUM_ZOOM) {
            return 0;
        }
        for (var index = 0; index < GRID_METRES.length; index += 1) {
            if (zoom >= GRID_METRES[index].minimumZoom) {
                return GRID_METRES[index].size;
            }
        }
        return null;
    }

    function stableFeatureOrder(first, second) {
        var firstProperties = first.properties || {};
        var secondProperties = second.properties || {};
        var firstCoordinates = first.geometry.coordinates;
        var secondCoordinates = second.geometry.coordinates;
        return String(firstProperties.survey_group || '').localeCompare(String(secondProperties.survey_group || '')) ||
            Number(firstProperties.sequence || 0) - Number(secondProperties.sequence || 0) ||
            firstCoordinates[1] - secondCoordinates[1] ||
            firstCoordinates[0] - secondCoordinates[0] ||
            firstProperties.category.localeCompare(secondProperties.category);
    }

    function uniqueFeatures(features) {
        var seen = {};
        return features.filter(function(feature) {
            var coordinates = feature.geometry.coordinates;
            var id = coordinates[0] + '|' + coordinates[1] + '|' + feature.properties.category;
            if (seen[id]) {
                return false;
            }
            seen[id] = true;
            return true;
        });
    }

    function thinFeatures(features, gridSize) {
        if (!gridSize) {
            return features.slice().sort(stableFeatureOrder);
        }

        var cells = {};
        features.forEach(function(feature) {
            var coordinates = feature.geometry.coordinates;
            var metres = projectedMetres(coordinates[1], coordinates[0]);
            var key = Math.floor(metres.x / gridSize) + ':' + Math.floor(metres.y / gridSize);
            if (!cells[key]) {
                cells[key] = [];
            }
            cells[key].push(feature);
        });

        var retained = [];
        Object.keys(cells).sort().forEach(function(key) {
            var cell = cells[key].slice().sort(stableFeatureOrder);
            var categories = {};
            retained.push(cell[0]);
            cell.forEach(function(feature) {
                var category = feature.properties.category;
                if (!categories[category]) {
                    categories[category] = true;
                    retained.push(feature);
                }
            });
        });

        return uniqueFeatures(retained).sort(stableFeatureOrder);
    }

    function thinCloseDetailFeatures(features, map, zoom) {
        var cells = {};
        var retained = [];
        features.slice().sort(stableFeatureOrder).forEach(function(feature) {
            if (feature.properties.preserve) {
                retained.push(feature);
                return;
            }
            var coordinates = feature.geometry.coordinates;
            // map.project() produces world-pixel coordinates, so cell selection
            // remains stable when the viewport pans without changing zoom.
            var worldPoint = map.project([coordinates[1], coordinates[0]], zoom);
            var key = Math.floor(worldPoint.x / CLOSE_DETAIL_SPACING_PIXELS) + ':' +
                Math.floor(worldPoint.y / CLOSE_DETAIL_SPACING_PIXELS) + ':' +
                feature.properties.category;
            if (!cells[key]) {
                cells[key] = feature;
                retained.push(feature);
            }
        });
        return uniqueFeatures(retained).sort(stableFeatureOrder);
    }

    function paddedBounds(map) {
        var bounds = map.getBounds();
        var latitudePadding = Math.abs(bounds.getNorth() - bounds.getSouth()) * 0.15;
        var longitudePadding = Math.abs(bounds.getEast() - bounds.getWest()) * 0.15;
        return L.latLngBounds(
            [bounds.getSouth() - latitudePadding, bounds.getWest() - longitudePadding],
            [bounds.getNorth() + latitudePadding, bounds.getEast() + longitudePadding]
        );
    }

    function create(map, options) {
        var configuredAppearance = options.appearance || {};
        var categoryColors = {
            service: validColor(configuredAppearance.serviceColor, DEFAULT_SERVICE_COLOR),
            no_service: validColor(configuredAppearance.noServiceColor, DEFAULT_NO_SERVICE_COLOR)
        };
        var contrastColors = {
            service: validColor(configuredAppearance.serviceContrastColor, DEFAULT_SERVICE_CONTRAST_COLOR),
            no_service: validColor(configuredAppearance.noServiceContrastColor, DEFAULT_NO_SERVICE_CONTRAST_COLOR)
        };
        var enabled = false;
        var requestToken = 0;
        var manifest = null;
        var measurements = null;
        var loadingPromise = null;
        var renderedSignature = '';
        var refreshTimer = null;
        var button = null;
        var renderer = L.canvas({ padding: 0.5, pane: options.pane });
        var pointLayer = L.layerGroup();

        function loadData() {
            if (measurements) {
                return Promise.resolve(measurements);
            }
            if (loadingPromise) {
                return loadingPromise;
            }

            loadingPromise = fetch(options.manifestUrl)
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('Unable to load Connectivity manifest.');
                    }
                    return response.json();
                })
                .then(function(loadedManifest) {
                    manifest = loadedManifest;
                    return fetch(manifest.data_url);
                })
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('Unable to load Connectivity measurements.');
                    }
                    return response.json();
                })
                .then(function(data) {
                    measurements = Array.isArray(data.features) ? data.features : [];
                    return measurements;
                })
                .catch(function(error) {
                    loadingPromise = null;
                    throw error;
                });
            return loadingPromise;
        }

        function render() {
            if (!enabled || !measurements) {
                return;
            }

            var zoom = map.getZoom();
            var gridSize = gridSizeForZoom(zoom);
            var visible = [];
            if (gridSize !== null) {
                var bounds = paddedBounds(map);
                visible = measurements.filter(function(feature) {
                    var coordinates = feature.geometry.coordinates;
                    return bounds.contains([coordinates[1], coordinates[0]]);
                });
                visible = zoom >= FULL_DETAIL_MINIMUM_ZOOM
                    ? visible.slice().sort(stableFeatureOrder)
                    : (zoom >= CLOSE_DETAIL_MINIMUM_ZOOM
                        ? thinCloseDetailFeatures(visible, map, zoom)
                        : thinFeatures(visible, gridSize));
            }

            var signature = zoom + '|' + visible.map(function(feature) {
                var coordinates = feature.geometry.coordinates;
                return coordinates[0] + ':' + coordinates[1] + ':' + feature.properties.category;
            }).join(',');
            if (signature === renderedSignature) {
                return;
            }

            renderedSignature = signature;
            pointLayer.clearLayers();
            visible.forEach(function(feature) {
                var coordinates = feature.geometry.coordinates;
                var category = 'no_service' === feature.properties.category ? 'no_service' : 'service';
                var color = categoryColors[category];
                var contrastColor = contrastColors[category];
                var logicalPoint = L.layerGroup();
                var closeDetail = zoom >= CLOSE_DETAIL_MINIMUM_ZOOM && zoom < FULL_DETAIL_MINIMUM_ZOOM;
                [
                    { radius: closeDetail ? 7.5 : 8.5, opacity: closeDetail ? 0.16 : 0.22 },
                    { radius: closeDetail ? 5.75 : 6.5, opacity: closeDetail ? 0.32 : 0.40 },
                    { radius: closeDetail ? 4 : 4.5, opacity: closeDetail ? 0.56 : 0.65 }
                ].forEach(function(ring) {
                    L.circleMarker([coordinates[1], coordinates[0]], {
                        pane: options.pane,
                        renderer: renderer,
                        radius: ring.radius,
                        color: contrastColor,
                        weight: 2,
                        opacity: Math.min(0.28, ring.opacity * 0.45),
                        fill: false,
                        interactive: false
                    }).addTo(logicalPoint);
                    L.circleMarker([coordinates[1], coordinates[0]], {
                        pane: options.pane,
                        renderer: renderer,
                        radius: ring.radius,
                        color: color,
                        weight: 1,
                        opacity: ring.opacity,
                        fill: false,
                        interactive: false
                    }).addTo(logicalPoint);
                });
                L.circleMarker([coordinates[1], coordinates[0]], {
                    pane: options.pane,
                    renderer: renderer,
                    radius: 2.5,
                    color: contrastColor,
                    weight: 1,
                    opacity: 0.35,
                    fillColor: color,
                    fillOpacity: 0.95,
                    interactive: false
                }).addTo(logicalPoint);
                logicalPoint.addTo(pointLayer);
            });
        }

        function scheduleRender() {
            window.clearTimeout(refreshTimer);
            refreshTimer = window.setTimeout(render, 80);
        }

        function setEnabled(nextEnabled) {
            enabled = !!nextEnabled;
            requestToken += 1;
            var currentToken = requestToken;
            button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            button.setAttribute('aria-label', enabled ? 'Hide Connectivity measurements' : 'Show Connectivity measurements');

            if (!enabled) {
                renderedSignature = '';
                pointLayer.clearLayers();
                if (map.hasLayer(pointLayer)) {
                    map.removeLayer(pointLayer);
                }
                return;
            }

            if (!map.hasLayer(pointLayer)) {
                pointLayer.addTo(map);
            }
            loadData().then(function() {
                if (enabled && currentToken === requestToken) {
                    render();
                }
            }).catch(function(error) {
                if (currentToken !== requestToken) {
                    return;
                }
                enabled = false;
                button.setAttribute('aria-pressed', 'false');
                button.setAttribute('aria-label', 'Show Connectivity measurements');
                console.error(error);
            });
        }

        var Control = L.Control.extend({
            options: { position: 'topleft' },
            onAdd: function() {
                var container = L.DomUtil.create('div', 'beesayatv-atlas-access-control leaflet-control');
                button = L.DomUtil.create('button', 'beesayatv-atlas-access-control__toggle', container);
                button.type = 'button';
                button.textContent = 'Smart LTE';
                button.setAttribute('aria-label', 'Show Connectivity measurements');
                button.setAttribute('aria-pressed', 'false');
                L.DomEvent.disableClickPropagation(container);
                L.DomEvent.on(button, 'click', function() {
                    setEnabled(!enabled);
                });
                return container;
            }
        });

        new Control().addTo(map);
        map.on('zoomend moveend', scheduleRender);

        return {
            isEnabled: function() { return enabled; },
            refresh: scheduleRender,
            setEnabled: setEnabled
        };
    }

    window.BeesayaTrailAtlasConnectivity = { create: create };
})(window, window.L);
