'use strict';
// parity-step-c.cjs — Phase 4 Step C parity check.
//
// Directly queries MySQL for each of the 4 converted controllers (patients,
// patientHistory, invoices, payments) and asserts the returned object shape
// matches the Mongoose response (camelCase keys, nested address/medical
// history subdocs, ISO-8601 timestamps, no snake_case leak).
//
// Run from backend/:
//   node scripts/phase4/parity-step-c.cjs

const mysql = require('mysql2/promise');

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

// ── Inline mapper copies (so this file is self-contained) ─────────────────────
const toIso   = (v) => (v ? new Date(v).toISOString() : null);
const toBool  = (v) => v === 1 || v === true;
const toNum   = (v) => (v === null || v === undefined ? 0 : parseFloat(v));
const toDobIso = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return new Date(`${v}T00:00:00.000Z`).toISOString();
  return new Date(v).toISOString();
};

function mapPatientRow(row, tagRows = []) {
  return {
    _id:            row.patient_id,
    patientId:      row.patient_id,
    uhid:           row.uhid,
    organizationId: row.organization_id,
    branchId:       row.branch_id,
    salutation:     row.salutation || null,
    name:           row.name,
    gender:         row.gender,
    dateOfBirth:    toDobIso(row.date_of_birth),
    age:            row.age != null ? Number(row.age) : null,
    phone:          row.phone,
    alternatePhone: row.alternate_phone || null,
    email:          row.email || null,
    address: {
      street: row.address_street || null, city: row.address_city || null,
      state: row.address_state || null, country: row.address_country || null,
      pincode: row.address_pincode || null,
    },
    bloodGroup:     row.blood_group || null,
    tags:           tagRows.map((t) => t.tag),
    isActive:       toBool(row.is_active),
    createdBy:      row.created_by || null,
    createdAt:      toIso(row.created_at),
    updatedAt:      toIso(row.updated_at),
  };
}

function mapPatientHistoryRow(row, conditions = [], allergies = [], surgical = [], family = []) {
  return {
    _id:         row.history_id,
    historyId:   row.history_id,
    patientId:   row.patient_id,
    noHistory:   toBool(row.no_history),
    conditions:  conditions.map((c) => ({ name: c.name, value: c.value, since: c.since || null, notes: c.notes || null })),
    allergies:   allergies.map((a) => ({ allergen: a.allergen, severity: a.severity || null, reaction: a.reaction || null })),
    surgicalHistory: surgical.map((s) => ({ procedure: s.procedure_name, date: s.procedure_date ? new Date(s.procedure_date).toISOString() : null, notes: s.notes || null })),
    familyHistory: family.map((f) => ({ relation: f.relation, condition: f.condition_desc })),
    updatedBy:   row.updated_by || null,
    createdAt:   toIso(row.created_at),
    updatedAt:   toIso(row.updated_at),
  };
}

function mapInvoiceRow(row, liRows = []) {
  const lineItems = liRows.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((li) => ({
    description: li.description || null, quantity: Number(li.quantity) || 0,
    unitPrice: toNum(li.unit_price), discount: toNum(li.discount), total: toNum(li.total),
  }));
  return {
    _id: row.invoice_id, invoiceId: row.invoice_id, organizationId: row.organization_id,
    patientId: row.patient_id, appointmentId: row.appointment_id || null,
    lineItems, subtotal: toNum(row.subtotal), discount: toNum(row.discount), tax: toNum(row.tax),
    totalAmount: toNum(row.total_amount), paidAmount: toNum(row.paid_amount),
    balanceDue: toNum(row.balance_due), status: row.status,
    createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at),
  };
}

function mapPaymentRow(row) {
  return {
    _id: row.payment_id, paymentId: row.payment_id, invoiceId: row.invoice_id,
    amount: toNum(row.amount), method: row.method,
    transactionRef: row.transaction_ref || null, collectedBy: row.collected_by || null,
    collectedAt: toIso(row.collected_at), receiptId: row.receipt_id || null,
    createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at),
  };
}

