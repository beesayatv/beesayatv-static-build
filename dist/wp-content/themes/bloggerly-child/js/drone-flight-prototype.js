(function () {
    'use strict';

    // Rotate the cone separately from Leaflet's marker positioning transform.
    function updateDirectionCone(marker, heading, speed) {
        var element = marker.getElement();
        if (!element) { return; }
        var visible = Number.isFinite(heading) && speed >= 0.3;
        element.classList.toggle('has-direction', visible);
        if (visible) {
            element.style.setProperty('--btv-drone-heading', heading + 'deg');
        }
    }

    var config = window.beesayatvDroneFlightPrototype;
    var mapElement = document.getElementById('btv-drone-prototype-map');
    var mediaHost = document.getElementById('btv-drone-prototype-video');
    var video = null;
    if (!config || !mapElement || !mediaHost || !window.L) { return; }
    var mobileDisclosures = window.matchMedia('(max-width: 700px)');
    var disclosurePanels = Array.prototype.slice.call(document.querySelectorAll('.btv-drone-disclosure'));
    function setDisclosureMode() {
        disclosurePanels.forEach(function (panel) { panel.open = !mobileDisclosures.matches; });
    }
    setDisclosureMode();
    if (typeof mobileDisclosures.addEventListener === 'function') { mobileDisclosures.addEventListener('change', setDisclosureMode); }
    disclosurePanels.forEach(function (panel) {
        var summary = panel.querySelector('summary');
        if (!summary) { return; }
        summary.addEventListener('click', function (event) { if (!mobileDisclosures.matches) { event.preventDefault(); } });
        summary.addEventListener('keydown', function (event) { if (!mobileDisclosures.matches && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); } });
    });

    function loadYouTubeApi() {
        return new Promise(function (resolve, reject) {
            if (window.YT && window.YT.Player) { resolve(window.YT); return; }
            var previousReady = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = function () {
                if (typeof previousReady === 'function') { previousReady(); }
                resolve(window.YT);
            };
            var existing = document.getElementById('btv-youtube-iframe-api');
            if (!existing) {
                var script = document.createElement('script');
                script.id = 'btv-youtube-iframe-api';
                script.src = 'https://www.youtube.com/iframe_api';
                script.async = true;
                script.onerror = function () { reject(new Error('YouTube player API failed to load.')); };
                document.head.appendChild(script);
            }
        });
    }

    function createYouTubeMedia(host) {
        return loadYouTubeApi().then(function (YT) {
            return new Promise(function (resolve) {
                var playButton = host.parentNode.querySelector('.btv-drone-youtube-play');
                var listeners = {};
                var playerState = -1;
                var isSeeking = false;
                var ready = false;
                var requestedPlay = false;
                var lastTime = 0;
                var player;
                var pollingTimer = null;
                function emit(name) {
                    (listeners[name] || []).forEach(function (listener) { listener(); });
                }
                var media = {
                    addEventListener: function (name, listener) {
                        if (!listeners[name]) { listeners[name] = []; }
                        listeners[name].push(listener);
                    },
                    play: function () {
                        player.playVideo();
                        return Promise.resolve();
                    },
                    pause: function () { if (player) { player.pauseVideo(); } },
                    destroy: function () {
                        ready = false;
                        if (pollingTimer) { window.clearInterval(pollingTimer); pollingTimer = null; }
                        if (playButton) {
                            playButton.removeEventListener('click', requestPlay);
                            playButton.removeEventListener('touchend', requestPlay);
                        }
                        if (player && typeof player.destroy === 'function') { player.destroy(); }
                        listeners = {};
                    }
                };
                function requestPlay(event) {
                    if (event) { event.preventDefault(); }
                    if (ready && player) {
                        if (playerState === YT.PlayerState.PLAYING) {
                            player.pauseVideo();
                        } else {
                            player.playVideo();
                        }
                    } else {
                        requestedPlay = true;
                    }
                }
                if (playButton) {
                    playButton.addEventListener('click', requestPlay);
                    playButton.addEventListener('touchend', requestPlay, { passive: false });
                }
                Object.defineProperties(media, {
                    currentTime: { get: function () { return ready ? Number(player.getCurrentTime()) || 0 : 0; } },
                    duration: { get: function () { return ready ? Number(player.getDuration()) || NaN : NaN; } },
                    paused: { get: function () { return playerState !== YT.PlayerState.PLAYING; } },
                    ended: { get: function () { return playerState === YT.PlayerState.ENDED; } },
                    seeking: { get: function () { return isSeeking; } },
                    readyState: { get: function () { return ready ? 1 : 0; } }
                });
                player = new YT.Player(host, {
                    videoId: host.getAttribute('data-youtube-id'),
                    playerVars: { controls: 1, playsinline: 1, rel: 0, origin: window.location.origin },
                    events: {
                        onReady: function () {
                            ready = true;
                            lastTime = media.currentTime;
                            if (requestedPlay) { player.playVideo(); }
                            resolve(media);
                            window.setTimeout(function () { emit('loadedmetadata'); }, 0);
                            pollingTimer = window.setInterval(function () {
                                if (!ready) { return; }
                                var nextTime = media.currentTime;
                                if (Math.abs(nextTime - lastTime) > 0.05) {
                                    var expectedAdvance = playerState === YT.PlayerState.PLAYING ? 0.8 : 0.05;
                                    if (Math.abs(nextTime - lastTime) > expectedAdvance) {
                                        isSeeking = true;
                                        emit('seeking');
                                    }
                                    lastTime = nextTime;
                                    emit('timeupdate');
                                    if (isSeeking) {
                                        isSeeking = false;
                                        emit('seeked');
                                    }
                                }
                            }, 250);
                        },
                        onStateChange: function (event) {
                            playerState = event.data;
                            if (event.data === YT.PlayerState.PLAYING) {
                                if (playButton) {
                                    playButton.classList.add('has-started', 'is-playing');
                                    playButton.setAttribute('aria-label', 'Pause video');
                                }
                                emit('play');
                            }
                            if (event.data === YT.PlayerState.PAUSED) {
                                if (playButton) {
                                    playButton.classList.add('has-started');
                                    playButton.classList.remove('is-playing');
                                    playButton.setAttribute('aria-label', 'Resume video');
                                }
                                emit('pause');
                            }
                            if (event.data === YT.PlayerState.BUFFERING) { emit('pause'); }
                            if (event.data === YT.PlayerState.ENDED) {
                                if (playButton) {
                                    playButton.classList.add('has-started');
                                    playButton.classList.remove('is-playing');
                                    playButton.setAttribute('aria-label', 'Replay video');
                                }
                                emit('ended');
                            }
                        }
                    }
                });
            });
        });
    }

    function initializeMultiFlightViewer(items) {
        var map = L.map(mapElement, { zoomControl: true });
        var street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
        var satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', maxZoom: 19 });
        L.control.layers({ Map: street, Satellite: satellite }, null, { position: 'topright', collapsed: false }).addTo(map);
        L.control.scale({ imperial: false, maxWidth: 100, position: 'bottomright' }).addTo(map);

        var layers = {};
        var telemetry = {};
        var showingInitialOverview = true;
        var nearbyTrailLayer = L.featureGroup().addTo(map);
        function renderNearbyTrailList(trails) {
            var list = document.querySelector('[data-drone-nearby-trails-list]');
            var nearbyBlock = document.querySelector('[data-drone-nearby-trails]');
            if (!list || !nearbyBlock) { return; }
            list.replaceChildren();
            (Array.isArray(trails) ? trails : []).forEach(function (trail) {
                if (!trail.title || !trail.url) { return; }
                var item = document.createElement('li');
                var link = document.createElement('a');
                link.href = trail.url;
                link.textContent = trail.title;
                item.appendChild(link);
                list.appendChild(item);
            });
            nearbyBlock.hidden = list.children.length === 0;
        }
        renderNearbyTrailList(config.nearbyTrails);
        if (config.nearbyTrailsUrl) {
            fetch(config.nearbyTrailsUrl, { credentials:'same-origin', headers:{ Accept:'application/json' } })
                .then(function (response) { if (!response.ok) { throw new Error('Nearby trails unavailable'); } return response.json(); })
                .then(function (data) {
                    (Array.isArray(data.trails) ? data.trails : []).forEach(function (trail) {
                        if (!trail.geojson) { return; }
                        var trailColors = config.trailColors || { easy:'#3D8B3D', mild:'#3B7ED0', tough:'#D47A00', epic:'#B83C3C' };
                        var difficultyKey = String(trail.difficulty || '').toLowerCase().trim();
                        var defaultTrailColor = trail.color || trailColors[difficultyKey] || '#89867e';
                        if (trail.wip) {
                            L.geoJSON(trail.geojson, {
                                style: { color:'#ff0000', weight:5, opacity:0.85, dashArray:'7 6', lineCap:'round', lineJoin:'round' },
                                interactive:false
                            }).addTo(nearbyTrailLayer);
                            return;
                        }
                        if (Array.isArray(trail.segments) && trail.segments.length) {
                            trail.segments.forEach(function (segment) {
                                if (!Array.isArray(segment.coordinates) || segment.coordinates.length < 2) { return; }
                                var color = segment.color || trailColors[String(segment.difficulty || '').toLowerCase().trim()] || defaultTrailColor;
                                L.polyline(segment.coordinates.map(function (point) { return [point[1], point[0]]; }), {
                                    color:color, weight:4, opacity:0.9, dashArray:'7 6', lineCap:'round', lineJoin:'round', interactive:false
                                }).addTo(nearbyTrailLayer);
                            });
                            return;
                        }
                        L.geoJSON(trail.geojson, {
                            style: { color:defaultTrailColor, weight:4, opacity:0.9, dashArray:'7 6', lineCap:'round', lineJoin:'round' },
                            interactive:false
                        }).addTo(nearbyTrailLayer);
                    });
                    if (showingInitialOverview) {
                        var extent = L.featureGroup([nearbyTrailLayer].concat(Object.keys(layers).map(function (key) { return layers[key]; })));
                        if (extent.getBounds().isValid()) { map.fitBounds(extent.getBounds(), { padding:[24,24], animate:false }); }
                    }
                })
                .catch(function () {});
        }
        var activeIndex = 0;
        var activeMedia = null;
        var activeMarker = null;
        var animationFrame = null;
        var playAll = false;
        var lastCameraFollow = 0;
        var playbackCameraFocused = false;
        var mediaContainer = document.getElementById('btv-drone-media-container');
        var flightTrigger = document.getElementById('btv-drone-flight-trigger');
        var flightOptions = document.getElementById('btv-drone-flight-options');
        var flightChoices = Array.prototype.slice.call(document.querySelectorAll('[data-drone-flight-index]'));
        var playAllButton = document.getElementById('btv-drone-play-all');
        var hudGps = document.querySelector('[data-drone-hud="gps"]');
        var hudStart = document.querySelector('[data-drone-hud="start-gps"]');
        var hudEnd = document.querySelector('[data-drone-hud="end-gps"]');
        var hudSpeed = document.querySelector('[data-drone-hud="speed"]');
        var hudHeading = document.querySelector('[data-drone-hud="heading"]');
        var hudSatellites = document.querySelector('[data-drone-hud="satellites"]');
        var hudDistance = document.querySelector('[data-drone-hud="distance"]');
        var hudBattery = document.querySelector('[data-drone-hud="battery"]');
        var hudGimbalPitch = document.querySelector('[data-drone-hud="gimbal-pitch"]');
        var durationOutput = document.getElementById('btv-drone-video-duration');
        var status = document.getElementById('btv-drone-prototype-status');
        var droneIcon = L.divIcon({ className:'btv-drone-prototype-marker', html:'<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 12h10M9 9l-2 3 2 3m6-6 2 3-2 3M12 8v8"/><circle cx="6" cy="8" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="6" cy="16" r="2"/><circle cx="18" cy="16" r="2"/></svg></span>', iconSize:[34,34], iconAnchor:[17,17] });

        function normalize(raw) {
            raw.samples = raw.samples.map(function (s) { return Array.isArray(s) ? { t:Number(s[0]), lat:Number(s[1]), lng:Number(s[2]), alt:s[3], segment:Number(s[4] || 0), satellites:s[5], distance:s[6], battery:s[7], gimbalHeading:s[8], gimbalPitch:s[9] } : s; });
            return raw;
        }
        function fetchFlight(index) {
            if (telemetry[index]) { return Promise.resolve(telemetry[index]); }
            return fetch(items[index].telemetryUrl, { credentials:'same-origin', headers:{ Accept:'application/json' } })
                .then(function (r) { if (!r.ok) { throw new Error('Telemetry unavailable'); } return r.json(); })
                .then(function (data) { telemetry[index] = normalize(data); drawFlight(index); return telemetry[index]; });
        }
        function drawFlight(index) {
            if (layers[index] || !telemetry[index]) { return; }
            var grouped = {};
            telemetry[index].samples.forEach(function (s) {
                if (!grouped[s.segment]) { grouped[s.segment] = []; }
                grouped[s.segment].push([s.lat, s.lng]);
            });
            var group = L.featureGroup();
            Object.keys(grouped).forEach(function (key) {
                if (grouped[key].length > 1) {
                    L.polyline(grouped[key], { color:'#6e7359', weight:4, opacity:0.24, lineCap:'round', lineJoin:'round', smoothFactor:0 }).addTo(group);
                    var pulse = L.polyline(grouped[key], { color:'#d9cda9', weight:4, opacity:0.95, dashArray:'8 32', lineCap:'round', lineJoin:'round', smoothFactor:0, interactive:false, className:'btv-drone-route-pulse' + (index === activeIndex ? ' is-active-flight' : '') }).addTo(group);
                    pulse._btvDronePulse = true;
                }
            });
            group.addTo(map); layers[index] = group; styleLayers();
            if (showingInitialOverview) {
                var all = L.featureGroup(Object.keys(layers).map(function (key) { return layers[key]; }));
                if (all.getBounds().isValid()) { map.fitBounds(all.getBounds(), { padding:[24,24], animate:false }); }
            }
        }
        function styleLayers() {
            Object.keys(layers).forEach(function (key) {
                var isActive = Number(key) === activeIndex;
                layers[key].eachLayer(function (line) {
                    if (line._btvDronePulse) {
                        var element = line.getElement();
                        if (element) { element.classList.toggle('is-active-flight', isActive); }
                        return;
                    }
                    line.setStyle(isActive ? { color:'#6e7359', weight:5, opacity:0.95 } : { color:'#8e9872', weight:3, opacity:0.22 });
                });
            });
        }
        function sampleAt(data, time) {
            var samples = data.samples;
            if (!samples.length || time < samples[0].t || time > samples[samples.length - 1].t) { return null; }
            var low=0, high=samples.length-1;
            while (low <= high) { var mid=Math.floor((low+high)/2); if (samples[mid].t < time) { low=mid+1; } else { high=mid-1; } }
            if (low < samples.length && samples[low].t === time) { return samples[low]; }
            var a=samples[low-1], b=samples[low];
            if (!a || !b || a.segment !== b.segment || b.t-a.t > data.maxGapSeconds) { return null; }
            var ratio=(time-a.t)/(b.t-a.t);
            function blend(name) { return null == a[name] || null == b[name] ? null : Number(a[name])+(Number(b[name])-Number(a[name]))*ratio; }
            return { lat:a.lat+(b.lat-a.lat)*ratio, lng:a.lng+(b.lng-a.lng)*ratio, t:time,
                satellites:ratio < .5 ? a.satellites : b.satellites, distance:blend('distance'), battery:blend('battery'), gimbalPitch:blend('gimbalPitch') };
        }
        function distanceMetresBetween(a, b) {
            var lat1=a.lat*Math.PI/180, lat2=b.lat*Math.PI/180;
            var dlat=lat2-lat1, dlng=(b.lng-a.lng)*Math.PI/180;
            var hav=Math.sin(dlat/2)*Math.sin(dlat/2)+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlng/2)*Math.sin(dlng/2);
            return 6371000*2*Math.atan2(Math.sqrt(hav),Math.sqrt(Math.max(0,1-hav)));
        }
        function updateMarker() {
            if (!activeMedia || !telemetry[activeIndex]) { return; }
            var flightTime = Number(items[activeIndex].flightOffset || 0) + Number(activeMedia.currentTime || 0);
            var point = sampleAt(telemetry[activeIndex], flightTime);
            if (point) {
                if (!activeMarker) { activeMarker = L.marker([point.lat,point.lng], { icon:droneIcon, zIndexOffset:1000 }).addTo(map); }
                else { activeMarker.setLatLng([point.lat,point.lng]); }
                if (!activeMedia.paused && window.performance.now() - lastCameraFollow >= 600) {
                    var markerPoint = map.latLngToContainerPoint([point.lat, point.lng]);
                    var mapSize = map.getSize();
                    var outsideSafeZone = markerPoint.x < mapSize.x * 0.25 || markerPoint.x > mapSize.x * 0.75
                        || markerPoint.y < mapSize.y * 0.25 || markerPoint.y > mapSize.y * 0.75;
                    if (outsideSafeZone) {
                        map.panTo([point.lat, point.lng], { animate:true, duration:0.55, easeLinearity:0.25, noMoveStart:true });
                        lastCameraFollow = window.performance.now();
                    }
                }
                if (hudGps) { hudGps.textContent = point.lat.toFixed(6) + '°, ' + point.lng.toFixed(6) + '°'; }
                if (hudSatellites) { hudSatellites.textContent = null == point.satellites ? '—' : String(Math.round(point.satellites)); }
                if (hudDistance) {
                    var videoStart = sampleAt(telemetry[activeIndex], Number(items[activeIndex].flightOffset || 0)) || telemetry[activeIndex].samples[0];
                    var distanceFeet = null;
                    if (videoStart) {
                        distanceFeet = null != point.distance && null != videoStart.distance
                            ? Math.max(0, Number(point.distance) - Number(videoStart.distance))
                            : distanceMetresBetween(videoStart, point) * 3.280839895;
                    }
                    hudDistance.textContent = null == distanceFeet || !Number.isFinite(distanceFeet) ? '—' : distanceFeet.toFixed(1) + ' ft';
                }
                if (hudBattery) { hudBattery.textContent = null == point.battery ? '—' : Math.round(point.battery) + '%'; }
                if (hudGimbalPitch) { hudGimbalPitch.textContent = null == point.gimbalPitch ? '—' : Number(point.gimbalPitch).toFixed(1) + '°'; }
                var before=sampleAt(telemetry[activeIndex],flightTime-.5), after=sampleAt(telemetry[activeIndex],flightTime+.5);
                if (before && after) {
                    var lat1=before.lat*Math.PI/180, lat2=after.lat*Math.PI/180, dlat=lat2-lat1, dlng=(after.lng-before.lng)*Math.PI/180;
                    var hav=Math.sin(dlat/2)*Math.sin(dlat/2)+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlng/2)*Math.sin(dlng/2);
                    var metres=6371000*2*Math.atan2(Math.sqrt(hav),Math.sqrt(1-hav));
                    var y=Math.sin(dlng)*Math.cos(lat2), x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dlng);
                    var heading=(Math.atan2(y,x)*180/Math.PI+360)%360;
                    updateDirectionCone(activeMarker, heading, metres);
                    if(hudSpeed){hudSpeed.textContent=metres.toFixed(1)+' m/s';} if(hudHeading){hudHeading.textContent=String(Math.round(heading)).padStart(3,'0')+'°';}
                } else { updateDirectionCone(activeMarker, NaN, 0); }
            } else if (activeMarker) { map.removeLayer(activeMarker); activeMarker = null; }
            if (activeMedia && !activeMedia.paused && !activeMedia.ended) { animationFrame = window.requestAnimationFrame(updateMarker); }
        }
        function bindMedia(media) {
            activeMedia = media;
            media.addEventListener('loadedmetadata', function () {
                if (durationOutput && Number.isFinite(media.duration)) { durationOutput.textContent = Math.round(media.duration) + ' sec'; }
                updateMarker();
            });
            media.addEventListener('play', function () {
                mapElement.classList.add('is-video-playing');
                if (animationFrame) { cancelAnimationFrame(animationFrame); }
                showingInitialOverview = false;
                if (!playbackCameraFocused && telemetry[activeIndex]) {
                    var startTime = Number(items[activeIndex].flightOffset || 0) + Number(media.currentTime || 0);
                    var startPoint = sampleAt(telemetry[activeIndex], startTime);
                    if (startPoint) {
                        map.setView([startPoint.lat, startPoint.lng], Math.min(map.getZoom() + 2, 18), { animate:true, duration:0.55 });
                        playbackCameraFocused = true;
                        lastCameraFollow = window.performance.now();
                    }
                }
                updateMarker();
            });
            media.addEventListener('pause', function () {
                mapElement.classList.remove('is-video-playing');
                updateMarker();
            });
            ['timeupdate','seeking','seeked'].forEach(function (name) { media.addEventListener(name, updateMarker); });
            media.addEventListener('ended', function () {
                mapElement.classList.remove('is-video-playing');
                updateMarker();
                if (playAll && activeIndex + 1 < items.length) { activate(activeIndex + 1, true); }
                else if (playAll) { playAll = false; if (playAllButton) { playAllButton.innerHTML = '<span aria-hidden="true">▶</span> Play all flights (' + items.length + ')'; } }
            });
        }
        function buildMedia(item) {
            if (activeMedia && typeof activeMedia.pause === 'function') { activeMedia.pause(); }
            if (activeMedia && typeof activeMedia.destroy === 'function') { activeMedia.destroy(); }
            if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = null; }
            mediaContainer.innerHTML = '';
            mediaContainer.classList.toggle('is-youtube', item.videoType === 'youtube');
            if (item.videoType === 'youtube') {
                var host=document.createElement('div'); host.id='btv-drone-prototype-video'; host.className='btv-drone-youtube-player'; host.setAttribute('data-youtube-id',item.youtubeId); mediaContainer.appendChild(host);
                var button=document.createElement('button'); button.type='button'; button.className='btv-drone-youtube-play'; button.setAttribute('aria-label','Play video'); button.innerHTML='<span aria-hidden="true"></span>'; mediaContainer.appendChild(button);
                return createYouTubeMedia(host).then(bindMedia);
            }
            var element=document.createElement('video'); element.id='btv-drone-prototype-video'; element.controls=true; element.playsInline=true; element.preload='metadata'; element.src=item.videoUrl; mediaContainer.appendChild(element); bindMedia(element); return Promise.resolve();
        }
        function updateFacts(data) {
            var samples=data.samples, first=samples[0], last=samples[samples.length-1];
            if (hudStart) { hudStart.textContent=first.lat.toFixed(6)+'°, '+first.lng.toFixed(6)+'°'; }
            if (hudEnd) { hudEnd.textContent=last.lat.toFixed(6)+'°, '+last.lng.toFixed(6)+'°'; }
            if (hudSpeed) { hudSpeed.textContent='—'; } if (hudHeading) { hudHeading.textContent='—'; }
        }
        function activate(index, autoplay) {
            mapElement.classList.remove('is-video-playing');
            lastCameraFollow = 0;
            playbackCameraFocused = false;
            activeIndex = index; styleLayers();
            if (flightTrigger) { flightTrigger.querySelector('span').textContent = items[index].label; }
            flightChoices.forEach(function (choice) { choice.setAttribute('aria-selected', Number(choice.getAttribute('data-drone-flight-index')) === index ? 'true' : 'false'); });
            if (activeMarker) { map.removeLayer(activeMarker); activeMarker=null; }
            Promise.all([fetchFlight(index), buildMedia(items[index])]).then(function (result) {
                updateFacts(result[0]);
                if (!showingInitialOverview && layers[index] && layers[index].getBounds().isValid()) {
                    map.fitBounds(layers[index].getBounds(), { padding:[16,16], animate:false });
                }
                updateMarker(); if (autoplay && activeMedia) { activeMedia.play().catch(function () {}); }
            }).catch(function () { if (status) { status.textContent='This flight could not be loaded.'; } });
        }
        function closeFlightMenu() { if (!flightOptions || !flightTrigger) { return; } flightOptions.hidden=true; flightTrigger.setAttribute('aria-expanded','false'); }
        if (flightTrigger && flightOptions) {
            flightTrigger.addEventListener('click', function () { var opening=flightOptions.hidden; flightOptions.hidden=!opening; flightTrigger.setAttribute('aria-expanded',opening?'true':'false'); if(opening){var selected=flightOptions.querySelector('[aria-selected="true"]'); if(selected){selected.focus();}} });
            flightChoices.forEach(function (choice) { choice.addEventListener('click', function () { showingInitialOverview=false; playAll=false; closeFlightMenu(); if(playAllButton){playAllButton.innerHTML='<span aria-hidden="true">▶</span> Play all flights ('+items.length+')';} activate(Number(choice.getAttribute('data-drone-flight-index')),false); flightTrigger.focus(); }); });
            document.addEventListener('click', function (event) { if (!event.target.closest('.btv-drone-flight-menu')) { closeFlightMenu(); } });
            document.addEventListener('keydown', function (event) { if(event.key==='Escape'&&!flightOptions.hidden){closeFlightMenu();flightTrigger.focus();} });
        }
        if (playAllButton) { playAllButton.addEventListener('click', function () { showingInitialOverview=false; playAll=true; playAllButton.textContent='Playing all flights'; activate(activeIndex, true); }); }
        var mapDisclosure = document.querySelector('.btv-drone-disclosure--map');
        if (mapDisclosure) { mapDisclosure.addEventListener('toggle', function () { if (!mapDisclosure.open) { return; } window.setTimeout(function () { map.invalidateSize(); var all=L.featureGroup(Object.keys(layers).map(function(key){return layers[key];})); if(showingInitialOverview&&all.getBounds().isValid()){map.fitBounds(all.getBounds(),{padding:[24,24],animate:false});} }, 0); }); }
        items.forEach(function (_,index) { fetchFlight(index).catch(function () {}); });
        activate(0, false);
    }

    if (Array.isArray(config.flights) && config.flights.length) {
        initializeMultiFlightViewer(config.flights);
        return;
    }

    function normalizeFlight(rawFlight) {
        var flight = rawFlight;
        flight.samples = flight.samples.map(function (sample) {
            if (!Array.isArray(sample)) { return sample; }
            return {
                t: sample[0], lat: sample[1], lng: sample[2], alt: sample[3], segment: sample[4],
                satellites: sample.length > 5 ? sample[5] : null,
                distance: sample.length > 6 ? sample[6] : null,
                battery: sample.length > 7 ? sample[7] : null,
                gimbalHeading: sample.length > 8 ? sample[8] : null,
                gimbalPitch: sample.length > 9 ? sample[9] : null
            };
        });
        if (!Array.isArray(flight.segments)) {
            var grouped = {};
            flight.samples.forEach(function (sample) {
                if (!grouped[sample.segment]) { grouped[sample.segment] = []; }
                grouped[sample.segment].push([sample.lat, sample.lng]);
            });
            flight.segments = Object.keys(grouped).sort(function (a, b) { return Number(a) - Number(b); }).map(function (key) { return grouped[key]; });
        }
        return flight;
    }

    function initializeFlightViewer(rawFlight) {
    var flight = normalizeFlight(rawFlight);
    var samples = flight.samples;
    var offsetRange = document.getElementById('btv-drone-prototype-offset');
    var offsetNumber = document.getElementById('btv-drone-prototype-offset-number');
    var windowStatus = document.getElementById('btv-drone-prototype-window');
    var playbackStatus = document.getElementById('btv-drone-prototype-status');
    var flightMoment = document.getElementById('btv-drone-flight-moment');
    var flightMomentNumber = document.getElementById('btv-drone-flight-moment-number');
    var matchMoment = document.getElementById('btv-drone-match-moment');
    var previewSync = document.getElementById('btv-drone-preview-sync');
    var confirmSync = document.getElementById('btv-drone-confirm-sync');
    var confirmedInput = document.getElementById('btv-drone-alignment-confirmed');
    var confirmationStatus = document.getElementById('btv-drone-confirmation-status');
    var durationOutput = document.getElementById('btv-drone-video-duration');
    var durationInput = document.getElementById('btv-drone-video-duration-value');
    var hudGps = document.querySelector('[data-drone-hud="gps"]');
    var hudStartGps = document.querySelector('[data-drone-hud="start-gps"]');
    var hudEndGps = document.querySelector('[data-drone-hud="end-gps"]');
    var hudFlightTime = document.querySelector('[data-drone-hud="flight-time"]');
    var hudSatellites = document.querySelector('[data-drone-hud="satellites"]');
    var hudDistance = document.querySelector('[data-drone-hud="distance"]');
    var hudBattery = document.querySelector('[data-drone-hud="battery"]');
    var hudGimbalHeading = document.querySelector('[data-drone-hud="gimbal-heading"]');
    var hudGimbalPitch = document.querySelector('[data-drone-hud="gimbal-pitch"]');
    var hudSpeed = document.querySelector('[data-drone-hud="speed"]');
    var hudHeading = document.querySelector('[data-drone-hud="heading"]');
    var hudTime = document.querySelector('[data-drone-hud="time"]');
    var overlayGps = document.querySelector('[data-drone-overlay="gps"]');
    var animationFrame = null;
    var lastCameraFollow = 0;
    var smoothedMarkerPosition = null;
    var lastMarkerFrame = 0;
    var currentOffset = Number(config.flightOffset);
    if (!Number.isFinite(currentOffset)) { currentOffset = Number(flight.defaultOffset) || 0; }

    var map = L.map(mapElement, { zoomControl: true });
    var mapBasemap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    });
    var satelliteBasemap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        maxZoom: 19
    });
    mapBasemap.addTo(map);
    if (!config.editor) {
        L.control.layers({ Map: mapBasemap, Satellite: satelliteBasemap }, null, { position: 'topright', collapsed: false }).addTo(map);
        L.control.scale({ imperial: false, maxWidth: 100, position: 'bottomright' }).addTo(map);
    }

    var pathLayers = [];
    var pathGroup = L.featureGroup();
    var completedPathLayers = [];
    var upcomingPathLayers = [];
    var pulsePathLayers = [];
    var playbackWindowStart = null;
    var playbackWindowEnd = null;
    var lastRouteProgressUpdate = 0;
    var initialFitPending = true;
    var publicViewInitialized = false;

    function refreshMapSize(forceFit) {
        if (mapElement.offsetWidth < 2 || mapElement.offsetHeight < 2) { return; }
        map.invalidateSize({ pan: false, animate: false });
        if (!config.editor && publicViewInitialized) { return; }
        if ((initialFitPending || forceFit) && pathLayers.length && pathGroup.getBounds().isValid()) {
            map.fitBounds(pathGroup.getBounds(), { padding: [24, 24], animate: false });
            initialFitPending = false;
        }
    }

    function fitFlightPathAfterLayout() {
        window.requestAnimationFrame(function () {
            window.requestAnimationFrame(function () { refreshMapSize(true); });
        });
    }

    window.requestAnimationFrame(function () {
        window.requestAnimationFrame(refreshMapSize);
    });
    window.addEventListener('load', fitFlightPathAfterLayout);
    if ('ResizeObserver' in window) {
        var mapResizeFrame = null;
        new ResizeObserver(function () {
            if (mapResizeFrame) { window.cancelAnimationFrame(mapResizeFrame); }
            mapResizeFrame = window.requestAnimationFrame(refreshMapSize);
        }).observe(mapElement);
    }

    var droneIcon = L.divIcon({
        className: 'btv-drone-prototype-marker',
        html: '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12h10M9 9l-2 3 2 3m6-6 2 3-2 3M12 8v8"/><circle cx="6" cy="8" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="6" cy="16" r="2"/><circle cx="18" cy="16" r="2"/></svg></span>',
        iconSize: [34, 34],
        iconAnchor: [17, 17]
    });
    var positionMarker = L.marker([samples[0].lat, samples[0].lng], { icon: droneIcon, zIndexOffset: 1000 }).addTo(map);

    function offset() { return currentOffset; }

    function invalidateConfirmation() {
        if (!confirmedInput) { return; }
        confirmedInput.value = '0';
        confirmationStatus.textContent = 'Alignment needs review';
        confirmationStatus.classList.remove('is-confirmed');
        confirmationStatus.classList.add('needs-review');
    }

    function samplePosition(time) {
        if (time < samples[0].t || time > samples[samples.length - 1].t) { return null; }
        var low = 0;
        var high = samples.length - 1;
        while (low <= high) {
            var middle = Math.floor((low + high) / 2);
            if (samples[middle].t < time) { low = middle + 1; } else { high = middle - 1; }
        }
        if (low < samples.length && samples[low].t === time) { return samples[low]; }
        var next = samples[low];
        var previous = samples[low - 1];
        if (!previous || !next || previous.segment !== next.segment || next.t - previous.t > flight.maxGapSeconds) { return null; }
        var ratio = (time - previous.t) / (next.t - previous.t);
        return {
            lat: previous.lat + (next.lat - previous.lat) * ratio,
            lng: previous.lng + (next.lng - previous.lng) * ratio,
            alt: null === previous.alt || null === next.alt ? null : previous.alt + (next.alt - previous.alt) * ratio,
            satellites: ratio < 0.5 ? previous.satellites : next.satellites,
            distance: null == previous.distance || null == next.distance ? null : previous.distance + (next.distance - previous.distance) * ratio,
            battery: null == previous.battery || null == next.battery ? null : previous.battery + (next.battery - previous.battery) * ratio,
            gimbalHeading: ratio < 0.5 ? previous.gimbalHeading : next.gimbalHeading,
            gimbalPitch: null == previous.gimbalPitch || null == next.gimbalPitch ? null : previous.gimbalPitch + (next.gimbalPitch - previous.gimbalPitch) * ratio,
            t: time,
            segment: previous.segment
        };
    }

    function routeSegmentsBetween(windowStart, windowEnd) {
        var segments = [];
        var currentSegment = [];
        var currentSegmentId = null;

        function addPosition(position) {
            if (!position) {
                if (currentSegment.length > 1) { segments.push(currentSegment); }
                currentSegment = [];
                currentSegmentId = null;
                return;
            }
            if (null !== currentSegmentId && position.segment !== currentSegmentId) {
                if (currentSegment.length > 1) { segments.push(currentSegment); }
                currentSegment = [];
            }
            currentSegmentId = position.segment;
            var point = [position.lat, position.lng];
            var previousPoint = currentSegment[currentSegment.length - 1];
            if (!previousPoint || previousPoint[0] !== point[0] || previousPoint[1] !== point[1]) {
                currentSegment.push(point);
            }
        }

        var startPosition = samplePosition(windowStart);
        var endPosition = samplePosition(windowEnd);
        addPosition(startPosition);
        samples.forEach(function (sample) {
            if (sample.t > windowStart && sample.t < windowEnd) { addPosition(sample); }
        });
        addPosition(endPosition);
        if (currentSegment.length > 1) { segments.push(currentSegment); }
        return { segments: segments, start: startPosition, end: endPosition };
    }

    function replaceRouteLayers(target, segments, options) {
        options = Object.assign({ smoothFactor: 0 }, options);
        while (target.length > segments.length) {
            map.removeLayer(target.pop());
        }
        segments.forEach(function (segment, index) {
            if (!target[index]) {
                target[index] = L.polyline(segment, options).addTo(map);
            } else {
                target[index].setLatLngs(segment);
            }
        });
        return target;
    }

    function updatePublicRouteProgress(flightTime, force) {
        if (config.editor || null === playbackWindowStart || null === playbackWindowEnd) { return; }
        var now = window.performance.now();
        if (!force && now - lastRouteProgressUpdate < 220) { return; }
        lastRouteProgressUpdate = now;
        var current = Math.max(playbackWindowStart, Math.min(playbackWindowEnd, flightTime));
        var completed = routeSegmentsBetween(playbackWindowStart, current).segments;
        var upcoming = routeSegmentsBetween(current, playbackWindowEnd).segments;
        completedPathLayers = replaceRouteLayers(completedPathLayers, completed, {
            color: '#6e7359', weight: 4, opacity: 0.34, lineCap: 'round', lineJoin: 'round', className: 'btv-drone-route-completed'
        });
        upcomingPathLayers = replaceRouteLayers(upcomingPathLayers, upcoming, {
            color: '#6e7359', weight: 4, opacity: 0.42, dashArray: '8 12', lineCap: 'round', lineJoin: 'round', className: 'btv-drone-route-upcoming'
        });
        pulsePathLayers = replaceRouteLayers(pulsePathLayers, upcoming, {
            color: '#d9cda9', weight: 4, opacity: 0.95, dashArray: '8 32', lineCap: 'round', lineJoin: 'round', className: 'btv-drone-route-pulse is-active-flight'
        });
        pathLayers = completedPathLayers.concat(upcomingPathLayers, pulsePathLayers);
    }

    function rebuildPlaybackPath() {
        pathLayers.forEach(function (layer) { map.removeLayer(layer); });
        pathLayers = [];
        completedPathLayers = [];
        upcomingPathLayers = [];
        pulsePathLayers = [];
        pathGroup = L.featureGroup();

        if (!Number.isFinite(video.duration) || video.duration <= 0) { return; }

        var windowStart = Math.max(samples[0].t, offset());
        var windowEnd = Math.min(samples[samples.length - 1].t, offset() + video.duration);
        var route = routeSegmentsBetween(windowStart, windowEnd);
        var startPosition = route.start;
        var endPosition = route.end;
        playbackWindowStart = windowStart;
        playbackWindowEnd = windowEnd;

        if (config.editor) {
            pathLayers = route.segments.map(function (segment) {
                return L.polyline(segment, { color: '#6e7359', weight: 4, opacity: 0.85, lineCap: 'round', lineJoin: 'round', smoothFactor: 0 }).addTo(map);
            });
        } else {
            updatePublicRouteProgress(windowStart, true);
        }
        pathGroup = L.featureGroup(pathLayers);
        initialFitPending = true;

        if (hudStartGps) {
            hudStartGps.textContent = startPosition ? startPosition.lat.toFixed(6) + '°, ' + startPosition.lng.toFixed(6) + '°' : 'NO TELEMETRY';
        }
        if (hudEndGps) {
            hudEndGps.textContent = endPosition ? endPosition.lat.toFixed(6) + '°, ' + endPosition.lng.toFixed(6) + '°' : 'NO TELEMETRY';
        }
        if (!config.editor && startPosition) {
            map.invalidateSize({ pan: false, animate: false });
            if (!publicViewInitialized) {
                map.setView([startPosition.lat, startPosition.lng], 18, { animate: false });
                publicViewInitialized = true;
            }
            initialFitPending = false;
        } else {
            refreshMapSize(true);
        }
    }

    function distanceMetres(a, b) {
        var earthRadius = 6371000;
        var lat1 = a.lat * Math.PI / 180;
        var lat2 = b.lat * Math.PI / 180;
        var deltaLat = (b.lat - a.lat) * Math.PI / 180;
        var deltaLng = (b.lng - a.lng) * Math.PI / 180;
        var value = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
        return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
    }

    function motionAtTime(time) {
        var startTime = Math.max(samples[0].t, time - 0.5);
        var endTime = Math.min(samples[samples.length - 1].t, time + 0.5);
        if (endTime - startTime < 0.2) { return null; }
        var start = samplePosition(startTime);
        var end = samplePosition(endTime);
        if (!start || !end) { return null; }
        var distance = distanceMetres(start, end);
        var lat1 = start.lat * Math.PI / 180;
        var lat2 = end.lat * Math.PI / 180;
        var deltaLng = (end.lng - start.lng) * Math.PI / 180;
        var y = Math.sin(deltaLng) * Math.cos(lat2);
        var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
        var heading = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
        return { speed: distance / (endTime - startTime), heading: heading };
    }

    function compassDirection(degrees) {
        var directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        return directions[Math.round(degrees / 45) % directions.length];
    }

    function formatElapsed(seconds) {
        seconds = Math.max(0, Number(seconds) || 0);
        var minutes = Math.floor(seconds / 60);
        var remainder = (seconds % 60).toFixed(1).padStart(4, '0');
        return String(minutes).padStart(2, '0') + ':' + remainder;
    }

    function formatFlightTime(flightTime) {
        if (!flight.firstUtc) { return '—'; }
        var start = new Date(String(flight.firstUtc).replace(' ', 'T') + 'Z');
        if (Number.isNaN(start.getTime())) { return '—'; }
        var moment = new Date(start.getTime() + flightTime * 1000);
        var options = { hour: 'numeric', minute: '2-digit', second: '2-digit' };
        if (config.timeZone && !/^[+-]/.test(config.timeZone)) { options.timeZone = config.timeZone; }
        try { return new Intl.DateTimeFormat(undefined, options).format(moment); }
        catch (error) { return moment.toISOString().slice(11, 19) + ' UTC'; }
    }

    function updateHud(position, flightTime) {
        if (!hudGps) { return; }
        var motion = position ? motionAtTime(flightTime) : null;
        hudGps.textContent = position ? position.lat.toFixed(6) + '°, ' + position.lng.toFixed(6) + '°' : 'NO TELEMETRY';
        if (hudFlightTime) { hudFlightTime.textContent = position ? formatFlightTime(flightTime) : '—'; }
        if (hudSatellites) { hudSatellites.textContent = position && null != position.satellites ? String(Math.round(position.satellites)) : '—'; }
        if (hudDistance) {
            var distanceFeet = position && null != position.distance ? position.distance : (position ? distanceMetres(samples[0], position) * 3.280839895 : null);
            hudDistance.textContent = null !== distanceFeet ? distanceFeet.toFixed(1) + ' ft' : '—';
        }
        if (hudBattery) { hudBattery.textContent = position && null != position.battery ? Math.round(position.battery) + '%' : '—'; }
        if (hudGimbalHeading) { hudGimbalHeading.textContent = position && null != position.gimbalHeading ? String(Math.round(position.gimbalHeading)).padStart(3, '0') + '° ' + compassDirection(position.gimbalHeading) : '—'; }
        if (hudGimbalPitch) { hudGimbalPitch.textContent = position && null != position.gimbalPitch ? position.gimbalPitch.toFixed(1) + '°' : '—'; }
        hudSpeed.textContent = motion ? motion.speed.toFixed(1) + ' m/s' : '—';
        hudHeading.textContent = motion && motion.speed >= 0.3 ? String(Math.round(motion.heading)).padStart(3, '0') + '° ' + compassDirection(motion.heading) : '—';
        if (hudTime) { hudTime.textContent = formatElapsed(video.currentTime); }
        if (overlayGps) { overlayGps.textContent = hudGps.textContent; }
    }

    function showPosition(flightTime, prefix) {
        updatePublicRouteProgress(flightTime, video.seeking || video.paused || video.ended);
        var position = samplePosition(flightTime);
        var isPreRoll = flightTime < samples[0].t;
        if (!position && isPreRoll) {
            position = samples[0];
        }
        if (!position) {
            if (map.hasLayer(positionMarker)) { map.removeLayer(positionMarker); }
            smoothedMarkerPosition = null;
            lastMarkerFrame = 0;
            if (playbackStatus) { playbackStatus.textContent = (prefix || 'Flight ' + flightTime.toFixed(1) + ' s') + ' — no interpolated position in this telemetry gap or outside the flight record.'; }
            updateHud(null, flightTime);
            return;
        }
        if (!map.hasLayer(positionMarker)) { positionMarker.addTo(map); }
        var now = window.performance.now();
        var shouldSnapMarker = config.editor || video.seeking || video.paused || video.ended || isPreRoll || !smoothedMarkerPosition || !lastMarkerFrame;
        if (shouldSnapMarker) {
            smoothedMarkerPosition = { lat: position.lat, lng: position.lng };
        } else {
            var markerDeltaSeconds = Math.min(0.25, Math.max(0.001, (now - lastMarkerFrame) / 1000));
            var markerBlend = 1 - Math.exp(-markerDeltaSeconds / 0.28);
            smoothedMarkerPosition.lat += (position.lat - smoothedMarkerPosition.lat) * markerBlend;
            smoothedMarkerPosition.lng += (position.lng - smoothedMarkerPosition.lng) * markerBlend;
        }
        lastMarkerFrame = now;
        var markerPosition = [smoothedMarkerPosition.lat, smoothedMarkerPosition.lng];
        positionMarker.setLatLng(markerPosition);
        var markerMotion = motionAtTime(flightTime);
        updateDirectionCone(positionMarker, markerMotion ? markerMotion.heading : NaN, markerMotion ? markerMotion.speed : 0);
        if (!config.editor && publicViewInitialized) {
            var mapSize = map.getSize();
            var markerPoint = map.latLngToContainerPoint(markerPosition);
            var centerPoint = mapSize.divideBy(2);
            var outsideCenterZone = Math.abs(markerPoint.x - centerPoint.x) > Math.max(28, mapSize.x * 0.1)
                || Math.abs(markerPoint.y - centerPoint.y) > Math.max(24, mapSize.y * 0.1);
            if (video.seeking || video.paused || video.ended) {
                map.panTo(markerPosition, { animate: false, noMoveStart: true });
                lastCameraFollow = now;
            } else if (outsideCenterZone && now - lastCameraFollow >= 50) {
                var mapCenter = map.getCenter();
                var cameraDeltaSeconds = Math.min(0.25, Math.max(0.016, (now - lastCameraFollow) / 1000));
                var cameraBlend = 1 - Math.exp(-cameraDeltaSeconds / 0.45);
                map.panTo([
                    mapCenter.lat + (smoothedMarkerPosition.lat - mapCenter.lat) * cameraBlend,
                    mapCenter.lng + (smoothedMarkerPosition.lng - mapCenter.lng) * cameraBlend
                ], { animate: false, noMoveStart: true });
                lastCameraFollow = now;
            }
        }
        if (isPreRoll) {
            if (playbackStatus) { playbackStatus.textContent = (prefix || 'Flight ' + flightTime.toFixed(1) + ' s') + ' — telemetry begins at flight ' + samples[0].t.toFixed(1) + ' s.'; }
            updateHud(null, flightTime);
        } else {
            if (playbackStatus) { playbackStatus.textContent = (prefix || 'Flight ' + flightTime.toFixed(1) + ' s') + ' · ' + position.lat.toFixed(6) + ', ' + position.lng.toFixed(6) + (null === position.alt ? '' : ' · ' + position.alt.toFixed(1) + ' ft above takeoff'); }
            updateHud(position, flightTime);
        }
    }

    function updatePosition() {
        var flightTime = offset() + video.currentTime;
        showPosition(flightTime, 'Video ' + video.currentTime.toFixed(1) + ' s → flight ' + flightTime.toFixed(1) + ' s');
    }

    function updateWindow() {
        var end = Number.isFinite(video.duration) ? Math.min(offset() + video.duration, flight.duration) : null;
        if (!windowStatus) { updatePosition(); return; }
        windowStatus.textContent = null === end
            ? 'Playback window starts at flight ' + offset().toFixed(1) + ' s. Load video metadata to calculate its end.'
            : 'Playback window: flight ' + offset().toFixed(1) + '–' + end.toFixed(1) + ' s (' + video.duration.toFixed(1) + ' s video; no time stretching).';
        updatePosition();
    }

    function animate() {
        updatePosition();
        if (!video.paused && !video.ended) { animationFrame = window.requestAnimationFrame(animate); }
    }
    function startAnimation() {
        if (animationFrame) { window.cancelAnimationFrame(animationFrame); }
        animationFrame = window.requestAnimationFrame(animate);
    }
    function stopAnimation() {
        if (animationFrame) { window.cancelAnimationFrame(animationFrame); animationFrame = null; }
        updatePosition();
    }
    function setOffset(value, changedByEditor) {
        var next = Number(value);
        if (!Number.isFinite(next)) { next = Number(flight.defaultOffset) || 0; }
        if (offsetRange && offsetNumber) {
            var minimum = Number(offsetRange.min);
            var maximum = Number(offsetRange.max);
            if (Number.isFinite(minimum)) { next = Math.max(minimum, next); }
            if (Number.isFinite(maximum)) { next = Math.min(maximum, next); }
            offsetRange.value = next.toFixed(3);
            offsetNumber.value = next.toFixed(3);
        }
        currentOffset = next;
        if (changedByEditor) { invalidateConfirmation(); }
        rebuildPlaybackPath();
        updateWindow();
    }

    if (offsetRange && offsetNumber) {
        offsetRange.addEventListener('input', function () { setOffset(offsetRange.value, true); });
        offsetNumber.addEventListener('input', function () { setOffset(offsetNumber.value, true); });
    }
    if (flightMoment && flightMomentNumber) {
        function setFlightMoment(value) {
            var minimum = Number(flightMoment.min);
            var maximum = Number(flightMoment.max);
            var next = Math.max(minimum, Math.min(Number(value) || 0, maximum));
            flightMoment.value = next.toFixed(3);
            flightMomentNumber.value = next.toFixed(3);
            showPosition(next, 'Selected flight ' + next.toFixed(1) + ' s');
        }
        flightMoment.addEventListener('input', function () { setFlightMoment(flightMoment.value); });
        flightMomentNumber.addEventListener('input', function () { setFlightMoment(flightMomentNumber.value); });
        matchMoment.addEventListener('click', function () {
            setOffset(Number(flightMomentNumber.value) - video.currentTime, true);
        });
    }
    if (previewSync) {
        previewSync.addEventListener('click', function () {
            updatePosition();
            video.play().catch(function () {});
        });
    }
    if (confirmSync) {
        confirmSync.addEventListener('click', function (event) {
            event.preventDefault();
            confirmedInput.value = '1';
            confirmationStatus.textContent = 'Saving alignment…';
            confirmationStatus.classList.add('is-confirmed');
            confirmationStatus.classList.remove('needs-review');
            if (confirmSync.form) { confirmSync.form.requestSubmit(confirmSync); }
        });
    }
    function updateDuration() {
        if (!Number.isFinite(video.duration)) { return; }
        if (durationInput) { durationInput.value = video.duration.toFixed(3); }
        if (!durationOutput) { return; }
        var totalSeconds = Math.max(0, Math.round(video.duration));
        var minutes = Math.floor(totalSeconds / 60);
        var seconds = totalSeconds % 60;
        durationOutput.textContent = minutes ? minutes + ' min ' + seconds + ' sec' : seconds + ' sec';
    }
    video.addEventListener('loadedmetadata', function () {
        updateDuration();
        setOffset(offset(), false);
        fitFlightPathAfterLayout();
    });
    video.addEventListener('play', function () {
        mapElement.classList.add('is-video-playing');
        startAnimation();
    });
    video.addEventListener('pause', function () {
        mapElement.classList.remove('is-video-playing');
        stopAnimation();
    });
    video.addEventListener('ended', function () {
        mapElement.classList.remove('is-video-playing');
        stopAnimation();
    });
    video.addEventListener('seeking', updatePosition);
    video.addEventListener('seeked', updatePosition);
    video.addEventListener('timeupdate', updatePosition);
    updateDuration();
    setOffset(currentOffset, false);
    if (video.readyState >= 1) { fitFlightPathAfterLayout(); }
    }

    function initializeWithMedia(media) {
        video = media;
        if (config.flight) {
            initializeFlightViewer(config.flight);
        } else if (config.telemetryUrl) {
            var loadingStatus = document.getElementById('btv-drone-prototype-status');
            if (loadingStatus) { loadingStatus.textContent = 'Loading processed flight telemetry…'; }
            fetch(config.telemetryUrl, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
                .then(function (response) {
                    if (!response.ok) { throw new Error('Telemetry request failed.'); }
                    return response.json();
                })
                .then(initializeFlightViewer)
                .catch(function () {
                    if (loadingStatus) { loadingStatus.textContent = 'Synchronized flight telemetry could not be loaded.'; }
                });
        }
    }

    if (config.videoType === 'youtube') {
        createYouTubeMedia(mediaHost).then(initializeWithMedia).catch(function () {
            var status = document.getElementById('btv-drone-prototype-status');
            if (status) { status.textContent = 'The YouTube player could not be loaded.'; }
        });
    } else {
        initializeWithMedia(mediaHost);
    }
}());
