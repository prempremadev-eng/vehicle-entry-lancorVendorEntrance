// Advanced I/O function — no /execute suffix, matches the practice project's confirmed pattern.
export const PLATE_SCAN_FUNCTION_URL = import.meta.env.VITE_PLATE_SCAN_URL

export const EMPLOYEE_TYPE = 'employee'
export const VISITOR_TYPE = 'visitor'
export const VENDOR_TYPE = 'vendor'

export const ENTRY_TYPE_LABELS = {
  [EMPLOYEE_TYPE]: 'Employee Without Sticker',
  [VISITOR_TYPE]: 'Visitor',
  [VENDOR_TYPE]: 'Vendor',
}

export const SPEECH_TO_TEXT_FUNCTION_URL = import.meta.env.VITE_SPEECH_TO_TEXT_URL
export const VEHICLE_PHOTO_FUNCTION_URL = import.meta.env.VITE_VEHICLE_PHOTO_URL

// Fields that hold a raw digit string rather than free text — voice input for
// these runs through wordsToDigits() instead of using the transcript as-is.
export const VOICE_DIGIT_FIELDS = new Set(['employeeNumber', 'phoneNumber'])

// Fields where a new voice clip continues what's already there instead of
// replacing it — Remarks is dictated as multiple separate clips (person
// pauses, taps mic again), so each new clip should append, not overwrite.
export const VOICE_APPEND_FIELDS = new Set(['remarks'])

