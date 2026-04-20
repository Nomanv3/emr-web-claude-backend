import 'dotenv/config';
import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';

import connectDB from './config/db.js';
import config from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authenticate } from './middleware/auth.middleware.js';

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
import whatsappRoutes from './routes/whatsapp.routes.js';
import placesRoutes from './routes/places.routes.js';

const app = express();

// Middleware
// Loosen crossOriginResourcePolicy so Gupshup (and browsers) can fetch
// /uploads/prescriptions/*.pdf from a different origin.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    // Allow any localhost origin (any port) for local development
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
    // Allow Render and Vercel deployments
    if (origin.endsWith('.onrender.com') || origin.endsWith('.vercel.app')) return callback(null, true);
    // Check against explicitly allowed origins
    const allowed = config.corsOrigin.split(',').map(o => o.trim());
    if (allowed.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Publicly serve uploaded prescription PDFs so Gupshup can fetch them.
// When tunneling with ngrok, set PUBLIC_BASE_URL in .env so the returned URLs
// use the public host instead of localhost.
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'EMR Backend is running', timestamp: new Date().toISOString() });
});

// Mount routes
// /api/auth and /api/health are unprotected (login/refresh public).
// All other resource routes require a valid Bearer token via `authenticate`.
app.use('/api/auth', authRoutes);
app.use('/api/patients', authenticate, patientsRoutes);
app.use('/api/queue', authenticate, queueRoutes);
app.use('/api/appointments', authenticate, appointmentsRoutes);
app.use('/api/prescriptions', authenticate, prescriptionsRoutes);
app.use('/api/patient-history', authenticate, patientHistoryRoutes);
app.use('/api/invoices', authenticate, invoicesRoutes);
app.use('/api/payments', authenticate, paymentsRoutes);
app.use('/api/print-settings', authenticate, printSettingsRoutes);
app.use('/api/templates', authenticate, templatesRoutes);
app.use('/api/prescription-Templates', authenticate, templatesRoutes);
app.use('/api/masters', authenticate, mastersRoutes);
app.use('/api/analytics', authenticate, analyticsRoutes);
app.use('/api/schedule', authenticate, scheduleRoutes);
// WhatsApp (Gupshup) send + PDF upload — mounted at /api so the endpoints
// resolve to /api/send-whatsapp and /api/upload-prescription-pdf.
app.use('/api', authenticate, whatsappRoutes);
app.use('/api/places', authenticate, placesRoutes);

// Legacy route aliases (match existing frontend API calls).
// All aliases are gated behind `authenticate` to mirror their underlying routes.
app.post('/api/savePrescription', authenticate, (req, res, next) => {
  req.url = '/api/prescriptions/save';
  app.handle(req, res, next);
});
app.put('/api/updatePrescription', authenticate, (req, res, next) => {
  req.url = '/api/prescriptions/update';
  app.handle(req, res, next);
});
app.get('/api/get-fullprescription', authenticate, (req, res, next) => {
  req.url = '/api/prescriptions/full';
  app.handle(req, res, next);
});
app.post('/api/get-fullprescription', authenticate, (req, res, next) => {
  req.url = '/api/prescriptions/save';
  app.handle(req, res, next);
});
app.put('/api/get-fullprescription', authenticate, (req, res, next) => {
  req.url = '/api/prescriptions/update';
  app.handle(req, res, next);
});
app.get('/api/patientDetail-history', authenticate, (req, res, next) => {
  req.url = '/api/prescriptions/patient-detail-history';
  app.handle(req, res, next);
});
app.put('/api/patientDetail-history', authenticate, (req, res, next) => {
  const patientId = req.body.patientId || req.body.patient_id;
  req.url = `/api/patient-history/${patientId}`;
  app.handle(req, res, next);
});
app.get('/api/printSettings', authenticate, (req, res, next) => {
  req.url = '/api/print-settings';
  app.handle(req, res, next);
});
app.post('/api/printSettings', authenticate, (req, res, next) => {
  req.url = '/api/print-settings';
  app.handle(req, res, next);
});
// Dropdown options (frontend calls GET /prescription)
app.get('/api/prescription', authenticate, (req, res, next) => {
  req.url = '/api/prescriptions/dropdown-options';
  app.handle(req, res, next);
});
// Unified search (frontend calls GET /PrescriptionSearch)
app.get('/api/PrescriptionSearch', authenticate, (req, res, next) => {
  req.url = '/api/prescriptions/search' + (req._parsedUrl.search || '');
  app.handle(req, res, next);
});
// Frequently seen (frontend calls GET /prescription-frequentlySeen)
app.get('/api/prescription-frequentlySeen', authenticate, (req, res, next) => {
  req.url = '/api/prescriptions/frequently-seen' + (req._parsedUrl.search || '');
  app.handle(req, res, next);
});
// Configuration (frontend calls GET/PUT /prescription-configuration)
app.get('/api/prescription-configuration', authenticate, (req, res, next) => {
  req.url = '/api/prescriptions/configuration' + (req._parsedUrl.search || '');
  app.handle(req, res, next);
});
app.put('/api/prescription-configuration', authenticate, (req, res, next) => {
  req.url = '/api/prescriptions/configuration';
  app.handle(req, res, next);
});
// Vital units (frontend calls GET /vitals)
app.get('/api/vitals', authenticate, (req, res, next) => {
  req.url = '/api/prescriptions/vital-units';
  app.handle(req, res, next);
});
// Global main templates (frontend calls GET /emr-AddMainTemplate)
app.get('/api/emr-AddMainTemplate', authenticate, (req, res, next) => {
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
    console.error('MySQL connection failed — refusing to start server:', error.message);
    process.exit(1);
  }
  app.listen(config.port, () => {
    console.log(`EMR Backend running on port ${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
  });
};

startServer();

export default app;
