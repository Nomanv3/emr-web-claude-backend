'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { getDb, closeMongo }        = require('../lib/mongo.cjs');
const { pool, upsert, closeMysql } = require('../lib/mysql.cjs');
const { recordTable }              = require('../lib/state.cjs');
const { toTsStr, countMysqlMatched } = require('../lib/util.cjs');

async function countChildRows(table, col, parentIds) {
  if (!parentIds || parentIds.length === 0) return 0;
  const ph = parentIds.map(() => '?').join(', ');
  const [[{ c }]] = await pool.query(
    `SELECT COUNT(*) c FROM \`${table}\` WHERE \`${col}\` IN (${ph})`,
    parentIds
  );
  return Number(c);
}

(async () => {
  const db   = await getDb();
  const docs  = await db.collection('prescriptionconfigs').find({}).toArray();
  console.log(`[prescription_config] Mongo docs found: ${docs.length}`);

  let totalSectionOrder = 0;
  let totalEnabled = 0;
  let totalPrintEnabled = 0;
  let totalCustom = 0;

  for (const d of docs) {
    const configId = d.configId;

    await upsert('prescription_config', {
      config_id:       configId,
      organization_id: d.organizationId,
      branch_id:       d.branchId,
      doctor_id:       d.doctorId,
      created_at:      toTsStr(d.createdAt),
      updated_at:      toTsStr(d.updatedAt),
    }, 'config_id');

    // Child: section_order (array of strings → rows with sort_order = index)
    const sectionOrder = Array.isArray(d.section_order) ? d.section_order : [];
    await pool.execute('DELETE FROM `prescription_config_section_order` WHERE `config_id` = ?', [configId]);
    for (let i = 0; i < sectionOrder.length; i++) {
      const name = sectionOrder[i];
      if (!name) continue;
      await pool.execute(
        'INSERT INTO `prescription_config_section_order` (`config_id`, `section_name`, `sort_order`) VALUES (?, ?, ?)',
        [configId, String(name), i]
      );
      totalSectionOrder++;
    }

    // Child: enabled_sections (Mixed object → rows)
    const enabled = (d.enabled_sections && typeof d.enabled_sections === 'object') ? d.enabled_sections : {};
    await pool.execute('DELETE FROM `prescription_config_enabled_sections` WHERE `config_id` = ?', [configId]);
    for (const [k, v] of Object.entries(enabled)) {
      await pool.execute(
        'INSERT INTO `prescription_config_enabled_sections` (`config_id`, `section_name`, `is_enabled`) VALUES (?, ?, ?)',
        [configId, String(k), v ? 1 : 0]
      );
      totalEnabled++;
    }

    // Child: print_enabled_sections (Mixed object → rows)
    const printEnabled = (d.print_enabled_sections && typeof d.print_enabled_sections === 'object') ? d.print_enabled_sections : {};
    await pool.execute('DELETE FROM `prescription_config_print_enabled_sections` WHERE `config_id` = ?', [configId]);
    for (const [k, v] of Object.entries(printEnabled)) {
      await pool.execute(
        'INSERT INTO `prescription_config_print_enabled_sections` (`config_id`, `section_name`, `is_enabled`) VALUES (?, ?, ?)',
        [configId, String(k), v ? 1 : 0]
      );
      totalPrintEnabled++;
    }

    // Child: custom_sections (array of Mixed)
    const customSections = Array.isArray(d.custom_sections) ? d.custom_sections : [];
    await pool.execute('DELETE FROM `prescription_config_custom_sections` WHERE `config_id` = ?', [configId]);
    for (let i = 0; i < customSections.length; i++) {
      const c = customSections[i];
      if (!c || typeof c !== 'object') continue;
      const sectionKey = c.section_key || c.sectionKey || c.key || c.id || `custom_${i}`;
      const title = c.title || c.name || null;
      await pool.execute(
        'INSERT INTO `prescription_config_custom_sections` (`config_id`, `section_key`, `title`, `sort_order`, `definition`) VALUES (?, ?, ?, ?, ?)',
        [configId, String(sectionKey), title, i, JSON.stringify(c)]
      );
      totalCustom++;
    }
  }

  // Parent count
  const mongoCount = docs.length;
  const ids = docs.map(d => d.configId);
  const mysqlCount = await countMysqlMatched(pool, 'prescription_config', 'config_id', ids);
  const ok = mongoCount === mysqlCount;
  await recordTable('prescription_config', { mongoCount, mysqlCount, ok, lastRun: new Date().toISOString() });
  console.log(`[prescription_config] mongo=${mongoCount} mysql=${mysqlCount} ok=${ok}`);

  // Child counts
  const mysqlSectionOrder = await countChildRows('prescription_config_section_order', 'config_id', ids);
  const mysqlEnabled      = await countChildRows('prescription_config_enabled_sections', 'config_id', ids);
  const mysqlPrintEnabled = await countChildRows('prescription_config_print_enabled_sections', 'config_id', ids);
  const mysqlCustom       = await countChildRows('prescription_config_custom_sections', 'config_id', ids);

  const now = new Date().toISOString();
  await recordTable('prescription_config_section_order',        { mongoCount: totalSectionOrder, mysqlCount: mysqlSectionOrder, ok: totalSectionOrder === mysqlSectionOrder, lastRun: now });
  await recordTable('prescription_config_enabled_sections',     { mongoCount: totalEnabled,      mysqlCount: mysqlEnabled,      ok: totalEnabled      === mysqlEnabled,      lastRun: now });
  await recordTable('prescription_config_print_enabled_sections',{mongoCount: totalPrintEnabled, mysqlCount: mysqlPrintEnabled, ok: totalPrintEnabled === mysqlPrintEnabled, lastRun: now });
  await recordTable('prescription_config_custom_sections',      { mongoCount: totalCustom,       mysqlCount: mysqlCustom,       ok: totalCustom       === mysqlCustom,       lastRun: now });

  console.log(`[prescription_config_section_order]         mongo=${totalSectionOrder} mysql=${mysqlSectionOrder} ok=${totalSectionOrder === mysqlSectionOrder}`);
  console.log(`[prescription_config_enabled_sections]      mongo=${totalEnabled}      mysql=${mysqlEnabled}      ok=${totalEnabled      === mysqlEnabled}`);
  console.log(`[prescription_config_print_enabled_sections]mongo=${totalPrintEnabled} mysql=${mysqlPrintEnabled} ok=${totalPrintEnabled === mysqlPrintEnabled}`);
  console.log(`[prescription_config_custom_sections]       mongo=${totalCustom}       mysql=${mysqlCustom}       ok=${totalCustom       === mysqlCustom}`);

  const allOk = ok
    && totalSectionOrder === mysqlSectionOrder
    && totalEnabled      === mysqlEnabled
    && totalPrintEnabled === mysqlPrintEnabled
    && totalCustom       === mysqlCustom;

  await closeMongo();
  await closeMysql();
  process.exit(allOk ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
