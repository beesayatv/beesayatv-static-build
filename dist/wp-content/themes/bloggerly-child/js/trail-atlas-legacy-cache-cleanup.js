(function () {
    'use strict';

    var cleanupKey = 'beesayatv-trail-atlas-legacy-cache-cleanup-v1';

    try {
        if (window.localStorage.getItem(cleanupKey) === 'complete') {
            return;
        }
    } catch (error) {
        // Cleanup can still run when browser storage is restricted.
    }

    var tasks = [];

    if ('serviceWorker' in navigator) {
        tasks.push(
            navigator.serviceWorker.getRegistrations().then(function (registrations) {
                return Promise.all(registrations.map(function (registration) {
                    return registration.unregister();
                }));
            })
        );
    }

    if ('caches' in window) {
        tasks.push(
            caches.keys().then(function (keys) {
                return Promise.all(keys.map(function (key) {
                    return caches.delete(key);
                }));
            })
        );
    }

    Promise.allSettled(tasks).then(function () {
        try {
            window.localStorage.setItem(cleanupKey, 'complete');
        } catch (error) {
            // A successful cleanup does not depend on recording the marker.
        }
    });
}());
