(function () {
    'use strict';

    function parseLocalDate(value) {
        var parts = typeof value === 'string' ? value.split('-').map(Number) : [];
        if (parts.length !== 3 || parts.some(function (part) { return !Number.isInteger(part); })) {
            return null;
        }
        var date = new Date(parts[0], parts[1] - 1, parts[2]);
        if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) {
            return null;
        }
        date.setHours(0, 0, 0, 0);
        return date;
    }

    function sortEvents(a, b, descending) {
        var difference = a.date.getTime() - b.date.getTime();
        if (difference) {
            return descending ? -difference : difference;
        }
        return a.title.localeCompare(b.title);
    }

    function toggleYear(button, panel, container) {
        var expanded = button.getAttribute('aria-expanded') === 'true';
        if (expanded) {
            button.setAttribute('aria-expanded', 'false');
            panel.hidden = true;
            return;
        }
        Array.prototype.forEach.call(container.querySelectorAll('.btv-trail-events__year-toggle'), function (otherButton) {
            if (otherButton === button) { return; }
            var otherPanel = document.getElementById(otherButton.getAttribute('aria-controls'));
            otherButton.setAttribute('aria-expanded', 'false');
            if (otherPanel) { otherPanel.hidden = true; }
        });
        button.setAttribute('aria-expanded', 'true');
        panel.hidden = false;
    }

    function initialize(wrapper, index) {
        var source = wrapper.querySelector('[data-event-source]');
        var currentContainer = wrapper.querySelector('[data-current-events]');
        var currentEmpty = wrapper.querySelector('[data-current-empty]');
        var pastContainer = wrapper.querySelector('[data-past-events]');
        if (!source || !currentContainer || !currentEmpty || !pastContainer) { return; }

        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var current = [];
        var past = [];
        Array.prototype.forEach.call(source.querySelectorAll('[data-trail-event]'), function (element) {
            var date = parseLocalDate(element.getAttribute('data-archive-after'));
            if (!date) { return; }
            var event = { element: element, date: date, title: element.getAttribute('data-event-title') || '' };
            (date >= today ? current : past).push(event);
        });

        current.sort(function (a, b) { return sortEvents(a, b, false); });
        past.sort(function (a, b) { return sortEvents(a, b, true); });
        current.forEach(function (event) { currentContainer.appendChild(event.element); });
        currentEmpty.hidden = current.length !== 0;

        if (!past.length) {
            var empty = document.createElement('p');
            empty.className = 'btv-trail-events__empty';
            empty.textContent = 'There are no past trail events in the archive yet.';
            pastContainer.appendChild(empty);
        } else {
            var groups = {};
            past.forEach(function (event) {
                var year = String(event.date.getFullYear());
                (groups[year] = groups[year] || []).push(event);
            });
            Object.keys(groups).sort(function (a, b) { return Number(b) - Number(a); }).forEach(function (year, yearIndex) {
                var section = document.createElement('section');
                section.className = 'btv-trail-events__year';
                var heading = document.createElement('h3');
                heading.className = 'btv-trail-events__year-heading';
                var button = document.createElement('button');
                var id = 'btv-trail-events-' + index + '-year-' + year;
                button.type = 'button'; button.className = 'btv-trail-events__year-toggle'; button.id = id + '-button';
                button.setAttribute('aria-controls', id); button.setAttribute('aria-expanded', yearIndex === 0 ? 'true' : 'false');
                button.innerHTML = '<span>' + year + '</span><span class="btv-trail-events__year-count">(' + groups[year].length + ')</span><span class="btv-trail-events__year-icon" aria-hidden="true"></span>';
                var panel = document.createElement('div');
                panel.className = 'btv-trail-events__year-panel'; panel.id = id; panel.setAttribute('role', 'region'); panel.setAttribute('aria-labelledby', button.id); panel.hidden = yearIndex !== 0;
                groups[year].forEach(function (event) { panel.appendChild(event.element); });
                button.addEventListener('click', function () { toggleYear(button, panel, pastContainer); });
                heading.appendChild(button); section.appendChild(heading); section.appendChild(panel); pastContainer.appendChild(section);
            });
        }
        wrapper.setAttribute('data-initialized', 'true');
    }

    function start() {
        Array.prototype.forEach.call(document.querySelectorAll('[data-trail-events]'), initialize);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
}());
