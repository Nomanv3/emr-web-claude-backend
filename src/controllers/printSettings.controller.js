import { query, withTransaction } from '../config/mysql.js';
import { v4 as uuidv4 } from 'uuid';
import { mapPrintSettingsRow, flattenSettings } from '../db/mappers/printSettings.mapper.js';

export const getPrintSettings = async (req, res, next) => {
  try {
    const { organization_id, branch_id, organizationId, branchId } = req.query;
    const orgId = organization_id || organizationId;
    const brId = branch_id || branchId;

    let sql = 'SELECT * FROM print_settings WHERE organization_id = ?';
    const params = [orgId];
    if (brId) {
      sql += ' AND branch_id = ?';
      params.push(brId);
    }
    sql += ' LIMIT 1';

    const [rows] = await query(sql, params);

    if (!rows.length) {
      return res.json({ success: true, data: { settings: {} } });
    }

    const parent = rows[0];
    const [optRows] = await query(
      'SELECT option_key, option_value FROM print_settings_options WHERE settings_id = ?',
      [parent.settings_id]
    );

    return res.json({ success: true, data: mapPrintSettingsRow(parent, optRows) });
  } catch (error) {
    next(error);
  }
};

export const savePrintSettings = async (req, res, next) => {
  try {
    const { organizationId, branchId, settings } = req.body;

    await withTransaction(async (conn) => {
      let sql = 'SELECT settings_id FROM print_settings WHERE organization_id = ?';
      const params = [organizationId];
      if (branchId) {
        sql += ' AND branch_id = ?';
        params.push(branchId);
      }
      sql += ' LIMIT 1';

      const [[existing]] = await conn.query(sql, params);
      let settingsId;

      if (existing) {
        settingsId = existing.settings_id;
        await conn.query(
          'DELETE FROM print_settings_options WHERE settings_id = ?',
          [settingsId]
        );
      } else {
        settingsId = uuidv4();
        await conn.execute(
          'INSERT INTO print_settings (settings_id, organization_id, branch_id) VALUES (?, ?, ?)',
          [settingsId, organizationId, branchId || null]
        );
      }

      const flatEntries = flattenSettings(settings || {});
      for (const { key, value } of flatEntries) {
        await conn.execute(
          'INSERT INTO print_settings_options (settings_id, option_key, option_value) VALUES (?, ?, ?)',
          [settingsId, key, value]
        );
      }

      return settingsId;
    });

    const [pRows] = await query(
      'SELECT * FROM print_settings WHERE organization_id = ?' +
      (branchId ? ' AND branch_id = ?' : '') + ' LIMIT 1',
      branchId ? [organizationId, branchId] : [organizationId]
    );
    const parent = pRows[0];
    const [optRows] = await query(
      'SELECT option_key, option_value FROM print_settings_options WHERE settings_id = ?',
      [parent.settings_id]
    );

    return res.json({
      success: true,
      data: mapPrintSettingsRow(parent, optRows),
      message: 'Print settings saved successfully',
    });
  } catch (error) {
    next(error);
  }
};
