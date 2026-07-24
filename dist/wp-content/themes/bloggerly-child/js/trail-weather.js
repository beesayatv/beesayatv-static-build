(function () {
    'use strict';

    var slots = document.querySelectorAll('.trail-weather-icons[data-weather-lat][data-weather-lng]');
    if (!slots.length || !window.fetch || !window.AbortController) {
        return;
    }

    var icons = {
        clear: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
        'partly-cloudy': '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4V2M5.64 6.64 4.22 5.22M4 13H2M17.66 6.64l1.42-1.42"/><circle cx="12" cy="10" r="4"/><path d="M6 19h11a3 3 0 0 0 .3-6A5.5 5.5 0 0 0 7 14.5 2.5 2.5 0 0 0 6 19Z"/></svg>',
        cloudy: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 19h11a3 3 0 0 0 .3-6A5.5 5.5 0 0 0 7 8.5 2.5 2.5 0 0 0 6 13Z"/></svg>',
        rain: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15h11a3 3 0 0 0 .3-6A5.5 5.5 0 0 0 7 10.5 2.5 2.5 0 0 0 6 15Z"/><path d="m8 18-1 3m5-3-1 3m5-3-1 3"/></svg>',
        thunderstorm: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15h11a3 3 0 0 0 .3-6A5.5 5.5 0 0 0 7 10.5 2.5 2.5 0 0 0 6 15Z"/><path d="m13 16-3 4h3l-2 3"/></svg>',
        fog: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 13h11a3 3 0 0 0 .3-6A5.5 5.5 0 0 0 6 13Z"/><path d="M4 17h13M6 20h11"/></svg>'
    };
    var dropletIcon = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.69 5.37 9.32a7 7 0 1 0 13.26 0L12 2.69Z"/></svg>';
    function localDate(item) {
        return new Date(item.date + 'T12:00:00+08:00');
    }

    function dayName(item, style) {
        return new Intl.DateTimeFormat('en-PH', { weekday: style, timeZone: 'Asia/Manila' }).format(localDate(item));
    }

    function validHourlyRain(item) {
        return !Array.isArray(item.hourly_rain) || (item.hourly_rain.length === 6 && item.hourly_rain.every(function (entry) {
            return entry && typeof entry.time === 'string' && Number.isFinite(Number(entry.probability));
        }));
    }

    function validForecast(item) {
        return item && typeof item.date === 'string' && typeof item.description === 'string' && icons[item.icon] && Number.isFinite(Number(item.temperature_min)) && Number.isFinite(Number(item.temperature_max)) && Number.isFinite(Number(item.rain_probability)) && validHourlyRain(item);
    }

    function accessibleLabel(item) {
        return dayName(item, 'long') + ': ' + item.description.toLowerCase() + ', ' + rainLikelihoodLabel(item.rain_probability) + ' (' + Math.round(item.rain_probability) + ' percent). Show rain outlook.';
    }

    function rainLikelihoodLevel(probability) {
        return Math.max(1, Math.min(5, Math.ceil(Number(probability) / 20)));
    }

    function rainLikelihoodLabel(probability) {
        var level = rainLikelihoodLevel(probability);
        return ['Very low chance of rain', 'Low chance of rain', 'Moderate chance of rain', 'High chance of rain', 'Very high chance of rain'][level - 1];
    }

    function rainLikelihoodDropletsMarkup(probability, className) {
        var level = rainLikelihoodLevel(probability);
        var droplets = '';
        for (var index = 1; index <= 5; index += 1) {
            droplets += '<span class="' + className + '__droplet' + (index <= level ? ' is-filled' : '') + '">' + dropletIcon + '</span>';
        }
        return droplets;
    }

    function rainSummaryMarkup(probability) {
        return '<span class="trail-weather-icons__rain" aria-hidden="true">' + Math.round(probability) + '%</span>';
    }

    function timeLabel(time) {
        var hour = Number(time.slice(0, 2));
        var suffix = hour >= 12 ? 'PM' : 'AM';
        var displayHour = hour % 12 || 12;
        return displayHour + ':00 ' + suffix;
    }

    function setActiveButton(buttons, activeButton) {
        buttons.forEach(function (button) {
            var active = button === activeButton;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-expanded', active ? 'true' : 'false');
        });
    }

    function renderRainDetail(panel, item) {
        var heading = document.createElement('h4');
        heading.className = 'trail-weather-detail__title';
        heading.id = panel.id + '-title';
        heading.textContent = dayName(item, 'long') + ' rain outlook';
        panel.setAttribute('aria-labelledby', heading.id);
        panel.replaceChildren(heading);

        if (!Array.isArray(item.hourly_rain) || item.hourly_rain.length !== 6) {
            var unavailable = document.createElement('p');
            unavailable.className = 'trail-weather-detail__unavailable';
            unavailable.textContent = 'Rain detail unavailable';
            panel.appendChild(unavailable);
            return;
        }

        var entries = document.createElement('div');
        entries.className = 'trail-weather-detail__entries';
        item.hourly_rain.forEach(function (entry) {
            var entryElement = document.createElement('div');
            var time = document.createElement('span');
            var likelihood = document.createElement('span');
            time.textContent = timeLabel(entry.time);
            time.className = 'trail-weather-detail__time';
            time.setAttribute('aria-hidden', 'true');
            entryElement.setAttribute('role', 'group');
            entryElement.setAttribute('aria-label', timeLabel(entry.time) + ', ' + Math.round(entry.probability) + ' percent chance of rain.');
            likelihood.className = 'trail-weather-detail__likelihood';
            likelihood.setAttribute('aria-hidden', 'true');
            likelihood.innerHTML = rainLikelihoodDropletsMarkup(entry.probability, 'trail-weather-detail__likelihood');
            entryElement.appendChild(time);
            entryElement.appendChild(likelihood);
            entries.appendChild(entryElement);
        });
        panel.appendChild(entries);
    }

    function render(slot, forecast, slotIndex) {
        var row = slot.parentNode;
        var panel = document.createElement('div');
        var panelId = 'trail-weather-detail-' + slotIndex;
        var buttons = [];
        panel.className = 'trail-weather-detail';
        panel.id = panelId;
        panel.setAttribute('role', 'region');
        panel.hidden = true;

        forecast.forEach(function (item) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'trail-weather-icons__item';
            button.setAttribute('data-weather-icon', item.icon);
            button.setAttribute('aria-label', accessibleLabel(item));
            button.setAttribute('aria-expanded', 'false');
            button.setAttribute('aria-controls', panelId);
            button.innerHTML = '<span class="trail-weather-icons__day" data-day-initial="' + dayName(item, 'narrow') + '" aria-hidden="true">' + dayName(item, 'short') + '</span><span class="trail-weather-icons__symbol" aria-hidden="true">' + icons[item.icon] + '</span>' + rainSummaryMarkup(item.rain_probability);
            button.addEventListener('click', function () {
                if (!panel.hidden && button.classList.contains('is-active')) {
                    panel.hidden = true;
                    setActiveButton(buttons, null);
                    return;
                }
                renderRainDetail(panel, item);
                panel.hidden = false;
                setActiveButton(buttons, button);
            });
            buttons.push(button);
            slot.appendChild(button);
        });

        row.insertAdjacentElement('afterend', panel);
        document.addEventListener('click', function (event) {
            if (!panel.hidden && !slot.contains(event.target) && !panel.contains(event.target)) {
                panel.hidden = true;
                setActiveButton(buttons, null);
            }
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && !panel.hidden) {
                panel.hidden = true;
                setActiveButton(buttons, null);
            }
        });
        slot.hidden = false;
    }

    Array.prototype.forEach.call(slots, function (slot, slotIndex) {
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
        url.searchParams.set('schema', '2');

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
                render(slot, forecast, slotIndex);
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
