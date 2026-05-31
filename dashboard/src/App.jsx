import { useState, useEffect } from "react";
import OverviewPage from "./OverviewPage";
import SiteDetailPage from "./SiteDetailPage";
import ReportsPage from "./ReportsPage";
import LoginPage from "./components/LoginPage";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem("token"));
  const [page, setPage] = useState("overview");
  const [selectedSite, setSelectedSite] = useState(null);

  if (!isAuthenticated) return <LoginPage onLogin={() => setIsAuthenticated(true)} />;

  const handleSiteSelect = (site) => {
    setSelectedSite(site);
    setPage("site");
  };

  const handleBack = () => {
    setPage("overview");
    setSelectedSite(null);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setIsAuthenticated(false);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>DashBoard Inred</h1>
        <span className="header-sub">Proyecto Juntas de Internet</span>
        <button style={{ marginLeft: "auto" }} onClick={handleLogout}>Cerrar Sesión</button>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${page === "overview" ? "tab-active" : ""}`}
          onClick={() => { setPage("overview"); setSelectedSite(null); }}
        >
          Panel General
        </button>
        {selectedSite && (
          <button
            className={`tab ${page === "site" ? "tab-active" : ""}`}
            onClick={() => setPage("site")}
          >
            {selectedSite.site_name || "Detalle"}
          </button>
        )}
        <button
          className={`tab ${page === "reports" ? "tab-active" : ""}`}
          onClick={() => setPage("reports")}
        >
          Reportes
        </button>
      </nav>

      {page === "overview" && <OverviewPage onSiteSelect={handleSiteSelect} />}
      {page === "site" && selectedSite && (
        <SiteDetailPage site={selectedSite} onBack={handleBack} />
      )}
      {page === "reports" && <ReportsPage />}
    </div>
  );
}
