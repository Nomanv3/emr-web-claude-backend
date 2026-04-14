/**
 * WhatsApp integration via Gupshup.
 *
 * Flow:
 *   1. Upload PDF to backend → get public URL (ngrok/prod).
 *   2. Send the welcome template message (no params — static text).
 *   3. Wait 2 seconds.
 *   4. Send the PDF as a file message.
 *
 * NOTE: The file message (step 4) only works if the recipient has an active
 * 24-hour session. If they haven't replied, only the template will be delivered.
 * For guaranteed PDF delivery, create a template with a DOCUMENT header.
 *
 * Env vars:
 *   - GUPSHUP_API_KEY       sk_... API key from Gupshup Portal
 *   - GUPSHUP_NUMBER        Sender number (digits only, e.g. 15559177695)
 *   - GUPSHUP_APP_NAME      App name from Gupshup Dashboard → Settings
 *   - GUPSHUP_TEMPLATE_ID   Gupshup template UUID
 *   - PUBLIC_BASE_URL        Public URL base for uploaded PDFs
 */

import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const GUPSHUP_TEMPLATE_URL = 'https://api.gupshup.io/wa/api/v1/template/msg';
const GUPSHUP_MSG_URL = 'https://api.gupshup.io/wa/api/v1/msg';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'prescriptions');

/**
 * Normalise phone to international format without '+'.
 * 10-digit → prepend 91 (India). Otherwise pass through.
 */
function normalisePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function formUrlEncode(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function getGupshupConfig() {
  return {
    apiKey: process.env.GUPSHUP_API_KEY,
    source: process.env.GUPSHUP_NUMBER,
    appName: process.env.GUPSHUP_APP_NAME,
    templateId: process.env.GUPSHUP_TEMPLATE_ID,
  };
}

/**
 * Send a template message.
 * The current template (165604c2-...) is static text with 0 params.
 * If you switch to a template with params (e.g. {{1}} for patient name),
 * update the `params` array accordingly.
 */
async function sendTemplate({ apiKey, appName, source, destination, templateId, params }) {
  const bodyObj = {
    channel: 'whatsapp',
    source,
    destination,
    'src.name': appName,
    template: JSON.stringify({ id: templateId, params: params || [] }),
  };

  const body = formUrlEncode(bodyObj);

  console.log('[Gupshup] → TEMPLATE request:', JSON.stringify({
    url: GUPSHUP_TEMPLATE_URL,
    appName,
    source,
    destination,
    templateId,
    params: params || [],
  }, null, 2));

  const res = await fetch(GUPSHUP_TEMPLATE_URL, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  console.log('[Gupshup] ← TEMPLATE response:', JSON.stringify({ status: res.status, data }, null, 2));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Send a standalone file/document message (session message).
 * NOTE: This only works within a 24-hour session window.
 */
async function sendFile({ apiKey, appName, source, destination, fileUrl, filename, caption }) {
  const body = formUrlEncode({
    channel: 'whatsapp',
    source,
    destination,
    'src.name': appName,
    message: JSON.stringify({
      type: 'file',
      url: fileUrl,
      filename: filename || 'Prescription.pdf',
      caption: caption || 'Your prescription',
    }),
  });

  console.log('[Gupshup] → FILE request:', JSON.stringify({
    url: GUPSHUP_MSG_URL,
    appName,
    source,
    destination,
    fileUrl,
    filename,
  }, null, 2));

  const res = await fetch(GUPSHUP_MSG_URL, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  console.log('[Gupshup] ← FILE response:', JSON.stringify({ status: res.status, data }, null, 2));
  return { ok: res.ok, status: res.status, data };
}

/**
 * POST /api/upload-prescription-pdf
 * Body: { pdfBase64: string, filename?: string }
 */
export async function uploadPrescriptionPdf(req, res) {
  try {
    const { pdfBase64, filename } = req.body || {};
    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'pdfBase64 is required' },
      });
    }

    const base64 = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const id = randomUUID();
    const safeName = (filename || `Prescription_${id}.pdf`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedName = `${id}__${safeName}`;
    const fullPath = path.join(UPLOAD_DIR, storedName);
    await fs.writeFile(fullPath, buffer);

    const base =
      (process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.replace(/\/$/, '')) ||
      `${req.protocol}://${req.get('host')}`;
    const url = `${base}/uploads/prescriptions/${storedName}`;

    console.log('[uploadPrescriptionPdf] Saved:', fullPath);
    console.log('[uploadPrescriptionPdf] Public URL:', url);

    return res.json({
      success: true,
      message: 'PDF uploaded',
      data: { url, filename: storedName },
    });
  } catch (err) {
    console.error('[uploadPrescriptionPdf] error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to upload PDF' },
    });
  }
}

