(function () {
    'use strict';

    var config = window.beesayatvDroneFlightPrototype;
    var mapElement = document.getElementById('btv-drone-prototype-map');
    var video = document.getElementById('btv-drone-prototype-video');
    if (!config || !mapElement || !video || !window.L) { return; }

    function normalizeFlight(rawFlight) {
        var flight = rawFlight;
        flight.samples = flight.samples.map(function (sample) {
            if (!Array.isArray(sample)) { return sample; }
            return { t: sample[0], lat: sample[1], lng: sample[2], alt: sample[3], segment: sample[4] };
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
    var hudGps = document.querySelector('[data-drone-hud="gps"]');
    var hudAltitude = document.querySelector('[data-drone-hud="altitude"]');
    var hudSpeed = document.querySelector('[data-drone-hud="speed"]');
    var hudHeading = document.querySelector('[data-drone-hud="heading"]');
    var hudTime = document.querySelector('[data-drone-hud="time"]');
    var animationFrame = null;
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

    var pathLayers = flight.segments.map(function (segment) {
        return L.polyline(segment, { color: '#6e7359', weight: 4, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }).addTo(map);
    });
    var pathGroup = L.featureGroup(pathLayers);
    var initialFitPending = true;

    function refreshMapSize(forceFit) {
        if (mapElement.offsetWidth < 2 || mapElement.offsetHeight < 2) { return; }
        map.invalidateSize({ pan: false, animate: false });
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
            t: time
        };
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

    function updateHud(position, flightTime) {
        if (!hudGps) { return; }
        var motion = position ? motionAtTime(flightTime) : null;
        hudGps.textContent = position ? position.lat.toFixed(6) + '°, ' + position.lng.toFixed(6) + '°' : 'NO TELEMETRY';
        hudAltitude.textContent = position && null !== position.alt ? position.alt.toFixed(1) + ' ft' : '—';
        hudSpeed.textContent = motion ? motion.speed.toFixed(1) + ' m/s' : '—';
        hudHeading.textContent = motion && motion.speed >= 0.3 ? String(Math.round(motion.heading)).padStart(3, '0') + '° ' + compassDirection(motion.heading) : '—';
        hudTime.textContent = formatElapsed(video.currentTime);
    }

    function showPosition(flightTime, prefix) {
        var position = samplePosition(flightTime);
        if (!position) {
            if (map.hasLayer(positionMarker)) { map.removeLayer(positionMarker); }
            if (playbackStatus) { playbackStatus.textContent = (prefix || 'Flight ' + flightTime.toFixed(1) + ' s') + ' — no interpolated position in this telemetry gap or outside the flight record.'; }
            updateHud(null, flightTime);
            return;
        }
        if (!map.hasLayer(positionMarker)) { positionMarker.addTo(map); }
        positionMarker.setLatLng([position.lat, position.lng]);
        if (playbackStatus) { playbackStatus.textContent = (prefix || 'Flight ' + flightTime.toFixed(1) + ' s') + ' · ' + position.lat.toFixed(6) + ', ' + position.lng.toFixed(6) + (null === position.alt ? '' : ' · ' + position.alt.toFixed(1) + ' ft above takeoff'); }
        updateHud(position, flightTime);
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
            offsetRange.value = next.toFixed(1);
            offsetNumber.value = next.toFixed(1);
        }
        currentOffset = next;
        if (changedByEditor) { invalidateConfirmation(); }
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
            flightMoment.value = next.toFixed(1);
            flightMomentNumber.value = next.toFixed(1);
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
        confirmSync.addEventListener('click', function () {
            confirmedInput.value = '1';
            confirmationStatus.textContent = 'Alignment confirmed — save or update the survey to publish it';
            confirmationStatus.classList.add('is-confirmed');
            confirmationStatus.classList.remove('needs-review');
        });
    }
    function updateDuration() {
        if (!durationOutput || !Number.isFinite(video.duration)) { return; }
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
}());
