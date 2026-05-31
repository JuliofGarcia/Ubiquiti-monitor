import { useState, useEffect } from "react";
import { fetchSiteDevices } from "../api";

export default function SiteModal({ site, onClose }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (site?.site_id) {
      fetchSiteDevices(site.site_id).then(setStats).catch(() => {});
    }
  }, [site?.site_id]);

  if (!site) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{site.site_name}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="modal-grid">
            <div className="modal-item"><strong>Zona:</strong> {site.zone || "—"}</div>
            <div className="modal-item"><strong>Departamento:</strong> {site.department || "—"}</div>
            <div className="modal-item"><strong>Etapa:</strong> <span className={`badge ${site.estado === "Operación" ? "badge-active" : ""}`}>{site.estado || "—"}</span></div>
            <div className="modal-item"><strong>Inicio Operación:</strong> {site.fecha_inicio || "—"}</div>
            <div className="modal-item"><strong>Horas caído:</strong> {(() => {
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

              if (site.hours_down !== undefined && typeof site.hours_down === 'number') {
                return site.hours_down >= 1
                  ? `${Math.floor(site.hours_down)}h ${Math.round((site.hours_down % 1) * 60)}m`
                  : `${Math.round(site.hours_down * 60)}m`;
              }
              return getDiff(site.last_online);
            })()}</div>
            <div className="modal-item"><strong>Última conexión:</strong> {site.last_online && site.last_online !== "0001-01-01T00:00:00Z" ? new Date(site.last_online).toLocaleString("es-CO") : "—"}</div>
            <div className="modal-item"><strong>Online:</strong> {site.online ? "Sí" : "No"}</div>
            <div className="modal-item"><strong>Total Clientes:</strong> {site.device_count || 0}</div>
            <div className="modal-item"><strong>Clientes Online:</strong> {site.devices_available || 0}</div>
            <div className="modal-item"><strong>Clientes Offline:</strong> {site.device_outage_count ?? (site.device_count || 0) - (site.devices_available || 0)}</div>
            <div className="modal-item"><strong>Access Point:</strong> {(site.ap_online || 0)} / {(site.ap_total || site.ap_count || 0)}</div>
            <div className="modal-item"><strong>Tráfico Rx:</strong> {Number(site.download_capacity || 0).toFixed(4)}</div>
            <div className="modal-item"><strong>Tráfico Tx:</strong> {Number(site.upload_capacity || 0).toFixed(4)}</div>
          </div>
          {stats && (
            <div className="modal-stats">
              <hr />
              <div className="modal-grid">
                <div className="modal-item"><strong>Hogares Online:</strong> {stats.hogares_online} / {stats.hogares_total}</div>
                <div className="modal-item"><strong>Hogares Offline:</strong> {stats.hogares_offline}</div>
                <div className="modal-item"><strong>APs Online:</strong> {stats.aps_online} / {stats.aps_total}</div>
                <div className="modal-item"><strong>APs Offline:</strong> {stats.aps_offline}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
