'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }    = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }          = require('../lib/state.cjs');
const { toBool, toIntOrNull, toTsStr, countMysqlMatched } = require('../lib/util.cjs');

(async () => {
  const db   = await getDb();
  const docs  = await db.collection('dropdownoptions').find({}).toArray();
  console.log(`[dropdown_option] Mongo docs found: ${docs.length}`);

  for (const d of docs) {
    const trans = d.translations || {};
    await upsert('dropdown_option', {
      dropdown_option_id: d.dropdown_option_id,
      organization_id:    null,
      branch_id:          null,
      section:            d.section,
      option_key:         d.option_key,
      option_value:       d.option_value,
      translation_hi:     trans.hi || '',
      translation_mr:     trans.mr || '',
      sort_order:         toIntOrNull(d.sort_order) || 0,
      is_active:          toBool(d.is_active),
      created_at:         toTsStr(d.createdAt),
      updated_at:         toTsStr(d.updatedAt),
    }, 'dropdown_option_id');
  }

  const mongoCount = docs.length;
  const ids = docs.map(d => d.dropdown_option_id);
  const mysqlCount = await countMysqlMatched(pool, 'dropdown_option', 'dropdown_option_id', ids);
  const ok = mongoCount === mysqlCount;
  await recordTable('dropdown_option', { mongoCount, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[dropdown_option] mongo=${mongoCount} mysql=${mysqlCount} ok=${ok}`);

  await closeMongo();
  await closeMysql();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
