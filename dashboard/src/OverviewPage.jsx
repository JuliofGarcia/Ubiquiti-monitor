import { useState, useEffect, useCallback, useRef } from "react";
import { fetchStats, fetchSites, fetchTraffic, fetchActivity, fetchDepartments, fetchAlerts } from "./api";
import StatsCards from "./components/StatsCards";
import TrafficChart from "./components/TrafficChart";
import ActivityChart from "./components/ActivityChart";
import SitesTable from "./components/SitesTable";
import SiteModal from "./components/SiteModal";

export default function OverviewPage({ onSiteSelect }) {
  const [stats, setStats] = useState(null);
  const [sites, setSites] = useState([]);
  const [traffic, setTraffic] = useState([]);
  const [activity, setActivity] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [modalSite, setModalSite] = useState(null);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const resizeRef = useRef(false);
  const ignoreNextOverlay = useRef(false);
  const [departments, setDepartments] = useState([]);
  const [allJuntas, setAllJuntas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [suggestions, setSuggestions] = useState([]);

  const [filters, setFilters] = useState({
    department: "",
    status: "",
    search: "",
    estado: "",
    health: "",
  });

  const [trafficRange, setTrafficRange] = useState("24h");
  const [activityRange, setActivityRange] = useState("168");

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const chartParams = { department: filters.department, estado: filters.estado };
      const [statsData, deptsData, trafficData, activityData, alertsData, sitesData] = await Promise.all([
        fetchStats(),
        fetchDepartments(),
        fetchTraffic(trafficRange, null, chartParams),
        fetchActivity(activityRange, null, chartParams),
        fetchAlerts(),
        fetchSites({
          department: filters.department,
          status: filters.status,
          search: filters.search,
          estado: filters.estado,
          health: filters.health,
        }),
      ]);
      setStats(statsData);
      setDepartments(deptsData);
      setTraffic(trafficData);
      setActivity(activityData);
      setAlerts(alertsData);
      setSites(sitesData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [filters, trafficRange, activityRange]);

  useEffect(() => {
    loadData(false);
    const interval = setInterval(() => loadData(true), 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    fetchSites({}).then((all) => setAllJuntas(all.map((s) => s.site_name).sort()));
  }, []);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const hasActiveFilters = filters.estado || filters.department || filters.health;
  const dropdownJuntas = hasActiveFilters
    ? [...new Set([...sites.map((s) => s.site_name), ...(filters.search ? [filters.search] : [])])].sort()
    : allJuntas;

  const totalDevices = sites.reduce((sum, s) => sum + (s.device_count || 0), 0);
  const onlineDevices = sites.reduce((sum, s) => sum + (s.devices_available || 0), 0);
  const totalAPs = sites.reduce((sum, s) => sum + (s.ap_count || 0), 0);
  const onlineAPs = sites.reduce((sum, s) => sum + (s.ap_online || 0), 0);
  const isSiteOnline = (s) => (s.ap_online || 0) > 0 || (s.ap_count === 0 && s.online);
  const opsSites = sites.filter((s) => s.estado === "Operación");

  const sitesOnlineTotal = sites.filter((s) => (s.ap_count > 0 && s.ap_online === s.ap_count) || (s.ap_count === 0 && s.online)).length;
  const sitesParcial = sites.filter((s) => (s.ap_count || 0) > 0 && (s.ap_online || 0) > 0 && (s.ap_online || 0) < (s.ap_count || 0)).length;
  const sitesCaidas = sites.filter((s) => (s.ap_count || 0) > 0 && (s.ap_online || 0) === 0).length;

  const opsOnlineTotal = opsSites.filter((s) => (s.ap_count || 0) > 0 && (s.ap_online || 0) === (s.ap_count || 0)).length;
  const opsParcial = opsSites.filter((s) => (s.ap_count || 0) > 0 && (s.ap_online || 0) > 0 && (s.ap_online || 0) < (s.ap_count || 0)).length;
  const opsCaidas = opsSites.filter((s) => (s.ap_count || 0) > 0 && (s.ap_online || 0) === 0).length;

  const filteredStats = {
    sites_total: sites.length,
    sites_online_total: sitesOnlineTotal,
    sites_parcial: sitesParcial,
    sites_caidas: sitesCaidas,
    ops_total: opsSites.length,
    ops_online_total: opsOnlineTotal,
    ops_parcial: opsParcial,
    ops_caidas: opsCaidas,
    aps_total: totalAPs,
    aps_online: onlineAPs,
    clients_total: totalDevices,
    clients_online: onlineDevices,
    clients_offline: Math.max(0, totalDevices - onlineDevices),
  };

  return (
    <>
      {error && <div className="alert alert-error">Error: {error}</div>}

      <div style={{ position: "relative", marginBottom: "16px" }}>
        <input
          type="text"
          className="site-search-input"
          placeholder="Buscar junta..."
          value={filters.search}
          onChange={(e) => {
            handleFilterChange("search", e.target.value);
            if (e.target.value) {
              const filtered = allJuntas.filter(j => j.toLowerCase().includes(e.target.value.toLowerCase()));
              setSuggestions(filtered);
            } else {
              setSuggestions([]);
            }
          }}
          onFocus={() => {
            if (filters.search) {
              const filtered = allJuntas.filter(j => j.toLowerCase().includes(filters.search.toLowerCase()));
              setSuggestions(filtered);
            }
          }}
          onBlur={() => setTimeout(() => setSuggestions([]), 200)}
        />
        {suggestions.length > 0 && (
          <ul style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            listStyle: "none",
            zIndex: 10,
            maxHeight: "200px",
            overflowY: "auto",
            marginTop: "4px"
          }}>
            {suggestions.map((j) => (
              <li
                key={j}
                onClick={() => {
                  handleFilterChange("search", j);
                  setSuggestions([]);
                }}
                style={{ padding: "8px 12px", cursor: "pointer", fontSize: "0.85rem" }}
                onMouseOver={(e) => e.target.style.background = "var(--bg-hover)"}
                onMouseOut={(e) => e.target.style.background = "transparent"}
              >
                {j}
              </li>
            ))}
          </ul>
        )}
      </div>

      <StatsCards stats={filteredStats} loading={loading} />

      {alerts.length > 0 && (
        <div className="alert alert-warning">
          <strong>{alerts.length} juntas en operación SIN conectividad:</strong>{" "}
          <span className="alert-list">
            {alerts.slice(0, 5).map((a) => (
              <span
                key={a.site_id}
                className="alert-tag"
                style={{ cursor: "pointer" }}
                onClick={() => setModalSite(a)}
                title={a.hours_down ? (typeof a.hours_down === "number" ? `${a.hours_down}h · Última: ${new Date(a.last_online).toLocaleString("es-CO")}` : a.hours_down) : ""}
              >
                {a.site_name}
                {a.hours_down && a.hours_down !== "sin registro" ? <small> ({a.hours_down}h)</small> : null}
              </span>
            ))}
            {alerts.length > 5 && (
              <span className="alert-tag alert-more" style={{ cursor: "pointer" }} onClick={() => setShowAllAlerts(true)}>
                +{alerts.length - 5} más
              </span>
            )}
          </span>
        </div>
      )}

      <div className="filter-bar">
        <div className="filter-group">
          <select value={filters.estado} onChange={(e) => handleFilterChange("estado", e.target.value)}>
            <option value="">Todas las juntas</option>
            <option value="Operación">En Operación</option>
            <option value="Implementación">En Implementación</option>
          </select>
               <select value={filters.department} onChange={(e) => handleFilterChange("department", e.target.value)}>
                 <option value="">Todos los departamentos</option>
                 {departments.map((d) => (<option key={d} value={d}>{d}</option>))}
               </select>
          <select value={filters.health} onChange={(e) => handleFilterChange("health", e.target.value)}>
            <option value="">Todo estado</option>
            <option value="caido">Totalmente caído</option>
            <option value="parcial">Parcial (≥1 online)</option>
            <option value="total">Total (todos online)</option>
          </select>
          <select value={filters.search} onChange={(e) => handleFilterChange("search", e.target.value)}>
            <option value="">Todas las juntas</option>
            {dropdownJuntas.map((n) => (<option key={n} value={n}>{n}</option>))}
          </select>
        </div>
        <button className="btn-refresh" onClick={() => loadData(false)} disabled={isRefreshing}>
          {isRefreshing ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      <TrafficChart data={traffic} range={trafficRange} onRangeChange={setTrafficRange} loading={loading} />
      <ActivityChart data={activity} range={activityRange} onRangeChange={setActivityRange} loading={loading} />
      <SitesTable sites={sites} onSelect={onSiteSelect} loading={loading} />

      <SiteModal site={modalSite} onClose={() => setModalSite(null)} />

      {showAllAlerts && (
        <div className="modal-overlay" onMouseUp={() => { if (resizeRef.current) { ignoreNextOverlay.current = true; } resizeRef.current = false; }} onClick={() => { if (!ignoreNextOverlay.current) setShowAllAlerts(false); ignoreNextOverlay.current = false; }}>
          <div className="modal-content" style={{ width: "720px", height: "auto", maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()} onMouseDown={() => { resizeRef.current = true; }}>
            <div className="modal-header" style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)", color: "white", borderRadius: "var(--radius) var(--radius) 0 0" }}>
              <h3 style={{ color: "white", margin: 0, fontSize: "1rem", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "1.2rem" }}>⚠️</span>
                Juntas sin conectividad ({alerts.length})
              </h3>
              <button className="modal-close" onClick={() => setShowAllAlerts(false)} style={{ color: "rgba(255,255,255,0.8)", fontSize: "1.5rem" }}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              <div style={{ maxHeight: "55vh", overflowY: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr style={{ background: "#fef2f2" }}>
                      <th style={{ padding: "10px 14px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "#991b1b", borderBottom: "2px solid #fecaca", textTransform: "uppercase", letterSpacing: "0.05em" }}>Junta</th>
                      <th style={{ padding: "10px 14px", textAlign: "left", fontSize: "12px", fontWeight: 600, color: "#991b1b", borderBottom: "2px solid #fecaca", textTransform: "uppercase", letterSpacing: "0.05em" }}>Departamento</th>
                      <th style={{ padding: "10px 14px", textAlign: "center", fontSize: "12px", fontWeight: 600, color: "#991b1b", borderBottom: "2px solid #fecaca", textTransform: "uppercase", letterSpacing: "0.05em" }}>APs</th>
                      <th style={{ padding: "10px 14px", textAlign: "center", fontSize: "12px", fontWeight: 600, color: "#991b1b", borderBottom: "2px solid #fecaca", textTransform: "uppercase", letterSpacing: "0.05em" }}>Caída</th>
                      <th style={{ padding: "10px 14px", textAlign: "center", fontSize: "12px", fontWeight: 600, color: "#991b1b", borderBottom: "2px solid #fecaca", textTransform: "uppercase", letterSpacing: "0.05em" }}>Última Conexión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((a, i) => (
                      <tr key={a.site_id} style={{ cursor: "pointer", background: i % 2 === 0 ? "white" : "#fef2f2", transition: "background 0.15s" }} onClick={() => { setShowAllAlerts(false); setModalSite(a); }} onMouseEnter={e => e.target.style.background = "#fee2e2"} onMouseLeave={e => e.target.style.background = i % 2 === 0 ? "white" : "#fef2f2"}>
                        <td style={{ padding: "10px 14px", fontWeight: 500, color: "#111827", borderBottom: "1px solid #f3f4f6" }}>{a.site_name}</td>
                        <td style={{ padding: "10px 14px", color: "#6b7280", borderBottom: "1px solid #f3f4f6" }}>{a.department || "—"}</td>
                        <td style={{ padding: "10px 14px", textAlign: "center", borderBottom: "1px solid #f3f4f6" }}>
                          <span style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: "999px", fontSize: "12px", fontWeight: 600 }}>
                            {a.ap_online || 0}/{a.ap_total || 0}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#dc2626", fontWeight: 600, borderBottom: "1px solid #f3f4f6" }}>
                          {(() => {
                            const getDiff = (lastOnline) => {
                              if (!lastOnline || lastOnline === "0001-01-01T00:00:00Z") return "—";
                              const lastDate = new Date(lastOnline);
                              const now = new Date();
                              const diffMs = now - lastDate;
                              if (diffMs < 0) return "—";
                              const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                              const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                              return `${diffHours}h ${diffMinutes}m`;
                            };

                            if (typeof a.hours_down === "number") {
                              return a.hours_down >= 1
                                ? `${Math.floor(a.hours_down)}h ${Math.round((a.hours_down % 1) * 60)}m`
                                : `${Math.round(a.hours_down * 60)}m`;
                            }
                            return getDiff(a.last_online);
                          })()}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center", color: "#6b7280", fontSize: "13px", borderBottom: "1px solid #f3f4f6" }}>{a.last_online && a.last_online !== "0001-01-01T00:00:00Z" ? new Date(a.last_online).toLocaleString("es-CO") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        Actualizado: {new Date().toLocaleTimeString("es-CO")}
        {loading && " · Cargando..."}
      </footer>
    </>
  );
}
