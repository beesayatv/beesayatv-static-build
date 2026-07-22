document.addEventListener('DOMContentLoaded', function () {
    const explore = document.querySelector('.btv-explore');
    const sidebar = document.querySelector('.btv-sidebar');
    const search = document.getElementById('btv-search');
    const resultsGrid = document.getElementById('btv-results-grid');
    const resultsCount = document.getElementById('btv-results-count');
    const resultsStatus = document.getElementById('btv-results-status');
    const clearButton = document.querySelector('.btv-clear-filters');
    const mobileFiltersToggle = document.querySelector('.btv-mobile-filters-toggle');
    const mobileFiltersCount = document.querySelector('.btv-mobile-filters-toggle__count');
    const mobileDoneButton = document.querySelector('.btv-mobile-filters-done');
    const filterToggles = document.querySelectorAll('.btv-filter-toggle');
    let allTrails = [];
    let searchTimer;

    if (!explore || !sidebar || !resultsGrid || !resultsCount) {
        return;
    }

    function getDisplayTitle(trail) {
        if (trail && typeof trail.title === 'string' && trail.title.trim() !== '') {
            const title = trail.title.trim();
            const separator = title.indexOf('|');
            return (separator === -1 ? title : title.slice(0, separator)).trim();
        }

        const fullTitle = trail && typeof trail.full_title === 'string' ? trail.full_title : '';
        const separator = fullTitle.indexOf('|');
        return (separator === -1 ? fullTitle : fullTitle.slice(0, separator)).trim();
    }

    function resolveLocalUrl(value) {
        try {
            const url = new URL(value, window.location.origin);
            if (url.origin === window.location.origin || url.hostname === 'beesayatv.test') {
                return url.pathname + url.search + url.hash;
            }
            return value;
        } catch (error) {
            return value;
        }
    }

    function getTrailLabel(trail, labelKey, valueKey) {
        if (Array.isArray(trail[labelKey]) && trail[labelKey][0]) {
            return trail[labelKey][0];
        }

        if (!Array.isArray(trail[valueKey]) || !trail[valueKey][0]) {
            return '';
        }

        return trail[valueKey][0].split('-').map(function (word) {
            return word === 'and' || word === 'to' ? word : word.charAt(0).toUpperCase() + word.slice(1);
        }).join(' ');
    }

    function renderTrailCard(trail) {
        const title = getDisplayTitle(trail);
        const trailUrl = resolveLocalUrl(trail.url);
        const thumbnailUrl = resolveLocalUrl(trail.thumbnail);
        const metadataItems = [
            getTrailLabel(trail, 'trail_location_labels', 'trail_location'),
            getTrailLabel(trail, 'trail_difficulty_labels', 'trail_difficulty'),
            getTrailLabel(trail, 'trail_type_labels', 'trail_type')
        ].filter(Boolean);

        if (metadataItems.length < 3 && trail.wip) {
            metadataItems.push('Exploration in progress');
        }

        if (metadataItems.length < 3 && trail.documented) {
            metadataItems.push(trail.documented);
        }

        const metadata = metadataItems.slice(0, 3).join(' · ');

        return `
            <article class="post-card btv-post-card">
                <a class="post-card-link btv-post-card__link" href="${trailUrl}">
                    <div class="post-thumbnail btv-post-card__thumbnail">
                        <img src="${thumbnailUrl}" alt="${title}">
                    </div>
                    <h2 class="entry-title btv-post-card__title">${title}</h2>
                    ${metadata ? `<p class="btv-post-card__meta">${metadata}</p>` : ''}
                </a>
            </article>`;
    }

    function selectedValues(name) {
        return Array.from(document.querySelectorAll(`input[name="${name}[]"]:checked`)).map(function (checkbox) {
            return checkbox.value;
        });
    }

    function hasOverlap(values, selected) {
        return Array.isArray(values) && values.some(function (value) {
            return selected.includes(value);
        });
    }

    function getFilteredTrails() {
        const keyword = search ? search.value.trim().toLowerCase() : '';
        const locations = selectedValues('trail_location');
        const difficulties = selectedValues('trail_difficulty');
        const features = selectedValues('trail_feature');
        const types = selectedValues('trail_type');

        return allTrails.filter(function (trail) {
            const searchableTitle = `${trail.title || ''} ${trail.full_title || ''}`.toLowerCase();
            return (!keyword || searchableTitle.includes(keyword))
                && (!locations.length || hasOverlap(trail.trail_location, locations))
                && (!difficulties.length || hasOverlap(trail.trail_difficulty, difficulties))
                && (!features.length || hasOverlap(trail.trail_feature, features))
                && (!types.length || hasOverlap(trail.trail_type, types));
        });
    }

    function activeFilterCount() {
        return document.querySelectorAll('.btv-sidebar input[type="checkbox"]:checked').length;
    }

    function hasActiveCriteria() {
        return activeFilterCount() > 0 || (search && search.value.trim() !== '');
    }

    function updateToolbar(trailCount) {
        if (trailCount === 0) {
            resultsCount.textContent = 'No documented trails';
        } else if (trailCount === 1) {
            resultsCount.textContent = '1 documented trail';
        } else {
            resultsCount.textContent = `${trailCount} documented trails`;
        }

        const active = hasActiveCriteria();
        clearButton.hidden = !active;
        mobileFiltersCount.hidden = activeFilterCount() === 0;
        mobileFiltersCount.textContent = activeFilterCount() === 0 ? '' : ` (${activeFilterCount()})`;
    }

    function renderResults() {
        const trails = getFilteredTrails();
        updateToolbar(trails.length);

        if (trails.length) {
            resultsGrid.innerHTML = trails.map(renderTrailCard).join('');
            resultsStatus.hidden = true;
            resultsStatus.textContent = '';
            return;
        }

        resultsGrid.innerHTML = '';
        resultsStatus.textContent = 'No documented trails match these filters.';
        resultsStatus.hidden = false;
    }

    function setGroupState(button, expanded) {
        const panel = document.getElementById(button.getAttribute('aria-controls'));
        button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        button.closest('.btv-filter-group').classList.toggle('is-open', expanded);
        if (panel) {
            panel.hidden = !expanded;
        }
    }

    function setMobileFiltersOpen(open) {
        explore.classList.toggle('is-filters-open', open);
        mobileFiltersToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function positionMobileFilterGroup(button) {
        window.setTimeout(function () {
            const header = document.getElementById('masthead');
            const headerOffset = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
            const top = window.scrollY + button.getBoundingClientRect().top - headerOffset - 16;
            const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            window.scrollTo({
                top: Math.max(0, top),
                behavior: reducedMotion ? 'auto' : 'smooth'
            });
        }, 100);
    }

    filterToggles.forEach(function (button) {
        button.addEventListener('click', function () {
            const isMobile = window.matchMedia('(max-width: 767px)').matches;
            const willExpand = button.getAttribute('aria-expanded') !== 'true';

            if (isMobile) {
                filterToggles.forEach(function (otherButton) {
                    if (otherButton !== button) {
                        setGroupState(otherButton, false);
                    }
                });
            }

            setGroupState(button, willExpand);

            if (isMobile && willExpand) {
                positionMobileFilterGroup(button);
            }
        });
    });

    sidebar.addEventListener('change', function (event) {
        if (event.target.matches('input[type="checkbox"]')) {
            renderResults();
        }
    });

    if (search) {
        search.addEventListener('input', function () {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(renderResults, 200);
        });
    }

    clearButton.addEventListener('click', function () {
        document.querySelectorAll('.btv-sidebar input[type="checkbox"]:checked').forEach(function (checkbox) {
            checkbox.checked = false;
        });
        if (search) {
            search.value = '';
        }
        renderResults();
    });

    mobileFiltersToggle.addEventListener('click', function () {
        setMobileFiltersOpen(!explore.classList.contains('is-filters-open'));
    });

    mobileDoneButton.addEventListener('click', function () {
        setMobileFiltersOpen(false);
    });

    fetch('/wp-content/uploads/trail-data.json')
        .then(function (response) {
            if (!response.ok) {
                throw new Error('Unable to load trail records.');
            }
            return response.json();
        })
        .then(function (trails) {
            allTrails = Array.isArray(trails) ? trails : [];
            renderResults();
        })
        .catch(function () {
            resultsGrid.innerHTML = '';
            resultsCount.textContent = 'Trail records unavailable';
            resultsStatus.textContent = 'Trail records could not be loaded. Please try again later.';
            resultsStatus.hidden = false;
        });
});
