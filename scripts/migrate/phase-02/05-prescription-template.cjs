'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }        = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }              = require('../lib/state.cjs');
const { toBool, toTsStr, countMysqlMatched } = require('../lib/util.cjs');

const VALID_TYPES = new Set(['symptom','medication','labtest','labresult','diagnosis','examination','procedure','global','main']);

(async () => {
  const db   = await getDb();
  const docs  = await db.collection('prescriptiontemplates').find({}).toArray();
  console.log(`[prescription_template] Mongo docs found: ${docs.length}`);

  let skipped = 0;
  const migratedIds = [];

  for (const d of docs) {
    if (!VALID_TYPES.has(d.type)) {
      console.warn(`[prescription_template] WARNING: skipping doc ${d.templateId} — invalid type "${d.type}"`);
      skipped++;
      continue;
    }
    await upsert('prescription_template', {
      template_id:     d.templateId,
      organization_id: d.organizationId,
      branch_id:       d.branchId    || null,
      doctor_id:       d.doctorId    || null,
      type:            d.type,
      name:            d.name,
      data:            d.data == null ? null : JSON.stringify(d.data),
      is_global:       toBool(d.isGlobal),
      created_at:      toTsStr(d.createdAt),
      updated_at:      toTsStr(d.updatedAt),
    }, 'template_id');
    migratedIds.push(d.templateId);
  }

  const mongoCount = migratedIds.length;
  const mysqlCount = await countMysqlMatched(pool, 'prescription_template', 'template_id', migratedIds);
  const ok = mongoCount === mysqlCount;
  await recordTable('prescription_template', { mongoCount, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[prescription_template] mongo=${mongoCount} mysql=${mysqlCount} ok=${ok} (skipped ${skipped} invalid-type)`);

  await closeMongo();
  await closeMysql();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
