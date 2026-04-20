// printSettings.mapper.js — helpers for reading/writing print_settings + print_settings_options.
//
// MongoDB stores `settings` as a Mixed (arbitrary-depth) object.
// MySQL stores it as flat `(option_key, option_value)` rows where option_key uses
// dotted-path notation (e.g. "margins.top", "font.family").
// These two helpers convert between the formats.

// ─── nestSettings ────────────────────────────────────────────────────────────
/**
 * nestSettings(rows) — converts an array of {option_key, option_value} rows
 * into a nested JS object.
 *
 * Example input:
 *   [ { option_key: 'margins.top', option_value: '20' },
 *     { option_key: 'font.family', option_value: 'Roboto' },
 *     { option_key: 'logo.url', option_value: 'data:image/png;base64,...' } ]
 *
 * Example output:
 *   { margins: { top: '20' }, font: { family: 'Roboto' }, logo: { url: 'data:image/png;...' } }
 *
 * Special case: if the value is a JSON-stringified array/object, it is parsed back.
 * A simple string like "20" is returned as-is (not coerced to number).
 */
export function nestSettings(rows) {
  const result = {};
  for (const { option_key, option_value } of rows) {
    const parts = option_key.split('.');
    let cursor = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (cursor[part] === undefined || typeof cursor[part] !== 'object') {
        cursor[part] = {};
      }
      cursor = cursor[part];
    }
    const leaf = parts[parts.length - 1];
    // Try to parse JSON arrays/objects that were stored as JSON strings.
    if (option_value !== null && option_value !== undefined) {
      const trimmed = option_value.trim();
      if ((trimmed.startsWith('[') || trimmed.startsWith('{')) && trimmed.length > 1) {
        try {
          cursor[leaf] = JSON.parse(trimmed);
          continue;
        } catch { /* not JSON — fall through */ }
      }
    }
    cursor[leaf] = option_value;
  }
  return result;
}

// ─── flattenSettings ─────────────────────────────────────────────────────────
/**
 * flattenSettings(obj, prefix) — flattens an arbitrary-depth settings object
 * into an array of { key, value } pairs using dotted-path keys.
 *
 * Arrays are JSON-stringified and stored as a single leaf value.
 * null/undefined values are stored as null.
 *
 * Example input:  { margins: { top: 20 }, font: { family: 'Roboto' } }
 * Example output: [ { key: 'margins.top', value: '20' },
 *                   { key: 'font.family', value: 'Roboto' } ]
 */
export function flattenSettings(obj, prefix = '') {
  if (obj === null || obj === undefined) return [];
  const entries = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      // Store arrays as JSON strings so they round-trip cleanly.
      entries.push({ key: fullKey, value: JSON.stringify(v) });
    } else if (v !== null && typeof v === 'object') {
      // Recurse into nested objects.
      entries.push(...flattenSettings(v, fullKey));
    } else {
      // Primitive — store as string (TEXT column accommodates base64).
      entries.push({ key: fullKey, value: v === null || v === undefined ? null : String(v) });
    }
  }
  return entries;
}

// ─── mapPrintSettingsRow ──────────────────────────────────────────────────────
/**
 * mapPrintSettingsRow(parentRow, optionRows) — combines the parent row with its
 * child option rows into the Mongoose-shaped response object.
 *
 * Mongoose shape:
 *   { settingsId, organizationId, branchId, settings: { ... }, createdAt, updatedAt }
 */
export function mapPrintSettingsRow(parentRow, optionRows = []) {
  const toIso = (v) => (v ? new Date(v).toISOString() : null);
  return {
    _id:            parentRow.settings_id,
    settingsId:     parentRow.settings_id,
    organizationId: parentRow.organization_id,
    branchId:       parentRow.branch_id || null,
    settings:       nestSettings(optionRows),
    createdAt:      toIso(parentRow.created_at),
    updatedAt:      toIso(parentRow.updated_at),
  };
}
