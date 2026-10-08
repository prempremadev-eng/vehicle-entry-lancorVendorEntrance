'use strict';

const catalyst = require('zcatalyst-sdk-node');
const Busboy = require('busboy');

const BUCKET_NAME = process.env.PHOTO_BUCKET_NAME || 'lancor-vendor-entrance-photos';
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
// Signed URLs are regenerated on every vendor_entries GET, so this only needs
// to outlive a single page view, not the object's lifetime — capped at the
// SDK's own max of 7 days.
const SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Production origins are handled by API Gateway + Authorized Domains —
// this only covers local dev, where no gateway sits in front of the function.
function setLocalDevCors(req, res) {
  const origin = req.headers.origin || '';
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}

function parseUpload(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
    });

    const fields = {};
    const chunks = [];
    let mimeType = '';
    let tooLarge = false;
    let sawFile = false;

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('file', (fieldname, file, info) => {
      sawFile = true;
      mimeType = info.mimeType;
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('limit', () => {
        tooLarge = true;
      });
    });

    busboy.on('error', reject);
    busboy.on('finish', () => {
      if (!sawFile) return reject(new Error('NO_FILE'));
      if (tooLarge) return reject(new Error('FILE_TOO_LARGE'));
      resolve({ fields, buffer: Buffer.concat(chunks), mimeType });
    });

    req.pipe(busboy);
  });
}

module.exports = async (req, res) => {
  setLocalDevCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  let upload;
  try {
    upload = await parseUpload(req);
  } catch (err) {
    if (err.message === 'FILE_TOO_LARGE') return sendJson(res, 413, { error: 'Photo is too large' });
    if (err.message === 'NO_FILE') return sendJson(res, 400, { error: 'No photo received' });
    console.error('Upload parse error:', err);
    return sendJson(res, 400, { error: 'Could not read the photo' });
  }

  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const bucket = catalystApp.stratus().bucket(BUCKET_NAME);

    const rowId = upload.fields.rowId || '';
    const key = `photos/${rowId || 'new'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

    await bucket.putObject(key, upload.buffer, {
      contentType: upload.mimeType || 'image/jpeg',
      overwrite: true,
    });

    // Attached to an already-parked (Status=IN) entry from the Vehicle Out
    // page — persist immediately so the thumbnail shows without a separate
    // save step.
    if (rowId) {
      const table = catalystApp.datastore().table('ParkingEntries');
      await table.updateRow({ ROWID: rowId, VehiclePhotoKey: key });
    }

    const signed = await bucket.generatePreSignedUrl(key, 'GET', { expiryIn: SIGNED_URL_EXPIRY_SECONDS });
    return sendJson(res, 200, { key, url: signed.signature });
  } catch (err) {
    console.error('vehicle_photo error:', err);
    return sendJson(res, 500, { error: err.message });
  }
};
