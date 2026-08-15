import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const PAGE_SIZE = 15;
const JUNTAS_PAGE_SIZE = 20;

const SEGUIMIENTO_COLORS = {
  "DESCRIPCIÓN": "#2563eb",
  "DESCRIPCION": "#2563eb",
  "CIERRE": "#16a34a",
  "SOLUCIÓN": "#7c3aed",
  "SOLUCION": "#7c3aed",
  "ASIGNACIÓN": "#f97316",
  "ASIGNACION": "#f97316",
};

export default function TicketsPage({ role }) {
  const [stats, setStats] = useState(null);
  const [months, setMonths] = useState([]);
  const [listData, setListData] = useState([]);
  const [total, setTotal] = useState(0);
  const [juntas, setJuntas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [departments, setDepartments] = useState([]);
  const [source, setSource] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [juntasPage, setJuntasPage] = useState(1);
  const [chartMetric, setChartMetric] = useState("indisp");
  const [chartLimit, setChartLimit] = useState(15);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [filters, setFilters] = useState({
    from: "2026-01-01",
    to: "",
    department: "all",
    junta: "all",
    estado: "all",
    tipo: "all",
    search: "",
  });

  const buildQuery = (extra = {}) => {
    const query = new URLSearchParams();
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
    if (filters.department !== "all") query.set("department", filters.department);
    if (filters.junta !== "all") query.set("junta", filters.junta);
    if (filters.estado !== "all") query.set("estado", filters.estado);
    if (filters.tipo !== "all") query.set("tipo", filters.tipo);
    if (filters.search) query.set("search", filters.search);
    Object.entries(extra).forEach(([k, v]) => { if (v) query.set(k, v); });
    return query;
  };

  const fetchData = async () => {
    setLoading(true);
    setCurrentPage(1);
    setJuntasPage(1);
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("token")}` };

      const resStats = await fetch(`/api/tickets/stats?${buildQuery()}`, { headers });
      const statsResult = await resStats.json();
      if (statsResult.error) throw new Error(statsResult.error);
      setStats(statsResult);
      setDepartments(statsResult.departments || []);

      const resMonths = await fetch(`/api/tickets/months?${buildQuery()}`, { headers });
      const monthsResult = await resMonths.json();
      if (Array.isArray(monthsResult)) setMonths(monthsResult);

      const resList = await fetch(`/api/tickets?${buildQuery({ page: 1, page_size: PAGE_SIZE })}`, { headers });
      const listResult = await resList.json();
      if (listResult.error) throw new Error(listResult.error);
      setListData(listResult.items || []);
      setTotal(listResult.total || 0);
      setSource(listResult.source || "");

      const resJuntas = await fetch(`/api/tickets/juntas?${buildQuery()}`, { headers });
      const juntasResult = await resJuntas.json();
      if (Array.isArray(juntasResult)) setJuntas(juntasResult);
    } catch (e) {
      console.error("Error fetching tickets:", e);
      alert(e.message || "Error al cargar los tickets");
    } finally {
      setLoading(false);
    }
  };

  const fetchPage = async (page) => {
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("token")}` };
      const res = await fetch(`/api/tickets?${buildQuery({ page, page_size: PAGE_SIZE })}`, { headers });
      const result = await res.json();
      if (!result.error) {
        setListData(result.items || []);
        setCurrentPage(page);
      }
    } catch (e) {
      console.error("Error fetching page:", e);
    }
  };

  const openDetail = async (row) => {
    setDetailLoading(true);
    setDetail(row);
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("token")}` };
      const res = await fetch(`/api/tickets/${row["#Ticket"]}`, { headers });
      const result = await res.json();
      if (!result.error) setDetail(result);
    } catch (e) {
      console.error("Error fetching detail:", e);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm(`¿Cargar el archivo "${file.name}" como fuente de tickets? Se reemplazará el actual.`)) {
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/tickets/upload", {
        method: "POST",
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` },
        body: formData,
      });
      const result = await res.json();
      if (result.ok) {
        alert("Archivo de tickets cargado correctamente");
        await fetchData();
      } else {
        alert("Error: " + result.error);
      }
    } catch (err) {
      console.error("Error uploading:", err);
      alert("No se pudo cargar el archivo");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const exportToExcel = async () => {
    try {
      const response = await fetch(`/api/tickets/excel?${buildQuery()}`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (!response.ok) throw new Error("Error al descargar el reporte");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Reporte_Tickets_JUNTAS_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error("Error exporting to Excel:", e);
      alert("No se pudo exportar el reporte");
    }
  };

  const cards = [
    { label: "Total Tickets", value: stats?.total ?? "-", color: "var(--green)", icon: "🎫" },
    { label: "Abiertos", value: stats?.abiertos ?? "-", color: "var(--orange)", icon: "◉" },
    { label: "Cerrados", value: stats?.cerrados ?? "-", color: "var(--green)", icon: "✓" },
    { label: "Anulados", value: stats?.anulados ?? "-", color: "var(--red)", icon: "✕" },
    { label: "MTTR Promedio (h)", value: stats?.mttr_horas ?? "-", color: "#2563eb", icon: "⏱" },
    { label: "Indisp. Bruta (h)", value: stats?.indisponibilidad_bruta_horas ?? "-", color: "var(--red)", icon: "▼" },
    { label: "Indisp. Neta (h)", value: stats?.indisponibilidad_neta_horas ?? "-", color: "var(--orange)", icon: "≈" },
    { label: "Horas Parada", value: stats?.horas_parada ?? "-", color: "#7c3aed", icon: "⏸" },
  ];

  const fmtHours = (h) => {
    if (h === null || h === undefined) return "—";
    return `${Number(h).toLocaleString("es-CO", { maximumFractionDigits: 2 })} h`;
  };

  const topJuntas = juntas.slice(0, chartLimit).map(j => ({
    name: j.name,
    code: j.code,
    tickets: j.total,
    indisp: j.indisp_neta_horas,
    indisp_bruta: j.indisp_bruta_horas,
    incidentes: j.incidentes,
  }));

  const CHART_METRICS = {
    indisp: { key: "indisp", label: "Horas indisponibilidad neta", color: "#ef4444" },
    indisp_bruta: { key: "indisp_bruta", label: "Horas indisponibilidad bruta", color: "#f97316" },
    tickets: { key: "tickets", label: "Cantidad de tickets", color: "#2c6a9c" },
    incidentes: { key: "incidentes", label: "Cantidad de incidentes", color: "#7c3aed" },
  };
  const activeMetric = CHART_METRICS[chartMetric] || CHART_METRICS.indisp;

  const fmtDate = (iso) => iso ? iso.slice(0, 16).replace("T", " ") : "—";

  return (
    <div>
      <div className="panel">
        <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Reportes de Tickets - Proyecto JUNTAS</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {source && <span style={{ fontSize: 12, color: "#888" }}>Fuente: {source}</span>}
            {role === "admin" && (
              <button className="btn-refresh" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                style={{ backgroundColor: "#7c3aed", color: "white", border: "none", padding: "8px 14px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}>
                {uploading ? "Cargando..." : "📤 Cargar Excel"}
              </button>
            )}
            <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={handleUpload} />
            <button className="btn-refresh" onClick={exportToExcel}>Exportar Reporte Excel</button>
          </div>
        </div>

        <div className="stats-grid stats-grid-8" style={{ padding: "0 20px" }}>
          {cards.map((card) => (
            <div key={card.label} className="stat-card">
              <div className="stat-icon" style={{ color: card.color }}>{card.icon}</div>
              <div className="stat-info">
                <span className="stat-label">{card.label}</span>
                <span className="stat-value" style={{ color: card.color }}>
                  {loading ? "..." : card.value}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="filter-bar" style={{
          display: "flex", gap: "12px", margin: "20px", flexWrap: "wrap", alignItems: "center",
          backgroundColor: "var(--panel-bg, #f8f9fa)", padding: "15px", borderRadius: "8px",
          border: "1px solid #ddd", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.05)", width: "calc(100% - 40px)"
        }}>
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>Desde</label>
            <input type="date" value={filters.from}
              style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", marginLeft: 6 }}
              onChange={e => setFilters({ ...filters, from: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>Hasta</label>
            <input type="date" value={filters.to}
              style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", marginLeft: 6 }}
              onChange={e => setFilters({ ...filters, to: e.target.value })} />
          </div>
          <select className="filter-select" style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", minWidth: "200px", cursor: "pointer" }}
            value={filters.department} onChange={e => setFilters({ ...filters, department: e.target.value })}>
            <option value="all">Todos los departamentos</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="filter-select" style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", minWidth: "220px", cursor: "pointer" }}
            value={filters.junta} onChange={e => setFilters({ ...filters, junta: e.target.value })}>
            <option value="all">Todas las juntas</option>
            {juntas.map(j => <option key={j.code} value={j.code}>{j.name}</option>)}
          </select>
          <select className="filter-select" style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", minWidth: "130px", cursor: "pointer" }}
            value={filters.estado} onChange={e => setFilters({ ...filters, estado: e.target.value })}>
            <option value="all">Todos los estados</option>
            <option value="Abierto">Abiertos</option>
            <option value="Cerrado">Cerrados</option>
            <option value="Anulado">Anulados</option>
          </select>
          <select className="filter-select" style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", minWidth: "150px", cursor: "pointer" }}
            value={filters.tipo} onChange={e => setFilters({ ...filters, tipo: e.target.value })}>
            <option value="all">Todos los tipos</option>
            <option value="incidente">Incidentes</option>
            <option value="peticion">Peticiones</option>
          </select>
          <input type="text" placeholder="Buscar ticket, junta, municipio..." value={filters.search}
            style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", minWidth: "220px" }}
            onChange={e => setFilters({ ...filters, search: e.target.value })} />
          <button className="btn-refresh" onClick={fetchData} style={{
            padding: "8px 20px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer",
            backgroundColor: "#2563eb", color: "white", border: "none"
          }}>
            Aplicar Filtros
          </button>
        </div>
      </div>

      <div className="panel" style={{ marginTop: "20px" }}>
        <div className="panel-header">Tendencia Mensual de Tickets</div>
        <div className="panel-body" style={{ height: "380px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{
                backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)'
              }} />
              <Legend verticalAlign="top" align="right" height={36} />
              <Bar dataKey="total" name="Creados" fill="#2c6a9c" radius={[4, 4, 0, 0]} barSize={30} />
              <Bar dataKey="cerrados" name="Cerrados" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
              <Bar dataKey="abiertos" name="Abiertos" fill="#f97316" radius={[4, 4, 0, 0]} barSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel" style={{ marginTop: "20px" }}>
        <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span>Indisponibilidad por Junta ({juntas.length} juntas)</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select className="filter-select" style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #ccc", cursor: "pointer" }}
              value={chartMetric} onChange={e => setChartMetric(e.target.value)}>
              <option value="indisp">Indisponibilidad neta</option>
              <option value="indisp_bruta">Indisponibilidad bruta</option>
              <option value="tickets">Cantidad de tickets</option>
              <option value="incidentes">Cantidad de incidentes</option>
            </select>
            <select className="filter-select" style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #ccc", cursor: "pointer" }}
              value={chartLimit} onChange={e => setChartLimit(Number(e.target.value))}>
              <option value={10}>Top 10</option>
              <option value={15}>Top 15</option>
              <option value={30}>Top 30</option>
              <option value={50}>Top 50</option>
              <option value={999}>Todas</option>
            </select>
            {juntas.length > JUNTAS_PAGE_SIZE && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "15px" }}>
              <button className="btn-refresh" style={{
                width: "30px", height: "30px", borderRadius: "50%", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: "16px", backgroundColor: "white", color: "#666",
                border: "1px solid #ddd", cursor: "pointer"
              }} disabled={juntasPage === 1} onClick={() => setJuntasPage(prev => prev - 1)}>←</button>
              <span style={{ fontSize: "13px", fontWeight: "bold", color: "#333" }}>
                {(juntasPage - 1) * JUNTAS_PAGE_SIZE + 1} - {Math.min(juntasPage * JUNTAS_PAGE_SIZE, juntas.length)} de {juntas.length}
              </span>
              <button className="btn-refresh" style={{
                width: "30px", height: "30px", borderRadius: "50%", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: "16px", backgroundColor: "white", color: "#666",
                border: "1px solid #ddd", cursor: "pointer"
              }} disabled={juntasPage >= Math.ceil(juntas.length / JUNTAS_PAGE_SIZE)}
                onClick={() => setJuntasPage(prev => prev + 1)}>→</button>
            </div>
          )}
          </div>
        </div>
        <div className="panel-body" style={{ height: "400px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topJuntas} layout="vertical" margin={{ top: 20, right: 40, left: 40, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
              <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{
                backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)'
              }} />
              <Legend verticalAlign="top" align="right" height={36} />
              <Bar dataKey={activeMetric.key} name={activeMetric.label} fill={activeMetric.color} radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel-body table-wrapper">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Junta</th>
                <th>Departamento</th>
                <th>Tickets</th>
                <th>Abiertos</th>
                <th>Incidentes</th>
                <th>Indisp. Bruta (h)</th>
                <th>Parada (h)</th>
                <th>Indisp. Neta (h)</th>
              </tr>
            </thead>
            <tbody>
              {juntas.slice((juntasPage - 1) * JUNTAS_PAGE_SIZE, juntasPage * JUNTAS_PAGE_SIZE).map((j, i) => (
                <tr key={j.code}>
                  <td>{(juntasPage - 1) * JUNTAS_PAGE_SIZE + i + 1}</td>
                  <td><strong>{j.name}</strong></td>
                  <td>{j.department || "—"}</td>
                  <td>{j.total}</td>
                  <td>{j.abiertos}</td>
                  <td>{j.incidentes}</td>
                  <td>{fmtHours(j.indisp_bruta_horas)}</td>
                  <td style={{ color: Number(j.horas_parada) > 0 ? "#7c3aed" : "inherit" }}>{fmtHours(j.horas_parada)}</td>
                  <td style={{ fontWeight: "bold", color: Number(j.indisp_neta_horas) > 0 ? "#dc2626" : "inherit" }}>{fmtHours(j.indisp_neta_horas)}</td>
                </tr>
              ))}
              {juntas.length === 0 && (
                <tr><td colSpan="9" style={{ textAlign: "center", padding: "20px", color: "#888" }}>Sin datos con los filtros aplicados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: "20px" }}>
        <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Detalle de Tickets JUNTAS (clic en una fila para ver seguimiento)</span>
          {total > PAGE_SIZE && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "15px" }}>
              <button className="btn-refresh" style={{
                width: "30px", height: "30px", borderRadius: "50%", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: "16px", backgroundColor: "white", color: "#666",
                border: "1px solid #ddd", cursor: "pointer"
              }} disabled={currentPage === 1} onClick={() => fetchPage(currentPage - 1)}>←</button>
              <span style={{ fontSize: "13px", fontWeight: "bold", color: "#333" }}>
                {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, total)} de {total}
              </span>
              <button className="btn-refresh" style={{
                width: "30px", height: "30px", borderRadius: "50%", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: "16px", backgroundColor: "white", color: "#666",
                border: "1px solid #ddd", cursor: "pointer"
              }} disabled={currentPage >= Math.ceil(total / PAGE_SIZE)} onClick={() => fetchPage(currentPage + 1)}>→</button>
            </div>
          )}
        </div>
        <div className="panel-body table-wrapper">
          <table>
            <thead>
              <tr>
                <th>#Ticket</th>
                <th>Fecha Inicio</th>
                <th>Código</th>
                <th>Departamento</th>
                <th>Municipio</th>
                <th>Centro Poblado</th>
                <th>Categoría</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Horas Total</th>
                <th>Parada (h)</th>
                <th>Netas (h)</th>
              </tr>
            </thead>
            <tbody>
              {listData.map((row, i) => (
                <tr key={row["#Ticket"] || i} onClick={() => openDetail(row)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--hover, #f0f7ff)"}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = ""}>
                  <td><strong>{row["#Ticket"] ?? "—"}</strong></td>
                  <td>{fmtDate(row.fecha_inicio)}</td>
                  <td>{row.codigo_operador || "—"}</td>
                  <td>{row.departamento || "—"}</td>
                  <td>{row.municipio || "—"}</td>
                  <td>{row.centro_poblado || "—"}</td>
                  <td style={{ maxWidth: 220 }}>{row.categoria || "—"}</td>
                  <td>
                    <span className={`badge ${String(row.prioridad).toLowerCase() === "baja" ? "badge-active" : String(row.prioridad).toLowerCase() === "alta" ? "badge-error" : "badge-warning"}`}>
                      {row.prioridad || "—"}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${String(row.ticket_estado).toLowerCase() === "abierto" ? "badge-warning" : String(row.ticket_estado).toLowerCase() === "anulado" ? "badge-error" : "badge-active"}`}>
                      {row.ticket_estado || "—"}
                    </span>
                  </td>
                  <td>{fmtHours(row.horas_total)}</td>
                  <td style={{ color: Number(row.horas_parada) > 0 ? "#7c3aed" : "inherit" }}>{fmtHours(row.horas_parada)}</td>
                  <td>{fmtHours(row.horas_netas)}</td>
                </tr>
              ))}
              {listData.length === 0 && (
                <tr>
                  <td colSpan="12" style={{ textAlign: "center", padding: "20px", color: "#888" }}>
                    No se encontraron tickets con los filtros aplicados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div className="modal-overlay" onMouseDown={() => setDetail(null)}>
          <div className="modal-content" style={{ width: "760px", height: "80vh", padding: "24px", maxWidth: "90vw", overflow: "auto" }}
            onMouseDown={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ margin: 0 }}>Ticket #{detail["#Ticket"]}</h3>
              <button className="modal-close" onClick={() => setDetail(null)}>×</button>
            </div>

            {detailLoading ? (
              <div className="chart-placeholder">Cargando detalle del ticket...</div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px", fontSize: "13px", marginBottom: "16px" }}>
                  <div><strong>Estado:</strong> <span className={`badge ${String(detail.ticket_estado).toLowerCase() === "abierto" ? "badge-warning" : "badge-active"}`}>{detail.ticket_estado}</span></div>
                  <div><strong>Prioridad:</strong> <span className="badge badge-warning">{detail.prioridad}</span> {detail.prioridad_baja && <span style={{ color: "#16a34a", fontSize: 11 }}>(no genera indisponibilidad)</span>}</div>
                  <div><strong>Fecha inicio:</strong> {fmtDate(detail.fecha_inicio)}</div>
                  <div><strong>Fecha fin:</strong> {fmtDate(detail.fecha_fin)}</div>
                  <div><strong>Código operador:</strong> {detail.codigo_operador || "—"}</div>
                  <div><strong>Tipo:</strong> {detail.tipo || "—"}</div>
                  <div><strong>Departamento:</strong> {detail.departamento || "—"}</div>
                  <div><strong>Categoría:</strong> {detail.categoria || "—"}</div>
                  <div><strong>Municipio:</strong> {detail.municipio || "—"}</div>
                  <div><strong>Centro poblado:</strong> {detail.centro_poblado || "—"}</div>
                  <div><strong>Sub proyecto:</strong> {detail.sub_proyecto || "—"}</div>
                  <div><strong>Responsable:</strong> {detail.responsable || "—"}</div>
                  <div><strong>Grupo escalamiento:</strong> {detail.grupo_escalamiento || "—"}</div>
                  <div><strong>Asignado a:</strong> {detail["Asignado A"] || "—"}</div>
                  <div><strong>Usuario crea:</strong> {detail["Usuario Crea"] || "—"}</div>
                  <div><strong>Usuario cierre:</strong> {detail["Usuario Cierre"] || "—"}</div>
                  <div><strong>Horas total:</strong> {fmtHours(detail.horas_total)}</div>
                  <div><strong>Horas parada reloj:</strong> {fmtHours(detail.horas_parada)}</div>
                  <div><strong>Horas netas:</strong> {fmtHours(detail.horas_netas)}</div>
                  <div><strong>Indisponibilidad neta:</strong> <strong style={{ color: detail.indisp_neta_horas > 0 ? "#dc2626" : "#16a34a" }}>{fmtHours(detail.indisp_neta_horas)}</strong></div>
                </div>

                {detail["Mantenimiento Id"] && (
                  <div style={{ marginBottom: "16px", padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px" }}>
                    <strong>Mantenimiento:</strong> {detail["Mantenimiento Id"]} — Estado: {detail["Estado Mnt"] || "—"} — Técnico: {detail["Tecnico Asignado"] || "—"} — Inicio: {fmtDate(detail["Fecha Inicio Mantenimiento"])} — Fin: {fmtDate(detail["Fecha Fin Mnt"])}
                  </div>
                )}

                <h4 style={{ margin: "0 0 8px", fontSize: "14px" }}>Seguimiento del Ticket</h4>
                <div style={{ borderLeft: "3px solid #e2e8f0", paddingLeft: "16px", marginBottom: "16px" }}>
                  {(detail.seguimiento || []).map((s, i) => (
                    <div key={i} style={{ marginBottom: "12px", position: "relative" }}>
                      <span style={{ position: "absolute", left: "-23px", top: "5px", width: "10px", height: "10px", borderRadius: "50%", background: SEGUIMIENTO_COLORS[String(s.tipo).toUpperCase()] || "#94a3b8" }}></span>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "2px" }}>
                        <strong style={{ fontSize: "12px", color: SEGUIMIENTO_COLORS[String(s.tipo).toUpperCase()] || "#334155" }}>{s.tipo}</strong>
                        <span style={{ fontSize: "11px", color: "#94a3b8" }}>{s.fecha}</span>
                      </div>
                      <div style={{ fontSize: "12.5px", color: "#475569", whiteSpace: "pre-wrap" }}>{s.texto}</div>
                    </div>
                  ))}
                  {(detail.seguimiento || []).length === 0 && <div style={{ fontSize: "13px", color: "#94a3b8" }}>Sin seguimiento registrado</div>}
                </div>

                {detail.paradas && detail.paradas.length > 0 && (
                  <>
                    <h4 style={{ margin: "0 0 8px", fontSize: "14px" }}>Paradas de Reloj Aplicadas</h4>
                    <div className="table-wrapper" style={{ marginBottom: "8px" }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Inicio Falla</th>
                            <th>Fin Falla</th>
                            <th>Inicio Parada</th>
                            <th>Fin Parada</th>
                            <th>Días Parada</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detail.paradas || []).map((p, i) => (
                            <tr key={i}>
                              <td>{p.fecha_inicio_falla?.slice(0, 16).replace("T", " ") || "—"}</td>
                              <td>{p.fecha_fin_falla?.slice(0, 16).replace("T", " ") || "—"}</td>
                              <td>{p.fecha_inicio_parada?.slice(0, 16).replace("T", " ") || "—"}</td>
                              <td>{p.fecha_fin_parada?.slice(0, 16).replace("T", " ") || "—"}</td>
                              <td>{Number(p.dias_parada).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {detail["Comentario Apertura"] && (
                  <div style={{ marginTop: "8px" }}>
                    <h4 style={{ margin: "0 0 8px", fontSize: "14px" }}>Comentario Apertura</h4>
                    <div style={{ fontSize: "12.5px", color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px", whiteSpace: "pre-wrap", maxHeight: "150px", overflow: "auto" }}>
                      {detail["Comentario Apertura"]}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <footer className="footer">Reporte generado: {new Date().toLocaleString("es-CO")}</footer>
    </div>
  );
}
