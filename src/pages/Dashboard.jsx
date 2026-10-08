import {useState, useEffect} from 'react'

function Dashboard({onNavigate}){
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
        <div className="dashboard">
            <div className="dashboard-banner">
                <span className="dashboard-banner-icon">🚗</span>
                <div className="dashboard-banner-text">
                    <span className="dashboard-banner-title">Lancor Entrance</span>
                    <span className="dashboard-banner-subtitle">Secure Premises, Safer Tomorrow</span>
                </div>
                <span className="dashboard-banner-avatar">👤</span>
            </div>

            <div className="dashboard-title-row">
                <h2 className="section-title dashboard-title">Dashboard</h2>
                <span className="dashboard-date-pill">📅 {todayLabel}</span>
            </div>

            <div className="summary-grid">
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

            <div className="date-field">
                <div className="date-field-wrap">
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
            </div>

            <div className="search-field">
                <span className="search-field-icon">🔍</span>
                <input
                className="search-input search-input-pill"
                type="text"
                placeholder="Search Vehicle Number"
                value={searchQuery}
                onChange={(e)=>setSearchQuery(e.target.value)}
                />
            </div>

        <div className="filter-section">
            <span className="filter-group-label">Type</span>
            <div className="filter-group">
                <button className={`filter-pill ${entryTypeFilter==='all' ? 'filter-pill-active' : ''}`} onClick={()=>setEntryTypeFilter('all')}>All Types</button>
                <button className={`filter-pill ${entryTypeFilter==='employee' ? 'filter-pill-active' : ''}`} onClick={()=>setEntryTypeFilter('employee')}>Employee</button>
                <button className={`filter-pill ${entryTypeFilter==='visitor' ? 'filter-pill-active' : ''}`} onClick={()=>setEntryTypeFilter('visitor')}>Visitor</button>
                <button className={`filter-pill ${entryTypeFilter==='vendor' ? 'filter-pill-active' : ''}`} onClick={()=>setEntryTypeFilter('vendor')}>Vendor</button>
            </div>
        </div>
        <div className="filter-section">
            <span className="filter-group-label">Status</span>
            <div className="filter-group">
                <button className={`filter-pill ${statusFilter==='all' ? 'filter-pill-active' : ''}`} onClick={()=>setStatusFilter('all')}>All Status</button>
                <button className={`filter-pill ${statusFilter==='IN' ? 'filter-pill-active' : ''}`} onClick={()=>setStatusFilter('IN')}>IN</button>
                <button className={`filter-pill ${statusFilter==='OUT' ? 'filter-pill-active' : ''}`} onClick={()=>setStatusFilter('OUT')}>OUT</button>
            </div>
        </div>
            <ul className="record-list">
                {filteredEntries.map((entry)=>(
                    <li className="record-card" key={entry.ROWID}>
                        <div className="record-card-row">
                            <span className="record-vehicle">{entry.VehicleNumber}</span>
                            <span className={`status-badge status-${entry.Status.toLowerCase()}`}>{entry.Status}</span>
                        </div>
                        <div className="record-card-meta">{entry.EntryType}</div>
                        {entry.CreatedByEmail && (
                            <div className="record-card-meta">✉️ Entered by: {entry.CreatedByEmail}</div>
                        )}
                        {entry.Status === 'OUT' && entry.OutByEmail && (
                            <div className="record-card-meta">✉️ Out by: {entry.OutByEmail}</div>
                        )}
                        {entry.Remarks && (
                            <div className="record-card-meta remarks-highlight">📝 {entry.Remarks}</div>
                        )}
                        {entry.InTime && (
                            <div className="record-card-meta">🕐 {entry.InTime}</div>
                        )}
                        {entry.VehiclePhotoUrl && (
                            <button type="button" className="out-photo-thumb-btn" onClick={()=>setViewedPhotoEntry(entry)}>
                                <img className="out-photo-thumb" src={entry.VehiclePhotoUrl} alt="Vehicle" />
                            </button>
                        )}
                    </li>
                ))}
            </ul>
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
            <button className="btn-link" onClick={()=>onNavigate('admin')}>🖥️ Open Desktop Admin View</button>
            <button className="btn-link" onClick={()=>onNavigate('home')}>Back To Home</button>
        </div>
    )
}
export default Dashboard;
