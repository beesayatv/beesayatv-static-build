(function () {
  'use strict';

  function init(viewer) {
    const locations = Array.from(viewer.querySelectorAll('[data-bfs-delta-location]'));
    if (!locations.length) return;
    let locationIndex = 0;

    function photosFor(location) {
      return Array.from(location.querySelectorAll('[data-bfs-delta-photo]'));
    }

    function showPhoto(location, index) {
      const photos = photosFor(location);
      if (!photos.length) return;
      const selected = Math.max(0, Math.min(index, photos.length - 1));
      photos.forEach((photo, photoIndex) => { photo.hidden = photoIndex !== selected; });
      const thumbnails = Array.from(location.querySelectorAll('[data-bfs-delta-thumbnail]'));
      thumbnails.forEach((button, photoIndex) => {
        const current = photoIndex === selected;
        button.classList.toggle('is-current', current);
        button.setAttribute('aria-pressed', current ? 'true' : 'false');
      });
      const previous = location.querySelector('[data-bfs-delta-photo-prev]');
      const next = location.querySelector('[data-bfs-delta-photo-next]');
      const count = location.querySelector('[data-bfs-delta-photo-count]');
      const filename = location.querySelector('[data-bfs-delta-filename]');
      const captureTime = location.querySelector('[data-bfs-delta-capture-time]');
      const gps = location.querySelector('[data-bfs-delta-gps]');
      const photo = photos[selected];
      if (previous) previous.disabled = selected === 0;
      if (next) next.disabled = selected === photos.length - 1;
      if (count) count.textContent = 'Photo ' + (selected + 1) + ' of ' + photos.length;
      if (filename) filename.textContent = photo.dataset.filename || '';
      if (captureTime) captureTime.textContent = photo.dataset.captureTime || 'Capture date/time not recorded';
      if (gps) {
        const coordinates = photo.dataset.latitude + ',' + photo.dataset.longitude;
        gps.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(coordinates);
        gps.textContent = 'GPS: ' + photo.dataset.latitude + ', ' + photo.dataset.longitude;
        gps.setAttribute('aria-label', 'Open GPS coordinates ' + photo.dataset.latitude + ', ' + photo.dataset.longitude + ' in Google Maps');
      }
      location.dataset.photoIndex = String(selected);
    }

    function showLocation(index, focusStage) {
      locationIndex = Math.max(0, Math.min(index, locations.length - 1));
      locations.forEach((location, itemIndex) => { location.hidden = itemIndex !== locationIndex; });
      const previous = viewer.querySelector('[data-bfs-delta-location-prev]');
      const next = viewer.querySelector('[data-bfs-delta-location-next]');
      const count = viewer.querySelector('[data-bfs-delta-location-count]');
      if (previous) previous.disabled = locationIndex === 0;
      if (next) next.disabled = locationIndex === locations.length - 1;
      if (count) count.textContent = 'Location ' + (locationIndex + 1) + ' of ' + locations.length;
      showPhoto(locations[locationIndex], 0);
      if (focusStage) {
        const stage = locations[locationIndex].querySelector('[data-bfs-delta-stage]');
        if (stage) stage.focus({ preventScroll: true });
      }
    }

    locations.forEach((location) => {
      const previous = location.querySelector('[data-bfs-delta-photo-prev]');
      const next = location.querySelector('[data-bfs-delta-photo-next]');
      const stage = location.querySelector('[data-bfs-delta-stage]');
      const thumbnails = Array.from(location.querySelectorAll('[data-bfs-delta-thumbnail]'));
      if (previous) previous.addEventListener('click', () => showPhoto(location, Number(location.dataset.photoIndex || 0) - 1));
      if (next) next.addEventListener('click', () => showPhoto(location, Number(location.dataset.photoIndex || 0) + 1));
      thumbnails.forEach((button, index) => button.addEventListener('click', () => showPhoto(location, index)));
      if (stage) {
        stage.addEventListener('keydown', (event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            showPhoto(location, Number(location.dataset.photoIndex || 0) + (event.key === 'ArrowRight' ? 1 : -1));
          } else if (event.key === 'ArrowUp' && locationIndex > 0) {
            event.preventDefault(); showLocation(locationIndex - 1, true);
          } else if (event.key === 'ArrowDown' && locationIndex < locations.length - 1) {
            event.preventDefault(); showLocation(locationIndex + 1, true);
          }
        });
        let startX = null;
        stage.addEventListener('touchstart', (event) => { startX = event.touches.length === 1 ? event.touches[0].clientX : null; }, { passive: true });
        stage.addEventListener('touchend', (event) => {
          if (startX === null || !event.changedTouches.length) return;
          const delta = event.changedTouches[0].clientX - startX; startX = null;
          if (Math.abs(delta) >= 45) showPhoto(location, Number(location.dataset.photoIndex || 0) + (delta < 0 ? 1 : -1));
        }, { passive: true });
      }
      const fullscreen = location.querySelector('[data-bfs-delta-fullscreen]');
      if (fullscreen) fullscreen.addEventListener('click', () => {
        const stage = location.querySelector('[data-bfs-delta-stage]');
        if (!stage) return;
        if (document.fullscreenElement === stage) {
          if (document.exitFullscreen) document.exitFullscreen();
        } else if (stage.requestFullscreen) stage.requestFullscreen();
      });
      showPhoto(location, 0);
    });

    document.addEventListener('fullscreenchange', () => locations.forEach((location) => {
      const button = location.querySelector('[data-bfs-delta-fullscreen]');
      const stage = location.querySelector('[data-bfs-delta-stage]');
      if (button) {
        const active = document.fullscreenElement === stage;
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.setAttribute('aria-label', active ? 'Exit fullscreen photo' : 'View photo fullscreen');
      }
    }));

    const previousLocation = viewer.querySelector('[data-bfs-delta-location-prev]');
    const nextLocation = viewer.querySelector('[data-bfs-delta-location-next]');
    if (previousLocation) previousLocation.addEventListener('click', () => showLocation(locationIndex - 1, false));
    if (nextLocation) nextLocation.addEventListener('click', () => showLocation(locationIndex + 1, false));
    showLocation(0, false);
  }

  function start() { document.querySelectorAll('[data-bfs-delta-viewer]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}());
