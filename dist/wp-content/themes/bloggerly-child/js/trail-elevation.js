(function () {
    'use strict';

    var buttons = document.querySelectorAll('.beesaya-elevation-btn');
    if (!buttons.length || !window.fetch) {
        return;
    }

    // Haversine formula to calculate distance between two lat/lng points in km
    function calculateDistance(lat1, lon1, lat2, lon2) {
        var R = 6371; // Radius of the earth in km
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLon = (lon2 - lon1) * Math.PI / 180;
        var a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in km
    }

    buttons.forEach(function(button, index) {
        var geojsonUrl = button.getAttribute('data-geojson-url');
        if (!geojsonUrl) return;

        var panelId = 'trail-elevation-detail-panel-' + index;
        button.setAttribute('aria-controls', panelId);

        var gridContainer = button.closest('.beesaya-grid');
        if (!gridContainer) return;

        var panel = document.createElement('div');
        panel.id = panelId;
        panel.className = 'trail-elevation-panel';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', 'Elevation Profile');
        panel.hidden = true;
        
        // Insert the panel right after the button
        if (!button.nextElementSibling || !button.nextElementSibling.classList.contains('trail-elevation-panel')) {
            button.parentNode.insertBefore(panel, button.nextSibling);
        } else {
            panel = button.nextElementSibling;
        }

        var chartInitialized = false;

        button.addEventListener('click', function() {
            var isExpanded = button.getAttribute('aria-expanded') === 'true';
            
            if (isExpanded) {
                button.setAttribute('aria-expanded', 'false');
                panel.hidden = true;
                return;
            }

            button.setAttribute('aria-expanded', 'true');
            panel.hidden = false;

            if (!chartInitialized) {
                chartInitialized = true;
                panel.innerHTML = '<div class="trail-elevation-loading">Loading elevation data...</div>';

                fetch(geojsonUrl)
                    .then(function(response) {
                        if (!response.ok) throw new Error('Network response was not ok');
                        return response.json();
                    })
                    .then(function(data) {
                        var coordinates = [];
                        if (data.type === 'FeatureCollection' && data.features.length > 0) {
                            var feature = data.features.find(function(f) { return f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'); });
                            if (feature) {
                                if (feature.geometry.type === 'LineString') {
                                    coordinates = feature.geometry.coordinates;
                                } else if (feature.geometry.type === 'MultiLineString') {
                                    coordinates = feature.geometry.coordinates[0]; // Take first segment for simplicity
                                }
                            }
                        } else if (data.type === 'LineString') {
                            coordinates = data.coordinates;
                        }

                        if (!coordinates || coordinates.length === 0) {
                            throw new Error('No coordinates found');
                        }

                        // Check if elevation data exists (3rd item in coordinate array)
                        if (coordinates[0].length < 3) {
                            throw new Error('No elevation data in GeoJSON');
                        }

                        var chartData = [];
                        var labels = [];
                        var cumulativeDistance = 0;

                        for (var i = 0; i < coordinates.length; i++) {
                            var coord = coordinates[i];
                            var lng = coord[0];
                            var lat = coord[1];
                            var ele = coord[2];

                            if (i > 0) {
                                var prevCoord = coordinates[i - 1];
                                cumulativeDistance += calculateDistance(prevCoord[1], prevCoord[0], lat, lng);
                            }

                            chartData.push(ele);
                            labels.push(cumulativeDistance.toFixed(2));
                        }

                        panel.innerHTML = '<div style="position:relative;height:140px;width:100%;"><canvas class="trail-elevation-canvas"></canvas></div>';
                        var canvas = panel.querySelector('canvas');
                        
                        if (typeof Chart !== 'undefined') {
                            new Chart(canvas, {
                                type: 'line',
                                data: {
                                    labels: labels,
                                    datasets: [{
                                        label: 'Elevation (m)',
                                        data: chartData,
                                        borderColor: '#1e73be',
                                        backgroundColor: 'rgba(30, 115, 190, 0.2)',
                                        borderWidth: 2,
                                        fill: true,
                                        pointRadius: 0,
                                        pointHitRadius: 10,
                                        tension: 0.1
                                    }]
                                },
                                options: {
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    interaction: {
                                        mode: 'index',
                                        intersect: false,
                                    },
                                    plugins: {
                                        legend: { display: false },
                                        tooltip: {
                                            callbacks: {
                                                title: function(context) {
                                                    return context[0].label + ' km';
                                                },
                                                label: function(context) {
                                                    return context.parsed.y + ' m';
                                                }
                                            }
                                        }
                                    },
                                    scales: {
                                        x: {
                                            title: { display: true, text: 'Distance (km)' },
                                            ticks: { maxTicksLimit: 10 }
                                        },
                                        y: {
                                            title: { display: true, text: 'Elevation (m)' }
                                        }
                                    }
                                }
                            });
                        } else {
                            panel.innerHTML = '<div class="trail-elevation-error">Chart library not loaded.</div>';
                        }
                    })
                    .catch(function(error) {
                        console.error('Error fetching/parsing GeoJSON:', error);
                        panel.innerHTML = '<div class="trail-elevation-error">Elevation profile unavailable.</div>';
                    });
            }
        });
    });
})();
