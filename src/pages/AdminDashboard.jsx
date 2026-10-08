import {useState, useEffect} from 'react'
import { parseEntryDateTime, formatTimeDisplay, formatDateDisplay, getEntryIdentifier } from '../utils'

function AdminDashboard({onNavigate}){
    const [entries, setEntries] = useState([])
    const [entryTypeFilter, setEntryTypeFilter] = useState("all")
    const [statusFilter, setStatusFilter] = useState("all")
    const [searchQuery, setSearchQuery] = useState("")
    const [dateFilter, setDateFilter] = useState("")
    const [viewedPhotoEntry, setViewedPhotoEntry] = useState(null)

    useEffect(() => {
        fetch(import.meta.env.VITE_API_BASE, { credentials: 'include' })
            .then(response => response.json())
            .then(data => setEntries(data.entries))
    }, [])

    const total = entries.length
    const inCount = entries.filter((entry)=>entry.Status==='IN').length
    const outCount = entries.filter((entry)=>entry.Status==='OUT').length

    const todayLabel = new Date().toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    })

    const filteredEntries = entries.filter((entry) => {
        if (entryTypeFilter !== 'all' && entry.EntryType !== entryTypeFilter) {
            return false
        }
        if (statusFilter !== 'all' && entry.Status !== statusFilter) {
            return false
        }
        if (!entry.VehicleNumber || !entry.VehicleNumber.toLowerCase().includes(searchQuery.toLowerCase())) {
            return false
        }
        if (dateFilter && (!entry.InTime || !entry.InTime.startsWith(dateFilter))) {
            return false
        }
        return true
    })

    return (
        <div className="admin-dashboard">
            <div className="admin-banner">
                <span className="dashboard-banner-icon">🚗</span>
                <div className="dashboard-banner-text">
                    <span className="dashboard-banner-title">Lancor Entrance</span>
                    <span className="dashboard-banner-subtitle">Admin Dashboard — Desktop View</span>
                </div>
                <span className="dashboard-date-pill">📅 {todayLabel}</span>
            </div>

            <div className="admin-quick-actions">
                <button className="btn-primary" type="button" onClick={()=>onNavigate('in','employee')}>🧑‍💼 Employee Entry</button>
                <button className="btn-primary" type="button" onClick={()=>onNavigate('in','visitor')}>🙋 Visitor Entry</button>
                <button className="btn-primary" type="button" onClick={()=>onNavigate('in','vendor')}>🚚 Vendor Entry</button>
                <button className="btn-secondary" type="button" onClick={()=>onNavigate('out')}>🚗 Vehicle OUT</button>
            </div>

            <div className="summary-grid admin-summary-grid">
                <div className="summary-card">
                    <span className="summary-icon">👥</span>
                    <span className="summary-value">{total}</span>
                    <span className="summary-label">Total</span>
                </div>
                <div className="summary-card summary-card-in">
                    <span className="summary-icon">⬇️</span>
                    <span className="summary-value">{inCount}</span>
                    <span className="summary-label">IN</span>
                </div>
                <div className="summary-card summary-card-out">
                    <span className="summary-icon">⬆️</span>
                    <span className="summary-value">{outCount}</span>
                    <span className="summary-label">OUT</span>
                </div>
            </div>

            <div className="admin-toolbar">
                <div className="search-field admin-search-field">
                    <span className="search-field-icon">🔍</span>
                    <input
                    className="search-input search-input-pill"
                    type="text"
                    placeholder="Search Vehicle Number"
                    value={searchQuery}
                    onChange={(e)=>setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="date-field-wrap admin-date-field">
                    <input
                    type="date"
                    value={dateFilter}
                    onChange={(e)=>setDateFilter(e.target.value)}
                    />
                    {!dateFilter && <span className="date-field-overlay">Date</span>}
                </div>
                {dateFilter && (
                    <button className="btn-link" type="button" onClick={()=>setDateFilter("")}>Clear date</button>
                )}

                <div className="filter-section admin-filter-section">
                    <span className="filter-group-label dashboard-filter-label">Type</span>
                    <div className="filter-group">
                        <button className={`filter-pill ${entryTypeFilter==='all' ? 'filter-pill-active' : ''}`} onClick={()=>setEntryTypeFilter('all')}>All Types</button>
                        <button className={`filter-pill ${entryTypeFilter==='employee' ? 'filter-pill-active' : ''}`} onClick={()=>setEntryTypeFilter('employee')}>Employee</button>
                        <button className={`filter-pill ${entryTypeFilter==='visitor' ? 'filter-pill-active' : ''}`} onClick={()=>setEntryTypeFilter('visitor')}>Visitor</button>
                        <button className={`filter-pill ${entryTypeFilter==='vendor' ? 'filter-pill-active' : ''}`} onClick={()=>setEntryTypeFilter('vendor')}>Vendor</button>
                    </div>
                </div>
                <div className="filter-section admin-filter-section">
                    <span className="filter-group-label dashboard-filter-label">Status</span>
                    <div className="filter-group">
                        <button className={`filter-pill ${statusFilter==='all' ? 'filter-pill-active' : ''}`} onClick={()=>setStatusFilter('all')}>All Status</button>
                        <button className={`filter-pill ${statusFilter==='IN' ? 'filter-pill-active' : ''}`} onClick={()=>setStatusFilter('IN')}>IN</button>
                        <button className={`filter-pill ${statusFilter==='OUT' ? 'filter-pill-active' : ''}`} onClick={()=>setStatusFilter('OUT')}>OUT</button>
                    </div>
                </div>
            </div>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Time In</th>
                            <th>Vehicle No.</th>
                            <th>Type</th>
                            <th>Name / Emp No.</th>
                            <th>Entered By</th>
                            <th>Status</th>
                            <th>Time Out</th>
                            <th>Out By</th>
                            <th>Remarks</th>
                            <th>Photo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredEntries.map((entry)=>{
                            const inDate = parseEntryDateTime(entry.InTime)
                            const outDate = parseEntryDateTime(entry.OutTime)
                            return (
                                <tr key={entry.ROWID}>
                                    <td>{formatDateDisplay(inDate)}</td>
                                    <td>{formatTimeDisplay(inDate)}</td>
                                    <td className="admin-cell-vehicle">{entry.VehicleNumber}</td>
                                    <td className="admin-cell-capitalize">{entry.EntryType}</td>
                                    <td>{getEntryIdentifier(entry) || '—'}</td>
                                    <td>{entry.CreatedByEmail || '—'}</td>
                                    <td>
                                        <span className={`status-badge status-${entry.Status.toLowerCase()}`}>{entry.Status}</span>
                                    </td>
                                    <td>{entry.Status === 'OUT' ? formatTimeDisplay(outDate) : '—'}</td>
                                    <td>{entry.Status === 'OUT' ? (entry.OutByEmail || '—') : '—'}</td>
                                    <td className="admin-cell-remarks">{entry.Remarks || '—'}</td>
                                    <td>
                                        {entry.VehiclePhotoUrl ? (
                                            <button type="button" className="out-photo-thumb-btn" onClick={()=>setViewedPhotoEntry(entry)}>
                                                <img className="out-photo-thumb" src={entry.VehiclePhotoUrl} alt="Vehicle" />
                                            </button>
                                        ) : '—'}
                                    </td>
                                </tr>
                            )
                        })}
                        {filteredEntries.length === 0 && (
                            <tr>
                                <td colSpan={11} className="admin-empty-row">No entries match these filters.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {viewedPhotoEntry && (
                <div className="photo-viewer-overlay" role="dialog" aria-modal="true" onClick={()=>setViewedPhotoEntry(null)}>
                    <div className="photo-viewer-panel" onClick={(e)=>e.stopPropagation()}>
                        <img className="photo-viewer-img" src={viewedPhotoEntry.VehiclePhotoUrl} alt="Vehicle" />
                        <p className="photo-viewer-caption">{viewedPhotoEntry.VehicleNumber}</p>
                        <div className="scanner-actions">
                            <button type="button" className="btn-secondary" onClick={()=>setViewedPhotoEntry(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
export default AdminDashboard;
