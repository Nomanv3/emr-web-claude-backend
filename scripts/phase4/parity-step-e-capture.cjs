// parity-step-e-capture.cjs — Phase 4 Step E helper.
// Hits every read-only /api endpoint on localhost:5000, normalizes volatile fields
// (IDs, timestamps, pagination totals we care about are preserved), and writes
// each response to an output dir. Run once per mode then diff -r.
//
// Usage:
//   node scripts/phase4/parity-step-e-capture.cjs --out baseline-mongo
//   node scripts/phase4/parity-step-e-capture.cjs --out baseline-mysql

const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const OUT_DIR = args.out ? path.resolve(__dirname, args.out) : path.resolve(__dirname, 'baseline-capture');
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = 'http://localhost:5000';
const CREDS = { username: 'dev-doctor', password: 'password123' };

async function post(pathUrl, body, token) {
  const r = await fetch(BASE + pathUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  try { return { status: r.status, body: JSON.parse(text) }; }
  catch { return { status: r.status, body: text }; }
}
async function get(pathUrl, token) {
  const r = await fetch(BASE + pathUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await r.text();
  try { return { status: r.status, body: JSON.parse(text) }; }
  catch { return { status: r.status, body: text }; }
}

// Normalize: strip fields that naturally differ between runs or between modes
// (e.g., JWT tokens, createdAt/updatedAt microsecond-level differences,
// Mongo _id vs SQL PK). Keep payload keys + types + counts intact.
const VOLATILE_KEYS = new Set([
  'token', 'refreshToken', 'expiresIn', 'iat', 'exp',
  '_id', '__v',
  'createdAt', 'updatedAt', 'timestamp', 'date',
  'lastLogin', 'generatedAt',
]);

function scrub(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(scrub);
  const out = {};
  for (const k of Object.keys(v).sort()) {
    if (VOLATILE_KEYS.has(k)) { out[k] = '<scrubbed>'; continue; }
    out[k] = scrub(v[k]);
  }
  return out;
}

function sortArraysDeep(v, keyPriority = ['patientId', 'appointmentId', 'queueId', 'invoiceId', 'paymentId', 'prescriptionId', 'templateId', 'serviceId', 'uhid', 'username', 'name']) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const arr = v.map((x) => sortArraysDeep(x, keyPriority));
    if (arr.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x))) {
      const keyFn = (obj) => {
        for (const k of keyPriority) if (obj[k] != null) return String(obj[k]);
        return JSON.stringify(obj);
      };
      arr.sort((a, b) => keyFn(a).localeCompare(keyFn(b)));
    }
    return arr;
  }
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = sortArraysDeep(v[k], keyPriority);
  return out;
}

function writeResp(name, resp) {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const normalized = {
    status: resp.status,
    body: sortArraysDeep(scrub(resp.body)),
  };
  fs.writeFileSync(
    path.join(OUT_DIR, safe + '.json'),
    JSON.stringify(normalized, null, 2) + '\n',
  );
}

async function waitHealth(tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

(async () => {
  console.log(`[capture] out dir: ${OUT_DIR}`);
  const up = await waitHealth();
  if (!up) { console.error('[capture] backend not responding on :5000'); process.exit(1); }

  // 1. Login
  const login = await post('/api/auth/login', CREDS);
  writeResp('01_auth_login', login);
  if (login.status !== 200) { console.error('login failed', login); process.exit(2); }
  const token = login.body?.data?.token;
  console.log(`[capture] got token (len ${token?.length})`);

  // 2. Health
  writeResp('02_health', await get('/api/health'));

  // 3. Masters — the dropdowns & searches
  writeResp('10_masters_symptoms', await get('/api/masters/symptoms', token));
  writeResp('11_masters_diagnoses', await get('/api/masters/diagnoses', token));
  writeResp('12_masters_medications', await get('/api/masters/medications', token));
  writeResp('13_masters_labTests', await get('/api/masters/labTests', token));
  writeResp('14_masters_examinationFindings', await get('/api/masters/examinationFindings', token));
  writeResp('15_masters_procedures', await get('/api/masters/procedures', token));
  writeResp('16_masters_services', await get('/api/masters/services', token));
  writeResp('17_masters_salutations', await get('/api/masters/salutations', token));
  writeResp('18_masters_symptoms_search', await get('/api/masters/symptoms?search=fever', token));
  writeResp('19_masters_medications_search', await get('/api/masters/medications?search=para', token));

  // 4. Patients
  writeResp('20_patients_list', await get('/api/patients?page=1&limit=10', token));
  writeResp('21_patients_search', await get('/api/patients/search?q=a', token));

  // Pull first patient id from list to drive per-patient calls
  const plist = JSON.parse(fs.readFileSync(path.join(OUT_DIR, '20_patients_list.json'), 'utf8'));
  const firstPid = plist.body?.data?.patients?.[0]?.patientId;
  if (firstPid) {
    writeResp('22_patients_by_id', await get(`/api/patients/${firstPid}`, token));
    writeResp('23_patientHistory', await get(`/api/patientDetail-history?patientId=${firstPid}`, token));
    writeResp('24_patient_prescriptions', await get(`/api/prescriptions?patientId=${firstPid}`, token));
    writeResp('25_patient_appointments', await get(`/api/appointments?patientId=${firstPid}`, token));
    writeResp('26_patient_invoices', await get(`/api/invoices?patientId=${firstPid}`, token));
  }

  // 5. Queue / appointments / calendar
  writeResp('30_queue_list', await get('/api/queue', token));
  writeResp('31_queue_stats', await get('/api/queue/stats', token));
  writeResp('32_appointments_list', await get('/api/appointments?page=1&limit=20', token));
  writeResp('33_appointments_slots', await get('/api/appointments/slots?date=2026-04-19', token));

  // 6. Prescriptions dropdowns + config + templates
  writeResp('40_prescription_dropdownOptions', await get('/api/prescriptions/dropdown-options', token));
  writeResp('41_prescription_config', await get('/api/prescriptions/configuration', token));
  writeResp('42_prescription_vitalUnits', await get('/api/prescriptions/vital-units', token));
  writeResp('43_prescription_frequentlyUsed', await get('/api/prescriptions/frequently-used?section=symptoms', token));
  writeResp('44_templates_list', await get('/api/templates', token));
  writeResp('45_prescriptionTemplates', await get('/api/prescription-templates', token));
  writeResp('46_printSettings', await get('/api/print-settings', token));

  // 7. Invoices / payments
  writeResp('50_invoices_list', await get('/api/invoices?page=1&limit=20', token));
  writeResp('51_payments_list', await get('/api/payments?page=1&limit=20', token));
  writeResp('52_payments_stats', await get('/api/payments/stats', token));

  // 8. Analytics — the heaviest SQL path
  const from = '2026-01-01';
  const to = '2026-12-31';
  writeResp('60_analytics_summary', await get(`/api/analytics/summary?from=${from}&to=${to}`, token));
  writeResp('61_analytics_appointments', await get(`/api/analytics/appointments?from=${from}&to=${to}`, token));
  writeResp('62_analytics_patients', await get(`/api/analytics/patients?from=${from}&to=${to}`, token));
  writeResp('63_analytics_revenue', await get(`/api/analytics/revenue?from=${from}&to=${to}`, token));
  writeResp('64_analytics_services', await get(`/api/analytics/services?from=${from}&to=${to}`, token));

  console.log(`[capture] done → ${OUT_DIR}`);
})();
