'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }        = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }              = require('../lib/state.cjs');
const { pickAddress, toBool, toTsStr, countMysqlMatched } = require('../lib/util.cjs');

(async () => {
  const db   = await getDb();
  const docs  = await db.collection('patients').find({}).toArray();
  console.log(`[patient] Mongo docs found: ${docs.length}`);

  let totalMongoTags = 0;

  for (const d of docs) {
    const addr = pickAddress(d.address || {});

    // date_of_birth: store as DATE string 'YYYY-MM-DD' or null
    let dob = null;
    if (d.dateOfBirth) {
      const dt = new Date(d.dateOfBirth);
      if (!isNaN(dt.getTime())) {
        dob = dt.toISOString().slice(0, 10);
      }
    }

    await upsert('patient', {
      patient_id:      d.patientId,
      uhid:            d.uhid             || null,
      organization_id: d.organizationId,
      branch_id:       d.branchId,
      salutation:      d.salutation       || null,
      name:            d.name,
      gender:          d.gender,
      date_of_birth:   dob,
      age:             (d.age != null) ? d.age : null,
      phone:           d.phone,
      alternate_phone: d.alternatePhone   || null,
      email:           d.email            || null,
      address_street:  addr.street,
      address_city:    addr.city,
      address_state:   addr.state,
      address_country: addr.country,
      address_pincode: addr.pincode,
      blood_group:     d.bloodGroup       || null,
      is_active:       toBool(d.isActive),
      created_by:      d.createdBy        || null,
      created_at:      toTsStr(d.createdAt),
      updated_at:      toTsStr(d.updatedAt),
    }, 'patient_id');

    // Child table: patient_tags
    const tags = Array.isArray(d.tags) ? d.tags.filter(t => t != null && t !== '') : [];
    totalMongoTags += tags.length;

    if (tags.length > 0) {
      // Delete existing tags for this patient (idempotent)
      await pool.execute('DELETE FROM `patient_tags` WHERE `patient_id` = ?', [d.patientId]);
      for (const tag of tags) {
        await pool.execute(
          'INSERT INTO `patient_tags` (`patient_id`, `tag`) VALUES (?, ?)',
          [d.patientId, String(tag)]
        );
      }
    }
  }

  // Count check — parent
  const mongoCount = docs.length;
  const ids = docs.map(d => d.patientId);
  const mysqlCount = await countMysqlMatched(pool, 'patient', 'patient_id', ids);
  const ok = mongoCount === mysqlCount;
  await recordTable('patient', { mongoCount, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[patient] mongo=${mongoCount} mysql=${mysqlCount} ok=${ok}`);

  // Count check — child (patient_tags)
  const [[{ tagCount }]] = await pool.query(
    `SELECT COUNT(*) AS tagCount FROM \`patient_tags\` WHERE \`patient_id\` IN (${ids.map(() => '?').join(', ')})`,
    ids
  );
  const tagsOk = totalMongoTags === Number(tagCount);
  await recordTable('patient_tags', {
    mongoCount: totalMongoTags,
    mysqlCount: Number(tagCount),
    ok: tagsOk,
    lastRun: new Date().toISOString(),
  });
  console.log(`[patient_tags] mongo=${totalMongoTags} mysql=${tagCount} ok=${tagsOk}`);

  await closeMongo();
  await closeMysql();
  process.exit(ok && tagsOk ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
