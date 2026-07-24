(function () {
    'use strict';

    var slots = document.querySelectorAll('.trail-weather-icons[data-weather-lat][data-weather-lng]');
    if (!slots.length || !window.fetch || !window.AbortController) {
        return;
    }

    var icons = {
        clear: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
        'partly-cloudy': '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4V2M5.64 6.64 4.22 5.22M4 13H2M17.66 6.64l1.42-1.42"/><circle cx="12" cy="10" r="4"/><path d="M6 19h11a3 3 0 0 0 .3-6A5.5 5.5 0 0 0 7 14.5 2.5 2.5 0 0 0 6 19Z"/></svg>',
        cloudy: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 19h11a3 3 0 0 0 .3-6A5.5 5.5 0 0 0 7 14.5 2.5 2.5 0 0 0 6 19Z"/></svg>',
        rain: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15h11a3 3 0 0 0 .3-6A5.5 5.5 0 0 0 7 10.5 2.5 2.5 0 0 0 6 15Z"/><path d="m8 18-1 3m5-3-1 3m5-3-1 3"/></svg>',
        thunderstorm: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15h11a3 3 0 0 0 .3-6A5.5 5.5 0 0 0 7 10.5 2.5 2.5 0 0 0 6 15Z"/><path d="m13 16-3 4h3l-2 3"/></svg>',
        fog: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 13h11a3 3 0 0 0 .3-6A5.5 5.5 0 0 0 7 8.5 2.5 2.5 0 0 0 6 13Z"/><path d="M4 17h13M6 20h11"/></svg>'
    };

    function validForecast(item) {
        return item && typeof item.date === 'string' && typeof item.description === 'string' && icons[item.icon] && Number.isFinite(Number(item.temperature_min)) && Number.isFinite(Number(item.temperature_max)) && Number.isFinite(Number(item.rain_probability));
    }

    function accessibleLabel(item) {
        var date = new Date(item.date + 'T12:00:00+08:00');
        var day = new Intl.DateTimeFormat('en-PH', { weekday: 'long', timeZone: 'Asia/Manila' }).format(date);
        return day + ': ' + item.description.toLowerCase() + ', ' + Math.round(item.temperature_min) + ' to ' + Math.round(item.temperature_max) + ' degrees Celsius, ' + Math.round(item.rain_probability) + ' percent chance of rain.';
    }

    function dayAbbreviation(item) {
        var date = new Date(item.date + 'T12:00:00+08:00');
        return new Intl.DateTimeFormat('en-PH', { weekday: 'short', timeZone: 'Asia/Manila' }).format(date);
    }

    function dayInitial(item) {
        var date = new Date(item.date + 'T12:00:00+08:00');
        return new Intl.DateTimeFormat('en-PH', { weekday: 'narrow', timeZone: 'Asia/Manila' }).format(date);
    }

    function render(slot, forecast) {
        var fragment = document.createDocumentFragment();
        forecast.forEach(function (item) {
            var itemElement = document.createElement('span');
            itemElement.className = 'trail-weather-icons__item';
            itemElement.setAttribute('data-weather-icon', item.icon);
            itemElement.setAttribute('role', 'img');
            itemElement.setAttribute('aria-label', accessibleLabel(item));
            itemElement.innerHTML = '<span class="trail-weather-icons__day" data-day-initial="' + dayInitial(item) + '" aria-hidden="true">' + dayAbbreviation(item) + '</span><span class="trail-weather-icons__symbol" aria-hidden="true">' + icons[item.icon] + '</span>';
            fragment.appendChild(itemElement);
        });
        slot.replaceChildren(fragment);
        slot.hidden = false;
    }

    slots.forEach(function (slot) {
        var lat = Number(slot.dataset.weatherLat);
        var lng = Number(slot.dataset.weatherLng);
        var endpoint = slot.dataset.weatherEndpoint;
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !endpoint) {
            return;
        }

        var controller = new AbortController();
        var timeout = window.setTimeout(function () { controller.abort(); }, 6000);
        var url = new URL(endpoint, window.location.origin);
        url.searchParams.set('lat', String(lat));
        url.searchParams.set('lng', String(lng));

        fetch(url.toString(), { signal: controller.signal, headers: { Accept: 'application/json' } })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('Weather request failed');
                }
                return response.json();
            })
            .then(function (data) {
                var forecast = data && Array.isArray(data.forecast) ? data.forecast : [];
                if (forecast.length !== 3 || !forecast.every(validForecast)) {
                    throw new Error('Weather response is incomplete');
                }
                render(slot, forecast);
            })
            .catch(function () {
                slot.replaceChildren();
                slot.hidden = true;
            })
            .finally(function () {
                window.clearTimeout(timeout);
            });
    });
}());
