(function () {
    'use strict';

    var buttons = document.querySelectorAll('.beesaya-connectivity-btn');
    if (!buttons.length || !window.fetch || typeof BeesayaSmartLTEData === 'undefined') {
        return;
    }

    function haversineDist(lat1, lon1, lat2, lon2) {
        var R = 6371;
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLon = (lon2 - lon1) * Math.PI / 180;
        var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
                Math.sin(dLon/2) * Math.sin(dLon/2); 
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
        return R * c;
    }

    buttons.forEach(function(button, index) {
        var trailId = button.getAttribute('data-trail-id');
        if (!trailId) return;

        var panelId = 'trail-connectivity-detail-panel-' + index;
        button.setAttribute('aria-controls', panelId);

        var panel = document.createElement('div');
        panel.id = panelId;
        panel.className = 'trail-elevation-panel';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', 'Smart LTE Timeline');
        panel.hidden = true;
        
        if (!button.nextElementSibling || !button.nextElementSibling.classList.contains('trail-elevation-panel')) {
            button.parentNode.insertBefore(panel, button.nextSibling);
        } else {
            panel = button.nextElementSibling;
        }

        var sequenceLoaded = false;

        button.addEventListener('click', function() {
            var isExpanded = button.getAttribute('aria-expanded') === 'true';
            
            if (isExpanded) {
                button.setAttribute('aria-expanded', 'false');
                panel.hidden = true;
                return;
            }

            button.setAttribute('aria-expanded', 'true');
            panel.hidden = false;

            if (!sequenceLoaded) {
                sequenceLoaded = true;
                panel.innerHTML = '<div class="trail-elevation-loading">Loading connectivity data...</div>';

                var url = BeesayaSmartLTEData.ajaxUrl + '?action=beesayatv_trail_connectivity_sequence&trail_id=' + trailId;

                fetch(url)
                    .then(function(response) {
                        if (!response.ok) throw new Error('Network response was not ok');
                        return response.json();
                    })
                    .then(function(data) {
                        if (!data.success || !data.data || !data.data.sequence) {
                            throw new Error('Invalid data');
                        }

                        var sequence = data.data.sequence;
                        
                        panel.innerHTML = `
                            <div class="trail-connectivity-labels" style="position:relative; height:16px; margin-bottom:4px; width:100%;"></div>
                            <div class="trail-connectivity-canvas-wrapper" style="position:relative; width:100%; height:24px; border-radius:4px; overflow:hidden;">
                                <canvas class="trail-connectivity-canvas" style="display:block; width:100%; height:100%;"></canvas>
                            </div>
                        `;
                        
                        var canvas = panel.querySelector('canvas');
                        var ctx = canvas.getContext('2d');
                        var labelsContainer = panel.querySelector('.trail-connectivity-labels');
                        
                        var rect = canvas.getBoundingClientRect();
                        canvas.width = rect.width * (window.devicePixelRatio || 1);
                        canvas.height = rect.height * (window.devicePixelRatio || 1);
                        
                        var totalSamples = sequence.length;
                        var widthPerSample = canvas.width / totalSamples;
                        
                        var colors = {
                            's': '#4CAF50',
                            'n': '#c62828',
                            'e': '#F28C28'
                        };

                        var cumulativeDistance = 0;
                        var currentState = (typeof sequence[0] === 'string') ? sequence[0] : sequence[0].s;
                        var transitions = [];

                        for (var i = 0; i < totalSamples; i++) {
                            var item = sequence[i];
                            var state = typeof item === 'string' ? item : item.s;
                            
                            if (i > 0) {
                                var prev = sequence[i - 1];
                                cumulativeDistance += haversineDist(prev.lat, prev.lng, item.lat, item.lng);
                            }

                            if (i > 0 && state !== currentState) {
                                transitions.push({
                                    dist: cumulativeDistance,
                                    percent: i / totalSamples
                                });
                                currentState = state;
                            }

                            ctx.fillStyle = colors[state] || '#e0e0e0';
                            
                            var startX = i * widthPerSample;
                            var drawWidth = Math.ceil(widthPerSample) + 0.5; 
                            ctx.fillRect(startX, 0, drawWidth, canvas.height);
                        }
                        
                        var labelsHtml = '<span style="position:absolute; left:0; bottom:0; font-size:10px; color:#888; transform:translateX(0); font-weight:600;">0km</span>';
                        
                        var lastPercent = 0;
                        for (var j=0; j<transitions.length; j++) {
                            var t = transitions[j];
                            if (t.percent > 0.15 && t.percent < 0.85 && (t.percent - lastPercent) > 0.15) {
                                labelsHtml += '<span style="position:absolute; left:'+(t.percent*100)+'%; bottom:0; font-size:10px; color:#888; transform:translateX(-50%);">' + t.dist.toFixed(1) + 'km</span>';
                                lastPercent = t.percent;
                            }
                        }
                        
                        labelsHtml += '<span style="position:absolute; right:0; bottom:0; font-size:10px; color:#888; transform:translateX(0); font-weight:600;">' + cumulativeDistance.toFixed(1) + 'km</span>';
                        labelsContainer.innerHTML = labelsHtml;

                    })
                    .catch(function(error) {
                        console.error('Error fetching connectivity sequence:', error);
                        panel.innerHTML = '<div class="trail-elevation-error">Timeline unavailable.</div>';
                    });
            }
        });
    });
})();
