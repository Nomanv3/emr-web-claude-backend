'use strict';
// parity-step-b.cjs — Phase 4 Step B parity check.
//
// Directly queries MySQL for each of the 4 converted controllers and logs the
// returned object shape so you can visually confirm it matches Mongoose output.
//
// Run from backend/:
//   node scripts/phase4/parity-step-b.cjs
//
// Prerequisites: MySQL at 192.168.80.1:3306 must be reachable from WSL2.

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// ── DB connection ─────────────────────────────────────────────────────────────
const MYSQL_OPTS = {
  host:               process.env.MYSQL_HOST     || '192.168.80.1',
  port:               parseInt(process.env.MYSQL_PORT || '3306', 10),
  user:               process.env.MYSQL_USER     || 'root',
  password:           process.env.MYSQL_PASSWORD || 'Noman@9511676707',
  database:           process.env.MYSQL_DATABASE || 'emrdevtestingdb',
  charset:            'utf8mb4',
  timezone:           '+00:00',
  waitForConnections: true,
  connectionLimit:    3,
};

// ── Mapper copies (inline so this file is self-contained) ─────────────────────
const toIso   = (v) => (v ? new Date(v).toISOString() : null);
const toBool  = (v) => v === 1 || v === true;
const toFloat = (v) => parseFloat(v) || 0;

function mapSymptomRow(row) {
  return { _id: row.symptom_id, symptomId: row.symptom_id, name: row.name,
           category: row.category || null, icdMapping: row.icd_mapping || null,
           createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at) };
}
function mapDiagnosisRow(row) {
  return { _id: row.diagnosis_id, diagnosisId: row.diagnosis_id,
           icdCode: row.icd_code, description: row.description, category: row.category || null,
           createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at) };
}
function mapUserRow(row) {
  return { _id: row.user_id, userId: row.user_id, organizationId: row.organization_id,
           branchId: row.branch_id, username: row.username, email: row.email,
           role: row.role, name: row.name, qualifications: row.qualifications || null,
           registrationNumber: row.registration_number || null, signature: row.signature || null,
           specialization: row.specialization || null, isActive: toBool(row.is_active),
           createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at) };
}
function nestSettings(rows) {
  const result = {};
  for (const { option_key, option_value } of rows) {
    const parts = option_key.split('.');
    let cursor = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!cursor[p] || typeof cursor[p] !== 'object') cursor[p] = {};
      cursor = cursor[p];
    }
    const leaf = parts[parts.length - 1];
    if (option_value !== null && option_value !== undefined) {
      const t = option_value.trim();
      if ((t.startsWith('[') || t.startsWith('{')) && t.length > 1) {
        try { cursor[leaf] = JSON.parse(t); continue; } catch {}
      }
    }
    cursor[leaf] = option_value;
  }
  return result;
}
function mapPrintSettingsRow(parent, optRows) {
  return { _id: parent.settings_id, settingsId: parent.settings_id,
           organizationId: parent.organization_id, branchId: parent.branch_id || null,
           settings: nestSettings(optRows),
           createdAt: toIso(parent.created_at), updatedAt: toIso(parent.updated_at) };
}
function mapQueueRow(row, svcRows) {
  return { _id: row.queue_id, queueId: row.queue_id,
           organizationId: row.organization_id, branchId: row.branch_id,
           patientId: row.patient_id, patientName: row.patient_name || null,
           tokenNumber: row.token_number != null ? Number(row.token_number) : null,
           slot: row.slot || null, queueDate: row.queue_date, status: row.status,
           services: svcRows.map(s => ({ serviceId: s.service_id || null, name: s.name || null, price: toFloat(s.price) })),
           createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at) };
}

