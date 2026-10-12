(function () {
  'use strict';

  function escapeText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char];
    });
  }

  function install(event) {
    var map = event && event.detail && event.detail.map;
    if (!map || !window.L || !window.BFS_DELTA_ATLAS || map._beesayaDeltaControl) return;
    map._beesayaDeltaControl = true;

    var paneName = 'beesayatvDeltaTrackingPane';
    if (!map.getPane(paneName)) {
      map.createPane(paneName);
      map.getPane(paneName).style.zIndex = '625';
    }
    var layer = L.layerGroup();
    var locations = [];
    var available = false;
    var active = false;
    var activatedOnce = false;
    var loading = false;
    var activeMarker = -1;
    var availabilityTimer;
    var control = L.control({ position: 'topleft' });
    control.onAdd = function () {
      var container = L.DomUtil.create('div', 'beesayatv-atlas-access-control leaflet-control');
      var button = L.DomUtil.create('button', 'beesayatv-atlas-access-control__toggle', container);
      button.type = 'button';
      button.textContent = 'Delta Tracking';
      button.disabled = true;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', 'Delta Tracking unavailable while checking published locations');
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(button, 'click', function () {
        if (button.disabled || !available) return;
        active = !active;
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        if (!active) {
          map.removeLayer(layer);
          return;
        }
        map.addLayer(layer);
        if (!activatedOnce) {
          var markerList = locations.map(function (item) { return item.marker; }).filter(Boolean);
          if (markerList.length) map.fitBounds(L.featureGroup(markerList).getBounds().pad(0.15), { maxZoom: 17 });
          activatedOnce = true;
        }
      });
      return container;
    };
    control.addTo(map);

    function usableLocation(location) {
      if (!location || location.latitude == null || location.longitude == null || location.latitude === '' || location.longitude === '') return false;
      var latitude = Number(location.latitude), longitude = Number(location.longitude);
      return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 &&
        Array.isArray(location.photos) && location.photos.some(function (photo) { return photo && typeof photo.url === 'string' && photo.url !== ''; });
    }

    function updateLocations(payload) {
      // The public endpoint applies the approved, published, readable-photo,
      // usable-GPS, and two-distinct-session eligibility rules.
      locations = (Array.isArray(payload.locations) ? payload.locations : []).filter(usableLocation);
      layer.clearLayers();
      locations.forEach(function (location, index) {
        var marker = L.circleMarker([Number(location.latitude), Number(location.longitude)], {
          pane: paneName, radius: 8, color: '#805200', weight: 2, fillColor: '#f0a51a', fillOpacity: 0.95,
          interactive: true, bubblingMouseEvents: false
        });
        marker.bindPopup(popupHtml(location, index));
        marker.on('popupopen', function () { activeMarker = index; });
        location.marker = marker;
        layer.addLayer(marker);
      });
      available = locations.length > 0;
      var button = containerButton();
      if (button) {
        button.disabled = !available;
        button.setAttribute('aria-label', available ? 'Toggle Delta Tracking photo layer' : 'Delta Tracking unavailable: no eligible published locations');
      }
      if (!available) {
        if (active) {
          active = false;
          map.removeLayer(layer);
          if (button) button.setAttribute('aria-pressed', 'false');
        }
        activatedOnce = false;
      } else if (active) {
        map.addLayer(layer);
      }
    }

    var toggleButton;
    function containerButton() { return toggleButton; }
    // onAdd runs synchronously when the control is attached.
    toggleButton = control.getContainer().querySelector('button');

    function refreshAvailability() {
      if (loading || document.visibilityState === 'hidden') return;
      loading = true;
      fetch(window.BFS_DELTA_ATLAS.endpoint, { credentials: 'same-origin', cache: 'no-store' })
        .then(function (response) {
          if (!response.ok) throw new Error('Delta Tracking could not be loaded.');
          return response.json();
        })
        .then(updateLocations)
        .catch(function () {
          available = false;
          if (toggleButton) {
            toggleButton.disabled = true;
            toggleButton.setAttribute('aria-label', 'Delta Tracking unavailable');
          }
          if (active) {
            active = false;
            map.removeLayer(layer);
            if (toggleButton) toggleButton.setAttribute('aria-pressed', 'false');
          }
          activatedOnce = false;
        })
        .finally(function () { loading = false; });
    }

    function refreshWhenVisible() { if (document.visibilityState === 'visible') refreshAvailability(); }
    refreshAvailability();
    availabilityTimer = window.setInterval(refreshAvailability, 60000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    map.on('unload', function () {
      window.clearInterval(availabilityTimer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    });

    function popupHtml(location, index) {
      var photos = Array.isArray(location.photos) ? location.photos : [];
      var body = photos.map(function (photo) {
        var date = photo.timestamp ? '<figcaption>' + escapeText(photo.timestamp) + '</figcaption>' : '';
        return '<figure class="beesayatv-delta-photo"><img src="' + escapeText(photo.url) + '" alt="Trail photo" loading="lazy"><figcaption class="beesayatv-delta-photo__filename">' + escapeText(photo.filename) + '</figcaption>' + date + '</figure>';
      }).join('');
      var nav = locations.length > 1 ? '<div class="beesayatv-delta-popup-nav"><button type="button" data-delta-prev="' + ((index + locations.length - 1) % locations.length) + '">Previous location</button><span>' + (index + 1) + ' / ' + locations.length + '</span><button type="button" data-delta-next="' + ((index + 1) % locations.length) + '">Next location</button></div>' : '';
      return '<div class="beesayatv-delta-popup"><div class="beesayatv-delta-popup__photos">' + (body || '<p>No published photos.</p>') + '</div>' + nav + '</div>';
    }

    map.on('popupopen', function (event) {
      var root = event.popup.getElement();
      if (!root) return;
      root.querySelectorAll('[data-delta-prev], [data-delta-next]').forEach(function (button) {
        button.addEventListener('click', function () {
          var nextIndex = Number(button.getAttribute('data-delta-next') || button.getAttribute('data-delta-prev'));
          var next = locations[nextIndex];
          if (next && next.marker) next.marker.openPopup();
        });
      });
    });
  }

  window.addEventListener('beesayatv:atlas-ready', install);
})();
