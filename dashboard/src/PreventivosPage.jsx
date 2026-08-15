import { useState, useEffect, useRef } from "react";
import { fetchDepartments } from "./api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";

const PAGE_SIZE = 15;

export default function PreventivosPage() {
  const [chartData, setChartData] = useState([]);
  const [opStartData, setOpStartData] = useState([]);
  const [listData, setListData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState({
    department: "all",
    month: "all",
    year: "all",
    status: "all",
  });
  const [updatingId, setUpdatingId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [fechaModal, setFechaModal] = useState({ show: false, juntaId: null, juntaName: "" });
  const [fechaPreventivo, setFechaPreventivo] = useState(new Date().toISOString().split('T')[0]);
  const resizeRef = useRef(false);
  const ignoreNextOverlay = useRef(false);

  const fetchDepartmentsData = async () => {
    try {
      const d = await fetchDepartments();
      setDepartments(d);
    } catch (e) {
      console.error("Error fetching departments:", e);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setCurrentPage(1);
    try {
      const query = new URLSearchParams();
      if (filters.department !== "all") query.set("department", filters.department);
      if (filters.month !== "all") query.set("month", filters.month);
      if (filters.year !== "all") query.set("year", filters.year);
      
      // Fetch Chart Data
       const resChart = await fetch(`/api/preventivos?${query.toString()}`, {
         headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
       });
       const chartResult = await resChart.json();
       if (chartResult.chart_data) setChartData(chartResult.chart_data);
       if (chartResult.op_start_data) setOpStartData(chartResult.op_start_data);
 
       // Fetch List Data - include status filter
      const listQuery = new URLSearchParams(query);
      if (filters.status !== "all") listQuery.set("status", filters.status);
      
      const resList = await fetch(`/api/preventivos/list?${listQuery.toString()}`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      const listResult = await resList.json();
      if (Array.isArray(listResult)) setListData(listResult);
      
    } catch (e) {
      console.error("Error fetching preventivos:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartmentsData();
    fetchData();
  }, []);

  // Filtrar la lista basada en el buscador
  const filteredListData = listData.filter(row => 
    (row["JUNTA"] || "").toLowerCase().includes(searchTerm.toLowerCase())
  );


  // Obtener sugerencias únicas basadas en la lista actual
  const suggestions = [...new Set(listData.map(row => row["JUNTA"]).filter(Boolean))]
    .filter(name => name.toLowerCase().includes(searchTerm.toLowerCase()) && searchTerm !== "")
    .slice(0, 10);

  const exportToExcel = async () => {
    try {
      const query = new URLSearchParams();
      if (filters.department !== "all") query.set("department", filters.department);
      if (filters.month !== "all") query.set("month", filters.month);
      if (filters.year !== "all") query.set("year", filters.year);
      if (filters.status !== "all") query.set("status", filters.status);
      
      const response = await fetch(`/api/preventivos/excel?${query.toString()}`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      
      if (!response.ok) throw new Error("Error al descargar el reporte");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Reporte_Preventivos_${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error("Error exporting to Excel:", e);
      alert("No se pudo exportar el reporte");
    }
  };

  const handleUpdateStatus = async (juntaId, newStatus, juntaName) => {
    if (newStatus === "Ejecutado") {
      setFechaModal({ show: true, juntaId, juntaName });
      setFechaPreventivo(new Date().toISOString().split('T')[0]);
      return;
    }
    if (newStatus === "Pendiente" && !confirm("¿Está seguro de marcar este preventivo como Pendiente?")) return;
    await doUpdateStatus(juntaId, newStatus, "");
  };

  const doUpdateStatus = async (juntaId, newStatus, date) => {
    setUpdatingId(juntaId);
    try {
      const response = await fetch(`/api/preventivos/update`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}` 
        },
        body: JSON.stringify({
          junta_id: juntaId,
          status: newStatus,
          date: date
        })
      });
      const result = await response.json();
      if (result.ok) {
        alert(`Preventivo marcado como ${newStatus} correctamente`);
        await fetchData();
      } else {
        alert("Error: " + result.error);
      }
    } catch (e) {
      console.error("Error updating status:", e);
      alert("Ocurrió un error al actualizar el estado");
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) return <div className="chart-placeholder">Cargando datos de preventivos...</div>;

  return (
    <div>
      <div className="panel">
        <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Indicador de Mantenimientos Preventivos</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-refresh" onClick={exportToExcel}>Exportar Reporte Excel</button>
          </div>
        </div>
        
         <div className="filter-bar" style={{ 
           display: "flex", 
           gap: "12px", 
           margin: "20px", 
           flexWrap: "wrap", 
           alignItems: "center",
           backgroundColor: "var(--panel-bg, #f8f9fa)",
           padding: "15px",
           borderRadius: "8px",
           border: "1px solid #ddd",
           boxShadow: "inset 0 1px 3px rgba(0,0,0,0.05)",
           width: "calc(100% - 40px)"
         }}>
           <div style={{ position: "relative", minWidth: "250px" }}>
             <input 
               type="text" 
               placeholder="Buscar junta..." 
               style={{ 
                 padding: "8px 12px", 
                 borderRadius: "6px", 
                 border: "1px solid #ccc", 
                 width: "100%", 
                 boxSizing: "border-box",
                 cursor: "pointer" 
               }}
               value={searchTerm} 
               onChange={e => {
                 setSearchTerm(e.target.value);
                 setCurrentPage(1);
               }}
               onFocus={() => setShowSuggestions(true)}
               onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
             />
             {showSuggestions && suggestions.length > 0 && (
               <ul style={{ 
                 position: "absolute", 
                 top: "100%", 
                 left: 0, 
                 right: 0, 
                 zIndex: 1000, 
                 backgroundColor: "white", 
                 border: "1px solid #ddd", 
                 borderRadius: "0 0 6px 6px", 
                 listStyle: "none", 
                 padding: 0, 
                 margin: 0, 
                 maxHeight: "200px", 
                 overflowY: "auto", 
                 boxShadow: "0 4px 6px rgba(0,0,0,0.1)" 
               }}>
                 {suggestions.map(name => (
                   <li 
                     key={name} 
                     style={{ 
                       padding: "8px 12px", 
                       cursor: "pointer", 
                       borderBottom: "1px solid #eee",
                       fontSize: "13px"
                     }}
                     onClick={() => {
                       setSearchTerm(name);
                       setShowSuggestions(false);
                       setCurrentPage(1);
                     }}
                     onMouseEnter={e => e.target.style.backgroundColor = "#f0f7ff"}
                     onMouseLeave={e => e.target.style.backgroundColor = "white"}
                   >
                     {name}
                   </li>
                 ))}
               </ul>
             )}
           </div>
 
           <select 
             className="filter-select"
             style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", minWidth: "200px", cursor: "pointer" }}
             value={filters.department} 
             onChange={e => setFilters({...filters, department: e.target.value})}
           >
            <option value="all">Todos los departamentos</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

           <select 
             className="filter-select"
             style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", minWidth: "150px", cursor: "pointer" }}
             value={filters.status} 
             onChange={e => setFilters({...filters, status: e.target.value})}
           >
             <option value="all">Todos los estados</option>
             <option value="ejecutado">Ejecutados</option>
             <option value="pendiente">Pendientes</option>
           </select>
 
           <select 
             className="filter-select"
             style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", minWidth: "150px", cursor: "pointer" }}
             value={filters.month} 
             onChange={e => setFilters({...filters, month: e.target.value})}
           >
            <option value="all">Todos los meses</option>
            <option value="ene">Enero</option>
            <option value="feb">Febrero</option>
            <option value="mar">Marzo</option>
            <option value="abr">Abril</option>
            <option value="may">Mayo</option>
            <option value="jun">Junio</option>
            <option value="jul">Julio</option>
            <option value="ago">Agosto</option>
            <option value="sep">Septiembre</option>
            <option value="oct">Octubre</option>
            <option value="nov">Noviembre</option>
            <option value="dic">Diciembre</option>
          </select>

          <select 
            className="filter-select"
            style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", minWidth: "120px", cursor: "pointer" }}
            value={filters.year} 
            onChange={e => setFilters({...filters, year: e.target.value})}
          >
            <option value="all">Todos los años</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>
          
          <button 
            className="btn-refresh" 
            onClick={fetchData}
            style={{ 
              padding: "8px 20px", 
              borderRadius: "6px", 
              fontWeight: "bold",
              cursor: "pointer",
              backgroundColor: "#2563eb",
              color: "white",
              border: "none"
            }}
          >
            Aplicar Filtros
          </button>
        </div>

         <div className="panel" style={{ margin: "20px" }}>
           <div className="panel-header">Ejecución Mensual por Inicio Operación</div>
           <div className="panel-body" style={{ height: "400px" }}>
             <ResponsiveContainer width="100%" height="100%">
               <BarChart
                 data={chartData}
                 margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
               >
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                 <XAxis 
                   dataKey="month" 
                   tick={{ fill: 'var(--text-muted)', fontSize: 12 }} 
                   axisLine={{ stroke: 'var(--border)' }}
                   tickLine={false}
                 />
                 <YAxis 
                   tick={{ fill: 'var(--text-muted)', fontSize: 12 }} 
                   axisLine={false}
                   tickLine={false}
                 />
                 <Tooltip 
                   contentStyle={{ 
                     backgroundColor: 'var(--bg-card)', 
                     border: '1px solid var(--border)', 
                     borderRadius: 'var(--radius)',
                     boxShadow: 'var(--shadow)'
                   }} 
                 />
                 <Legend verticalAlign="top" align="right" height={36} />
                 <Bar 
                   dataKey="Ejecutado" 
                   fill="#2c6a9c" 
                   radius={[4, 4, 0, 0]} 
                   barSize={40}
                 />
                 <Bar 
                   dataKey="Pendiente" 
                   fill="#f97316" 
                   radius={[4, 4, 0, 0]} 
                   barSize={40}
                 />
               </BarChart>
             </ResponsiveContainer>
           </div>
         </div>

         <div className="panel" style={{ margin: "20px" }}>
           <div className="panel-header">Tendencia de Ejecuciones (Fecha Real)</div>
           <div className="panel-body" style={{ height: "400px" }}>
             <ResponsiveContainer width="100%" height="100%">
               <LineChart
                 data={opStartData}
                 margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
               >
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                 <XAxis 
                   dataKey="month" 
                   tick={{ fill: 'var(--text-muted)', fontSize: 12 }} 
                   axisLine={{ stroke: 'var(--border)' }}
                   tickLine={false}
                 />
                 <YAxis 
                   tick={{ fill: 'var(--text-muted)', fontSize: 12 }} 
                   axisLine={false}
                   tickLine={false}
                 />
                 <Tooltip 
                   contentStyle={{ 
                     backgroundColor: 'var(--bg-card)', 
                     border: '1px solid var(--border)', 
                     borderRadius: 'var(--radius)',
                     boxShadow: 'var(--shadow)'
                   }} 
                 />
                 <Legend verticalAlign="top" align="right" height={36} />
                 <Line 
                   type="monotone" 
                   dataKey="count" 
                   name="Ejecutados" 
                   stroke="#10b981" 
                   strokeWidth={3} 
                   dot={{ r: 6, fill: "#10b981" }}
                   activeDot={{ r: 8 }}
                 />
               </LineChart>
             </ResponsiveContainer>
           </div>
         </div>
      </div>

      <div className="panel" style={{ marginTop: "20px" }}>
         <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
           <span>Gestión de Preventivos</span>
           {filteredListData.length > PAGE_SIZE && (
             <div style={{ 
               display: "flex", 
               justifyContent: "center", 
               alignItems: "center", 
               gap: "15px", 
             }}>
               <button 
                 className="btn-refresh" 
                 style={{ 
                   width: "30px", 
                   height: "30px", 
                   borderRadius: "50%", 
                   display: "flex", 
                   alignItems: "center", 
                   justifyContent: "center", 
                   fontSize: "16px", 
                   backgroundColor: "white", 
                   color: "#666", 
                   border: "1px solid #ddd",
                   cursor: "pointer" 
                 }}
                 disabled={currentPage === 1}
                 onClick={() => setCurrentPage(prev => prev - 1)}
               >
                 ←
               </button>
               <span style={{ fontSize: "13px", fontWeight: "bold", color: "#333" }}>
                 {(currentPage - 1) * PAGE_SIZE + 1}- {Math.min(currentPage * PAGE_SIZE, filteredListData.length)} de {filteredListData.length}
               </span>
               <button 
                 className="btn-refresh" 
                 style={{ 
                   width: "30px", 
                   height: "30px", 
                   borderRadius: "50%", 
                   display: "flex", 
                   alignItems: "center", 
                   justifyContent: "center", 
                   fontSize: "16px", 
                   backgroundColor: "white", 
                   color: "#666", 
                   border: "1px solid #ddd",
                   cursor: "pointer" 
                 }}
                 disabled={currentPage >= Math.ceil(filteredListData.length / PAGE_SIZE)}
                 onClick={() => setCurrentPage(prev => prev + 1)}
               >
                 →
               </button>
             </div>
           )}
         </div>
         <div className="panel-body table-wrapper">
           <table>
              <thead>
                <tr>
                  <th>Junta</th>
                  <th>Departamento</th>
                  <th>Inicio Operación</th>
                  <th>Estado</th>
                  <th>Fecha Preventivo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredListData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((row, i) => (
                  <tr key={i}>
                    <td><strong>{row["JUNTA"] || "N/A"}</strong></td>
                    <td>{row["DEPARTAMENTO"] || "N/A"}</td>
                    <td>{row["inicio_operacion"] || "—"}</td>
                    <td>
                      <span className={`badge ${String(row["ESTADO_PREVENTIVO"]).toLowerCase().includes("ejecutado") ? "badge-active" : "badge-warning"}`}>
                        {row["ESTADO_PREVENTIVO"] || "Pendiente"}
                      </span>
                    </td>
                    <td>{row["FECHA_PREVENTIVO"] ? row["FECHA_PREVENTIVO"].split('T')[0] : "—"}</td>
                    <td>
                      {String(row["ESTADO_PREVENTIVO"]).toLowerCase().includes("pendiente") && (
                        <button 
                          className="btn-refresh" 
                          style={{ padding: "4px 8px", fontSize: "11px", backgroundColor: "#16a34a", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                          onClick={() => handleUpdateStatus(row["ID_JUNTA"], "Ejecutado", row["JUNTA"])}
                          disabled={updatingId === row["ID_JUNTA"]}
                        >
                          {updatingId === row["ID_JUNTA"] ? "..." : "Marcar Ejecutado"}
                        </button>
                      )}
                      {String(row["ESTADO_PREVENTIVO"]).toLowerCase().includes("ejecutado") && (
                        <button 
                          className="btn-refresh" 
                          style={{ padding: "4px 8px", fontSize: "11px", backgroundColor: "#dc2626", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                          onClick={() => handleUpdateStatus(row["ID_JUNTA"], "Pendiente", row["JUNTA"])}
                          disabled={updatingId === row["ID_JUNTA"]}
                        >
                          {updatingId === row["ID_JUNTA"] ? "..." : "Marcar Pendiente"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}

               {filteredListData.length === 0 && (
                 <tr>
                   <td colSpan="5" style={{ textAlign: "center", padding: "20px", color: "#888" }}>
                     No se encontraron datos de preventivos
                   </td>
                 </tr>
               )}
             </tbody>
            </table>
          </div>
      </div>
      {fechaModal.show && (
        <div className="modal-overlay" onMouseUp={() => { if (resizeRef.current) { ignoreNextOverlay.current = true; } resizeRef.current = false; }} onClick={() => { if (!ignoreNextOverlay.current) setFechaModal({ show: false, juntaId: null, juntaName: "" }); ignoreNextOverlay.current = false; }}>
          <div className="modal-content" style={{ width: "auto", height: "auto", padding: "24px", maxWidth: "420px", overflow: "auto" }} onClick={e => e.stopPropagation()} onMouseDown={() => { resizeRef.current = true; }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h3 style={{ margin: 0 }}>Fecha de Ejecución del Preventivo</h3>
              <button className="modal-close" onClick={() => setFechaModal({ show: false, juntaId: null, juntaName: "" })}>×</button>
            </div>
            <p>Ingrese la fecha en que se ejecutó el preventivo de <strong>{fechaModal.juntaName}</strong>:</p>
            <input
              type="date"
              value={fechaPreventivo}
              onChange={e => setFechaPreventivo(e.target.value)}
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
                onClick={() => setFechaModal({ show: false, juntaId: null, juntaName: "" })}
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
                  const id = fechaModal.juntaId;
                  setFechaModal({ show: false, juntaId: null, juntaName: "" });
                  await doUpdateStatus(id, "Ejecutado", fechaPreventivo);
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

      <footer className="footer">Reporte generado: {new Date().toLocaleString("es-CO")}</footer>
    </div>
  );
}
