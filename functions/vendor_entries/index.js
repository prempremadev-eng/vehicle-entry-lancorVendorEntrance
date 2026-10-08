'use strict';

const catalyst = require('zcatalyst-sdk-node');

const PHOTO_BUCKET_NAME = process.env.PHOTO_BUCKET_NAME || 'lancor-vendor-entrance-photos';
const PHOTO_SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60;

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

// User-scope (not admin) is required to read the caller's own identity —
// the admin-scope app elsewhere in this file is only for DataStore ops.
async function getSignedInEmail(req) {
  try {
    const currentUser = await catalyst.initialize(req).userManagement().getCurrentUser();
    return currentUser?.email_id || null;
  } catch {
    // No authenticated session (e.g. local dev before Gateway auth is required).
    return null;
  }
}

// Only the object key is stored in the table — a fresh signed URL is
// generated on every read so access stays scoped and short-lived instead of
// baking a long-lived link into stored data. Failures are per-entry and
// non-fatal (e.g. bucket not yet created) so a photo issue never breaks the
// whole entries list.
async function attachPhotoUrls(catalystApp, entries) {
  const bucket = catalystApp.stratus().bucket(PHOTO_BUCKET_NAME);
  await Promise.all(entries.map(async (entry) => {
    if (!entry.VehiclePhotoKey) return;
    try {
      const signed = await bucket.generatePreSignedUrl(entry.VehiclePhotoKey, 'GET', {
        expiryIn: PHOTO_SIGNED_URL_EXPIRY_SECONDS,
      });
      entry.VehiclePhotoUrl = signed.signature;
    } catch (err) {
      console.error('Photo URL signing failed for', entry.VehiclePhotoKey, err.message);
    }
  }));
  return entries;
}

module.exports = async (req, res) => {
  setLocalDevCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    const catalystApp = catalyst.initialize(req, { scope: 'admin' });
    const table = catalystApp.datastore().table('ParkingEntries');
    const zcql = catalystApp.zcql();

    if (req.method === 'GET') {
      const result = await zcql.executeZCQLQuery('SELECT * FROM ParkingEntries ORDER BY CREATEDTIME DESC LIMIT 0,300');
      const allEntries = result.map((row) => row.ParkingEntries);

      // Vehicle number autocomplete — used by the entry form so a repeat
      // visitor's Name/Phone/etc. can be filled in from their last visit
      // instead of re-typed every time. ZCQL's LIKE '%...%' wildcard is
      // silently non-functional (returns [] with no error — a documented
      // Catalyst limitation), so substring matching is done in JS instead.
      const url = new URL(req.url, 'http://placeholder');
      const vehicleSearch = url.searchParams.get('vehicleSearch');
      if (vehicleSearch && vehicleSearch.trim()) {
        const term = vehicleSearch.trim().toUpperCase();
        const seenVehicleNumbers = new Set();
        const entries = [];
        for (const entry of allEntries) {
          if (!entry.VehicleNumber || !entry.VehicleNumber.toUpperCase().includes(term)) continue;
          // Already sorted CREATEDTIME DESC — first occurrence of a plate
          // is its most recent entry, so duplicates (re-entered vehicles)
          // don't show as repeated rows in the suggestion list.
          if (seenVehicleNumbers.has(entry.VehicleNumber)) continue;
          seenVehicleNumbers.add(entry.VehicleNumber);
          entries.push(entry);
          if (entries.length === 5) break;
        }
        return sendJson(res, 200, { entries });
      }

      await attachPhotoUrls(catalystApp, allEntries);
      return sendJson(res, 200, { entries: allEntries });
    }

    if (req.method === 'POST') {
      const body = await getBody(req);

      // Updating Remarks on an existing (still-parked) entry — e.g. a note
      // like "long stay, admin approved" — distinct from marking it OUT.
      if (body.rowId && body.updateRemarks) {
        const row = await table.updateRow({
          ROWID: body.rowId,
          Remarks: body.remarks || '',
        });
        return sendJson(res, 200, { entry: row });
      }

      if (body.rowId) {
        const outByEmail = await getSignedInEmail(req);
        const row = await table.updateRow({
          ROWID: body.rowId,
          Status: 'OUT',
          OutByEmail: outByEmail,
          OutTime: body.outTime,
        });
        return sendJson(res, 200, { entry: row });
      }

      const createdByEmail = await getSignedInEmail(req);

      const row = await table.insertRow({
        VehicleNumber: body.vehicleNumber,
        EntryType: body.entryType,
        Name: body.name,
        PhoneNumber: body.phoneNumber,
        EmployeeNumber: body.employeeNumber,
        Remarks: body.remarks,
        ComingFrom: body.comingFrom,
        WhomToMeet: body.whomToMeet,
        InTime: body.inTime,
        Status: 'IN',
        VehiclePhotoKey: body.vehiclePhotoKey || null,
        GuardNumber: body.guardNumber,
        CreatedByEmail: createdByEmail,
      });

      return sendJson(res, 201, { entry: row });
    }

    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('vendor_entries error:', err);
    sendJson(res, 500, { error: err.message });
  }
};
