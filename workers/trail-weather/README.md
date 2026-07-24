# BeesayaTV trail weather Worker

This Worker provides the progressive three-day forecast enhancement used by static BeesayaTV trail reports.

- It accepts only `GET /api/trail-weather?lat={latitude}&lng={longitude}`.
- Coordinates are limited to latitude `9.3–11.3` and longitude `123.2–124.3`, covering Cebu Island and nearby documented areas.
- Successful normalized coordinate responses are edge-cached for one hour; browsers cache them for five minutes.
- Open-Meteo receives the original five-decimal coordinate, `Asia/Manila`, and four daily forecast days. The Worker excludes today and returns the next three days only.

The Worker is deliberately independent of the Pages static export. Do not place Worker files in `dist`.
