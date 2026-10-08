import { useEffect, useRef, useState } from 'react'
import { waitForCatalystAuth } from '../auth'

// On a cold app open, isUserAuthenticated() can come back false for a moment
// while the Catalyst SDK is still finishing its own session setup — a
// transient race, not a real "not logged in". Kept short (~800ms worst
// case) — a brand new visitor with no session at all pays this full wait
// on every first load, and the race in practice resolves within the first
// attempt or two.
async function isAuthenticatedWithRetry(catalyst, attempts = 4, delayMs = 200) {
  let lastError = null
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await catalyst.auth.isUserAuthenticated()
      return { authenticated: true, lastError: null }
    } catch (err) {
      lastError = err
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }
  return { authenticated: false, lastError }
}

// TEMPORARY diagnostic — shows the real error from the auth check so we can
// tell a genuine "not logged in" apart from something else going wrong.
// Remove once the reprompt-after-history-clear issue is confirmed fixed.
function describeAuthError(err) {
  if (!err) return 'none'
  try {
    return JSON.stringify(err.content || err.message || err)
  } catch {
    return String(err)
  }
}

function Login({ onReady }) {
  const [phase, setPhase] = useState('checking') // checking | widget
  const [debugInfo, setDebugInfo] = useState('') // TEMPORARY — see describeAuthError
  const [slowLoad, setSlowLoad] = useState(false)
  const widgetStartedRef = useRef(false)

  // waitForCatalystAuth() polls forever with no timeout if Zoho's login SDK
  // script never finishes loading (slow/blocked network) — without this,
  // that leaves the app stuck on "Loading…" permanently with no way out.
  useEffect(() => {
    if (phase !== 'checking') return
    const timer = setTimeout(() => setSlowLoad(true), 6000)
    return () => clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    let cancelled = false

    waitForCatalystAuth().then(async (catalyst) => {
      if (cancelled) return

      const { authenticated, lastError } = await isAuthenticatedWithRetry(catalyst)
      if (cancelled) return

      if (!authenticated) {
        setDebugInfo(`authFailed, lastError=${describeAuthError(lastError)}`)
        setPhase('widget')
        return
      }

      onReady()
    })

    return () => {
      cancelled = true
    }
  }, [onReady])

  useEffect(() => {
    if (phase !== 'widget' || widgetStartedRef.current) return
    widgetStartedRef.current = true

    waitForCatalystAuth().then((catalyst) => {
      // Sign-in redirects the whole page back to service_url on success,
      // which re-runs the check above fresh — no callback needed here.
      catalyst.auth.signIn('catalyst-login-container', {
        service_url: window.location.origin + '/',
      })
    })
  }, [phase])

  if (phase === 'checking') {
    return (
      <div className="reg-page">
        <div className="reg-card">
          <p className="reg-subtitle">Loading…</p>
          {slowLoad && (
            <>
              <p className="reg-subtitle" style={{ marginTop: '8px' }}>
                This is taking longer than usual — check your internet connection.
              </p>
              <div className="reg-actions">
                <button className="reg-btn-primary" type="button" onClick={() => window.location.reload()}>
                  Reload
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="reg-page">
      <div className="reg-card">
        <h2 className="reg-title">Sign In</h2>
        <div id="catalyst-login-container"></div>
        {debugInfo && (
          <p style={{ fontSize: '10px', color: '#999', marginTop: '12px', wordBreak: 'break-word' }}>
            debug: {debugInfo}
          </p>
        )}
      </div>
    </div>
  )
}

export default Login
