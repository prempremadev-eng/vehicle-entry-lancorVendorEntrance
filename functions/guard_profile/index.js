'use strict';

const catalyst = require('zcatalyst-sdk-node');

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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// The email comes from Catalyst's own verified session, not raw user input —
// this is just a defensive escape for the ZCQL string literal.
function escapeForZcql(value) {
  return String(value).replace(/'/g, "''");
}

module.exports = async (req, res) => {
  setLocalDevCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    const currentUser = await catalyst.initialize(req).userManagement().getCurrentUser();
    const email = currentUser?.email_id;
    if (!email) return sendJson(res, 401, { error: 'Not signed in' });

    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const table = catalystApp.datastore().table('GuardProfiles');
    const zcql = catalystApp.zcql();
    const safeEmail = escapeForZcql(email);

    if (req.method === 'GET') {
      const result = await zcql.executeZCQLQuery(
        `SELECT ROWID, GuardNumber FROM GuardProfiles WHERE UserEmail = '${safeEmail}' LIMIT 1`
      );
      const row = result[0] && result[0].GuardProfiles;
      return sendJson(res, 200, { guardNumber: (row && row.GuardNumber) || null });
    }

    if (req.method === 'POST') {
      const body = await getBody(req);
      const guardNumber = String(body.guardNumber || '').trim();
      if (!guardNumber) return sendJson(res, 400, { error: 'Guard number is required' });

      const existing = await zcql.executeZCQLQuery(
        `SELECT ROWID FROM GuardProfiles WHERE UserEmail = '${safeEmail}' LIMIT 1`
      );
      const existingRow = existing[0] && existing[0].GuardProfiles;

      if (existingRow) {
        await table.updateRow({ ROWID: existingRow.ROWID, GuardNumber: guardNumber });
      } else {
        await table.insertRow({ UserEmail: email, GuardNumber: guardNumber });
      }
      return sendJson(res, 200, { guardNumber });
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('guard_profile error:', err);
    return sendJson(res, 500, { error: err.message });
  }
};
