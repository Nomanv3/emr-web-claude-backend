'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }    = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }          = require('../lib/state.cjs');
const { pickAddress, toBool, toTsStr, countMysqlMatched } = require('../lib/util.cjs');

(async () => {
  const db   = await getDb();
  const docs  = await db.collection('branches').find({}).toArray();
  console.log(`[branch] Mongo docs found: ${docs.length}`);

  for (const d of docs) {
    const addr = pickAddress(d.address || {});
    await upsert('branch', {
      branch_id:       d.branchId,
      organization_id: d.organizationId,
      name:            d.name,
      address_street:  addr.street,
      address_city:    addr.city,
      address_state:   addr.state,
      address_country: addr.country,
      address_pincode: addr.pincode,
      timezone:        d.timezone || 'Asia/Kolkata',
      is_active:       toBool(d.isActive),
      created_at:      toTsStr(d.createdAt),
      updated_at:      toTsStr(d.updatedAt),
    }, 'branch_id');
  }

  const mongoCount = docs.length;
  const ids = docs.map(d => d.branchId);
  const mysqlCount = await countMysqlMatched(pool, 'branch', 'branch_id', ids);
  const ok = mongoCount === mysqlCount;
  await recordTable('branch', { mongoCount, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[branch] mongo=${mongoCount} mysql=${mysqlCount} ok=${ok}`);

  await closeMongo();
  await closeMysql();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
