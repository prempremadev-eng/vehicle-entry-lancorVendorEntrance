function Home({onNavigate}){
    return (
        <div className="home">
        <h2 className="section-title">Lancor Entrance</h2>
        <div className="nav-grid">
        <button className="card card-span-2" onClick={()=>{onNavigate('in','employee')}}>
            <span className="card-icon">🧑‍💼</span>
            <span className="card-title">Employee Without Sticker</span>
        </button>
        <button className="card" onClick={()=>{onNavigate('in','visitor')}}>
            <span className="card-icon">🙋</span>
            <span className="card-title">Visitor</span>
        </button>
        <button className="card" onClick={()=>{onNavigate('in','vendor')}}>
            <span className="card-icon">🚚</span>
            <span className="card-title">Vendor</span>
        </button>
        <button className="card card-span-2" onClick={()=>{onNavigate('out')}}>
            <span className="card-icon">🚗</span>
            <span className="card-title">Vehicle OUT</span>
        </button>
        <button className="card card-span-2" onClick={()=>{onNavigate('entries')}}>
            <span className="card-icon">📋</span>
            <span className="card-title">Dashboard</span>
        </button>
        </div>
        </div>
    )
}
export default Home;