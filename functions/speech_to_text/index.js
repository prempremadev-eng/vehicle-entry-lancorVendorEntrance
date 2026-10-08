'use strict';

const Busboy = require('busboy');

const SARVAM_TRANSCRIBE_URL = 'https://api.sarvam.ai/speech-to-text';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

function parseAudioUpload(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
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

// Sarvam's REST API is a single synchronous call (no upload-then-poll like
// AssemblyAI) — it returns the transcript directly in the response body.
// mode=codemix keeps mixed Tamil+English speech as spoken instead of
// collapsing it into one language; that mode is only available on saaras:v3.
// language_code is pinned to Tamil (not "unknown"/auto-detect) — auto-detect
// was misidentifying guards' speech as Hindi and transcribing in Hindi.
async function transcribeWithSarvam(buffer, mimeType, apiKey) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), 'input.webm');
  form.append('model', 'saaras:v3');
  form.append('mode', 'codemix');
  form.append('language_code', 'ta-IN');

  const response = await fetch(SARVAM_TRANSCRIBE_URL, {
    method: 'POST',
    headers: { 'api-subscription-key': apiKey },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Sarvam transcription failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.transcript || '';
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

  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    console.error('SARVAM_API_KEY is not set');
    return sendJson(res, 500, { error: 'Voice input is not configured' });
  }

  let upload;
  try {
    upload = await parseAudioUpload(req);
  } catch (err) {
    if (err.message === 'FILE_TOO_LARGE') return sendJson(res, 413, { error: 'Recording is too long' });
    if (err.message === 'NO_FILE') return sendJson(res, 400, { error: 'No audio received' });
    console.error('Upload parse error:', err);
    return sendJson(res, 400, { error: 'Could not read the recording' });
  }

  const t0 = Date.now();
  try {
    const text = await transcribeWithSarvam(upload.buffer, upload.mimeType, apiKey);
    console.log(`timing: audioBytes=${upload.buffer.length} total=${Date.now() - t0}ms`);
    return sendJson(res, 200, { text });
  } catch (err) {
    console.error(`Sarvam transcription failed after ${Date.now() - t0}ms:`, err);
    return sendJson(res, 502, { error: 'Transcription service failed' });
  }
};
