import { useState, useEffect } from "react";

const PAGE_SIZE = 15;

export default function ReportsPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetch("/api/report")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const paged = data.slice(start, start + PAGE_SIZE);

  const exportCSV = () => {
    const rows = [["Zona", "Departamento", "Sites Online", "Sites Total", "Clientes Online", "Clientes Total"]];
    data.forEach((z) => {
      rows.push([z.zone, z.department, z.sites_online, z.total_sites, z.clients_online, z.total_clients]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDetailCSV = () => {
    const rows = [["Zona", "Depto", "Site", "Online", "Clientes", "Clientes Online", "Descarga", "Carga"]];
    data.forEach((z) => {
      z.sites.forEach((s) => {
        rows.push([z.zone, z.department, s.name, s.online ? "Si" : "No", s.clients, s.clients_online, s.download, s.upload]);
      });
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte_detalle_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="chart-placeholder">Cargando reporte...</div>;

  return (
    <div>
      <div className="panel">
        <div className="panel-header">
          <span>Reporte por Zona/Departamento</span>
          <span className="panel-sub">{data.length} zonas</span>
          {totalPages > 1 && (
            <div className="pagination">
              <button className="page-btn" disabled={page === 0} onClick={() => setPage(page - 1)}>←</button>
              <span className="page-info">{start + 1}-{Math.min(start + PAGE_SIZE, data.length)} de {data.length}</span>
              <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>→</button>
            </div>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn-refresh" onClick={exportCSV}>Exportar Resumen CSV</button>
            <button className="btn-refresh" onClick={exportDetailCSV}>Exportar Detalle CSV</button>
          </div>
        </div>
        <div className="panel-body table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Zona</th>
                <th>Departamento</th>
                <th>Sites Online</th>
                <th>Sites Total</th>
                <th>Clientes Online</th>
                <th>Clientes Total</th>
                <th>Disponibilidad</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((z, i) => (
                <tr key={i}>
                  <td><strong>{z.zone}</strong></td>
                  <td>{z.department}</td>
                  <td><span className="badge badge-active">{z.sites_online}</span></td>
                  <td>{z.total_sites}</td>
                  <td><span className="badge badge-active">{z.clients_online}</span></td>
                  <td>{z.total_clients}</td>
                  <td>
                    {z.total_sites > 0
                      ? ((z.sites_online / z.total_sites) * 100).toFixed(0) + "%"
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="footer">Reporte generado: {new Date().toLocaleString("es-CO")}</footer>
    </div>
  );
}