/**
 * POST /api/send-whatsapp
 * Body: { phone, name, pdfUrl, templateId? }
 *
 * Sends:
 *   1. Template message (static welcome text, no params)
 *   2. PDF file as a separate message (requires active 24h session)
 */
export async function sendWhatsApp(req, res) {
  try {
    const { phone, name, pdfUrl, templateId } = req.body || {};

    if (!phone || !name || !pdfUrl) {
      return res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'phone, name, and pdfUrl are required' },
      });
    }

    const config = getGupshupConfig();

    if (!config.apiKey || !config.source) {
      return res.status(500).json({
        success: false,
        error: { code: 'GUPSHUP_NOT_CONFIGURED', message: 'GUPSHUP_API_KEY and GUPSHUP_NUMBER must be set in backend .env' },
      });
    }
    if (!config.appName) {
      return res.status(500).json({
        success: false,
        error: { code: 'GUPSHUP_NOT_CONFIGURED', message: 'GUPSHUP_APP_NAME must be set in backend .env' },
      });
    }

    const destination = normalisePhone(phone);
    if (!destination) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PHONE', message: 'Invalid phone number' },
      });
    }

    const finalTemplateId = templateId || config.templateId;
    if (!finalTemplateId) {
      return res.status(500).json({
        success: false,
        error: { code: 'GUPSHUP_NOT_CONFIGURED', message: 'GUPSHUP_TEMPLATE_ID must be set in backend .env' },
      });
    }

    console.log('\n====== GUPSHUP WHATSAPP SEND ======');
    console.log('Patient:', name, '| Phone:', destination, '| PDF:', pdfUrl);
    console.log('Config:', config.appName, '| Source:', config.source, '| Template:', finalTemplateId);

    // 1) Send template message (static text, no params)
    const templateResult = await sendTemplate({
      apiKey: config.apiKey,
      appName: config.appName,
      source: config.source,
      destination,
      templateId: finalTemplateId,
      params: [],  // Current template has 0 parameters
    });

    if (!templateResult.ok) {
      console.error('[Gupshup] TEMPLATE FAILED:', templateResult);
      return res.status(502).json({
        success: false,
        error: {
          code: 'GUPSHUP_TEMPLATE_FAILED',
          message: `Gupshup template failed (HTTP ${templateResult.status})`,
          details: templateResult.data,
        },
      });
    }

    console.log('[Gupshup] Template accepted:', templateResult.data?.messageId);

    // 2) Wait 2s, then send PDF as file message
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const fileResult = await sendFile({
      apiKey: config.apiKey,
      appName: config.appName,
      source: config.source,
      destination,
      fileUrl: pdfUrl,
      filename: `Prescription_${name.replace(/\s+/g, '_')}.pdf`,
      caption: `Prescription for ${name}`,
    });

    if (!fileResult.ok) {
      console.warn('[Gupshup] File send failed (template was accepted):', fileResult.data);
      // Don't fail — template was already sent
    } else {
      console.log('[Gupshup] File accepted:', fileResult.data?.messageId);
    }

    console.log('====== GUPSHUP SEND COMPLETE ======\n');

    return res.json({
      success: true,
      message: 'WhatsApp messages submitted',
      data: {
        template: templateResult.data,
        file: fileResult.data,
        note: 'Messages are processed asynchronously by Gupshup. Check your Gupshup dashboard for delivery status.',
      },
    });
  } catch (err) {
    console.error('[Gupshup] UNEXPECTED ERROR:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Unexpected error' },
    });
  }
}

/**
 * GET /api/test-whatsapp?phone=9511676707
 * Quick test — sends template + optional file to the given number.
 */
export async function testWhatsApp(req, res) {
  const phone = req.query.phone;
  if (!phone) {
    return res.status(400).json({ success: false, error: 'phone query param required' });
  }

  const config = getGupshupConfig();
  const destination = normalisePhone(phone);

  console.log('\n====== TEST WHATSAPP ======');
  console.log('Config:', { ...config, apiKey: config.apiKey?.substring(0, 8) + '...' });
  console.log('Destination:', destination);

  const result = await sendTemplate({
    apiKey: config.apiKey,
    appName: config.appName,
    source: config.source,
    destination,
    templateId: config.templateId,
    params: [],  // Current template has 0 params
  });

  console.log('====== TEST COMPLETE ======\n');

  return res.json({
    success: result.ok,
    gupshupResponse: result.data,
    config: {
      source: config.source,
      appName: config.appName,
      templateId: config.templateId,
      destination,
    },
    troubleshooting: {
      'If message not received': [
        'Error 1003: Recharge your Gupshup wallet (current balance is negative)',
        'Error 4003: Template params mismatch (this endpoint sends [] params)',
        'Sandbox: Recipient must send "Hi" to +1 555 917 7695 on WhatsApp first',
        'Check Gupshup Dashboard → Webhooks for delivery failure logs',
      ],
    },
  });
}