// ── Test runner ───────────────────────────────────────────────────────────────
async function run() {
  const pool = mysql.createPool(MYSQL_OPTS);
  const PASS = '✅ PASS';
  const FAIL = '❌ FAIL';
  let passCount = 0;
  let failCount = 0;

  async function check(label, fn) {
    process.stdout.write(`\n[${label}] ... `);
    try {
      const result = await fn(pool);
      console.log(PASS);
      console.log('  shape:', JSON.stringify(result).slice(0, 200));
      passCount++;
      return result;
    } catch (err) {
      console.log(FAIL, err.message);
      failCount++;
      return null;
    }
  }

  // ── 1. masters — searchSymptoms ──────────────────────────────────────────
  await check('masters.searchSymptoms (first 3 rows)', async (p) => {
    const [rows] = await p.query('SELECT * FROM master_symptom ORDER BY name LIMIT 3');
    if (!rows.length) throw new Error('No symptom rows found');
    const mapped = rows.map(mapSymptomRow);
    // Assert camelCase keys.
    if (!('symptomId' in mapped[0])) throw new Error('Missing symptomId key');
    if (!('createdAt' in mapped[0])) throw new Error('Missing createdAt key');
    if (typeof mapped[0].createdAt !== 'string') throw new Error('createdAt not a string');
    return mapped[0];
  });

  // ── 2. masters — searchDiagnoses ─────────────────────────────────────────
  await check('masters.searchDiagnoses (first 3 rows)', async (p) => {
    const [rows] = await p.query('SELECT * FROM master_diagnosis ORDER BY description LIMIT 3');
    if (!rows.length) throw new Error('No diagnosis rows found');
    const mapped = rows.map(mapDiagnosisRow);
    if (!('diagnosisId' in mapped[0])) throw new Error('Missing diagnosisId');
    if (!('icdCode' in mapped[0])) throw new Error('Missing icdCode (snake_case leak!)');
    return mapped[0];
  });

  // ── 3. auth — login bcrypt (dry run; does NOT change data) ───────────────
  await check('auth.login (bcrypt verify dev-doctor)', async (p) => {
    const [[row]] = await p.query(
      'SELECT * FROM `user` WHERE username = ? AND is_active = 1 LIMIT 1',
      ['dev-doctor']
    );
    if (!row) throw new Error('dev-doctor user not found in MySQL');
    const ok = await bcrypt.compare('password123', row.password_hash);
    if (!ok) throw new Error('bcrypt.compare returned false — hash mismatch');
    const safe = mapUserRow(row);
    if ('passwordHash' in safe) throw new Error('passwordHash leaked into mapUserRow output!');
    if (!safe.userId) throw new Error('Missing userId');
    return { userId: safe.userId, username: safe.username, role: safe.role, bcryptOk: ok };
  });

  // ── 4. printSettings — getPrintSettings ──────────────────────────────────
  await check('printSettings.getPrintSettings (org-001)', async (p) => {
    const [[parent]] = await p.query(
      "SELECT * FROM print_settings WHERE organization_id = 'org-001' LIMIT 1"
    );
    if (!parent) {
      console.log('  (no print_settings row for org-001 — returning empty shape)');
      return { settings: {} };
    }
    const [optRows] = await p.query(
      'SELECT option_key, option_value FROM print_settings_options WHERE settings_id = ?',
      [parent.settings_id]
    );
    const mapped = mapPrintSettingsRow(parent, optRows);
    if (!('settingsId' in mapped)) throw new Error('Missing settingsId');
    if (typeof mapped.settings !== 'object') throw new Error('settings is not an object');
    return { settingsId: mapped.settingsId, settingsKeys: Object.keys(mapped.settings).slice(0, 5) };
  });

  // ── 5. schedule — getSchedule (queue shape check) ────────────────────────
  await check('schedule.getSchedule — queue rows for branch-001', async (p) => {
    const [rows] = await p.query(
      `SELECT * FROM queue WHERE organization_id = 'org-001' AND branch_id = 'branch-001'
       AND deleted_at IS NULL ORDER BY token_number LIMIT 3`
    );
    if (!rows.length) {
      console.log('  (no queue rows for branch-001 — empty result is valid)');
      return { queue: [] };
    }
    const qids = rows.map(r => r.queue_id);
    const ph = qids.map(() => '?').join(', ');
    const [svcs] = await p.query(`SELECT * FROM queue_services WHERE queue_id IN (${ph})`, qids);
    const svcMap = {};
    for (const s of svcs) {
      if (!svcMap[s.queue_id]) svcMap[s.queue_id] = [];
      svcMap[s.queue_id].push(s);
    }
    const mapped = rows.map(r => mapQueueRow(r, svcMap[r.queue_id] || []));
    if (!('queueId' in mapped[0])) throw new Error('Missing queueId');
    if (!Array.isArray(mapped[0].services)) throw new Error('services is not an array');
    if (typeof mapped[0].createdAt !== 'string') throw new Error('createdAt not ISO string');
    return { count: mapped.length, firstQueueId: mapped[0].queueId, servicesCount: mapped[0].services.length };
  });

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Parity checks: ${passCount} passed, ${failCount} failed`);
  if (failCount > 0) process.exitCode = 1;
  await pool.end();
}

run().catch((err) => { console.error('Fatal:', err); process.exit(1); });
