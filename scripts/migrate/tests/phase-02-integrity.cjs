'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { pool, closeMysql } = require('../lib/mysql.cjs');

const QUERIES = [
  ['patient→org',       `SELECT COUNT(*) c FROM patient p LEFT JOIN organization o ON o.organization_id=p.organization_id WHERE o.id IS NULL`],
  ['patient→branch',    `SELECT COUNT(*) c FROM patient p LEFT JOIN branch b ON b.branch_id=p.branch_id WHERE b.id IS NULL`],
  ['user→org',          `SELECT COUNT(*) c FROM user u LEFT JOIN organization o ON o.organization_id=u.organization_id WHERE o.id IS NULL`],
  ['user→branch',       `SELECT COUNT(*) c FROM user u LEFT JOIN branch b ON b.branch_id=u.branch_id WHERE b.id IS NULL`],
  ['patient_tags→patient', `SELECT COUNT(*) c FROM patient_tags t LEFT JOIN patient p ON p.patient_id=t.patient_id WHERE p.id IS NULL`],
  ['med_history→patient', `SELECT COUNT(*) c FROM patient_medical_history h LEFT JOIN patient p ON p.patient_id=h.patient_id WHERE p.id IS NULL`],
  ['med_conditions→history', `SELECT COUNT(*) c FROM patient_medical_conditions m LEFT JOIN patient_medical_history h ON h.history_id=m.history_id WHERE h.id IS NULL`],
  ['allergies→history', `SELECT COUNT(*) c FROM patient_allergies a LEFT JOIN patient_medical_history h ON h.history_id=a.history_id WHERE h.id IS NULL`],
  ['surgical→history',  `SELECT COUNT(*) c FROM patient_surgical_history s LEFT JOIN patient_medical_history h ON h.history_id=s.history_id WHERE h.id IS NULL`],
  ['family→history',    `SELECT COUNT(*) c FROM patient_family_history f LEFT JOIN patient_medical_history h ON h.history_id=f.history_id WHERE h.id IS NULL`],
  ['rxconfig→org',      `SELECT COUNT(*) c FROM prescription_config r LEFT JOIN organization o ON o.organization_id=r.organization_id WHERE o.id IS NULL`],
  ['rxconfig→branch',   `SELECT COUNT(*) c FROM prescription_config r LEFT JOIN branch b ON b.branch_id=r.branch_id WHERE b.id IS NULL`],
  ['rxconfig→doctor',   `SELECT COUNT(*) c FROM prescription_config r LEFT JOIN user u ON u.user_id=r.doctor_id WHERE u.id IS NULL`],
  ['rxconfig_section_order→config', `SELECT COUNT(*) c FROM prescription_config_section_order s LEFT JOIN prescription_config r ON r.config_id=s.config_id WHERE r.id IS NULL`],
  ['rxtemplate→org',    `SELECT COUNT(*) c FROM prescription_template t LEFT JOIN organization o ON o.organization_id=t.organization_id WHERE o.id IS NULL`],
  ['printsettings→org', `SELECT COUNT(*) c FROM print_settings s LEFT JOIN organization o ON o.organization_id=s.organization_id WHERE o.id IS NULL`],
  ['printoptions→settings', `SELECT COUNT(*) c FROM print_settings_options o LEFT JOIN print_settings s ON s.settings_id=o.settings_id WHERE s.id IS NULL`],
];

(async () => {
  let allOk = true;
  for (const [label, sql] of QUERIES) {
    const [[{ c }]] = await pool.query(sql);
    const ok = Number(c) === 0;
    if (!ok) allOk = false;
    console.log(`${ok ? '✓' : '✗'} ${label}: ${c} orphans`);
  }
  await closeMysql();
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
