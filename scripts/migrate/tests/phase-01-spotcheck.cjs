'use strict';
// Test B — spot check: pick 3 random Mongo docs per table, find corresponding MySQL row,
// compare critical fields. Reports every mismatch in detail.
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo } = require('../lib/mongo.cjs');
const { pool, closeMysql }  = require('../lib/mysql.cjs');
const { toBool }            = require('../lib/util.cjs');

// Helper: fetch one MySQL row by UUID column
async function mysqlRowById(table, idCol, idVal) {
  const [[row]] = await pool.query(
    `SELECT * FROM \`${table}\` WHERE \`${idCol}\` = ? LIMIT 1`,
    [idVal]
  );
  return row || null;
}

// Helper: normalise a value for comparison (trim strings, coerce null/''/undefined → null)
function norm(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return v;
  return v;
}

// Helper: compare two normalised values; return true if they match
function eq(a, b) {
  return norm(a) === norm(b);
}

// Container to collect mismatches
const mismatches = [];
let totalChecked = 0;

function reportMismatch(table, uuid, field, mongoVal, mysqlVal) {
  const msg = `  MISMATCH  table=${table}  uuid=${uuid}  field=${field}  mongo=${JSON.stringify(mongoVal)}  mysql=${JSON.stringify(mysqlVal)}`;
  console.error(msg);
  mismatches.push({ table, uuid, field, mongoVal, mysqlVal });
}

function checkField(table, uuid, field, mongoVal, mysqlVal) {
  totalChecked++;
  if (!eq(mongoVal, mysqlVal)) {
    reportMismatch(table, uuid, field, mongoVal, mysqlVal);
  }
}

