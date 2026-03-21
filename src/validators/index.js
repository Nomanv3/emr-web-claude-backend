import { query, body, param } from 'express-validator';

// --- Shared helpers ---
const isOptionalUUID = (field, location = 'query') => {
  const fn = location === 'query' ? query : location === 'body' ? body : param;
  return fn(field).optional().isString().withMessage(`${field} must be a string`);
};

const isRequiredString = (field, msg) =>
  body(field).notEmpty().withMessage(msg || `${field} is required`).isString();

const isOptionalISO = (field) =>
  query(field).optional().isISO8601().withMessage(`${field} must be a valid ISO8601 date`);

// --- Patient validators ---
export const validateCreatePatient = [
  body('organizationId').optional().isString(),
  body('branchId').optional().isString(),
  isRequiredString('name', 'Patient name is required'),
  body('gender').notEmpty().withMessage('Gender is required').isIn(['M', 'F', 'Other']).withMessage('Gender must be M, F, or Other'),
  isRequiredString('phone', 'Phone is required'),
];

export const validateUpdatePatient = [
  param('patientId').notEmpty().withMessage('patientId param is required'),
  body('name').optional().isString(),
  body('gender').optional().isIn(['M', 'F', 'Other']).withMessage('Gender must be M, F, or Other'),
];

// --- Appointment validators ---
export const validateCreateAppointment = [
  body('organizationId').optional().isString(),
  body('branchId').optional().isString(),
  isRequiredString('patientId', 'patientId is required'),
  body('doctorId').optional().isString(),
  isRequiredString('slotDate', 'slotDate is required'),
  isRequiredString('slot', 'slot is required'),
];

export const validateUpdateAppointment = [
  param('appointmentId').notEmpty().withMessage('appointmentId param is required'),
  body('status').optional().isIn(['Booked', 'Follow Up', 'Ongoing', 'Completed', 'Cancelled']).withMessage('Invalid status'),
];

// --- Prescription validators ---
export const validateSavePrescription = [
  body('organizationId').optional().isString(),
  body('organization_id').optional().isString(),
  body('patientId').optional().isString(),
  body('patient_id').optional().isString(),
  body('doctorId').optional().isString(),
  body('doctor_id').optional().isString(),
  body().custom((value) => {
    const orgId = value.organizationId || value.organization_id;
    const patId = value.patientId || value.patient_id;
    const docId = value.doctorId || value.doctor_id;
    if (!orgId) throw new Error('organizationId or organization_id is required');
    if (!patId) throw new Error('patientId or patient_id is required');
    if (!docId) throw new Error('doctorId or doctor_id is required');
    return true;
  }),
];

export const validateUpdatePrescription = [
  body().custom((value) => {
    const id = value.prescriptionId || value.prescription_id;
    if (!id) throw new Error('prescriptionId or prescription_id is required');
    return true;
  }),
];

export const validateGetFullPrescription = [
  query().custom((value) => {
    const id = value.prescriptionId || value.prescription_id;
    if (!id) throw new Error('prescriptionId or prescription_id query param is required');
    return true;
  }),
];

// --- Queue validators ---
export const validateGetQueue = [
  query('organizationId').notEmpty().withMessage('organizationId is required'),
  query('branchId').notEmpty().withMessage('branchId is required'),
  query('date').notEmpty().withMessage('date is required')
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be YYYY-MM-DD format'),
];

export const validateAddToQueue = [
  isRequiredString('organizationId', 'organizationId is required'),
  isRequiredString('branchId', 'branchId is required'),
  isRequiredString('patientId', 'patientId is required'),
  isRequiredString('queueDate', 'queueDate is required'),
];

export const validateUpdateQueueEntry = [
  param('queueId').notEmpty().withMessage('queueId param is required'),
  body('status').optional().isIn(['Waiting', 'Ongoing', 'Completed', 'Cancelled']).withMessage('Invalid queue status'),
];

export const validateQueueStats = [
  query('organizationId').notEmpty().withMessage('organizationId is required'),
  query('branchId').notEmpty().withMessage('branchId is required'),
  query('date').notEmpty().withMessage('date is required')
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be YYYY-MM-DD format'),
];

// --- Payment validators ---
export const validateRecordPayment = [
  isRequiredString('invoiceId', 'invoiceId is required'),
  body('amount').notEmpty().withMessage('amount is required')
    .isFloat({ gt: 0 }).withMessage('amount must be greater than 0'),
  body('method').notEmpty().withMessage('method is required')
    .isIn(['Cash', 'Card', 'Online', 'UPI']).withMessage('method must be Cash, Card, Online, or UPI'),
];

// --- Invoice validators ---
export const validateCreateInvoice = [
  isRequiredString('organizationId', 'organizationId is required'),
  isRequiredString('patientId', 'patientId is required'),
  body('lineItems').isArray({ min: 1 }).withMessage('At least one line item is required'),
];

export const validateUpdateInvoice = [
  param('invoiceId').notEmpty().withMessage('invoiceId param is required'),
];

// --- Patient History validators ---
export const validateCreatePatientHistory = [
  isRequiredString('patientId', 'patientId is required'),
];

export const validateUpdatePatientHistory = [
  param('patientId').notEmpty().withMessage('patientId param is required'),
];

// --- Analytics validators ---
export const validateAnalyticsSummary = [
  isOptionalISO('startDate'),
  isOptionalISO('endDate'),
  isOptionalUUID('organizationId'),
  isOptionalUUID('branchId'),
];

// --- Template validators ---
export const validateCreateTemplate = [
  isRequiredString('name', 'Template name is required'),
  isRequiredString('type', 'Template type is required'),
];

export const validateUpdateTemplate = [
  param('templateId').notEmpty().withMessage('templateId param is required'),
];
