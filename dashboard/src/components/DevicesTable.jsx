import { useState } from "react";

const PAGE_SIZE = 15;

export default function DevicesTable({ devices, loading }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(devices.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const paged = devices.slice(start, start + PAGE_SIZE);

  const formatTime = (isoString) => {
    if (!isoString) return "—";
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    
    // Formato amigable en lenguaje humano
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return "Hace un momento";
    if (diffInSeconds < 3600) return `Hace ${Math.floor(diffInSeconds / 60)} min`;
    if (diffInSeconds < 86400) return `Hace ${Math.floor(diffInSeconds / 3600)} h`;
    return date.toLocaleDateString("es-CO", { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const getStatusBadge = (dev) => {
    // Si la última conexión es muy antigua, consideramos offline
    const lastSeen = new Date(dev.last_seen);
    const now = new Date();
    const diffMinutes = (now - lastSeen) / 60000;
    
    // Si no hay last_seen, es desconectado
    if (!dev.last_seen) return <span className="badge badge-inactive">Offline</span>;
    
    // Si hace más de 15 minutos que no reporta, está offline
    if (diffMinutes > 15) return <span className="badge badge-inactive">Offline</span>;

    const status = (dev.status || "").toLowerCase();
    if (status === "active" || status === "connected") {
      return <span className="badge badge-active">Online</span>;
    }
    
    return <span className="badge badge-inactive">Offline</span>;
  };

  const getSignalBar = (dBm) => {
    const val = Number(String(dBm || "-100").replace(",", "."));
    if (isNaN(val)) return "—";
    const pct = Math.min(100, Math.max(0, ((val + 100) / 60) * 100));
    const color = val >= -65 ? "var(--green)" : val >= -75 ? "var(--orange)" : "var(--red)";
    return (
      <span className="signal-bar">
        <span className="signal-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
        <span className="signal-value">{val.toFixed(0)} dBm</span>
      </span>
    );
  };

  const formatVal = (val, suffix) => {
    const n = Number(val);
    return n ? `${n}${suffix}` : "—";
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Dispositivos Cliente</span>
        <span className="panel-sub">{devices.length} encontrados</span>
        {totalPages > 1 && (
          <div className="pagination">
            <button className="page-btn" disabled={page === 0} onClick={() => setPage(page - 1)}>←</button>
            <span className="page-info">
              {start + 1}-{Math.min(start + PAGE_SIZE, devices.length)} de {devices.length}
            </span>
            <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>→</button>
          </div>
        )}
      </div>
      <div className="panel-body">
        {loading && devices.length === 0 ? (
          <div className="chart-placeholder" style={{ height: 60 }}>Cargando...</div>
        ) : devices.length === 0 ? (
          <div className="chart-placeholder" style={{ height: 60 }}>Sin dispositivos</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Modelo</th>
                <th>IP</th>
                <th>MAC</th>
                <th>Estado</th>
                <th>Señal</th>
                <th>Descarga</th>
                <th>Carga</th>
                <th>Última Conexión</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((device) => (
                <tr key={device.device_id}>
                  <td title={device.device_id}>{device.device_name || "—"}</td>
                  <td>{device.device_model || "—"}</td>
                  <td>{device.ip_address || "—"}</td>
                  <td>{device.mac_address || "—"}</td>
                  <td>{getStatusBadge(device)}</td>
                  <td>{getSignalBar(device.signal_strength)}</td>
                  <td>{formatVal(device.rx_throughput, " Mbps")}</td>
                  <td>{formatVal(device.tx_throughput, " Mbps")}</td>
                  <td>{formatTime(device.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
