import env from '../config/env.js';

const AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';

/**
 * Proxies Google Places Autocomplete so the API key stays on the server.
 * Query params:
 *   - input (required): user text
 *   - country (optional, default 'in'): ISO country code
 *   - sessiontoken (optional): billing session token from the client
 */
export const autocomplete = async (req, res, next) => {
  try {
    const { input, country = 'in', sessiontoken } = req.query;

    if (!input || typeof input !== 'string' || input.trim().length < 2) {
      return res.json({ success: true, data: { predictions: [] } });
    }

    if (!env.googleApiKey) {
      return res.status(500).json({
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'GOOGLE_API_KEY is not configured' },
      });
    }

    const params = new URLSearchParams({
      input: input.trim(),
      types: 'geocode',
      components: `country:${country}`,
      key: env.googleApiKey,
    });
    if (sessiontoken) params.set('sessiontoken', sessiontoken);

    const response = await fetch(`${AUTOCOMPLETE_URL}?${params.toString()}`);
    const body = await response.json();

    if (body.status !== 'OK' && body.status !== 'ZERO_RESULTS') {
      return res.status(502).json({
        success: false,
        error: {
          code: 'GOOGLE_PLACES_ERROR',
          message: body.error_message || body.status || 'Google Places request failed',
          details: { status: body.status },
        },
      });
    }

    const predictions = (body.predictions || []).map((p) => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text || p.description,
      secondaryText: p.structured_formatting?.secondary_text || '',
    }));

    res.json({ success: true, data: { predictions } });
  } catch (error) {
    next(error);
  }
};
