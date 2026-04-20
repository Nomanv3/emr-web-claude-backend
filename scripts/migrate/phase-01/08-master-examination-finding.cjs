'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }    = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }          = require('../lib/state.cjs');
const { toTsStr, countMysqlMatched } = require('../lib/util.cjs');

(async () => {
  const db   = await getDb();
  const docs  = await db.collection('masterexaminationfindings').find({}).toArray();
  console.log(`[master_examination_finding] Mongo docs found: ${docs.length}`);

  for (const d of docs) {
    await upsert('master_examination_finding', {
      finding_id:      d.findingId,
      organization_id: null,
      branch_id:       null,
      name:            d.name,
      category:        d.category || null,
      created_at:      toTsStr(d.createdAt),
      updated_at:      toTsStr(d.updatedAt),
    }, 'finding_id');
  }

  const mongoCount = docs.length;
  const ids = docs.map(d => d.findingId);
  const mysqlCount = await countMysqlMatched(pool, 'master_examination_finding', 'finding_id', ids);
  const ok = mongoCount === mysqlCount;
  await recordTable('master_examination_finding', { mongoCount, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[master_examination_finding] mongo=${mongoCount} mysql=${mysqlCount} ok=${ok}`);

  await closeMongo();
  await closeMysql();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
