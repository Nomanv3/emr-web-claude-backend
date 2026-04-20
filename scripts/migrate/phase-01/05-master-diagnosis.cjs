'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }    = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }          = require('../lib/state.cjs');
const { toTsStr, countMysqlMatched } = require('../lib/util.cjs');

(async () => {
  const db   = await getDb();
  const docs  = await db.collection('masterdiagnoses').find({}).toArray();
  console.log(`[master_diagnosis] Mongo docs found: ${docs.length}`);

  for (const d of docs) {
    await upsert('master_diagnosis', {
      diagnosis_id:    d.diagnosisId,
      organization_id: null,
      branch_id:       null,
      icd_code:        d.icdCode,
      description:     d.description,
      category:        d.category || null,
      created_at:      toTsStr(d.createdAt),
      updated_at:      toTsStr(d.updatedAt),
    }, 'diagnosis_id');
  }

  const mongoCount = docs.length;
  const ids = docs.map(d => d.diagnosisId);
  const mysqlCount = await countMysqlMatched(pool, 'master_diagnosis', 'diagnosis_id', ids);
  const ok = mongoCount === mysqlCount;
  await recordTable('master_diagnosis', { mongoCount, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[master_diagnosis] mongo=${mongoCount} mysql=${mysqlCount} ok=${ok}`);

  await closeMongo();
  await closeMysql();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
