// datetime-local input value ("YYYY-MM-DDTHH:MM") in the browser's local time —
// used to default/reset the In Time field to "right now" with both date and time.
export function getCurrentDateTimeValue() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

// Groups a vehicle number into the familiar "TN 22 AB 1234" layout as the user
// types — 2 letters, 2 digits, up to 2 letters, up to 4 digits.
// A real plate always starts with a letter (state code), so a digit-first
// value means the user is quick-searching by the plate's trailing digits
// (e.g. "3434") — left completely unformatted (no auto-spacing, no cursor
// jumps) and capped at 4 digits, which also matches cleanly against the
// last group of a stored "TN 22 AB 1234" style plate for search.
export function formatVehicleNumber(rawValue) {
  const clean = rawValue.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!clean) return ''

  if (/^[0-9]/.test(clean)) {
    return clean.slice(0, 4)
  }

  const groups = [clean.slice(0, 2), clean.slice(2, 4), clean.slice(4, 6), clean.slice(6, 10)]
  return groups.filter(Boolean).join(' ')
}

// InTime is stored as a "YYYY-MM-DDTHH:MM" datetime-local string with no
// timezone offset, so the Date constructor parses it as the browser's local
// time already — no separate timezone handling needed.
export function parseEntryDateTime(inTime) {
  if (!inTime) return null
  const date = new Date(inTime)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatTimeDisplay(date) {
  if (!date) return '—'
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatDateDisplay(date) {
  if (!date) return '—'
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

// "Parked for" duration — shows days once a vehicle has been parked more
// than 24 hours, otherwise hours and minutes.
export function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  return `${hours}h ${minutes}m`
}

// Name is optional for Employee Without Sticker entries — fall back to the
// employee number so a card never shows with zero identifying info.
export function getEntryIdentifier(entry) {
  if (entry.Name) return entry.Name
  if (entry.EmployeeNumber) return `Emp #${entry.EmployeeNumber}`
  return ''
}


const DIGIT_WORDS = {
  zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
}

const TEEN_WORDS = {
  ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14',
  fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19',
}

const TENS_WORDS = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}

// Digits are commonly read aloud "double 2 5 1" / "triple 9" (repeat the next
// digit) rather than as an arithmetic phrase — so this walks word-by-word and
// concatenates digits, instead of summing a full English number.
export function wordsToDigits(transcript) {
  const tokens = transcript
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  let out = ''
  let pendingTens = null

  const flushPendingTens = () => {
    if (pendingTens !== null) {
      out += String(pendingTens)
      pendingTens = null
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i]

    if (/^\d+$/.test(word)) {
      flushPendingTens()
      out += word
      continue
    }

    if (word === 'double' || word === 'triple') {
      const next = tokens[i + 1]
      if (next && next in DIGIT_WORDS) {
        flushPendingTens()
        out += DIGIT_WORDS[next].repeat(word === 'double' ? 2 : 3)
        i++
      }
      continue
    }

    if (word in TENS_WORDS) {
      flushPendingTens()
      pendingTens = TENS_WORDS[word]
      continue
    }

    if (word in DIGIT_WORDS) {
      if (pendingTens !== null) {
        out += String(pendingTens + Number(DIGIT_WORDS[word]))
        pendingTens = null
      } else {
        out += DIGIT_WORDS[word]
      }
      continue
    }

    if (word in TEEN_WORDS) {
      flushPendingTens()
      out += TEEN_WORDS[word]
      continue
    }

    flushPendingTens()
  }

  flushPendingTens()
  return out
}