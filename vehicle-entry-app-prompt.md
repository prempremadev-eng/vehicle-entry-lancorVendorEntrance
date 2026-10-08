Build a Vehicle Entry & Exit Management System for a gated facility (used by security
guards to log vendor/visitor/employee vehicle entries), using Zoho Catalyst as the
backend platform and a React + Vite frontend hosted on Catalyst Slate.

## Tech Stack
- Frontend: React + Vite, deployed via Catalyst Slate
- Backend: Catalyst Advanced I/O Functions (Node.js)
- Database: Catalyst Data Store
- Auth: Catalyst's built-in Authentication (Embedded widget: email/password + Google Sign-In)

## Pages & Features

1. **Sign In** — Catalyst's embedded auth widget (email/password + Google Sign-In button).
   No custom login UI needed, just mount catalyst.auth.signIn().

2. **Home** — navigation buttons to: Employee Entry, Visitor Entry, Vendor Entry,
   Vehicle Out, Dashboard.

3. **Entry Form** (shared component, three variants: Employee / Visitor / Vendor):
   - Vehicle Number (text input + a "Scan" button that opens the camera and sends the
     photo to a plate-recognition API to auto-fill the field)
   - Name, Phone Number (Employee: optional; Visitor/Vendor: required)
   - Employee Number (Employee type only)
   - Coming From, Whom To Meet (Visitor only, not Vendor/Employee)
   - Remarks (optional, textarea, 3 rows visible)
   - Voice input: a mic button next to each text field that transcribes speech into
     that field
   - Date/Time (defaults to now, editable)
   - Read-only field at the BOTTOM of the form showing the signed-in user's email
     (for accountability — not editable)
   - Submit → saves a new row with Status: "IN"

4. **Vehicle Out** — lists all currently-parked (Status: IN) vehicles:
   - Date filter (date picker) and search-by-vehicle-number
   - Shows: vehicle number, entry type, name/employee number, entry time,
     "Parked for: Xh Ym" (live-updating), who created the entry, remarks
   - "Mark OUT" button per row → updates Status to "OUT" and records who marked it out

5. **Dashboard** — full entry history:
   - Summary counts: Total / IN / OUT
   - Filters: entry type (all/employee/visitor/vendor), status (all/IN/OUT), date, search
   - Each row shows: vehicle number, status badge, entry type, who created it,
     who marked it out (if OUT), remarks
   - Today's date/day shown as a heading

## Data Model
One Data Store table (e.g. `ParkingEntries`) with columns:
VehicleNumber, EntryType, Name, PhoneNumber, EmployeeNumber, Remarks, ComingFrom,
WhomToMeet, InTime, Status, CreatedByEmail, OutByEmail
(ROWID/CREATEDTIME/MODIFIEDTIME are automatic)

## Critical Catalyst Platform Gotchas (learned the hard way — follow these from the start)

1. **Slate and Functions live on different domains.** A cookie-based session
   (`credentials: 'include'`) from the Slate-hosted frontend NEVER reaches a Function
   on `*.catalystserverless.com` — this is a hard cross-domain boundary, not a timing
   issue. The correct pattern: client calls `catalyst.auth.generateAuthToken()`
   (after `isUserAuthenticated()` succeeds) and sends it as a raw `Authorization`
   header (no "Bearer" prefix) on every fetch to a Function. The Function reads
   identity via `catalyst.initialize(req).userManagement().getCurrentUser()`, which
   correctly recognizes this Authorization header.

2. **Every new Function needs an explicit API Gateway route**, or calls to it may
   404/fail unpredictably even with a correct URL. Add one for each function:
   Request URL `/server/<fn>/{path1:(.*)}` → Target `/server/<fn>/{path1}`.

3. **On cold app load, `isUserAuthenticated()` can transiently fail** for a moment
   while the SDK finishes initializing — wrap it in a short retry (3-4 attempts,
   ~200ms apart is enough; don't over-retry, it directly adds to load time for every
   first-time visitor).

4. Give `waitForCatalystAuth()` (the helper that polls for `window.catalyst` to be
   ready) an actual timeout with a user-facing fallback ("taking longer than
   usual" + reload button) — it will otherwise wait forever if the SDK script fails
   to load on a bad connection, with zero way out for the user.

5. **Don't attempt WebAuthn/Passkey `navigator.credentials.get()`/`.create()`
   automatically on page load** — it's a gesture-preferring API and reliably hangs
   with no UI shown at all when called without a direct user tap. If you build this
   feature, gate it behind an explicit button.

6. Native `<input type="date">` does not reliably show the `placeholder` attribute
   on all mobile browsers — if you need placeholder-like text, use an absolutely
   positioned overlay `<span>` shown only when the value is empty, not the
   `placeholder` attribute.

7. Data Store `boolean` columns are stored as the literal strings `"true"`/`"false"`,
   not JS booleans — convert on read (`value === 'true'`) or you'll hit "always
   truthy string" bugs.

## Build Order
1. `catalyst init` and confirm org/project.
2. Create the Data Store table + columns via Console.
3. Build the Function(s) for entries (GET list, POST create, POST mark-out) with
   Security Rules and matching env vars.
4. Add the API Gateway route(s).
5. Scaffold the React app, wire up auth + the pages above.
6. `catalyst serve` locally to test end-to-end before deploying.
7. Deploy Functions, then `catalyst deploy slate <name>`.
