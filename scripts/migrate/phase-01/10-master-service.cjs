'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }    = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }          = require('../lib/state.cjs');
const { toBool, toTsStr, countMysqlMatched } = require('../lib/util.cjs');

(async () => {
  const db   = await getDb();
  const docs  = await db.collection('masterservices').find({}).toArray();
  console.log(`[master_service] Mongo docs found: ${docs.length}`);

  for (const d of docs) {
    await upsert('master_service', {
      service_id:      d.serviceId,
      organization_id: d.organizationId,
      branch_id:       null,           // MasterService model has no branchId field
      name:            d.name,
      category:        d.category     || null,
      default_price:   d.defaultPrice != null ? d.defaultPrice : 0,
      description:     d.description  || null,
      is_active:       toBool(d.isActive),
      created_at:      toTsStr(d.createdAt),
      updated_at:      toTsStr(d.updatedAt),
    }, 'service_id');
  }

  const mongoCount = docs.length;
  const ids = docs.map(d => d.serviceId);
  const mysqlCount = await countMysqlMatched(pool, 'master_service', 'service_id', ids);
  const ok = mongoCount === mysqlCount;
  await recordTable('master_service', { mongoCount, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[master_service] mongo=${mongoCount} mysql=${mysqlCount} ok=${ok}`);

  await closeMongo();
  await closeMysql();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