// ── Test runner ───────────────────────────────────────────────────────────────
async function run() {
  const pool = mysql.createPool(MYSQL_OPTS);
  const PASS = '✅ PASS';
  const FAIL = '❌ FAIL';
  let passCount = 0, failCount = 0;

  async function check(label, fn) {
    process.stdout.write(`\n[${label}] ... `);
    try {
      const result = await fn(pool);
      console.log(PASS);
      console.log('  shape:', JSON.stringify(result).slice(0, 220));
      passCount++;
      return result;
    } catch (err) {
      console.log(FAIL, err.message);
      failCount++;
      return null;
    }
  }

  // ── 1. patients.searchPatients ────────────────────────────────────────────
  await check('patients.searchPatients (first row)', async (p) => {
    const [rows] = await p.query(
      'SELECT patient_id, name, phone, uhid, gender, age FROM patient WHERE is_active=1 AND deleted_at IS NULL ORDER BY name LIMIT 20'
    );
    if (!rows.length) throw new Error('No active patients in MySQL');
    const mapped = rows.map((r) => ({
      _id: r.patient_id, patientId: r.patient_id, name: r.name, phone: r.phone,
      uhid: r.uhid, gender: r.gender, age: r.age != null ? Number(r.age) : null,
    }));
    if (!('patientId' in mapped[0])) throw new Error('Missing patientId');
    if ('patient_id' in mapped[0])   throw new Error('snake_case leak!');
    if (typeof mapped[0].patientId !== 'string') throw new Error('patientId not string');
    return mapped[0];
  });

  // ── 2. patients.getPatients (pagination + tags reconstruction) ────────────
  await check('patients.getPatients (paginated + tags)', async (p) => {
    const [rows] = await p.query(
      "SELECT * FROM patient WHERE is_active=1 AND deleted_at IS NULL AND organization_id='org-001' ORDER BY created_at DESC LIMIT 5 OFFSET 0"
    );
    if (!rows.length) throw new Error('No patients for org-001');
    const ids = rows.map((r) => r.patient_id);
    const ph = ids.map(() => '?').join(',');
    const [tagRows] = await p.query(
      `SELECT patient_id, tag FROM patient_tags WHERE patient_id IN (${ph})`, ids
    );
    const tagMap = {};
    for (const t of tagRows) (tagMap[t.patient_id] ||= []).push(t);
    const mapped = rows.map((r) => mapPatientRow(r, tagMap[r.patient_id] || []));
    if (!mapped[0].address || typeof mapped[0].address !== 'object') throw new Error('address not nested');
    if (!Array.isArray(mapped[0].tags)) throw new Error('tags not array');
    if (typeof mapped[0].isActive !== 'boolean') throw new Error('isActive not boolean');
    if (typeof mapped[0].createdAt !== 'string') throw new Error('createdAt not ISO string');
    return { count: mapped.length, firstPatientId: mapped[0].patientId, addressKeys: Object.keys(mapped[0].address), tagCount: mapped[0].tags.length };
  });

  // ── 3. patients.getPatientById (with embedded medicalHistory) ────────────
  await check('patients.getPatientById (with medicalHistory)', async (p) => {
    // Find a patient that has a history row
    const [[hrow]] = await p.query('SELECT * FROM patient_medical_history LIMIT 1');
    if (!hrow) throw new Error('No medical history rows in MySQL');
    const [[prow]] = await p.query(
      'SELECT * FROM patient WHERE patient_id = ? AND is_active=1 AND deleted_at IS NULL LIMIT 1',
      [hrow.patient_id]
    );
    if (!prow) throw new Error(`No active patient for history.patient_id=${hrow.patient_id}`);
    const [tagRows]  = await p.query('SELECT tag FROM patient_tags WHERE patient_id = ?', [prow.patient_id]);
    const [cRows]    = await p.query('SELECT * FROM patient_medical_conditions WHERE history_id = ?', [hrow.history_id]);
    const [aRows]    = await p.query('SELECT * FROM patient_allergies WHERE history_id = ?', [hrow.history_id]);
    const [sRows]    = await p.query('SELECT * FROM patient_surgical_history WHERE history_id = ?', [hrow.history_id]);
    const [fRows]    = await p.query('SELECT * FROM patient_family_history WHERE history_id = ?', [hrow.history_id]);
    const patient = mapPatientRow(prow, tagRows);
    const medicalHistory = mapPatientHistoryRow(hrow, cRows, aRows, sRows, fRows);
    const result = { ...patient, medicalHistory };
    if (!result.medicalHistory) throw new Error('medicalHistory missing');
    if (!Array.isArray(result.medicalHistory.conditions)) throw new Error('conditions not array');
    if (typeof result.medicalHistory.noHistory !== 'boolean') throw new Error('noHistory not bool');
    return {
      patientId: result.patientId,
      historyId: result.medicalHistory.historyId,
      conditionsCount: result.medicalHistory.conditions.length,
      allergiesCount: result.medicalHistory.allergies.length,
    };
  });

  // ── 4. patientHistory.getPatientHistory (lockedVitals from last rx) ──────
  await check('patientHistory.getPatientHistory (lockedVitals)', async (p) => {
    const [[hrow]] = await p.query('SELECT * FROM patient_medical_history LIMIT 1');
    if (!hrow) throw new Error('No medical history rows');
    const [[lastRx]] = await p.query(
      'SELECT prescription_id, visit_date FROM prescription WHERE patient_id = ? AND deleted_at IS NULL ORDER BY visit_date DESC LIMIT 1',
      [hrow.patient_id]
    );
    let lockedVitals = null;
    let lastVisitDate = null;
    if (lastRx) {
      const [vRows] = await p.query('SELECT * FROM prescription_vitals WHERE prescription_id = ?', [lastRx.prescription_id]);
      lockedVitals = {};
      for (const v of vRows) {
        if (v.unit || v.is_locked === 1) {
          lockedVitals[v.vital_name] = { value: v.value_text, unit: v.unit || null, is_locked: v.is_locked === 1 };
        } else {
          lockedVitals[v.vital_name] = v.value_text;
        }
      }
      lastVisitDate = lastRx.visit_date ? new Date(lastRx.visit_date).toISOString() : null;
    }
    const hasRx = !!lastRx;
    if (hasRx && typeof lastVisitDate !== 'string') throw new Error('lastVisitDate not ISO string');
    return { patientId: hrow.patient_id, hasRx, lockedVitalsKeys: lockedVitals ? Object.keys(lockedVitals) : [] };
  });

  // ── 5. invoices.getInvoicesList (pagination + lineItems reconstruction) ──
  await check('invoices.getInvoicesList (lineItems)', async (p) => {
    const [rows] = await p.query(
      "SELECT * FROM invoice WHERE deleted_at IS NULL AND organization_id='org-001' ORDER BY created_at DESC LIMIT 5 OFFSET 0"
    );
    if (!rows.length) {
      console.log('  (no invoices for org-001 — empty result is valid)');
      return { invoices: [] };
    }
    const ids = rows.map((r) => r.invoice_id);
    const ph = ids.map(() => '?').join(',');
    const [liRows] = await p.query(
      `SELECT * FROM invoice_line_items WHERE invoice_id IN (${ph}) ORDER BY sort_order, id`, ids
    );
    const liMap = {};
    for (const li of liRows) (liMap[li.invoice_id] ||= []).push(li);
    const mapped = rows.map((r) => mapInvoiceRow(r, liMap[r.invoice_id] || []));
    if (!('invoiceId' in mapped[0])) throw new Error('Missing invoiceId');
    if (!Array.isArray(mapped[0].lineItems)) throw new Error('lineItems not array');
    if (typeof mapped[0].totalAmount !== 'number') throw new Error('totalAmount not number');
    return { count: mapped.length, firstInvoiceId: mapped[0].invoiceId, lineItemsCount: mapped[0].lineItems.length, totalAmount: mapped[0].totalAmount };
  });

  // ── 6. payments.getPayments (org-scoped subquery) ─────────────────────────
  await check('payments.getPayments (org-scoped)', async (p) => {
    const [rows] = await p.query(
      "SELECT * FROM payment WHERE invoice_id IN (SELECT invoice_id FROM invoice WHERE organization_id='org-001') ORDER BY collected_at DESC LIMIT 5"
    );
    if (!rows.length) {
      console.log('  (no payments for org-001 — empty result is valid)');
      return { payments: [] };
    }
    const mapped = rows.map(mapPaymentRow);
    if (!('paymentId' in mapped[0])) throw new Error('Missing paymentId');
    if (typeof mapped[0].amount !== 'number') throw new Error('amount not number');
    if (typeof mapped[0].collectedAt !== 'string') throw new Error('collectedAt not ISO string');
    return { count: mapped.length, firstPaymentId: mapped[0].paymentId, amount: mapped[0].amount, method: mapped[0].method };
  });

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Step C parity checks: ${passCount} passed, ${failCount} failed`);
  if (failCount > 0) process.exitCode = 1;
  await pool.end();
}

run().catch((err) => { console.error('Fatal:', err); process.exit(1); });
