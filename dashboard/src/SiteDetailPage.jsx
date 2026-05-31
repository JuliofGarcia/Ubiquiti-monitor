import { useState, useEffect, useCallback } from "react";
import { fetchTraffic, fetchActivity, fetchDevices, fetchSiteDevices, fetchSites, toggleEstado } from "./api";
import TrafficChart from "./components/TrafficChart";
import ActivityChart from "./components/ActivityChart";
import DevicesTable from "./components/DevicesTable";

export default function SiteDetailPage({ site, onBack }) {
  const [currentSite, setCurrentSite] = useState(site);
  const [traffic, setTraffic] = useState([]);
  const [activity, setActivity] = useState([]);
  const [devices, setDevices] = useState([]);
  const [deviceStats, setDeviceStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trafficRange, setTrafficRange] = useState("24h");
  const [activityRange, setActivityRange] = useState("168");

  const loadData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const codeMatch = currentSite.site_name?.match(/^(\d+)/);
      const code = codeMatch ? codeMatch[1] : "";
      const sid = currentSite.site_id;
      console.log("DEBUG: Loading data for site:", sid, code);
      const [trafficData, activityData, devicesData, statsData, siteData] = await Promise.all([
        fetchTraffic(trafficRange, sid),
        fetchActivity(activityRange, sid),
        fetchDevices({ site_id: sid }),
        fetchSiteDevices(sid),
        code ? fetchSites({ search: code }) : Promise.resolve([]),
      ]);
      setTraffic(trafficData);
      setActivity(activityData);
      setDevices(devicesData);
      setDeviceStats(statsData);
      if (siteData.length > 0) setCurrentSite(siteData[0]);
    } catch (err) {
      console.error("DEBUG: Error loading data:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentSite.site_id, currentSite.site_name, trafficRange, activityRange]);

  useEffect(() => {
    loadData(false);
    const interval = setInterval(() => loadData(true), 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  return (
    <>
      {error && <div className="alert alert-error">Error: {error}</div>}

      <button className="btn-back" onClick={onBack}>
        ← Volver al panel general
      </button>

      <div className="site-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2>{currentSite.site_name}</h2>
            <div className="site-meta">
              <span>Zona: {currentSite.zone || "—"}</span>
              <span>Depto: {currentSite.department || "—"}</span>
              <span>Etapa: <span className={`badge ${currentSite.estado === "Operación" ? "badge-active" : ""}`}>{currentSite.estado || "—"}</span></span>
              {currentSite.fecha_inicio && <span>Inicio: {currentSite.fecha_inicio}</span>}
            </div>
          </div>
              <button
                className={`btn-toggle ${currentSite.estado === "Operación" ? "btn-toggle-op" : "btn-toggle-impl"}`}
                onClick={async () => {
                  const match = currentSite.site_name?.match(/^(\d+)/);
                  const code = match ? match[1] : "";
                  if (!code) {
                    console.error("No se pudo obtener el código de la junta.");
                    return;
                  }
                  const newEstado = currentSite.estado === "Operación" ? "Implementación" : "Operación";
                  try {
                    await toggleEstado(code, newEstado);
                    // Actualizar el estado local inmediatamente para que el botón refleje el cambio
                    setCurrentSite(prev => ({ ...prev, estado: newEstado }));
                    loadData(false);
                  } catch (err) {
                    console.error("Error al cambiar estado:", err);
                  }
                }}
              >

            {currentSite.estado === "Operación" ? "Pasar a Implementación" : "Pasar a Operación"}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ color: "var(--green)" }}>●</div>
          <div className="stat-info">
            <span className="stat-label">Hogares LB5 Online</span>
            <span className="stat-value" style={{ color: "var(--green)" }}>
              {deviceStats?.hogares_online ?? "..."}
            </span>
            <span className="stat-total">de {deviceStats?.hogares_total ?? "..."}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: "var(--red)" }}>○</div>
          <div className="stat-info">
            <span className="stat-label">Hogares LB5 Offline</span>
            <span className="stat-value" style={{ color: "var(--red)" }}>
              {deviceStats?.hogares_offline ?? "..."}
            </span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: "var(--blue)" }}>▲</div>
          <div className="stat-info">
            <span className="stat-label">APs Online</span>
            <span className="stat-value" style={{ color: "var(--blue)" }}>
              {deviceStats?.aps_online ?? "..."}
            </span>
            <span className="stat-total">de {deviceStats?.aps_total ?? "..."}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: "var(--text-muted)" }}>◆</div>
          <div className="stat-info">
            <span className="stat-label">Total Dispositivos</span>
            <span className="stat-value">
              {(deviceStats?.hogares_total ?? 0) + (deviceStats?.aps_total ?? 0)}
            </span>
            <span className="stat-total">LB5 + APs</span>
          </div>
        </div>
      </div>

      <TrafficChart
        data={traffic}
        range={trafficRange}
        onRangeChange={setTrafficRange}
        loading={loading}
        title={`Tráfico - ${currentSite.site_name}`}
      />

      <ActivityChart
        data={activity}
        range={activityRange}
        onRangeChange={setActivityRange}
        loading={loading}
        title={`Actividad - ${currentSite.site_name}`}
      />

      <DevicesTable devices={devices} loading={loading} />

      <footer className="footer">
        Actualizado: {new Date().toLocaleTimeString("es-CO")}
        {loading && " · Cargando..."}
      </footer>
    </>
  );
}
