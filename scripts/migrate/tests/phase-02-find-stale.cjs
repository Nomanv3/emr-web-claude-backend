'use strict';
// Find stale sample-seed rows in Phase 2 tables that aren't in MongoDB.
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo } = require('../lib/mongo.cjs');
const { pool, closeMysql } = require('../lib/mysql.cjs');

const PAIRS = [
  ['user',                  'users',                  'userId',     'user_id'],
  ['patient',               'patients',               'patientId',  'patient_id'],
  ['patient_medical_history','patientmedicalhistories','historyId', 'history_id'],
  ['prescription_config',   'prescriptionconfigs',    'configId',   'config_id'],
  ['prescription_template', 'prescriptiontemplates',  'templateId', 'template_id'],
  ['print_settings',        'printsettings',          'settingsId', 'settings_id'],
];

(async () => {
  const db = await getDb();
  for (const [table, coll, mongoKey, sqlKey] of PAIRS) {
    const docs = await db.collection(coll).find({}, { projection: { [mongoKey]: 1 } }).toArray();
    const liveIds = new Set(docs.map(d => d[mongoKey]));
    const [rows] = await pool.query(`SELECT \`${sqlKey}\` AS id FROM \`${table}\``);
    const stale = rows.filter(r => !liveIds.has(r.id));
    console.log(`${table}: mongo=${liveIds.size} mysql=${rows.length} stale=${stale.length}`);
    if (stale.length > 0) {
      console.log('  stale ids:', stale.map(r => r.id).join(', '));
    }
  }
  await closeMongo();
  await closeMysql();
})().catch((e) => { console.error(e); process.exit(1); });
