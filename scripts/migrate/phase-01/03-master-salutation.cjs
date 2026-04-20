'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }    = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }          = require('../lib/state.cjs');
const { toTsStr, countMysqlMatched } = require('../lib/util.cjs');

(async () => {
  const db   = await getDb();
  const docs  = await db.collection('mastersalutations').find({}).toArray();
  console.log(`[master_salutation] Mongo docs found: ${docs.length}`);

  for (const d of docs) {
    await upsert('master_salutation', {
      salutation_id:   d.salutationId,
      organization_id: null,
      branch_id:       null,
      label:           d.label,
      created_at:      toTsStr(d.createdAt),
      updated_at:      toTsStr(d.updatedAt),
    }, 'salutation_id');
  }

  const mongoCount = docs.length;
  const ids = docs.map(d => d.salutationId);
  const mysqlCount = await countMysqlMatched(pool, 'master_salutation', 'salutation_id', ids);
  const ok = mongoCount === mysqlCount;
  await recordTable('master_salutation', { mongoCount, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[master_salutation] mongo=${mongoCount} mysql=${mysqlCount} ok=${ok}`);

  await closeMongo();
  await closeMysql();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
