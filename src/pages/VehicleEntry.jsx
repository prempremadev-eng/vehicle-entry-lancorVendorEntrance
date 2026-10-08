import { useParams } from "react-router-dom";
import { useEffect, useRef, useState } from 'react'
import PlateRecognizerScanner from '../components/PlateRecognizerScanner'
import VehiclePhotoCamera from '../components/VehiclePhotoCamera'
import VoiceInputButton from '../components/VoiceInputButton'
import { useVoiceInput } from '../hooks/useVoiceInput'
import { EMPLOYEE_TYPE, ENTRY_TYPE_LABELS, VENDOR_TYPE, VOICE_APPEND_FIELDS, VEHICLE_PHOTO_FUNCTION_URL } from '../constants'
import { formatVehicleNumber, getCurrentDateTimeValue } from '../utils'
import { getAuthToken, getCurrentUserEmail, getStoredGuardNumber } from '../auth'

const emptyForm = {
    vehicleNumber: "",
    name: "",
    phoneNumber: "",
    employeeNumber: "",
    remarks: "",
    comingFrom: "",
    whomToMeet: "",
    dateAndTime: "",
}

function VehicleEntry({onNavigate}){
    const {entryType} = useParams()
    const entryTypeLabel = ENTRY_TYPE_LABELS[entryType] || 'Unknown'
    const isEmployee = entryType === EMPLOYEE_TYPE
    const isVendor = entryType === VENDOR_TYPE

    const [form, setForm] = useState(() => ({ ...emptyForm, dateAndTime: getCurrentDateTimeValue() }))
    const [error, setError] = useState('')
    const [successMessage, setSuccessMessage] = useState('')
    const [isScannerOpen, setIsScannerOpen] = useState(false)
    const [isPhotoCameraOpen, setIsPhotoCameraOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [signedInEmail, setSignedInEmail] = useState('')
    const [vehicleSuggestions, setVehicleSuggestions] = useState([])
    const [showSuggestions, setShowSuggestions] = useState(false)
    const [autofilledVehicleNumber, setAutofilledVehicleNumber] = useState(null)
    const [photoPreviewUrl, setPhotoPreviewUrl] = useState('')
    const [photoKey, setPhotoKey] = useState('')
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
    const [photoError, setPhotoError] = useState('')
    const nameRef = useRef(null)
    const galleryInputRef = useRef(null)

    useEffect(() => {
        getCurrentUserEmail().then(setSignedInEmail)
    }, [])

    // Search-as-you-type: once a few characters are typed, look up past
    // entries for this vehicle so a repeat visitor's details can be reused
    // instead of re-typed every visit. Debounced to avoid a request per
    // keystroke.
    useEffect(() => {
        const query = form.vehicleNumber.trim()
        const timer = setTimeout(() => {
            if (query.length < 4) {
                setVehicleSuggestions([])
                return
            }
            fetch(`${import.meta.env.VITE_API_BASE}?vehicleSearch=${encodeURIComponent(query)}`)
                .then((response) => response.json())
                .then((data) => setVehicleSuggestions(data.entries || []))
                .catch(() => setVehicleSuggestions([]))
        }, 400)
        return () => clearTimeout(timer)
    }, [form.vehicleNumber])

    const voice = useVoiceInput((field, text) => {
        setForm((prev) => {
            if (VOICE_APPEND_FIELDS.has(field) && prev[field]) {
                return { ...prev, [field]: `${prev[field]} ${text}` }
            }
            return { ...prev, [field]: text }
        })
        setSuccessMessage('')
    })

    const updateField = (field) => (e)=>{
        setForm({...form,[field]: e.target.value})
        setSuccessMessage('')
    }

    const renderVoiceButton = (field) => (
        <VoiceInputButton
            field={field}
            isSupported={voice.isSupported}
            isListening={voice.activeField === field}
            onStart={voice.start}
            onStop={voice.stop}
        />
    )

    const renderVoiceFeedback = (field) => {
        if (voice.activeField === field) return <span className="voice-feedback">🎤 Listening…</span>
        if (voice.isTranscribing && voice.lastField === field) {
            return <span className="voice-feedback">⏳ Transcribing…</span>
        }
        if (voice.error && voice.lastField === field) {
            return <span className="voice-feedback voice-feedback-error">{voice.error}</span>
        }
        return null
    }

    // If the plate is edited away from whatever was auto-filled (from a
    // suggestion or a scan), the previously-filled Name/Phone/etc. belongs
    // to a DIFFERENT vehicle now — clear them so a mismatched vehicle +
    // stale visitor's details can never be submitted together.
    const clearAutofilledFieldsIfStale = (newVehicleNumber, prevForm) => {
        if (!autofilledVehicleNumber || newVehicleNumber === autofilledVehicleNumber) {
            return prevForm
        }
        setAutofilledVehicleNumber(null)
        return {
            ...prevForm,
            name: '',
            phoneNumber: '',
            employeeNumber: '',
            comingFrom: '',
            whomToMeet: '',
            remarks: '',
        }
    }

    const handleVehicleNumberChange = (e) => {
        const formatted = formatVehicleNumber(e.target.value)
        setForm((prev) => clearAutofilledFieldsIfStale(formatted, { ...prev, vehicleNumber: formatted }))
        setSuccessMessage('')
    }

    const handleVehicleNumberDetected = (vehicleNumber) => {
        const formatted = formatVehicleNumber(vehicleNumber)
        setForm((prev) => clearAutofilledFieldsIfStale(formatted, { ...prev, vehicleNumber: formatted }))
        setSuccessMessage('')
        nameRef.current?.focus()
    }

    const handleSelectSuggestion = (entry) => {
        setForm({
            ...form,
            vehicleNumber: entry.VehicleNumber || form.vehicleNumber,
            name: entry.Name || '',
            phoneNumber: entry.PhoneNumber || '',
            employeeNumber: entry.EmployeeNumber || '',
            comingFrom: entry.ComingFrom || '',
            whomToMeet: entry.WhomToMeet || '',
            // Remarks are per-visit, not carried over from a past visit.
        })
        setAutofilledVehicleNumber(entry.VehicleNumber || null)
        setShowSuggestions(false)
        setVehicleSuggestions([])
    }

    const handlePhotoSelected = (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) uploadPhoto(file)
    }

    const uploadPhoto = async (file) => {
        setPhotoError('')
        setPhotoPreviewUrl(URL.createObjectURL(file))
        setIsUploadingPhoto(true)
        try {
            const formData = new FormData()
            formData.append('photo', file, file.name || 'vehicle.jpg')
            const response = await fetch(VEHICLE_PHOTO_FUNCTION_URL, { method: 'POST', body: formData })
            if (!response.ok) throw new Error('Upload failed')
            const data = await response.json()
            setPhotoKey(data.key)
        } catch (err) {
            console.error('Photo upload failed:', err)
            setPhotoError('Could not upload photo — try again.')
            setPhotoPreviewUrl('')
            setPhotoKey('')
        } finally {
            setIsUploadingPhoto(false)
        }
    }

    const handleRemovePhoto = () => {
        setPhotoPreviewUrl('')
        setPhotoKey('')
        setPhotoError('')
    }

    const handleSubmit = async (e) => {
    e.preventDefault()

    if (!form.vehicleNumber.trim()) {
        setError('Vehicle number is required.')
        setSuccessMessage('')
        return
    }

    if (isEmployee && !form.employeeNumber.trim()) {
        setError('Employee number is required.')
        setSuccessMessage('')
        return
    }

    if (!isEmployee && !form.name.trim()) {
        setError('Name is required.')
        setSuccessMessage('')
        return
    }

    if (!isEmployee && !form.phoneNumber.trim()) {
        setError('Phone number is required.')
        setSuccessMessage('')
        return
    }

    if (!isEmployee && !form.comingFrom.trim()) {
        setError('Coming from is required.')
        setSuccessMessage('')
        return
    }

    if (!isEmployee && !isVendor && !form.whomToMeet.trim()) {
        setError('Whom to meet is required.')
        setSuccessMessage('')
        return
    }

    setIsSubmitting(true)
    setError('')

    try {
        // Best-effort — if this fails, the entry still saves, it just won't
        // have CreatedByEmail attached (same as before this field existed).
        let authHeaders = {}
        try {
            const token = await getAuthToken()
            authHeaders = { Authorization: token }
        } catch {
            // Not signed in / token unavailable — proceed without it.
        }

        const response = await fetch(import.meta.env.VITE_API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({
                vehicleNumber: form.vehicleNumber,
                entryType: entryType,
                name: form.name,
                phoneNumber: form.phoneNumber,
                employeeNumber: form.employeeNumber,
                remarks: form.remarks,
                comingFrom: form.comingFrom,
                whomToMeet: form.whomToMeet,
                inTime: form.dateAndTime,
                guardNumber: getStoredGuardNumber(),
                vehiclePhotoKey: photoKey || null,
            })
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
            console.error('Entry save failed:', response.status, data)
            setError(`Could not save the entry (${response.status}): ${data.error || 'server error'}`)
            setSuccessMessage('')
            return
        }
        console.log('Saved:', data)
        const label = form.name.trim() || form.employeeNumber.trim() || form.vehicleNumber
        setSuccessMessage(`Entry added for ${label}.`)
        setForm({ ...emptyForm, dateAndTime: getCurrentDateTimeValue() })
        setAutofilledVehicleNumber(null)
        handleRemovePhoto()
    } catch (err) {
        console.error('Error submitting:', err)
        setError('Could not save the entry. Please check your connection and try again.')
    } finally {
        setIsSubmitting(false)
    }
}

    const handleClearForm = () => {
        setForm({ ...emptyForm, dateAndTime: getCurrentDateTimeValue() })
        setAutofilledVehicleNumber(null)
        setError('')
        setSuccessMessage('')
        handleRemovePhoto()
    }

    return(
        <div className="reg-page">
             <div className="reg-card">
                <h2 className="reg-title">{entryTypeLabel}</h2>
                <form onSubmit={handleSubmit}>

                <div className="vehicle-suggest-wrap">
                    <div className="reg-field">
                        <span className="reg-icon">🚗</span>
                        <input
                            className="reg-input"
                            type="text"
                            placeholder="Vehicle Number"
                            value={form.vehicleNumber}
                            onChange={handleVehicleNumberChange}
                            onFocus={() => setShowSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                            maxLength={13}
                        />
                    </div>
                    {showSuggestions && vehicleSuggestions.length > 0 && (
                        <ul className="vehicle-suggest-list">
                            {vehicleSuggestions.map((entry) => (
                                <li key={entry.ROWID}>
                                    <button
                                        type="button"
                                        className="vehicle-suggest-item"
                                        onMouseDown={() => handleSelectSuggestion(entry)}
                                    >
                                        <span className="vehicle-suggest-plate">{entry.VehicleNumber}</span>
                                        <span className="vehicle-suggest-name">
                                            {entry.Name || entry.EmployeeNumber || '—'}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <button className="reg-scan-btn" type="button" onClick={() => setIsScannerOpen(true)}>
                    📷&nbsp; Scan Vehicle Number
                </button>


                {isEmployee && (
                    <div>
                        <div className="reg-field">
                            <span className="reg-icon">🪪</span>
                            <input className="reg-input" type="text" placeholder="Employee Number" value={form.employeeNumber} onChange={updateField('employeeNumber')} />
                            {renderVoiceButton('employeeNumber')}
                        </div>
                        {renderVoiceFeedback('employeeNumber')}
                    </div>
                )}

                <div>
                    <div className="reg-field">
                        <span className="reg-icon">👤</span>
                        <input className="reg-input" type="text" ref={nameRef} placeholder={isEmployee ? 'Name (Optional)' : 'Full Name'} value={form.name} onChange={updateField('name')} />
                        {renderVoiceButton('name')}
                    </div>
                    {renderVoiceFeedback('name')}
                </div>

                {!isEmployee && (
                    <div>
                        <div className="reg-field">
                            <span className="reg-icon">📞</span>
                            <input className="reg-input" type="tel" placeholder="Phone Number" value={form.phoneNumber} onChange={updateField('phoneNumber')} />
                            {renderVoiceButton('phoneNumber')}
                        </div>
                        {renderVoiceFeedback('phoneNumber')}
                    </div>
                )}

                {!isEmployee && (
                    <div>
                        <div className="reg-field">
                            <span className="reg-icon">🏢</span>
                            <input className="reg-input" type="text" placeholder="Coming From" value={form.comingFrom} onChange={updateField('comingFrom')} />
                            {renderVoiceButton('comingFrom')}
                        </div>
                        {renderVoiceFeedback('comingFrom')}
                    </div>
                )}

                {!isEmployee && !isVendor && (
                    <div>
                        <div className="reg-field">
                            <span className="reg-icon">🧑‍💼</span>
                            <input className="reg-input" type="text" placeholder="Whom To Meet" value={form.whomToMeet} onChange={updateField('whomToMeet')} />
                            {renderVoiceButton('whomToMeet')}
                        </div>
                        {renderVoiceFeedback('whomToMeet')}
                    </div>
                )}

                <div>
                    <div className="reg-field reg-field-textarea">
                        <span className="reg-icon">📝</span>
                        <textarea className="reg-input" rows={3} placeholder="Remarks (Optional)" value={form.remarks} onChange={updateField('remarks')} />
                        {renderVoiceButton('remarks')}
                    </div>
                    {renderVoiceFeedback('remarks')}
                </div>

                <div className="reg-field">
                    <span className="reg-icon">🕐</span>
                    <input className="reg-input" type="datetime-local" value={form.dateAndTime} onChange={updateField('dateAndTime')} />
                </div>

                <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handlePhotoSelected}
                />
                <div className="reg-photo-section">
                    {photoPreviewUrl ? (
                        <div className="reg-photo-preview-wrap">
                            <img className="reg-photo-preview" src={photoPreviewUrl} alt="Vehicle" />
                            {isUploadingPhoto && <span className="reg-photo-status">Uploading…</span>}
                            <button className="reg-btn-clear" type="button" onClick={handleRemovePhoto} disabled={isUploadingPhoto}>Remove Photo</button>
                        </div>
                    ) : (
                        <div className="reg-photo-actions">
                            <button className="reg-scan-btn" type="button" onClick={() => galleryInputRef.current?.click()}>
                                🖼️&nbsp; Choose from Gallery
                            </button>
                            <button className="reg-scan-btn" type="button" onClick={() => setIsPhotoCameraOpen(true)}>
                                📷&nbsp; Take Photo (Optional)
                            </button>
                        </div>
                    )}
                    {photoError && <p className="form-error">{photoError}</p>}
                </div>

                {signedInEmail && (
                    <div className="reg-field">
                        <span className="reg-icon">✉️</span>
                        <input
                            className="reg-input"
                            type="text"
                            value={signedInEmail}
                            readOnly
                            disabled
                        />
                    </div>
                )}

                {error && <p className="form-error">{error}</p>}
                {successMessage && <p className="form-success">{successMessage}</p>}

                <div className="reg-actions">
                    <button className="reg-btn-clear" type="button" onClick={handleClearForm} disabled={isSubmitting}>CLEAR</button>
                    <button className="reg-btn-primary" type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'SUBMITTING…' : 'SUBMIT ENTRY ✓'}
                    </button>
                </div>
                <button className="btn-link btn-link-center" type="button" onClick={()=>{onNavigate('home')}}>Back to Home</button>
                </form>
             </div>
             {isPhotoCameraOpen && (
                <VehiclePhotoCamera
                    onCaptured={uploadPhoto}
                    onClose={() => setIsPhotoCameraOpen(false)}
                />
             )}
             {isScannerOpen && (
                <PlateRecognizerScanner
                    onDetected={handleVehicleNumberDetected}
                    onClose={() => setIsScannerOpen(false)}
                />
             )}
        </div>
    )
}
export default VehicleEntry;