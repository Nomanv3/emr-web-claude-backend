'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }        = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }              = require('../lib/state.cjs');
const { toTsStr, countMysqlMatched } = require('../lib/util.cjs');

// Flatten nested object into dotted-path keys: {a:{b:1}} → {'a.b':'1'}.
// Arrays get JSON-stringified as leaf values.
function flatten(obj, prefix = '', acc = {}) {
  if (obj == null || typeof obj !== 'object') return acc;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, key, acc);
    } else {
      acc[key] = Array.isArray(v) ? JSON.stringify(v) : (v == null ? null : String(v));
    }
  }
  return acc;
}

async function countChildRows(table, col, parentIds) {
  if (!parentIds || parentIds.length === 0) return 0;
  const ph = parentIds.map(() => '?').join(', ');
  const [[{ c }]] = await pool.query(
    `SELECT COUNT(*) c FROM \`${table}\` WHERE \`${col}\` IN (${ph})`,
    parentIds
  );
  return Number(c);
}

(async () => {
  const db   = await getDb();
  const docs  = await db.collection('printsettings').find({}).toArray();
  console.log(`[print_settings] Mongo docs found: ${docs.length}`);

  let totalOptions = 0;

  for (const d of docs) {
    const settingsId = d.settingsId;
    await upsert('print_settings', {
      settings_id:     settingsId,
      organization_id: d.organizationId,
      branch_id:       d.branchId || null,
      created_at:      toTsStr(d.createdAt),
      updated_at:      toTsStr(d.updatedAt),
    }, 'settings_id');

    const flat = flatten(d.settings || {});
    await pool.execute('DELETE FROM `print_settings_options` WHERE `settings_id` = ?', [settingsId]);
    for (const [k, v] of Object.entries(flat)) {
      await pool.execute(
        'INSERT INTO `print_settings_options` (`settings_id`, `option_key`, `option_value`) VALUES (?, ?, ?)',
        [settingsId, k, v]
      );
      totalOptions++;
    }
  }

  const mongoCount = docs.length;
  const ids = docs.map(d => d.settingsId);
  const mysqlCount = await countMysqlMatched(pool, 'print_settings', 'settings_id', ids);
  const ok = mongoCount === mysqlCount;
  await recordTable('print_settings', { mongoCount, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[print_settings] mongo=${mongoCount} mysql=${mysqlCount} ok=${ok}`);

  const mysqlOptions = await countChildRows('print_settings_options', 'settings_id', ids);
  const optsOk = totalOptions === mysqlOptions;
  await recordTable('print_settings_options', { mongoCount: totalOptions, mysqlCount: mysqlOptions, ok: optsOk, lastRun: new Date().toISOString() });
  console.log(`[print_settings_options] mongo=${totalOptions} mysql=${mysqlOptions} ok=${optsOk}`);

  await closeMongo();
  await closeMysql();
  process.exit(ok && optsOk ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
