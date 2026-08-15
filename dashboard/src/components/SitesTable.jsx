import { useState } from "react";

const PAGE_SIZE = 15;

export default function SitesTable({ sites, onSelect, loading }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(sites.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const paged = sites.slice(start, start + PAGE_SIZE);

  const getStatusBadge = (site) => {
    if (site.online) {
      return <span className="badge badge-active">Online</span>;
    }
    const status = site.status || "";
    if (status === "unknown") {
      return <span className="badge badge-warning">Desconocido</span>;
    }
    if (status === "disconnected") {
      return <span className="badge badge-inactive">Desconectado</span>;
    }
    return <span className="badge badge-inactive">Offline</span>;
  };

  const getHealthBadge = (site) => {
    const h = site.health || "";
    if (h === "total") return <span className="badge badge-active">Total</span>;
    if (h === "parcial") return <span className="badge badge-warning">Parcial</span>;
    if (h === "caido") return <span className="badge badge-inactive">Caído</span>;
    return <span className="badge">—</span>;
  };

  const downloadExcel = (e, siteId) => {
    e.stopPropagation();
    const token = localStorage.getItem("token");
    const url = `/api/report/excel?site_id=${siteId}`;
    
    fetch(url, {
      headers: { "Authorization": `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error("Error al descargar");
        return res.blob();
      })
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Reporte_Site_${siteId}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(err => alert("Error descargando reporte: " + err.message));
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span>APs / Juntas</span>
        <span className="panel-sub">{sites.length} encontrados · Click para ver detalle</span>
        {totalPages > 1 && (
          <div className="pagination">
            <button className="page-btn" disabled={page === 0} onClick={() => setPage(page - 1)}>←</button>
            <span className="page-info">
              {start + 1}-{Math.min(start + PAGE_SIZE, sites.length)} de {sites.length}
            </span>
            <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>→</button>
          </div>
        )}
      </div>
      <div className="panel-body">
        {loading && sites.length === 0 ? (
          <div className="chart-placeholder" style={{ height: 60 }}>Cargando...</div>
        ) : sites.length === 0 ? (
          <div className="chart-placeholder" style={{ height: 60 }}>Sin APs para los filtros seleccionados</div>
        ) : (
          <table>
            <thead>
               <tr>
                 <th>Nombre</th>
                  <th>Departamento</th>
                 <th>Estado</th>
                 <th>Etapa</th>
                 <th>Est. APs</th>
                 <th>Clientes</th>
                 <th>Online</th>
                 <th>Caídos</th>
                 <th>Reporte</th>
               </tr>
            </thead>
            <tbody>
              {paged.map((site) => (
                <tr
                  key={site.site_id}
                  onClick={() => { onSelect(site); setPage(0); }}
                  style={{ cursor: "pointer" }}
                >
                  <td title={site.site_id}>
                    {site.site_name}
                    {site.fecha_inicio && <small style={{ color: "var(--text-muted)", marginLeft: 6 }}>{site.fecha_inicio}</small>}
                  </td>
                   <td>{site.department || "—"}</td>
                  <td>{getStatusBadge(site)}</td>
                  <td>
                    <span className={site.estado === "Operación" ? "badge badge-active" : "badge"}>
                      {site.estado || "Impl."}
                    </span>
                  </td>
                  <td>{getHealthBadge(site)}</td>
                  <td>{site.device_count}</td>
                  <td>{site.devices_available}</td>
                   <td>{site.device_outage_count}</td>
                   <td>
                     <button 
                       className="btn-refresh" 
                       style={{ padding: "4px 8px", fontSize: "11px" }}
                       onClick={(e) => downloadExcel(e, site.site_id)}
                     >
                       Excel
                     </button>
                   </td>
                 </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
