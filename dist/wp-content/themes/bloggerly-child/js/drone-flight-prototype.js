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
    var animationFrame = null;
    var currentOffset = Number(config.flightOffset);
    if (!Number.isFinite(currentOffset)) { currentOffset = Number(flight.defaultOffset) || 0; }

    var map = L.map(mapElement, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    var pathLayers = flight.segments.map(function (segment) {
        return L.polyline(segment, { color: '#6e7359', weight: 4, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }).addTo(map);
    });
    var pathGroup = L.featureGroup(pathLayers);
    var initialFitPending = true;

    function refreshMapSize() {
        if (mapElement.offsetWidth < 2 || mapElement.offsetHeight < 2) { return; }
        map.invalidateSize({ pan: false, animate: false });
        if (initialFitPending && pathLayers.length && pathGroup.getBounds().isValid()) {
            map.fitBounds(pathGroup.getBounds(), { padding: [24, 24], animate: false });
            initialFitPending = false;
        }
    }

    window.requestAnimationFrame(function () {
        window.requestAnimationFrame(refreshMapSize);
    });
    window.addEventListener('load', refreshMapSize);
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

    function showPosition(flightTime, prefix) {
        var position = samplePosition(flightTime);
        if (!position) {
            if (map.hasLayer(positionMarker)) { map.removeLayer(positionMarker); }
            playbackStatus.textContent = (prefix || 'Flight ' + flightTime.toFixed(1) + ' s') + ' — no interpolated position in this telemetry gap or outside the flight record.';
            return;
        }
        if (!map.hasLayer(positionMarker)) { positionMarker.addTo(map); }
        positionMarker.setLatLng([position.lat, position.lng]);
        playbackStatus.textContent = (prefix || 'Flight ' + flightTime.toFixed(1) + ' s') + ' · ' + position.lat.toFixed(6) + ', ' + position.lng.toFixed(6) + (null === position.alt ? '' : ' · ' + position.alt.toFixed(1) + ' ft above takeoff');
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
    video.addEventListener('loadedmetadata', function () { setOffset(offset(), false); });
    video.addEventListener('play', startAnimation);
    video.addEventListener('pause', stopAnimation);
    video.addEventListener('ended', stopAnimation);
    video.addEventListener('seeking', updatePosition);
    video.addEventListener('seeked', updatePosition);
    video.addEventListener('timeupdate', updatePosition);
    setOffset(currentOffset, false);
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
