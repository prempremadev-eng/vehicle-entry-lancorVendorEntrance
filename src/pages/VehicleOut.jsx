import {useState, useEffect, useRef} from 'react'
import { formatDateDisplay, formatDuration, formatTimeDisplay, getCurrentDateTimeValue, getEntryIdentifier, parseEntryDateTime } from '../utils'
import { getAuthToken } from '../auth'
import { VEHICLE_PHOTO_FUNCTION_URL } from '../constants'
import VehiclePhotoCamera from '../components/VehiclePhotoCamera'

const TICK_INTERVAL_MS = 60 * 1000

function VehicleOut({onNavigate}) {
    const [entries, setEntries] = useState([])
    const [now, setNow] = useState(() => Date.now())
    const [searchQuery, setSearchQuery] = useState("")
    const [dateFilter, setDateFilter] = useState("")
    const [editingRowId, setEditingRowId] = useState(null)
    const [editingText, setEditingText] = useState("")
    const [isSavingRemarks, setIsSavingRemarks] = useState(false)
    const [tapHint, setTapHint] = useState(null)
    const tapTrackerRef = useRef({ rowId: null, count: 0, timer: null })
    const [photoUploadingRowId, setPhotoUploadingRowId] = useState(null)
    const [photoErrorRowId, setPhotoErrorRowId] = useState(null)
    const [isPhotoCameraOpen, setIsPhotoCameraOpen] = useState(false)
    const [viewedPhotoEntry, setViewedPhotoEntry] = useState(null)
    const galleryInputRef = useRef(null)
    const pendingPhotoRowIdRef = useRef(null)

    useEffect(() => {
        fetch(import.meta.env.VITE_API_BASE, { credentials: 'include' })
            .then(response => response.json())
            .then(data => {
                const parkedEntries = data.entries.filter((entry) => entry.Status === 'IN')
                setEntries(parkedEntries)
            })
    }, [])

    // Keeps "Parked for" advancing live without a manual refresh.
    useEffect(() => {
        const tick = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS)
        return () => clearInterval(tick)
    }, [])

    const filteredEntries = entries.filter((entry) => {
        if (searchQuery && !(entry.VehicleNumber && entry.VehicleNumber.toLowerCase().includes(searchQuery.toLowerCase()))) {
            return false
        }
        if (dateFilter && (!entry.InTime || !entry.InTime.startsWith(dateFilter))) {
            return false
        }
        return true
    })

    const todayLabel = new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })

    const handleMarkOut = async (id) => {
        // Best-effort — if this fails, the mark-out still proceeds, it just
        // won't have OutByEmail attached.
        let authHeaders = {}
        try {
            const token = await getAuthToken()
            authHeaders = { Authorization: token }
        } catch {
            // Not signed in / token unavailable — proceed without it.
        }

        fetch(import.meta.env.VITE_API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ rowId: id, outTime: getCurrentDateTimeValue() })
        })
        .then(response => response.json())
        .then(() => {
            setEntries(entries.filter((entry) => entry.ROWID !== id))
        })
    }

    const openRemarksEditor = (entry) => {
        setEditingRowId(entry.ROWID)
        setEditingText(entry.Remarks || "")
    }

    // Existing remarks are shown prominently, so a single accidental brush of
    // the card would otherwise open the editor. Requiring 3 taps within a
    // short window makes opening it a deliberate gesture instead.
    const REMARKS_TAP_THRESHOLD = 3
    const REMARKS_TAP_RESET_MS = 1500

    const handleRemarksTap = (entry) => {
        const tracker = tapTrackerRef.current
        if (tracker.rowId !== entry.ROWID) {
            tracker.rowId = entry.ROWID
            tracker.count = 0
        }
        tracker.count += 1
        clearTimeout(tracker.timer)

        if (tracker.count >= REMARKS_TAP_THRESHOLD) {
            tracker.rowId = null
            tracker.count = 0
            setTapHint(null)
            openRemarksEditor(entry)
            return
        }

        setTapHint({ rowId: entry.ROWID, remaining: REMARKS_TAP_THRESHOLD - tracker.count })
        tracker.timer = setTimeout(() => {
            tracker.rowId = null
            tracker.count = 0
            setTapHint(null)
        }, REMARKS_TAP_RESET_MS)
    }

    const handleCancelRemarks = () => {
        setEditingRowId(null)
        setEditingText("")
    }

    const handleSaveRemarks = async (id) => {
        setIsSavingRemarks(true)
        let authHeaders = {}
        try {
            const token = await getAuthToken()
            authHeaders = { Authorization: token }
        } catch {
            // Not signed in / token unavailable — proceed without it.
        }

        try {
            await fetch(import.meta.env.VITE_API_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ rowId: id, updateRemarks: true, remarks: editingText.trim() })
            })
            setEntries(entries.map((entry) => (
                entry.ROWID === id ? { ...entry, Remarks: editingText.trim() } : entry
            )))
            setEditingRowId(null)
            setEditingText("")
        } finally {
            setIsSavingRemarks(false)
        }
    }

    const handlePhotoButtonClick = (entry, fromGallery = false) => {
        pendingPhotoRowIdRef.current = entry.ROWID
        if (fromGallery) galleryInputRef.current?.click()
        else setIsPhotoCameraOpen(true)
    }

    const handlePhotoFileSelected = (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (file) uploadPhoto(file)
    }

    const uploadPhoto = async (file) => {
        const rowId = pendingPhotoRowIdRef.current
        if (!file || !rowId) return

        setPhotoErrorRowId(null)
        setPhotoUploadingRowId(rowId)
        try {
            const formData = new FormData()
            formData.append('photo', file, file.name || 'vehicle.jpg')
            formData.append('rowId', rowId)
            const response = await fetch(VEHICLE_PHOTO_FUNCTION_URL, { method: 'POST', body: formData })
            if (!response.ok) throw new Error('Upload failed')
            const data = await response.json()
            setEntries((prev) => prev.map((entry) => (
                entry.ROWID === rowId ? { ...entry, VehiclePhotoKey: data.key, VehiclePhotoUrl: data.url } : entry
            )))
        } catch (err) {
            console.error('Photo upload failed:', err)
            setPhotoErrorRowId(rowId)
        } finally {
            setPhotoUploadingRowId(null)
        }
    }

  return (
    <div className="reg-page">
      <div className="reg-card">
        <h2 className="reg-title">Vehicle OUT</h2>
        <p className="out-subline">{todayLabel} · {filteredEntries.length} parked</p>

        <div className="date-field">
          <div className="date-field-wrap">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
            {!dateFilter && <span className="date-field-overlay">Date</span>}
          </div>
          {dateFilter && (
            <button className="btn-link" type="button" onClick={() => setDateFilter("")}>Clear date</button>
          )}
        </div>

        <div className="reg-field">
          <span className="reg-icon">🔍</span>
          <input
            className="reg-input"
            type="text"
            placeholder="Search Vehicle Number"
            value={searchQuery}
            onChange={(e)=>setSearchQuery(e.target.value)}
          />
        </div>

        {filteredEntries.length === 0 && <p className="empty-state">No vehicles currently parked.</p>}

        {viewedPhotoEntry && (
          <div className="photo-viewer-overlay" role="dialog" aria-modal="true" onClick={() => setViewedPhotoEntry(null)}>
            <div className="photo-viewer-panel" onClick={(e) => e.stopPropagation()}>
              <img className="photo-viewer-img" src={viewedPhotoEntry.VehiclePhotoUrl} alt="Vehicle" />
              <p className="photo-viewer-caption">{viewedPhotoEntry.VehicleNumber}</p>
              <div className="scanner-actions">
                <button type="button" className="btn-primary" onClick={() => {
                  handlePhotoButtonClick(viewedPhotoEntry)
                  setViewedPhotoEntry(null)
                }}>
                  Retake Photo
                </button>
                <button type="button" className="btn-secondary" onClick={() => setViewedPhotoEntry(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {isPhotoCameraOpen && (
          <VehiclePhotoCamera
            onCaptured={uploadPhoto}
            onClose={() => setIsPhotoCameraOpen(false)}
          />
        )}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handlePhotoFileSelected}
        />

        <div className="out-rows">
          {filteredEntries.map((entry) => {
            const inDate = parseEntryDateTime(entry.InTime)
            const elapsedMs = inDate ? now - inDate.getTime() : 0
            return (
              <div className="out-row" key={entry.ROWID}>
                <div className="out-row-top">
                  <span className="out-row-vehicle">{entry.VehicleNumber}</span>
                  <span className="out-row-type">{entry.EntryType}</span>
                </div>
                <div className="out-row-meta">
                  {getEntryIdentifier(entry) || '—'} &nbsp;·&nbsp; 🕐 {formatTimeDisplay(inDate)} {formatDateDisplay(inDate)}
                </div>
                {entry.CreatedByEmail && (
                  <div className="out-row-meta">✉️ Entered by: {entry.CreatedByEmail}</div>
                )}
                {editingRowId === entry.ROWID ? (
                  <div className="out-row-meta">
                    <textarea
                      className="reg-input"
                      rows={2}
                      placeholder="e.g. Long stay, admin approved"
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      autoFocus
                    />
                    <div className="reg-actions">
                      <button className="reg-btn-clear" type="button" onClick={handleCancelRemarks} disabled={isSavingRemarks}>Cancel</button>
                      <button className="reg-btn-primary" type="button" onClick={() => handleSaveRemarks(entry.ROWID)} disabled={isSavingRemarks}>
                        {isSavingRemarks ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : entry.Remarks ? (
                  <div
                    className="out-row-meta remarks-highlight"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleRemarksTap(entry)}
                  >
                    📝 {entry.Remarks}
                    {entry.CREATEDTIME && entry.MODIFIEDTIME && entry.CREATEDTIME !== entry.MODIFIEDTIME && (
                      <span className="remarks-edited-badge">✏️ Edited</span>
                    )}
                    {tapHint && tapHint.rowId === entry.ROWID && (
                      <div className="remarks-tap-hint">Tap {tapHint.remaining} more time{tapHint.remaining > 1 ? 's' : ''} to edit</div>
                    )}
                  </div>
                ) : (
                  <div
                    className="out-row-meta remarks-add"
                    role="button"
                    tabIndex={0}
                    onClick={() => openRemarksEditor(entry)}
                  >
                    📝 + Add remark
                  </div>
                )}
                <div className="out-row-meta out-row-photo">
                  {entry.VehiclePhotoUrl ? (
                    <button type="button" className="out-photo-thumb-btn" onClick={() => setViewedPhotoEntry(entry)}>
                      <img className="out-photo-thumb" src={entry.VehiclePhotoUrl} alt="Vehicle" />
                      {photoUploadingRowId === entry.ROWID && <span className="reg-photo-status">Uploading…</span>}
                    </button>
                  ) : (
                    <div className="out-photo-actions">
                      <button type="button" className="remarks-add" onClick={() => handlePhotoButtonClick(entry, true)} disabled={photoUploadingRowId === entry.ROWID}>
                        🖼️ Gallery
                      </button>
                      <button type="button" className="remarks-add" onClick={() => handlePhotoButtonClick(entry)} disabled={photoUploadingRowId === entry.ROWID}>
                        📷 {photoUploadingRowId === entry.ROWID ? 'Uploading…' : '+ Add photo'}
                      </button>
                    </div>
                  )}
                  {photoErrorRowId === entry.ROWID && <span className="voice-feedback-error">Photo upload failed — try again.</span>}
                </div>
                <div className="out-row-bottom">
                  <span className="out-row-duration">Parked for: {formatDuration(elapsedMs)}</span>
                  <button className="reg-btn-primary out-row-btn" onClick={()=>{handleMarkOut(entry.ROWID)}}>Mark OUT</button>
                </div>
              </div>
            )
          })}
        </div>

        <button className="btn-link btn-link-center" type="button" onClick={()=>onNavigate('home')}>Back to Home</button>
      </div>
    </div>
  )
}
export default VehicleOut