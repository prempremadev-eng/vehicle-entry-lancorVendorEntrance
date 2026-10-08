import { useState, useEffect } from 'react'

// Admins open this app on a laptop, guards open it on a phone at the gate —
// this picks which landing view to show based on actual screen width rather
// than a manual toggle, so each side just sees their own view by default.
const DESKTOP_QUERY = '(min-width: 1024px)'

export function useIsDesktop() {
    const [isDesktop, setIsDesktop] = useState(
        () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches
    )

    useEffect(() => {
        const mql = window.matchMedia(DESKTOP_QUERY)
        const handleChange = (e) => setIsDesktop(e.matches)
        mql.addEventListener('change', handleChange)
        return () => mql.removeEventListener('change', handleChange)
    }, [])

    return isDesktop
}
