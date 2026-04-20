'use strict';
// util.cjs — Small helpers shared across all migration scripts

/**
 * toTsStr(date) → MySQL DATETIME string 'YYYY-MM-DD HH:MM:SS' in UTC, or null
 */
function toTsStr(date) {
  if (!date) return null;
  const d = (date instanceof Date) ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  // toISOString gives 'YYYY-MM-DDTHH:mm:ss.sssZ'; MySQL accepts 'YYYY-MM-DD HH:MM:SS'
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

/**
 * pickAddress(obj) → { street, city, state, country, pincode }
 * Returns null strings for missing fields.
 */
function pickAddress(obj) {
  if (!obj || typeof obj !== 'object') {
    return { street: null, city: null, state: null, country: null, pincode: null };
  }
  return {
    street:  obj.street  || null,
    city:    obj.city    || null,
    state:   obj.state   || null,
    country: obj.country || null,
    pincode: obj.pincode || null,
  };
}

/**
 * toJson(v) → JSON string if v is object/array, else null
 */
function toJson(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

/**
 * toBool(v) → 1 or 0 (MySQL TINYINT)
 */
function toBool(v) {
  if (v === null || v === undefined) return 1; // default active
  return v ? 1 : 0;
}

/**
 * toIntOrNull(v) → integer or null
 */
function toIntOrNull(v) {
  if (v === null || v === undefined) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

/**
 * countMysqlMatched(pool, table, idCol, ids)
 * Counts how many of the given UUIDs/IDs are present in MySQL.
 * Uses chunked IN queries to avoid hitting MySQL's IN-list limit.
 * Returns a number.
 */
async function countMysqlMatched(pool, table, idCol, ids) {
  if (!ids || ids.length === 0) return 0;
  const CHUNK = 500;
  let total = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(', ');
    const [[{ c }]] = await pool.query(
      `SELECT COUNT(*) c FROM \`${table}\` WHERE \`${idCol}\` IN (${placeholders})`,
      chunk
    );
    total += Number(c);
  }
  return total;
}

module.exports = { toTsStr, pickAddress, toJson, toBool, toIntOrNull, countMysqlMatched };