(async () => {
  const db = await getDb();

  console.log('\n=== Test B: Spot Check (3 random docs per table) ===\n');

  // ------------------------------------------------------------------ organization
  {
    const docs = await db.collection('organizations').aggregate([{ $sample: { size: 3 } }]).toArray();
    for (const d of docs) {
      const uuid = d.organizationId;
      console.log(`  [organization] checking uuid=${uuid}`);
      const row = await mysqlRowById('organization', 'organization_id', uuid);
      if (!row) { mismatches.push({ table: 'organization', uuid, field: 'ROW_MISSING', mongoVal: '(exists)', mysqlVal: null }); console.error(`  CRITICAL: No MySQL row for organization_id=${uuid}`); continue; }
      checkField('organization', uuid, 'name',         d.name,             row.name);
      checkField('organization', uuid, 'timezone',     d.timezone || 'Asia/Kolkata', row.timezone);
      checkField('organization', uuid, 'phone',        d.phone    || null, row.phone);
      checkField('organization', uuid, 'email',        d.email    || null, row.email);
      checkField('organization', uuid, 'address_city', d.address?.city || null, row.address_city);
      checkField('organization', uuid, 'is_active',    toBool(d.isActive), row.is_active);
    }
  }

  // ------------------------------------------------------------------ branch
  {
    const docs = await db.collection('branches').aggregate([{ $sample: { size: 3 } }]).toArray();
    for (const d of docs) {
      const uuid = d.branchId;
      console.log(`  [branch] checking uuid=${uuid}`);
      const row = await mysqlRowById('branch', 'branch_id', uuid);
      if (!row) { mismatches.push({ table: 'branch', uuid, field: 'ROW_MISSING', mongoVal: '(exists)', mysqlVal: null }); console.error(`  CRITICAL: No MySQL row for branch_id=${uuid}`); continue; }
      checkField('branch', uuid, 'organization_id', d.organizationId,         row.organization_id);
      checkField('branch', uuid, 'name',            d.name,                   row.name);
      checkField('branch', uuid, 'address_city',    d.address?.city || null,  row.address_city);
      checkField('branch', uuid, 'is_active',       toBool(d.isActive),       row.is_active);
    }
  }

  // ------------------------------------------------------------------ master_salutation
  {
    const docs = await db.collection('mastersalutations').aggregate([{ $sample: { size: 3 } }]).toArray();
    for (const d of docs) {
      const uuid = d.salutationId;
      console.log(`  [master_salutation] checking uuid=${uuid}`);
      const row = await mysqlRowById('master_salutation', 'salutation_id', uuid);
      if (!row) { mismatches.push({ table: 'master_salutation', uuid, field: 'ROW_MISSING', mongoVal: '(exists)', mysqlVal: null }); console.error(`  CRITICAL: No MySQL row for salutation_id=${uuid}`); continue; }
      checkField('master_salutation', uuid, 'label', d.label, row.label);
    }
  }

  // ------------------------------------------------------------------ master_symptom
  {
    const docs = await db.collection('mastersymptoms').aggregate([{ $sample: { size: 3 } }]).toArray();
    for (const d of docs) {
      const uuid = d.symptomId;
      console.log(`  [master_symptom] checking uuid=${uuid}`);
      const row = await mysqlRowById('master_symptom', 'symptom_id', uuid);
      if (!row) { mismatches.push({ table: 'master_symptom', uuid, field: 'ROW_MISSING', mongoVal: '(exists)', mysqlVal: null }); console.error(`  CRITICAL: No MySQL row for symptom_id=${uuid}`); continue; }
      checkField('master_symptom', uuid, 'name',     d.name,            row.name);
      checkField('master_symptom', uuid, 'category', d.category || null, row.category);
    }
  }

  // ------------------------------------------------------------------ master_diagnosis
  // MySQL table: diagnosis_id, icd_code, description, category (no 'name' column)
  {
    const docs = await db.collection('masterdiagnoses').aggregate([{ $sample: { size: 3 } }]).toArray();
    for (const d of docs) {
      const uuid = d.diagnosisId;
      console.log(`  [master_diagnosis] checking uuid=${uuid}`);
      const row = await mysqlRowById('master_diagnosis', 'diagnosis_id', uuid);
      if (!row) { mismatches.push({ table: 'master_diagnosis', uuid, field: 'ROW_MISSING', mongoVal: '(exists)', mysqlVal: null }); console.error(`  CRITICAL: No MySQL row for diagnosis_id=${uuid}`); continue; }
      checkField('master_diagnosis', uuid, 'description', d.description,      row.description);
      checkField('master_diagnosis', uuid, 'category',    d.category || null, row.category);
    }
  }

  // ------------------------------------------------------------------ master_medication
  // MySQL table: medication_id, brand_name, generic_name, form, strength (no 'name' or 'category' column)
  {
    const docs = await db.collection('mastermedications').aggregate([{ $sample: { size: 3 } }]).toArray();
    for (const d of docs) {
      const uuid = d.medicationId;
      console.log(`  [master_medication] checking uuid=${uuid}`);
      const row = await mysqlRowById('master_medication', 'medication_id', uuid);
      if (!row) { mismatches.push({ table: 'master_medication', uuid, field: 'ROW_MISSING', mongoVal: '(exists)', mysqlVal: null }); console.error(`  CRITICAL: No MySQL row for medication_id=${uuid}`); continue; }
      checkField('master_medication', uuid, 'brand_name',   d.brandName   || null, row.brand_name);
      checkField('master_medication', uuid, 'generic_name', d.genericName || null, row.generic_name);
    }
  }

  // ------------------------------------------------------------------ master_lab_test
  // MySQL table: test_id (not lab_test_id), name, category, normal_range, unit
  {
    const docs = await db.collection('masterlabtests').aggregate([{ $sample: { size: 3 } }]).toArray();
    for (const d of docs) {
      // Try testId first, fall back to labTestId
      const uuid = d.testId || d.labTestId;
      console.log(`  [master_lab_test] checking uuid=${uuid}`);
      // MySQL UUID column is test_id (per DESCRIBE output)
      const row = await mysqlRowById('master_lab_test', 'test_id', uuid);
      if (!row) { mismatches.push({ table: 'master_lab_test', uuid, field: 'ROW_MISSING', mongoVal: '(exists)', mysqlVal: null }); console.error(`  CRITICAL: No MySQL row for test_id=${uuid}`); continue; }
      checkField('master_lab_test', uuid, 'name',     d.name,             row.name);
      checkField('master_lab_test', uuid, 'category', d.category || null, row.category);
    }
  }

  // ------------------------------------------------------------------ master_examination_finding
  {
    const docs = await db.collection('masterexaminationfindings').aggregate([{ $sample: { size: 3 } }]).toArray();
    for (const d of docs) {
      const uuid = d.findingId;
      console.log(`  [master_examination_finding] checking uuid=${uuid}`);
      const row = await mysqlRowById('master_examination_finding', 'finding_id', uuid);
      if (!row) { mismatches.push({ table: 'master_examination_finding', uuid, field: 'ROW_MISSING', mongoVal: '(exists)', mysqlVal: null }); console.error(`  CRITICAL: No MySQL row for finding_id=${uuid}`); continue; }
      checkField('master_examination_finding', uuid, 'name',     d.name,             row.name);
      checkField('master_examination_finding', uuid, 'category', d.category || null,  row.category);
    }
  }

  // ------------------------------------------------------------------ master_procedure
  {
    const docs = await db.collection('masterprocedures').aggregate([{ $sample: { size: 3 } }]).toArray();
    for (const d of docs) {
      const uuid = d.procedureId;
      console.log(`  [master_procedure] checking uuid=${uuid}`);
      const row = await mysqlRowById('master_procedure', 'procedure_id', uuid);
      if (!row) { mismatches.push({ table: 'master_procedure', uuid, field: 'ROW_MISSING', mongoVal: '(exists)', mysqlVal: null }); console.error(`  CRITICAL: No MySQL row for procedure_id=${uuid}`); continue; }
      checkField('master_procedure', uuid, 'name',     d.name,             row.name);
      checkField('master_procedure', uuid, 'category', d.category || null,  row.category);
    }
  }

  // ------------------------------------------------------------------ master_service
  {
    const docs = await db.collection('masterservices').aggregate([{ $sample: { size: 3 } }]).toArray();
    for (const d of docs) {
      const uuid = d.serviceId;
      console.log(`  [master_service] checking uuid=${uuid}`);
      const row = await mysqlRowById('master_service', 'service_id', uuid);
      if (!row) { mismatches.push({ table: 'master_service', uuid, field: 'ROW_MISSING', mongoVal: '(exists)', mysqlVal: null }); console.error(`  CRITICAL: No MySQL row for service_id=${uuid}`); continue; }
      checkField('master_service', uuid, 'name',          d.name,                              row.name);
      checkField('master_service', uuid, 'category',      d.category    || null,               row.category);
      // default_price: Mongo stores as number, MySQL as DECIMAL — compare as floats
      const mongoPrice = d.defaultPrice != null ? parseFloat(d.defaultPrice) : 0;
      const mysqlPrice = row.default_price != null ? parseFloat(row.default_price) : 0;
      if (Math.abs(mongoPrice - mysqlPrice) > 0.001) {
        reportMismatch('master_service', uuid, 'default_price', mongoPrice, mysqlPrice);
      } else {
        totalChecked++;
      }
    }
  }

  // ------------------------------------------------------------------ dropdown_option
  {
    const docs = await db.collection('dropdownoptions').aggregate([{ $sample: { size: 3 } }]).toArray();
    for (const d of docs) {
      const uuid = d.dropdown_option_id;
      console.log(`  [dropdown_option] checking uuid=${uuid}`);
      const row = await mysqlRowById('dropdown_option', 'dropdown_option_id', uuid);
      if (!row) { mismatches.push({ table: 'dropdown_option', uuid, field: 'ROW_MISSING', mongoVal: '(exists)', mysqlVal: null }); console.error(`  CRITICAL: No MySQL row for dropdown_option_id=${uuid}`); continue; }
      const trans = d.translations || {};
      checkField('dropdown_option', uuid, 'section',        d.section,                row.section);
      checkField('dropdown_option', uuid, 'option_key',     d.option_key,             row.option_key);
      checkField('dropdown_option', uuid, 'option_value',   d.option_value,           row.option_value);
      checkField('dropdown_option', uuid, 'translation_hi', trans.hi || '',           row.translation_hi);
      checkField('dropdown_option', uuid, 'translation_mr', trans.mr || '',           row.translation_mr);
      // sort_order: may be stored as number or string in Mongo
      const mongoSort  = d.sort_order   != null ? parseInt(d.sort_order, 10)   : 0;
      const mysqlSort  = row.sort_order != null ? parseInt(row.sort_order, 10) : 0;
      if (mongoSort !== mysqlSort) {
        reportMismatch('dropdown_option', uuid, 'sort_order', mongoSort, mysqlSort);
      } else {
        totalChecked++;
      }
    }
  }

  // ------------------------------------------------------------------ summary
  console.log(`\n=== Test B Summary ===`);
  console.log(`Total field comparisons: ${totalChecked}`);
  console.log(`Total mismatches:        ${mismatches.length}`);
  if (mismatches.length === 0) {
    console.log('RESULT: PASS — no spot-check mismatches.');
  } else {
    console.error('RESULT: FAIL — mismatches found (listed above).');
  }

  await closeMongo();
  await closeMysql();
  process.exit(mismatches.length > 0 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
