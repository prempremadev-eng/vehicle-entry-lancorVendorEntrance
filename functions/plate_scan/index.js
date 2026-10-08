'use strict';

const Busboy = require('busboy');

const PLATE_RECOGNIZER_URL = 'https://api.platerecognizer.com/v1/plate-reader/';
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // Plate Recognizer's documented cloud API hard limit

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Production origins are handled by API Gateway + Authorized Domains —
// this only covers local dev, where no gateway sits in front of the function.
// Setting this header for the production origin too would duplicate what the
// gateway already injects, which browsers reject outright.
function setLocalDevCors(req, res) {
  const origin = req.headers.origin || '';
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

function parseImageUpload(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    });

    const chunks = [];
    let mimeType = '';
    let tooLarge = false;
    let sawFile = false;

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
      resolve({ buffer: Buffer.concat(chunks), mimeType });
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

  const token = process.env.PLATE_RECOGNIZER_TOKEN;
  if (!token) {
    console.error('PLATE_RECOGNIZER_TOKEN is not set');
    return sendJson(res, 500, { error: 'Scanner is not configured' });
  }

  let upload;
  try {
    upload = await parseImageUpload(req);
  } catch (err) {
    if (err.message === 'FILE_TOO_LARGE') {
      return sendJson(res, 413, { error: 'Image is too large' });
    }
    if (err.message === 'NO_FILE') {
      return sendJson(res, 400, { error: 'No image received' });
    }
    console.error('Upload parse error:', err);
    return sendJson(res, 400, { error: 'Could not read the uploaded image' });
  }

  try {
    const formData = new FormData();
    formData.append('regions', 'in');
    formData.append(
      'upload',
      new Blob([upload.buffer], { type: upload.mimeType || 'image/jpeg' }),
      'plate.jpg'
    );

    const response = await fetch(PLATE_RECOGNIZER_URL, {
      method: 'POST',
      headers: { Authorization: `Token ${token}` },
      body: formData,
    });

    if (!response.ok) {
      console.error('Plate Recognizer error:', response.status, await response.text());
      return sendJson(res, 502, { error: 'Plate recognition service failed' });
    }

    const data = await response.json();
    const [best] = data.results || [];

    if (!best) {
      return sendJson(res, 200, { vehicleNumber: null, message: 'No plate detected' });
    }

    return sendJson(res, 200, {
      vehicleNumber: best.plate.toUpperCase(),
      confidence: best.score,
    });
  } catch (err) {
    console.error('Plate Recognizer request failed:', err);
    return sendJson(res, 502, { error: 'Plate recognition service failed' });
  }
};
