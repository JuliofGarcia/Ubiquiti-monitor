import { useState, useEffect, useCallback, useRef } from "react";
import { fetchTraffic, fetchActivity, fetchDevices, fetchSiteDevices, fetchSites, toggleEstado, fetchExcelReport } from "./api";
import TrafficChart from "./components/TrafficChart";
import ActivityChart from "./components/ActivityChart";
import DevicesTable from "./components/DevicesTable";

export default function SiteDetailPage({ site, onBack, role }) {
  const [currentSite, setCurrentSite] = useState(site);
  const [traffic, setTraffic] = useState([]);
  const [activity, setActivity] = useState([]);
  const [devices, setDevices] = useState([]);
  const [deviceStats, setDeviceStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trafficRange, setTrafficRange] = useState("24h");
  const [activityRange, setActivityRange] = useState("168");
  const [showFechaModal, setShowFechaModal] = useState(false);
  const resizeRef = useRef(false);
  const ignoreNextOverlay = useRef(false);
  const [pendingEstado, setPendingEstado] = useState(null);
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().split('T')[0]);

  const loadData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const code = currentSite.inred_code;
      const sid = currentSite.site_id;
      const [trafficData, activityData, devicesData, statsData, siteData] = await Promise.all([
        fetchTraffic(trafficRange, sid),
        fetchActivity(activityRange, sid),
        fetchDevices({ site_id: sid }),
        fetchSiteDevices(sid),
        (code && code !== "unknown") ? fetchSites({ search: code }) : Promise.resolve([]),
      ]);
      setTraffic(trafficData);
      setActivity(activityData);
      setDevices(devicesData);
      setDeviceStats(statsData);
      if (siteData.length > 0) setCurrentSite(siteData[0]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentSite.site_id, currentSite.inred_code, trafficRange, activityRange]);

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
               <span>Departamento: {currentSite.department || "—"}</span>
              <span>Grupo: <span className={`badge ${currentSite.grupo && currentSite.grupo !== "Sin grupo" ? "badge-active" : ""}`}>{currentSite.grupo || "Sin grupo"}</span></span>
              <span>TK abiertos: {currentSite.tickets_abiertos > 0 ? (
                <span className="badge badge-inactive">{(currentSite.tickets_num || []).join(", ") || currentSite.tickets_abiertos}</span>
              ) : "—"}</span>
              <span>Etapa: <span className={`badge ${currentSite.estado === "Operación" ? "badge-active" : ""}`}>{currentSite.estado || "—"}</span></span>
              {currentSite.fecha_inicio && <span>Inicio: {currentSite.fecha_inicio}</span>}
            </div>
          </div>
        <div style={{ display: "flex", gap: 8 }}>
           <button 
             className="btn-refresh" 
             onClick={async () => {
               try {
                 const res = await fetchExcelReport(currentSite.site_id);
                 const blob = await res.blob();
                 const url = window.URL.createObjectURL(blob);
                 const a = document.createElement("a");
                 a.href = url;
                 a.download = `Reporte_${currentSite.site_name}.xlsx`;
                 document.body.appendChild(a);
                 a.click();
                 window.URL.revokeObjectURL(url);
                 a.remove();
               } catch (err) {
                 console.error("Error downloading Excel:", err);
                 alert("Error al descargar el reporte Excel");
               }
             }}
             style={{
               padding: "8px 16px",
               borderRadius: "6px",
               fontWeight: "bold",
               cursor: "pointer",
               backgroundColor: "#16a34a",
               color: "white",
               border: "none"
             }}
           >
             Exportar Excel

          </button>
            {role === "admin" && (
              <button
                className={`btn-toggle ${currentSite.estado === "Operación" ? "btn-toggle-op" : "btn-toggle-impl"}`}
                onClick={() => {
                const code = currentSite.inred_code;
                if (!code || code === "unknown") {
                  console.error("No se pudo obtener el código de la junta.");
                  return;
                }
                const newEstado = currentSite.estado === "Operación" ? "Implementación" : "Operación";
                if (newEstado === "Operación") {
                  setPendingEstado(newEstado);
                  setFechaInicio(new Date().toISOString().split('T')[0]);
                  setShowFechaModal(true);
                } else {
                  (async () => {
                    try {
                      await toggleEstado(code, newEstado);
                      setCurrentSite(prev => ({ ...prev, estado: newEstado }));
                      loadData(false);
                    } catch (err) {
                      console.error("Error al cambiar estado:", err);
                    }
                  })();
                }
              }}
            >
             {currentSite.estado === "Operación" ? "Pasar a Implementación" : "Pasar a Operación"}
           </button>
            )}
        </div>
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

      {showFechaModal && (
        <div className="modal-overlay" onMouseUp={() => { if (resizeRef.current) { ignoreNextOverlay.current = true; } resizeRef.current = false; }} onClick={() => { if (!ignoreNextOverlay.current) setShowFechaModal(false); ignoreNextOverlay.current = false; }}>
          <div className="modal-content" style={{ width: "auto", height: "auto", padding: "24px", maxWidth: "420px", overflow: "auto" }} onClick={e => e.stopPropagation()} onMouseDown={() => { resizeRef.current = true; }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ margin: 0 }}>Fecha de Inicio de Operación</h3>
              <button className="modal-close" onClick={() => setShowFechaModal(false)}>×</button>
            </div>
            <p>Ingrese la fecha en que <strong>{currentSite.site_name}</strong> inició operación:</p>
            <input
              type="date"
              value={fechaInicio}
              onChange={e => setFechaInicio(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #ccc",
                width: "100%",
                boxSizing: "border-box",
                marginTop: "8px",
                fontSize: "14px"
              }}
            />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
              <button
                onClick={() => setShowFechaModal(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  cursor: "pointer",
                  fontSize: "14px",
                  color: "#374151",
                  fontWeight: 500
                }}
                onMouseEnter={e => e.target.style.background = "#f3f4f6"}
                onMouseLeave={e => e.target.style.background = "#f9fafb"}
              >
                Cancelar
              </button>
              <button
                className="btn-refresh"
                onClick={async () => {
                  try {
                    await toggleEstado(currentSite.inred_code, pendingEstado, fechaInicio);
                    setCurrentSite(prev => ({ ...prev, estado: pendingEstado, fecha_inicio: fechaInicio }));
                    setShowFechaModal(false);
                    loadData(false);
                  } catch (err) {
                    console.error("Error al cambiar estado:", err);
                    alert("Error al cambiar estado");
                  }
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#2563eb",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                Guardar
              </button>
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
