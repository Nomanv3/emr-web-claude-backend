'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { pool, closeMysql } = require('../lib/mysql.cjs');

(async () => {
  const orphanChecks = [
    ['prescription → organization',       'SELECT COUNT(*) c FROM prescription p LEFT JOIN organization o ON o.organization_id=p.organization_id WHERE o.id IS NULL'],
    ['prescription → branch',             'SELECT COUNT(*) c FROM prescription p LEFT JOIN branch b ON b.branch_id=p.branch_id WHERE b.id IS NULL'],
    ['prescription → patient',            'SELECT COUNT(*) c FROM prescription p LEFT JOIN patient pa ON pa.patient_id=p.patient_id WHERE pa.id IS NULL'],
    ['prescription → user(doctor)',       'SELECT COUNT(*) c FROM prescription p LEFT JOIN user u ON u.user_id=p.doctor_id WHERE u.id IS NULL'],
    ['prescription.appointment → appt',   'SELECT COUNT(*) c FROM prescription p LEFT JOIN appointment a ON a.appointment_id=p.appointment_id WHERE p.appointment_id IS NOT NULL AND a.id IS NULL'],
    ['prescription.queue → queue',        'SELECT COUNT(*) c FROM prescription p LEFT JOIN queue q ON q.queue_id=p.queue_id WHERE p.queue_id IS NOT NULL AND q.id IS NULL'],
    ['rx_vitals → prescription',          'SELECT COUNT(*) c FROM prescription_vitals v LEFT JOIN prescription p ON p.prescription_id=v.prescription_id WHERE p.id IS NULL'],
    ['rx_symptoms → prescription',        'SELECT COUNT(*) c FROM prescription_symptoms s LEFT JOIN prescription p ON p.prescription_id=s.prescription_id WHERE p.id IS NULL'],
    ['rx_diagnoses → prescription',       'SELECT COUNT(*) c FROM prescription_diagnoses d LEFT JOIN prescription p ON p.prescription_id=d.prescription_id WHERE p.id IS NULL'],
    ['rx_medications → prescription',     'SELECT COUNT(*) c FROM prescription_medications m LEFT JOIN prescription p ON p.prescription_id=m.prescription_id WHERE p.id IS NULL'],
    ['rx_examination → prescription',     'SELECT COUNT(*) c FROM prescription_examination_findings e LEFT JOIN prescription p ON p.prescription_id=e.prescription_id WHERE p.id IS NULL'],
    ['rx_lab_invest → prescription',      'SELECT COUNT(*) c FROM prescription_lab_investigations l LEFT JOIN prescription p ON p.prescription_id=l.prescription_id WHERE p.id IS NULL'],
    ['appointment → patient',             'SELECT COUNT(*) c FROM appointment a LEFT JOIN patient p ON p.patient_id=a.patient_id WHERE p.id IS NULL'],
    ['appointment → user(doctor)',        'SELECT COUNT(*) c FROM appointment a LEFT JOIN user u ON u.user_id=a.doctor_id WHERE u.id IS NULL'],
    ['queue → patient',                   'SELECT COUNT(*) c FROM queue q LEFT JOIN patient p ON p.patient_id=q.patient_id WHERE p.id IS NULL'],
    ['queue.appointment → appt',          'SELECT COUNT(*) c FROM queue q LEFT JOIN appointment a ON a.appointment_id=q.appointment_id WHERE q.appointment_id IS NOT NULL AND a.id IS NULL'],
    ['invoice → patient',                 'SELECT COUNT(*) c FROM invoice i LEFT JOIN patient p ON p.patient_id=i.patient_id WHERE p.id IS NULL'],
    ['invoice_line_items → invoice',      'SELECT COUNT(*) c FROM invoice_line_items l LEFT JOIN invoice i ON i.invoice_id=l.invoice_id WHERE i.id IS NULL'],
    ['payment → invoice',                 'SELECT COUNT(*) c FROM payment p LEFT JOIN invoice i ON i.invoice_id=p.invoice_id WHERE i.id IS NULL'],
    ['receipt → payment',                 'SELECT COUNT(*) c FROM receipt r LEFT JOIN payment p ON p.payment_id=r.payment_id WHERE p.id IS NULL'],
    ['payment.receipt_id back-filled',    'SELECT (SELECT COUNT(*) FROM receipt) - (SELECT COUNT(*) FROM payment WHERE receipt_id IS NOT NULL) AS c'],
  ];
  let bad = 0;
  for (const [label, sql] of orphanChecks) {
    const [[{ c }]] = await pool.query(sql);
    if (c > 0) bad++;
    console.log(`${c === 0 ? '✓' : '✗'} ${label}: ${c}`);
  }

  console.log('\n-- MySQL row counts (Phase 3 tables) --');
  const tables = [
    'appointment','appointment_services','appointment_service_ids',
    'invoice','invoice_line_items',
    'queue','queue_services',
    'payment','receipt',
    'prescription','prescription_vitals','prescription_section_config',
    'prescription_symptoms','prescription_diagnoses','prescription_examination_findings',
    'prescription_medications','prescription_lab_investigations','prescription_lab_results',
    'prescription_procedures','prescription_custom_sections','prescription_custom_section_items',
  ];
  for (const t of tables) {
    const [[{ c }]] = await pool.query(`SELECT COUNT(*) c FROM \`${t}\``);
    console.log(`  ${t.padEnd(40)} ${c}`);
  }

  await closeMysql();
  process.exit(bad === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
