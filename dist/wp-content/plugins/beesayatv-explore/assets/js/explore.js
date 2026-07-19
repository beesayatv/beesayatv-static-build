document.addEventListener('DOMContentLoaded', function () {

	const sidebar = document.querySelector('.btv-sidebar');
	const search = document.getElementById('btv-search');

	let searchTimer;
	let allTrails = [];

	if (!sidebar) {
		return;
	}

	/*
	|--------------------------------------------------------------------------
	| Checkbox Filters
	|--------------------------------------------------------------------------
	*/

	sidebar.addEventListener('change', function (event) {

		if (event.target.matches('input[type="checkbox"]')) {
			filterTrails();
		}

	});

	/*
	|--------------------------------------------------------------------------
	| Search
	|--------------------------------------------------------------------------
	*/

	if (search) {

		search.addEventListener('input', function () {

			clearTimeout(searchTimer);

			searchTimer = setTimeout(function () {

				filterTrails();

			}, 300);

		});

	}

/*
|--------------------------------------------------------------------------
| Accordion Filters
|--------------------------------------------------------------------------
*/

document.querySelectorAll('.btv-filter-toggle').forEach(function (button) {

	button.addEventListener('click', function () {

		const group = button.closest('.btv-filter-group');

		document.querySelectorAll('.btv-filter-group').forEach(function (item) {

			if (item !== group) {
				item.classList.remove('is-open');
			}

		});

		group.classList.toggle('is-open');

	});

});

	/*
	|--------------------------------------------------------------------------
	| Clear Filters
	|--------------------------------------------------------------------------
	*/

	document.addEventListener('click', function (event) {

		if (!event.target.classList.contains('btv-clear-filters')) {
			return;
		}

		document.querySelectorAll('.btv-sidebar input[type="checkbox"]')
			.forEach(function (checkbox) {
				checkbox.checked = false;
			});

		if (search) {
			search.value = '';
		}

		filterTrails();

	});

	/*
	|--------------------------------------------------------------------------
	| Loading State
	|--------------------------------------------------------------------------
	*/

	function setLoading(isLoading) {

		const results = document.getElementById('btv-results');

		if (!results) {
			return;
		}

		if (isLoading) {
			results.classList.add('is-loading');
		} else {
			results.classList.remove('is-loading');
		}

	}

async function loadTrails() {

    const response = await fetch('/wp-content/uploads/trail-data.json');

    allTrails = await response.json();

    filterTrails();

}

function renderTrailCard(trail) {

    return `
        <article class="post-card">

            <a class="post-card-link" href="${trail.url}">

                <div class="post-thumbnail">
                    <img src="${trail.thumbnail}" alt="${trail.title}">
                </div>

                <div class="post-content-wrap">

                    <header class="entry-header">

                        <h2 class="entry-title">
                            ${trail.title}
                        </h2>

                    </header>

                    <div class="entry-content"></div>

                </div>

            </a>

        </article>
    `;

}

function getFilteredTrails() {

    let filtered = [...allTrails];

    if (search) {

        const keyword = search.value.trim().toLowerCase();

        if (keyword !== '') {

            filtered = filtered.filter(function (trail) {

                return trail.title.toLowerCase().includes(keyword);

            });

        }

    }
	
	const selectedLocations = [];

document.querySelectorAll(
    'input[name="trail_location[]"]:checked'
).forEach(function (checkbox) {

    selectedLocations.push(checkbox.value);

});

if (selectedLocations.length > 0) {

    filtered = filtered.filter(function (trail) {

        return trail.trail_location.some(function (location) {

            return selectedLocations.includes(location);

        });

    });

}

const selectedDifficulties = [];

document.querySelectorAll(
    'input[name="trail_difficulty[]"]:checked'
).forEach(function (checkbox) {

    selectedDifficulties.push(checkbox.value);

});

if (selectedDifficulties.length > 0) {

    filtered = filtered.filter(function (trail) {

        return trail.trail_difficulty.some(function (difficulty) {

            return selectedDifficulties.includes(difficulty);

        });

    });

}

const selectedFeatures = [];

document.querySelectorAll(
    'input[name="trail_feature[]"]:checked'
).forEach(function (checkbox) {

    selectedFeatures.push(checkbox.value);

});

if (selectedFeatures.length > 0) {

    filtered = filtered.filter(function (trail) {

        return trail.trail_feature.some(function (feature) {

            return selectedFeatures.includes(feature);

        });

    });

}



const selectedTypes = [];

document.querySelectorAll(
    'input[name="trail_type[]"]:checked'
).forEach(function (checkbox) {

    selectedTypes.push(checkbox.value);

});

if (selectedTypes.length > 0) {

    filtered = filtered.filter(function (trail) {

        return trail.trail_type.some(function (type) {

            return selectedTypes.includes(type);

        });

    });

}


    return filtered;

}


	/*
	|--------------------------------------------------------------------------
	| AJAX Filter
	|--------------------------------------------------------------------------
	*/

	function filterTrails() {

const results = document.getElementById('btv-results');

if (results) {

    const trails = getFilteredTrails();

    let html = '<div class="btv-results-grid">';

    trails.forEach(function (trail) {
        html += renderTrailCard(trail);
    });

    html += '</div>';

    results.innerHTML = html;

}

return;

		const formData = new FormData();

		formData.append('action', 'btv_filter_trails');
		formData.append('nonce', btvExplore.nonce);

		// Search
		if (search) {
			formData.append('search', search.value);
		}

		// Taxonomies
		[
			'trail_location',
			'trail_difficulty',
			'trail_type'
		].forEach(function (taxonomy) {

			document.querySelectorAll(
				'input[name="' + taxonomy + '[]"]:checked'
			).forEach(function (checkbox) {

				formData.append(
					taxonomy + '[]',
					checkbox.value
				);

			});

		});

		setLoading(true);

		fetch(btvExplore.ajaxUrl, {
			method: 'POST',
			body: formData
		})
		.then(function (response) {
			return response.json();
		})
		.then(function (response) {

			setLoading(false);

			if (!response.success) {
				return;
			}

			const results = document.getElementById('btv-results');

			if (results) {
				results.innerHTML = response.data.html;
			}

		})
		.catch(function (error) {

			setLoading(false);
			console.error(error);

		});

	}

loadTrails();

});