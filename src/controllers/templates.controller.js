import { query } from '../config/mysql.js';
import { mapTemplateRow } from '../db/mappers/template.mapper.js';
import { v4 as uuidv4 } from 'uuid';

const VALID_TYPES = new Set([
  'symptom', 'medication', 'labtest', 'labresult',
  'diagnosis', 'examination', 'procedure', 'global', 'main',
]);

function serializeData(data) {
  if (data == null) return null;
  if (typeof data === 'string') return data;
  try { return JSON.stringify(data); } catch { return null; }
}

async function fetchTemplateMysql(templateId) {
  const [[row]] = await query(
    'SELECT * FROM prescription_template WHERE template_id = ? LIMIT 1',
    [templateId]
  );
  return row ? mapTemplateRow(row) : null;
}

export const getTemplates = async (req, res, next) => {
  try {
    const { organization_id, branch_id, doctor_id, type, organizationId, branchId, doctorId } = req.query;
    const orgId = organization_id || organizationId;
    const brId = branch_id || branchId;
    const docId = doctor_id || doctorId;

    const where = [];
    const params = [];
    if (orgId) { where.push('organization_id = ?'); params.push(orgId); }
    if (brId)  { where.push('branch_id = ?');       params.push(brId); }
    if (docId) { where.push('doctor_id = ?');       params.push(docId); }
    if (type)  { where.push('type = ?');            params.push(type); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await query(
      `SELECT * FROM prescription_template ${whereSql} ORDER BY name ASC`,
      params
    );
    return res.json({ success: true, data: { templates: rows.map(mapTemplateRow) } });
  } catch (error) {
    next(error);
  }
};

export const createTemplate = async (req, res, next) => {
  try {
    const type = req.body.type;
    if (!VALID_TYPES.has(type)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: `Invalid template type: ${type}` },
      });
    }
    const templateId = uuidv4();
    await query(
      `INSERT INTO prescription_template
         (template_id, organization_id, branch_id, doctor_id, type, name, data, is_global)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        templateId,
        req.body.organizationId || req.body.organization_id,
        req.body.branchId || req.body.branch_id || null,
        req.body.doctorId || req.body.doctor_id || null,
        type,
        req.body.name,
        serializeData(req.body.data),
        req.body.isGlobal ? 1 : 0,
      ]
    );
    const created = await fetchTemplateMysql(templateId);
    return res.status(201).json({ success: true, data: created, message: 'Template created successfully' });
  } catch (error) {
    next(error);
  }
};

export const updateTemplate = async (req, res, next) => {
  try {
    const [[existing]] = await query(
      'SELECT template_id FROM prescription_template WHERE template_id = ? LIMIT 1',
      [req.params.templateId]
    );
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
      });
    }
    const b = req.body;
    const sets = [];
    const params = [];
    const colMap = {
      organizationId: 'organization_id', branchId: 'branch_id', doctorId: 'doctor_id',
      type: 'type', name: 'name',
    };
    for (const [k, col] of Object.entries(colMap)) {
      if (b[k] !== undefined) { sets.push(`${col} = ?`); params.push(b[k]); }
    }
    if (b.isGlobal !== undefined) { sets.push('is_global = ?'); params.push(b.isGlobal ? 1 : 0); }
    if (b.data !== undefined)     { sets.push('data = ?');      params.push(serializeData(b.data)); }

    if (sets.length) {
      await query(
        `UPDATE prescription_template SET ${sets.join(', ')} WHERE template_id = ?`,
        [...params, req.params.templateId]
      );
    }
    const updated = await fetchTemplateMysql(req.params.templateId);
    return res.json({ success: true, data: updated, message: 'Template updated successfully' });
  } catch (error) {
    next(error);
  }
};

export const deleteTemplate = async (req, res, next) => {
  try {
    const [result] = await query(
      'DELETE FROM prescription_template WHERE template_id = ?',
      [req.params.templateId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
      });
    }
    return res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getGlobalTemplates = async (req, res, next) => {
  try {
    const { organizationId, organization_id } = req.query;
    const orgId = organizationId || organization_id;

    const where = ['is_global = 1'];
    const params = [];
    if (orgId) { where.push('organization_id = ?'); params.push(orgId); }
    const [rows] = await query(
      `SELECT * FROM prescription_template WHERE ${where.join(' AND ')} ORDER BY name ASC`,
      params
    );
    return res.json({ success: true, data: { templates: rows.map(mapTemplateRow) } });
  } catch (error) {
    next(error);
  }
};

// ─── Main templates handler (full-prescription templates) ───

export const mainTemplateHandler = async (req, res, next) => {
  try {
    const { organization_id, branch_id, template_id } = req.query;

    if (template_id) {
      const [[row]] = await query(
        `SELECT * FROM prescription_template WHERE template_id = ? AND type = 'main' LIMIT 1`,
        [template_id]
      );
      if (!row) {
        return res.status(404).json({
          success: false,
          error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
        });
      }
      return res.json({ success: true, data: mapTemplateRow(row) });
    }
    const where = [`type = 'main'`];
    const params = [];
    if (organization_id) { where.push('organization_id = ?'); params.push(organization_id); }
    if (branch_id)       { where.push('branch_id = ?');       params.push(branch_id); }
    const [rows] = await query(
      `SELECT * FROM prescription_template WHERE ${where.join(' AND ')} ORDER BY name ASC`,
      params
    );
    return res.json({ success: true, data: rows.map(mapTemplateRow) });
  } catch (error) {
    next(error);
  }
};

// ─── Legacy template handlers (for frontend prescription-Templates routes) ───

export const templateGetHandler = async (req, res, next) => {
  try {
    const { organization_id, branch_id, template_id, type } = req.query;

    if (template_id && type) {
      const [[row]] = await query(
        'SELECT * FROM prescription_template WHERE template_id = ? AND type = ? LIMIT 1',
        [template_id, type]
      );
      if (!row) {
        return res.status(404).json({
          success: false,
          error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
        });
      }
      return res.json({ success: true, data: mapTemplateRow(row) });
    }
    const where = [];
    const params = [];
    if (organization_id) { where.push('organization_id = ?'); params.push(organization_id); }
    if (branch_id)       { where.push('branch_id = ?');       params.push(branch_id); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await query(
      `SELECT * FROM prescription_template ${whereSql} ORDER BY name ASC`,
      params
    );
    return res.json({ success: true, data: { templates: rows.map(mapTemplateRow) } });
  } catch (error) {
    next(error);
  }
};

export const templatePostHandler = async (req, res, next) => {
  try {
    const {
      organization_id, branch_id, doctor_id, name, type,
      items, created_by, updated_by,
      organizationId, branchId, doctorId,
    } = req.body;

    if (!VALID_TYPES.has(type)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: `Invalid template type: ${type}` },
      });
    }
    const templateId = uuidv4();
    const data = { items: items || [] };
    await query(
      `INSERT INTO prescription_template
         (template_id, organization_id, branch_id, doctor_id, type, name, data, is_global)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        templateId,
        organization_id || organizationId,
        branch_id || branchId || null,
        doctor_id || doctorId || null,
        type,
        name,
        JSON.stringify(data),
      ]
    );
    const created = await fetchTemplateMysql(templateId);
    return res.status(201).json({
      success: true,
      data: { template_id: templateId, ...created },
      message: 'Template created successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const templateEditHandler = async (req, res, next) => {
  try {
    const { template_id, templateId } = req.body;
    const tId = template_id || templateId;

    if (!tId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'template_id is required' },
      });
    }

    const [[existing]] = await query(
      'SELECT * FROM prescription_template WHERE template_id = ? LIMIT 1',
      [tId]
    );
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
      });
    }
    const b = req.body;
    const sets = [];
    const params = [];
    if (b.name !== undefined)    { sets.push('name = ?');           params.push(b.name); }
    if (b.type !== undefined) {
      if (!VALID_TYPES.has(b.type)) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: `Invalid template type: ${b.type}` },
        });
      }
      sets.push('type = ?'); params.push(b.type);
    }
    if (b.organization_id !== undefined || b.organizationId !== undefined) {
      sets.push('organization_id = ?'); params.push(b.organization_id || b.organizationId);
    }
    if (b.branch_id !== undefined || b.branchId !== undefined) {
      sets.push('branch_id = ?'); params.push(b.branch_id ?? b.branchId ?? null);
    }
    if (b.doctor_id !== undefined || b.doctorId !== undefined) {
      sets.push('doctor_id = ?'); params.push(b.doctor_id ?? b.doctorId ?? null);
    }
    if (b.isGlobal !== undefined) { sets.push('is_global = ?'); params.push(b.isGlobal ? 1 : 0); }
    if (b.items !== undefined) {
      sets.push('data = ?');
      params.push(JSON.stringify({ items: b.items }));
    } else if (b.data !== undefined) {
      sets.push('data = ?');
      params.push(serializeData(b.data));
    }

    if (sets.length) {
      await query(
        `UPDATE prescription_template SET ${sets.join(', ')} WHERE template_id = ?`,
        [...params, tId]
      );
    }
    const updated = await fetchTemplateMysql(tId);
    return res.json({ success: true, data: updated, message: 'Template updated successfully' });
  } catch (error) {
    next(error);
  }
};

export const templateDeleteHandler = async (req, res, next) => {
  try {
    const { template_id, template_type } = req.query;

    if (!template_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'template_id is required' },
      });
    }

    const where = ['template_id = ?'];
    const params = [template_id];
    if (template_type) { where.push('type = ?'); params.push(template_type); }
    const [result] = await query(
      `DELETE FROM prescription_template WHERE ${where.join(' AND ')}`,
      params
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
      });
    }
    return res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    next(error);
  }
};
