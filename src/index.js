import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';

dotenv.config();

import connectDB from './config/db.js';
import config from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';

// Route imports
import authRoutes from './routes/auth.routes.js';
import patientsRoutes from './routes/patients.routes.js';
import queueRoutes from './routes/queue.routes.js';
import appointmentsRoutes from './routes/appointments.routes.js';
import prescriptionsRoutes from './routes/prescriptions.routes.js';
import patientHistoryRoutes from './routes/patientHistory.routes.js';
import invoicesRoutes from './routes/invoices.routes.js';
import paymentsRoutes from './routes/payments.routes.js';
import printSettingsRoutes from './routes/printSettings.routes.js';
import templatesRoutes from './routes/templates.routes.js';
import mastersRoutes from './routes/masters.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import scheduleRoutes from './routes/schedule.routes.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: config.nodeEnv === 'development'
    ? (origin, callback) => callback(null, true)
    : config.corsOrigin.split(',').map(o => o.trim()),
  credentials: true,
}));
app.use(morgan('dev'));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'EMR Backend is running', timestamp: new Date().toISOString() });
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/prescriptions', prescriptionsRoutes);
app.use('/api/patient-history', patientHistoryRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/print-settings', printSettingsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/prescription-Templates', templatesRoutes);
app.use('/api/masters', mastersRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/schedule', scheduleRoutes);

// Legacy route aliases (match existing frontend API calls)
app.post('/api/savePrescription', (req, res, next) => {
  req.url = '/api/prescriptions/save';
  app.handle(req, res, next);
});
app.put('/api/updatePrescription', (req, res, next) => {
  req.url = '/api/prescriptions/update';
  app.handle(req, res, next);
});
app.get('/api/get-fullprescription', (req, res, next) => {
  req.url = '/api/prescriptions/full';
  app.handle(req, res, next);
});
app.post('/api/get-fullprescription', (req, res, next) => {
  req.url = '/api/prescriptions/save';
  app.handle(req, res, next);
});
app.put('/api/get-fullprescription', (req, res, next) => {
  req.url = '/api/prescriptions/update';
  app.handle(req, res, next);
});
app.get('/api/patientDetail-history', (req, res, next) => {
  req.url = '/api/prescriptions/patient-detail-history';
  app.handle(req, res, next);
});
app.put('/api/patientDetail-history', (req, res, next) => {
  const patientId = req.body.patientId || req.body.patient_id;
  req.url = `/api/patient-history/${patientId}`;
  app.handle(req, res, next);
});
app.get('/api/printSettings', (req, res, next) => {
  req.url = '/api/print-settings';
  app.handle(req, res, next);
});
app.post('/api/printSettings', (req, res, next) => {
  req.url = '/api/print-settings';
  app.handle(req, res, next);
});
// Dropdown options (frontend calls GET /prescription)
app.get('/api/prescription', (req, res, next) => {
  req.url = '/api/prescriptions/dropdown-options';
  app.handle(req, res, next);
});
// Unified search (frontend calls GET /PrescriptionSearch)
app.get('/api/PrescriptionSearch', (req, res, next) => {
  req.url = '/api/prescriptions/search' + (req._parsedUrl.search || '');
  app.handle(req, res, next);
});
// Frequently seen (frontend calls GET /prescription-frequentlySeen)
app.get('/api/prescription-frequentlySeen', (req, res, next) => {
  req.url = '/api/prescriptions/frequently-seen' + (req._parsedUrl.search || '');
  app.handle(req, res, next);
});
// Configuration (frontend calls GET/PUT /prescription-configuration)
app.get('/api/prescription-configuration', (req, res, next) => {
  req.url = '/api/prescriptions/configuration' + (req._parsedUrl.search || '');
  app.handle(req, res, next);
});
app.put('/api/prescription-configuration', (req, res, next) => {
  req.url = '/api/prescriptions/configuration';
  app.handle(req, res, next);
});
// Vital units (frontend calls GET /vitals)
app.get('/api/vitals', (req, res, next) => {
  req.url = '/api/prescriptions/vital-units';
  app.handle(req, res, next);
});
// Global main templates (frontend calls GET /emr-AddMainTemplate)
app.get('/api/emr-AddMainTemplate', (req, res, next) => {
  req.url = '/api/templates/global' + (req._parsedUrl.search || '');
  app.handle(req, res, next);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
});

// Global error handler
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.warn('MongoDB connection failed, starting server anyway:', error.message);
  }
  app.listen(config.port, () => {
    console.log(`EMR Backend running on port ${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
  });
};

startServer();

export default app;
