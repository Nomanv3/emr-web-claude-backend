'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }    = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }          = require('../lib/state.cjs');
const { pickAddress, toBool, toTsStr, countMysqlMatched } = require('../lib/util.cjs');

(async () => {
  const db   = await getDb();
  const docs  = await db.collection('organizations').find({}).toArray();
  console.log(`[organization] Mongo docs found: ${docs.length}`);

  for (const d of docs) {
    const addr = pickAddress(d.address || {});
    await upsert('organization', {
      organization_id: d.organizationId,
      name:            d.name,
      timezone:        d.timezone || 'Asia/Kolkata',
      address_street:  addr.street,
      address_city:    addr.city,
      address_state:   addr.state,
      address_country: addr.country,
      address_pincode: addr.pincode,
      phone:           d.phone    || null,
      email:           d.email    || null,
      logo:            d.logo     || null,
      is_active:       toBool(d.isActive),
      created_at:      toTsStr(d.createdAt),
      updated_at:      toTsStr(d.updatedAt),
    }, 'organization_id');
  }

  const mongoCount = docs.length;
  const ids = docs.map(d => d.organizationId);
  const mysqlCount = await countMysqlMatched(pool, 'organization', 'organization_id', ids);
  const ok = mongoCount === mysqlCount;
  await recordTable('organization', { mongoCount, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[organization] mongo=${mongoCount} mysql=${mysqlCount} ok=${ok}`);

  await closeMongo();
  await closeMysql();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
