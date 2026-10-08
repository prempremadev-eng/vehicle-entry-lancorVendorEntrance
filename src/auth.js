const GUARD_NUMBER_KEY = 'guardNumber'

// No longer collected anywhere (the Guard Number prompt was removed) — this
// now always returns '' via the catch-all fallback. Kept because
// VehicleEntry.jsx still reads it for the (optional) entry payload field.
export function getStoredGuardNumber() {
  try {
    return localStorage.getItem(GUARD_NUMBER_KEY) || ''
  } catch {
    return ''
  }
}

// Resolves once the Catalyst Web SDK's auth namespace is actually callable —
// index.html loads it, but this component may render before it's ready.
export function waitForCatalystAuth() {
  return new Promise((resolve) => {
    const check = () => {
      if (window.catalyst?.auth?.isUserAuthenticated) {
        resolve(window.catalyst)
      } else {
        setTimeout(check, 100)
      }
    }
    check()
  })
}

// Slate and Functions are different domains — a Slate-origin session
// cookie is never sent to *.catalystserverless.in. The documented, correct
// way to prove identity to a function from Slate is an explicit
// Authorization token from generateAuthToken(), not a cookie.
async function isAuthenticatedWithRetry(attempts = 3, delayMs = 150) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await window.catalyst.auth.isUserAuthenticated()
      return true
    } catch {
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }
  return false
}

export async function getAuthToken() {
  const ok = await isAuthenticatedWithRetry()
  if (!ok) throw new Error('not authenticated')
  const tokenRes = await window.catalyst.auth.generateAuthToken()
  return tokenRes.access_token
}

// For display only — shows which signed-in account is about to submit an
// entry. Returns '' if not signed in yet or the SDK isn't ready.
export async function getCurrentUserEmail() {
  try {
    await waitForCatalystAuth()
    const result = await window.catalyst.auth.isUserAuthenticated()
    return result?.content?.email_id || ''
  } catch {
    return ''
  }
}
