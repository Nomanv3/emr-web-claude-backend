import { Router } from 'express';
import { sendWhatsApp, uploadPrescriptionPdf, testWhatsApp } from '../controllers/whatsapp.controller.js';

const router = Router();

// Gupshup WhatsApp send (template + PDF)
router.post('/send-whatsapp', sendWhatsApp);

// Host a prescription PDF and return a public URL for Gupshup to fetch
router.post('/upload-prescription-pdf', uploadPrescriptionPdf);

// Quick test endpoint: GET /api/test-whatsapp?phone=9511676707
router.get('/test-whatsapp', testWhatsApp);

export default router;
