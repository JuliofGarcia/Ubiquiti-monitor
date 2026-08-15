import { useState, useEffect } from "react";
import OverviewPage from "./OverviewPage";
import SiteDetailPage from "./SiteDetailPage";
import ReportsPage from "./ReportsPage";
import PreventivosPage from "./PreventivosPage";
import TicketsPage from "./TicketsPage";
import LoginPage from "./components/LoginPage";
import UserManagementPage from "./components/UserManagementPage";
 
export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem("token"));
  const [role, setRole] = useState(localStorage.getItem("role"));
  const [userName, setUserName] = useState(localStorage.getItem("user_name"));
  const [page, setPage] = useState("overview");
  const [selectedSite, setSelectedSite] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
 
  const handleLogin = () => {
    setIsAuthenticated(true);
    setRole(localStorage.getItem("role"));
    setUserName(localStorage.getItem("user_name"));
  };
 
  if (!isAuthenticated) return <LoginPage onLogin={handleLogin} />;
 
  const handleSiteSelect = (site) => {
    setSelectedSite(site);
    setPage("site");
  };
 
  const handleBack = () => {
    setPage("overview");
    setSelectedSite(null);
  };
 
  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
    setRole(null);
    setUserName(null);
  };
 
  return (
    <div className="app-container">
      <aside className={`sidebar ${isSidebarOpen ? "open" : "closed"}`}>
        <div className="sidebar-logo">
          <img src="/images/logo-Inred.png" alt="Logo" className="sidebar-logo-img" />
          <h1>Inred Monitor</h1>
        </div>
        
        <nav className="sidebar-nav">
          <div className="nav-section">
            <span className="nav-label">Principal</span>
            <button
              className={`nav-item ${page === "overview" ? "nav-item-active" : ""}`}
              onClick={() => { setPage("overview"); setSelectedSite(null); }}
            >
              <span className="nav-icon">📊</span> Panel General
            </button>
            {selectedSite && (
              <button
                className={`nav-item ${page === "site" ? "nav-item-active" : ""}`}
                onClick={() => setPage("site")}
              >
                <span className="nav-icon">📍</span> {selectedSite.site_name || "Detalle"}
              </button>
            )}
             <button
               className={`nav-item ${page === "reports" ? "nav-item-active" : ""}`}
               onClick={() => setPage("reports")}
             >
               <span className="nav-icon">📁</span> Reportes
             </button>
             <button
               className={`nav-item ${page === "preventivos" ? "nav-item-active" : ""}`}
               onClick={() => setPage("preventivos")}
             >
               <span className="nav-icon">🛠️</span> Preventivos
             </button>
             <button
               className={`nav-item ${page === "tickets" ? "nav-item-active" : ""}`}
               onClick={() => setPage("tickets")}
             >
               <span className="nav-icon">🎫</span> Reportes TK
             </button>
             {role === "admin" && (

              <button
                className={`nav-item ${page === "users" ? "nav-item-active" : ""}`}
                onClick={() => setPage("users")}
              >
                <span className="nav-icon">👥</span> Usuarios
              </button>
            )}
          </div>
        </nav>
        
        <div className="sidebar-footer">
          <button onClick={handleLogout} className="logout-btn">
            <span className="nav-icon">🚪</span> Cerrar Sesión
          </button>
        </div>
      </aside>
 
      <main className="main-content">
        <header className="main-header">
          <button className="hamburger-menu" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            ☰
          </button>
          <div className="header-right">
            <div className="user-profile">
              <span className="user-name">{userName}</span>
              <span className={`role-badge ${role === "admin" ? "badge-admin" : "badge-viewer"}`}>
                {role === "admin" ? "Administrador" : "Consultor"}
              </span>
            </div>
          </div>
        </header>
 
        <div className="page-container">
          {page === "overview" && <OverviewPage onSiteSelect={handleSiteSelect} role={role} />}
          {page === "site" && selectedSite && (
            <SiteDetailPage site={selectedSite} onBack={handleBack} />
          )}
           {page === "reports" && <ReportsPage role={role} />}
           {page === "preventivos" && <PreventivosPage role={role} />}
           {page === "tickets" && <TicketsPage role={role} />}
           {page === "users" && role === "admin" && <UserManagementPage />}

        </div>
      </main>
    </div>
  );
}
