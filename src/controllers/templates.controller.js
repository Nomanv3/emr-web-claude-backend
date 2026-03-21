import PrescriptionTemplate from '../models/PrescriptionTemplate.js';

export const getTemplates = async (req, res, next) => {
  try {
    const { organization_id, branch_id, doctor_id, type, organizationId, branchId, doctorId } = req.query;
    const orgId = organization_id || organizationId;
    const brId = branch_id || branchId;
    const docId = doctor_id || doctorId;

    const filter = {};
    if (orgId) filter.organizationId = orgId;
    if (brId) filter.branchId = brId;
    if (docId) filter.doctorId = docId;
    if (type) filter.type = type;

    const templates = await PrescriptionTemplate.find(filter).sort({ name: 1 });

    res.json({ success: true, data: { templates } });
  } catch (error) {
    next(error);
  }
};

export const createTemplate = async (req, res, next) => {
  try {
    const template = new PrescriptionTemplate(req.body);
    await template.save();

    res.status(201).json({
      success: true,
      data: template,
      message: 'Template created successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const updateTemplate = async (req, res, next) => {
  try {
    const template = await PrescriptionTemplate.findOneAndUpdate(
      { templateId: req.params.templateId },
      { $set: req.body },
      { new: true }
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
      });
    }

    res.json({
      success: true,
      data: template,
      message: 'Template updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTemplate = async (req, res, next) => {
  try {
    const template = await PrescriptionTemplate.findOneAndDelete({
      templateId: req.params.templateId,
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
      });
    }

    res.json({
      success: true,
      message: 'Template deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getGlobalTemplates = async (req, res, next) => {
  try {
    const { organizationId, organization_id } = req.query;
    const orgId = organizationId || organization_id;

    const templates = await PrescriptionTemplate.find({
      ...(orgId && { organizationId: orgId }),
      isGlobal: true,
    }).sort({ name: 1 });

    res.json({ success: true, data: { templates } });
  } catch (error) {
    next(error);
  }
};

// ─── Legacy template handlers (for frontend prescription-Templates routes) ───

export const templateGetHandler = async (req, res, next) => {
  try {
    const { organization_id, branch_id, template_id, type } = req.query;

    // If template_id + type provided, return single template
    if (template_id && type) {
      const template = await PrescriptionTemplate.findOne({
        templateId: template_id,
        type,
      });
      if (!template) {
        return res.status(404).json({
          success: false,
          error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
        });
      }
      return res.json({ success: true, data: template });
    }

    // Otherwise return all templates for org/branch
    const filter = {};
    if (organization_id) filter.organizationId = organization_id;
    if (branch_id) filter.branchId = branch_id;

    const templates = await PrescriptionTemplate.find(filter).sort({ name: 1 });
    res.json({ success: true, data: { templates } });
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

    const template = new PrescriptionTemplate({
      organizationId: organization_id || organizationId,
      branchId: branch_id || branchId,
      doctorId: doctor_id || doctorId,
      name,
      type,
      data: { items: items || [] },
    });
    await template.save();

    res.status(201).json({
      success: true,
      data: { template_id: template.templateId, ...template.toObject() },
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

    const updateData = { ...req.body };
    delete updateData.template_id;
    delete updateData.templateId;
    if (updateData.items) {
      updateData.data = { items: updateData.items };
      delete updateData.items;
    }
    if (updateData.organization_id) {
      updateData.organizationId = updateData.organization_id;
      delete updateData.organization_id;
    }
    if (updateData.branch_id) {
      updateData.branchId = updateData.branch_id;
      delete updateData.branch_id;
    }
    if (updateData.doctor_id) {
      updateData.doctorId = updateData.doctor_id;
      delete updateData.doctor_id;
    }

    const template = await PrescriptionTemplate.findOneAndUpdate(
      { templateId: tId },
      { $set: updateData },
      { new: true }
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
      });
    }

    res.json({ success: true, data: template, message: 'Template updated successfully' });
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

    const filter = { templateId: template_id };
    if (template_type) filter.type = template_type;

    const template = await PrescriptionTemplate.findOneAndDelete(filter);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
      });
    }

    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    next(error);
  }
};
