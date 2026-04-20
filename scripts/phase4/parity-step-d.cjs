'use strict';
// parity-step-d.cjs — Phase 4 Step D parity check.
//
// Directly queries MySQL for each of the 5 Step-D controllers (appointments,
// queue, prescriptions, templates, analytics) and asserts the output shape
// matches what the Mongoose controllers return.
//
// Run from backend/:
//   node scripts/phase4/parity-step-d.cjs

const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

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

const toIso   = (v) => (v ? new Date(v).toISOString() : null);
const toBool  = (v) => v === 1 || v === true;
const toNum   = (v) => (v === null || v === undefined ? 0 : parseFloat(v));

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
      if (result !== undefined) console.log('  shape:', JSON.stringify(result).slice(0, 260));
      passCount++;
      return result;
    } catch (err) {
      console.log(FAIL, err.message);
      failCount++;
      return null;
    }
  }

  // ── 1. templates.getTemplates — list + type ENUM integrity ───────────────
  await check('templates.getTemplates (list + enum)', async (p) => {
    const [rows] = await p.query(
      "SELECT template_id, organization_id, branch_id, doctor_id, type, name, data, is_global, created_at, updated_at " +
      "FROM prescription_template WHERE organization_id = 'org-001' ORDER BY created_at DESC LIMIT 5"
    );
    const VALID_TYPES = new Set(['symptom','medication','labtest','labresult','diagnosis','examination','procedure','global','main']);
    for (const r of rows) {
      if (!VALID_TYPES.has(r.type)) throw new Error(`Invalid type "${r.type}" for template ${r.template_id}`);
    }
    const mapped = rows.map((r) => ({
      _id: r.template_id, templateId: r.template_id, organizationId: r.organization_id,
      branchId: r.branch_id || null, doctorId: r.doctor_id || null,
      type: r.type, name: r.name,
      data: r.data ? JSON.parse(r.data) : null,
      isGlobal: toBool(r.is_global),
      createdAt: toIso(r.created_at), updatedAt: toIso(r.updated_at),
    }));
    return { count: mapped.length, first: mapped[0] ? { type: mapped[0].type, name: mapped[0].name, hasData: !!mapped[0].data } : null };
  });

  // ── 2. templates — full round-trip (create → read → delete) ───────────────
  await check('templates.create/get/delete round-trip', async (p) => {
    const tid = uuidv4();
    const payload = { items: [{ name: 'Paracetamol', dosage: '500mg' }, { name: 'Azithromycin', dosage: '250mg' }] };
    await p.query(
      `INSERT INTO prescription_template (template_id, organization_id, branch_id, doctor_id, type, name, data, is_global)
       VALUES (?, 'org-001', 'branch-001', 'dev-doctor-001', 'medication', 'parity-test-medication', ?, 0)`,
      [tid, JSON.stringify(payload)],
    );
    const [[row]] = await p.query('SELECT * FROM prescription_template WHERE template_id = ?', [tid]);
    if (!row) throw new Error('insert succeeded but read returned nothing');
    const data = JSON.parse(row.data);
    if (!Array.isArray(data.items)) throw new Error('items round-trip broken');
    if (data.items.length !== 2)    throw new Error('items length mismatch');
    await p.query('DELETE FROM prescription_template WHERE template_id = ?', [tid]);
    return { templateId: tid, itemsRoundTripped: data.items.length };
  });

  // ── 3. queue.getQueueStats — GROUP BY status ─────────────────────────────
  await check('queue.getQueueStats (GROUP BY status)', async (p) => {
    const today = new Date().toISOString().slice(0, 10);
    const [rows] = await p.query(
      `SELECT status, COUNT(*) AS c FROM queue
       WHERE organization_id = 'org-001' AND branch_id = 'branch-001' AND queue_date = ?
         AND deleted_at IS NULL GROUP BY status`,
      [today],
    );
    const stats = { waiting: 0, ongoing: 0, completed: 0, cancelled: 0, total: 0 };
    for (const r of rows) {
      const k = String(r.status).toLowerCase();
      if (k in stats) stats[k] = Number(r.c);
      stats.total += Number(r.c);
    }
    for (const k of Object.keys(stats)) {
      if (typeof stats[k] !== 'number') throw new Error(`${k} not number`);
    }
    return stats;
  });

  // ── 4. queue.getQueue — list with services reconstruction ────────────────
  await check('queue.getQueue (services array reconstruction)', async (p) => {
    const [rows] = await p.query(
      `SELECT * FROM queue WHERE organization_id = 'org-001' AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 5`,
    );
    if (!rows.length) return { queue: [], note: 'no queue rows — empty result valid' };
    const ids = rows.map((r) => r.queue_id);
    const ph = ids.map(() => '?').join(',');
    const [svcRows] = await p.query(
      `SELECT * FROM queue_services WHERE queue_id IN (${ph})`, ids,
    );
    const svcMap = {};
    for (const s of svcRows) (svcMap[s.queue_id] ||= []).push({
      serviceId: s.service_id, name: s.name, price: toNum(s.price),
    });
    const mapped = rows.map((r) => ({
      _id: r.queue_id, queueId: r.queue_id,
      organizationId: r.organization_id, branchId: r.branch_id,
      patientId: r.patient_id, patientName: r.patient_name, uhid: r.uhid,
      tokenNumber: r.token_number, slot: r.slot, queueDate: r.queue_date,
      arrivalTime: toIso(r.arrival_time), status: r.status,
      paymentStatus: r.payment_status || null, paymentAmount: toNum(r.payment_amount),
      serviceAmount: toNum(r.service_amount), appointmentType: r.appointment_type,
      durationMinutes: Number(r.duration_minutes) || 15,
      invoiceId: r.invoice_id || null,
      services: svcMap[r.queue_id] || [],
      createdAt: toIso(r.created_at), updatedAt: toIso(r.updated_at),
    }));
    if (!Array.isArray(mapped[0].services)) throw new Error('services not array');
    if (typeof mapped[0].tokenNumber !== 'number' && mapped[0].tokenNumber !== null) throw new Error('tokenNumber wrong type');
    return { count: mapped.length, first: { queueId: mapped[0].queueId, token: mapped[0].tokenNumber, svcCount: mapped[0].services.length } };
  });

  // ── 5. appointments.getAppointments — list + services/serviceIds ─────────
  await check('appointments.getAppointments (services + serviceIds)', async (p) => {
    const [rows] = await p.query(
      `SELECT * FROM appointment WHERE organization_id = 'org-001' AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 5`,
    );
    if (!rows.length) return { appointments: [], note: 'no appointments — empty result valid' };
    const ids = rows.map((r) => r.appointment_id);
    const ph = ids.map(() => '?').join(',');
    const [[svcRowsRes], [sidRowsRes]] = await Promise.all([
      p.query(`SELECT * FROM appointment_services WHERE appointment_id IN (${ph})`, ids),
      p.query(`SELECT * FROM appointment_service_ids WHERE appointment_id IN (${ph})`, ids),
    ]);
    const svcMap = {};
    for (const s of svcRowsRes) (svcMap[s.appointment_id] ||= []).push({
      serviceId: s.service_id, name: s.name, price: toNum(s.price),
    });
    const sidMap = {};
    for (const s of sidRowsRes) (sidMap[s.appointment_id] ||= []).push(s.service_id);
    const mapped = rows.map((r) => ({
      _id: r.appointment_id, appointmentId: r.appointment_id,
      patientId: r.patient_id, doctorId: r.doctor_id,
      slotDate: r.slot_date, slotStartUTC: toIso(r.slot_start_utc),
      status: r.status, isFollowUp: toBool(r.is_follow_up),
      services: svcMap[r.appointment_id] || [],
      serviceIds: sidMap[r.appointment_id] || [],
    }));
    if (!Array.isArray(mapped[0].services))   throw new Error('services not array');
    if (!Array.isArray(mapped[0].serviceIds)) throw new Error('serviceIds not array');
    return { count: mapped.length, first: { apptId: mapped[0].appointmentId, svcCount: mapped[0].services.length, sidCount: mapped[0].serviceIds.length } };
  });

  // ── 6. prescriptions.getDropdownOptions — grouped shape ──────────────────
  await check('prescriptions.getDropdownOptions (grouped by section→key)', async (p) => {
    const [rows] = await p.query(
      `SELECT dropdown_option_id, section, option_key, option_value, translation_hi, translation_mr
       FROM dropdown_option WHERE is_active = 1 ORDER BY sort_order, id`,
    );
    const grouped = {};
    for (const r of rows) {
      if (!grouped[r.section]) grouped[r.section] = {};
      if (!grouped[r.section][r.option_key]) grouped[r.section][r.option_key] = [];
      grouped[r.section][r.option_key].push({
        dropdown_option_id: r.dropdown_option_id,
        option_value: r.option_value,
        option_key: r.option_key,
        translations: { hi: r.translation_hi || '', mr: r.translation_mr || '' },
      });
    }
    const sections = Object.keys(grouped);
    if (!sections.length) throw new Error('No dropdown sections found');
    const first = grouped[sections[0]];
    const firstKey = Object.keys(first)[0];
    const firstOpt = first[firstKey][0];
    if (!firstOpt.translations || typeof firstOpt.translations !== 'object') throw new Error('translations missing');
    return { sections, totalOptions: rows.length, sample: firstOpt };
  });

  // ── 7. prescriptions.savePrescription — write + read full round-trip ─────
  await check('prescriptions save→load round-trip (10 children)', async (p) => {
    const [[patRow]] = await p.query(
      "SELECT patient_id FROM patient WHERE organization_id='org-001' AND is_active=1 LIMIT 1"
    );
    if (!patRow) throw new Error('no patient in org-001');

    const rxId = uuidv4();
    const conn = await p.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `INSERT INTO prescription
         (prescription_id, organization_id, branch_id, patient_id, doctor_id,
          visit_date, follow_up_date, follow_up_notes, follow_up_notification,
          advice, surgical_notes, private_notes, language, is_edited)
         VALUES (?, 'org-001', 'branch-001', ?, 'dev-doctor-001',
                 NOW(), NOW(), 'parity follow-up notes', 1,
                 'drink water', 'no surgical notes', 'private', 'en', 0)`,
        [rxId, patRow.patient_id],
      );
      // Vitals
      await conn.query(
        `INSERT INTO prescription_vitals (prescription_id, vital_name, value_text, unit, is_locked)
         VALUES (?, 'bp', '120/80', 'mmHg', 1), (?, 'pulse', '72', 'bpm', 0)`,
        [rxId, rxId],
      );
      // Symptoms
      await conn.query(
        `INSERT INTO prescription_symptoms (prescription_id, name, severity, duration, sort_order)
         VALUES (?, 'Headache', 'Moderate', '2 days', 0)`,
        [rxId],
      );
      // Diagnoses
      await conn.query(
        `INSERT INTO prescription_diagnoses (prescription_id, icd_code, description, status, sort_order)
         VALUES (?, 'R51', 'Headache', 'Active', 0)`,
        [rxId],
      );
      // Medications
      await conn.query(
        `INSERT INTO prescription_medications (prescription_id, brand_name, generic_name, dosage, frequency, duration, sort_order)
         VALUES (?, 'Crocin', 'Paracetamol', '500mg', '1-0-1', '3 days', 0)`,
        [rxId],
      );
      // Section config
      await conn.query(
        `INSERT INTO prescription_section_config (prescription_id, section_name, sort_order, is_enabled, is_print_enabled)
         VALUES (?, 'vitals', 0, 1, 1), (?, 'symptoms', 1, 1, 1), (?, 'diagnosis', 2, 1, 0)`,
        [rxId, rxId, rxId],
      );
      // Custom sections
      const [csRes] = await conn.query(
        `INSERT INTO prescription_custom_sections (prescription_id, section_id, title, sort_order)
         VALUES (?, 'customA', 'Extra Notes', 0)`,
        [rxId],
      );
      await conn.query(
        `INSERT INTO prescription_custom_section_items (custom_section_id, item_key, item_value, sort_order)
         VALUES (?, 'flagA', 'valueA', 0), (?, 'flagB', 'valueB', 1)`,
        [csRes.insertId, csRes.insertId],
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    // Read back
    const [[row]]    = await p.query('SELECT * FROM prescription WHERE prescription_id = ?', [rxId]);
    const [vRows]    = await p.query('SELECT * FROM prescription_vitals WHERE prescription_id = ? ORDER BY id', [rxId]);
    const [symRows]  = await p.query('SELECT * FROM prescription_symptoms WHERE prescription_id = ? ORDER BY sort_order', [rxId]);
    const [dRows]    = await p.query('SELECT * FROM prescription_diagnoses WHERE prescription_id = ? ORDER BY sort_order', [rxId]);
    const [mRows]    = await p.query('SELECT * FROM prescription_medications WHERE prescription_id = ? ORDER BY sort_order', [rxId]);
    const [cfgRows]  = await p.query('SELECT * FROM prescription_section_config WHERE prescription_id = ? ORDER BY sort_order', [rxId]);
    const [csRows]   = await p.query('SELECT * FROM prescription_custom_sections WHERE prescription_id = ? ORDER BY sort_order', [rxId]);
    const [csItems]  = await p.query('SELECT * FROM prescription_custom_section_items WHERE custom_section_id = ? ORDER BY sort_order', [csRows[0]?.id]);

    // Cleanup — DELETE parent (CASCADE wipes children)
    await p.query('DELETE FROM prescription WHERE prescription_id = ?', [rxId]);

    if (!row) throw new Error('prescription parent not readable');
    if (vRows.length !== 2)    throw new Error('vitals count mismatch');
    if (symRows.length !== 1)  throw new Error('symptoms count mismatch');
    if (dRows.length !== 1)    throw new Error('diagnoses count mismatch');
    if (mRows.length !== 1)    throw new Error('medications count mismatch');
    if (cfgRows.length !== 3)  throw new Error('section_config count mismatch');
    if (csRows.length !== 1)   throw new Error('custom_sections count mismatch');
    if (csItems.length !== 2)  throw new Error('custom_section_items count mismatch');

    // Check vitals nested shape (locked row should have metadata)
    const bp = vRows.find((v) => v.vital_name === 'bp');
    if (!bp || bp.is_locked !== 1 || bp.unit !== 'mmHg') throw new Error('bp lock/unit metadata wrong');

    return {
      rxId,
      vitalsCount: vRows.length,
      symptomsCount: symRows.length,
      medicationsCount: mRows.length,
      customSectionsCount: csRows.length,
      customItemsCount: csItems.length,
      language: row.language,
      followUpNotification: toBool(row.follow_up_notification),
    };
  });

  // ── 8. prescriptions.getFrequentlySeen — count logic ─────────────────────
  await check('prescriptions.getFrequentlySeen (count aggregation)', async (p) => {
    const [rxRows] = await p.query(
      `SELECT prescription_id FROM prescription
       WHERE doctor_id = 'dev-doctor-001' AND deleted_at IS NULL
       ORDER BY visit_date DESC LIMIT 50`,
    );
    if (!rxRows.length) return { note: 'no prescriptions — empty result valid' };
    const ids = rxRows.map((r) => r.prescription_id);
    const ph = ids.map(() => '?').join(',');
    const [items] = await p.query(
      `SELECT name FROM prescription_symptoms WHERE prescription_id IN (${ph})`, ids,
    );
    const countMap = {};
    for (const r of items) { if (!r.name) continue; countMap[r.name] = (countMap[r.name] || 0) + 1; }
    const sorted = Object.entries(countMap).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return { uniqueSymptoms: Object.keys(countMap).length, topTen: sorted };
  });

  // ── 9. prescriptions.getConfiguration — 4-child-table reconstruction ─────
  await check('prescriptions.getConfiguration (4 child tables)', async (p) => {
    const [[cfgRow]] = await p.query(
      "SELECT * FROM prescription_config WHERE organization_id='org-001' AND branch_id='branch-001' AND doctor_id='dev-doctor-001' LIMIT 1"
    );
    if (!cfgRow) return { note: 'no config row — defaults would be returned' };
    const [orderRows]   = await p.query('SELECT section_name FROM prescription_config_section_order WHERE config_id = ? ORDER BY sort_order', [cfgRow.config_id]);
    const [enabledRows] = await p.query('SELECT section_name, is_enabled FROM prescription_config_enabled_sections WHERE config_id = ?', [cfgRow.config_id]);
    const [printRows]   = await p.query('SELECT section_name, is_enabled FROM prescription_config_print_enabled_sections WHERE config_id = ?', [cfgRow.config_id]);
    const [customRows]  = await p.query('SELECT * FROM prescription_config_custom_sections WHERE config_id = ? ORDER BY sort_order', [cfgRow.config_id]);
    const section_order = orderRows.map((r) => r.section_name);
    const enabled_sections = {}; for (const r of enabledRows) enabled_sections[r.section_name] = toBool(r.is_enabled);
    const print_enabled_sections = {}; for (const r of printRows) print_enabled_sections[r.section_name] = toBool(r.is_enabled);
    if (!Array.isArray(section_order)) throw new Error('section_order not array');
    if (typeof enabled_sections !== 'object') throw new Error('enabled_sections not object');
    return {
      configId: cfgRow.config_id,
      orderCount: section_order.length,
      enabledCount: Object.keys(enabled_sections).length,
      printEnabledCount: Object.keys(print_enabled_sections).length,
      customCount: customRows.length,
    };
  });

  // ── 10. analytics.getAnalyticsSummary — byMethod + daily trend ───────────
  await check('analytics.getAnalyticsSummary (revenue + daily trend)', async (p) => {
    const start = new Date(Date.now() - 90 * 86400000);
    const end = new Date();
    const [apptRows] = await p.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS d, COUNT(*) AS c
       FROM appointment WHERE organization_id = 'org-001' AND deleted_at IS NULL
         AND created_at >= ? AND created_at <= ? GROUP BY d ORDER BY d`,
      [start, end],
    );
    const [revRows] = await p.query(
      `SELECT method, SUM(amount) AS total, COUNT(*) AS count
       FROM payment WHERE collected_at >= ? AND collected_at <= ?
         AND invoice_id IN (SELECT invoice_id FROM invoice WHERE organization_id = 'org-001')
       GROUP BY method`,
      [start, end],
    );
    const byMethod = { cash: 0, card: 0, online: 0, upi: 0 };
    for (const r of revRows) {
      const k = String(r.method).toLowerCase();
      if (k in byMethod) byMethod[k] = Number(r.total) || 0;
    }
    const [[pendRow]] = await p.query(
      `SELECT COALESCE(SUM(balance_due), 0) AS pending FROM invoice
       WHERE organization_id = 'org-001' AND deleted_at IS NULL
         AND status IN ('Unpaid','Partial')
         AND created_at >= ? AND created_at <= ?`,
      [start, end],
    );
    if (typeof byMethod.cash !== 'number') throw new Error('byMethod.cash not number');
    if (typeof pendRow.pending !== 'number' && typeof pendRow.pending !== 'string') throw new Error('pending missing');
    return {
      dailyTrendDays: apptRows.length,
      byMethod,
      pending: Number(pendRow.pending) || 0,
    };
  });

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Step D parity checks: ${passCount} passed, ${failCount} failed`);
  if (failCount > 0) process.exitCode = 1;
  await pool.end();
}

run().catch((err) => { console.error('Fatal:', err); process.exit(1); });
