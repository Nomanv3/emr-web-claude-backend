import PrintSettings from '../models/PrintSettings.js';

export const getPrintSettings = async (req, res, next) => {
  try {
    const { organization_id, branch_id, organizationId, branchId } = req.query;
    const orgId = organization_id || organizationId;
    const brId = branch_id || branchId;

    const settings = await PrintSettings.findOne({
      organizationId: orgId,
      ...(brId && { branchId: brId }),
    });

    res.json({
      success: true,
      data: settings || { settings: {} },
    });
  } catch (error) {
    next(error);
  }
};

export const savePrintSettings = async (req, res, next) => {
  try {
    const { organizationId, branchId, settings } = req.body;

    let printSettings = await PrintSettings.findOne({
      organizationId,
      ...(branchId && { branchId }),
    });

    if (printSettings) {
      printSettings.settings = settings;
      await printSettings.save();
    } else {
      printSettings = new PrintSettings({ organizationId, branchId, settings });
      await printSettings.save();
    }

    res.json({
      success: true,
      data: printSettings,
      message: 'Print settings saved successfully',
    });
  } catch (error) {
    next(error);
  }
};
