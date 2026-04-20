'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }        = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }              = require('../lib/state.cjs');
const { toBool, toTsStr, countMysqlMatched } = require('../lib/util.cjs');

(async () => {
  const db   = await getDb();
  const docs  = await db.collection('users').find({}).toArray();
  console.log(`[user] Mongo docs found: ${docs.length}`);

  for (const d of docs) {
    await upsert('user', {
      user_id:             d.userId,
      organization_id:     d.organizationId,
      branch_id:           d.branchId,
      username:            d.username,
      email:               d.email,
      password_hash:       d.passwordHash,
      role:                d.role,
      name:                d.name,
      qualifications:      d.qualifications      || null,
      registration_number: d.registrationNumber  || null,
      signature:           d.signature           || null,
      specialization:      d.specialization      || null,
      is_active:           toBool(d.isActive),
      created_at:          toTsStr(d.createdAt),
      updated_at:          toTsStr(d.updatedAt),
    }, 'user_id');
  }

  const mongoCount = docs.length;
  const ids = docs.map(d => d.userId);
  const mysqlCount = await countMysqlMatched(pool, 'user', 'user_id', ids);
  const ok = mongoCount === mysqlCount;
  await recordTable('user', { mongoCount, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[user] mongo=${mongoCount} mysql=${mysqlCount} ok=${ok}`);

  await closeMongo();
  await closeMysql();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
