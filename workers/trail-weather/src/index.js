const ALLOWED_ORIGINS = new Set([
  'https://beesayatv.com',
  'https://www.beesayatv.com',
  'http://beesayatv.test',
  'https://beesayatv.test',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

const CEBU_BOUNDS = { minLat: 9.3, maxLat: 11.3, minLng: 123.2, maxLng: 124.3 };

function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Vary': 'Origin' });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET');
  }
  return headers;
}

function json(request, body, status, cacheControl) {
  const headers = corsHeaders(request);
  headers.set('Cache-Control', cacheControl || 'no-store');
  return new Response(JSON.stringify(body), { status, headers });
}

function weatherGroup(code) {
  if (code === 0) return { icon: 'clear', description: 'Clear' };
  if (code === 1 || code === 2) return { icon: 'partly-cloudy', description: 'Partly cloudy' };
  if (code === 3) return { icon: 'cloudy', description: 'Cloudy' };
  if (code === 45 || code === 48) return { icon: 'fog', description: 'Fog' };
  if (code === 95 || code === 96 || code === 99) return { icon: 'thunderstorm', description: 'Thunderstorm' };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86].includes(code)) return { icon: 'rain', description: 'Rain' };
  return { icon: 'cloudy', description: 'Cloudy' };
}

function validDailyResponse(daily) {
  return daily && Array.isArray(daily.time) && Array.isArray(daily.weather_code) && Array.isArray(daily.temperature_2m_min) && Array.isArray(daily.temperature_2m_max) && Array.isArray(daily.precipitation_probability_max) && daily.time.length >= 4 && daily.weather_code.length >= 4 && daily.temperature_2m_min.length >= 4 && daily.temperature_2m_max.length >= 4 && daily.precipitation_probability_max.length >= 4;
}

function compactForecast(daily) {
  return [1, 2, 3].map((index) => {
    const code = Number(daily.weather_code[index]);
    const temperatureMin = Number(daily.temperature_2m_min[index]);
    const temperatureMax = Number(daily.temperature_2m_max[index]);
    const rainProbability = Number(daily.precipitation_probability_max[index]);
    if (!daily.time[index] || !Number.isFinite(code) || !Number.isFinite(temperatureMin) || !Number.isFinite(temperatureMax) || !Number.isFinite(rainProbability)) throw new Error('Incomplete forecast data');
    const weather = weatherGroup(code);
    return { date: daily.time[index], code, description: weather.description, temperature_min: temperatureMin, temperature_max: temperatureMax, rain_probability: rainProbability, icon: weather.icon };
  });
}

export default {
  async fetch(request, env, context) {
    if (request.method !== 'GET') {
      const response = json(request, { error: 'Method not allowed' }, 405);
      response.headers.set('Allow', 'GET');
      return response;
    }

    const url = new URL(request.url);
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json(request, { error: 'Valid latitude and longitude are required' }, 400);
    if (lat < CEBU_BOUNDS.minLat || lat > CEBU_BOUNDS.maxLat || lng < CEBU_BOUNDS.minLng || lng > CEBU_BOUNDS.maxLng) return json(request, { error: 'Coordinates are outside the supported Cebu area' }, 403);

    const origin = request.headers.get('Origin');
    const cacheOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'same-origin';
    const cacheKey = new Request('https://beesayatv-weather-cache.invalid/forecast?lat=' + lat.toFixed(2) + '&lng=' + lng.toFixed(2) + '&origin=' + encodeURIComponent(cacheOrigin));
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const upstreamUrl = new URL('https://api.open-meteo.com/v1/forecast');
    upstreamUrl.searchParams.set('latitude', lat.toFixed(5));
    upstreamUrl.searchParams.set('longitude', lng.toFixed(5));
    upstreamUrl.searchParams.set('timezone', 'Asia/Manila');
    upstreamUrl.searchParams.set('forecast_days', '4');
    upstreamUrl.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const upstream = await fetch(upstreamUrl.toString(), { signal: controller.signal, headers: { 'Accept': 'application/json', 'User-Agent': 'beesayatv-trail-weather/1.0 (+https://beesayatv.com/)' } });
      if (!upstream.ok) return json(request, { error: 'Forecast service unavailable' }, 502);
      const payload = await upstream.json();
      if (!validDailyResponse(payload.daily)) return json(request, { error: 'Forecast service returned incomplete data' }, 502);
      const response = json(request, { forecast: compactForecast(payload.daily) }, 200, 'public, max-age=300, s-maxage=3600');
      context.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      return json(request, { error: 'Forecast service unavailable' }, 503);
    } finally {
      clearTimeout(timeout);
    }
  }
};
