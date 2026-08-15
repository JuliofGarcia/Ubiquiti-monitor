import { useState, useEffect } from "react";
import { fetchReport, fetchDepartments, fetchSites } from "./api";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { MapContainer, TileLayer, Popup, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
 
 
 
const PAGE_SIZE = 15;
 
export default function ReportsPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageZones, setPageZones] = useState(0);
  const [pageSites, setPageSites] = useState(0);
  const [departments, setDepartments] = useState([]);
  const [allJuntas, setAllJuntas] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  
  const [filters, setFilters] = useState({
    type: "all",
    department: "all",
    status: "all",
    availabilityRange: "all",
    search: ""
  });
  
  const fetchDepartmentsData = async () => {
    try {
      const d = await fetchDepartments();
      setDepartments(d);
    } catch (e) {
      console.error("Error fetching zones:", e);
    }
  };

  const fetchAllSiteNames = async () => {
    try {
      const sites = await fetchSites({});
      setAllJuntas(sites.map(s => s.site_name).sort());
    } catch (e) {
      console.error("Error fetching all sites:", e);
    }
  };
 
  const fetchReportData = async () => {
    setLoading(true);
    try {
      const apiFilters = {
        department: filters.department !== "all" ? filters.department : "",
        type: filters.type !== "all" ? filters.type : "all",
        health: filters.status !== "all" ? filters.status : "all",
        search: filters.search,
      };
      
      const d = await fetchReport(apiFilters);
      
       // Filtrado adicional por rango de disponibilidad de zona en el frontend
         const filteredData = d.filter(z => {
           const availability = z.total_sites > 0 ? (z.sites_online / z.total_sites) * 100 : 0;
           if (filters.availabilityRange === "all") return true;
           if (filters.availabilityRange === "0-50") return availability >= 0 && availability < 50;
           if (filters.availabilityRange === "51-75") return availability >= 50 && availability < 75;
           if (filters.availabilityRange === "76-90") return availability >= 75 && availability < 90;
           if (filters.availabilityRange === "91-100") return availability >= 90 && availability <= 100;
           return true;
         });
 
 
 
 
       setData(filteredData);
       setPageZones(0);
       setPageSites(0);
    } catch (e) {
      console.error("Error fetching report:", e);
    } finally {
      setLoading(false);
    }
  };
 
 
  const getHealthData = () => {
    const distribution = {
      total_online: 0,
      parcial: 0,
      total_caida: 0,
      unknown: 0
    };
    data.forEach(z => {
      z.sites.forEach(s => {
        distribution[s.health] = (distribution[s.health] || 0) + 1;
      });
    });
    return Object.keys(distribution).map(key => ({
      name: key.replace("_", " ").toUpperCase(),
      value: distribution[key]
    })).filter(d => d.value > 0);
  };
 
  const getAllSites = () => {
    const all = [];
    data.forEach(z => {
      z.sites.forEach(s => {
        all.push({
          ...s,
          department: z.department
        });
      });
    });
    return all;
  };
 
 
  useEffect(() => {
    fetchDepartmentsData();
    fetchReportData();
    fetchAllSiteNames();
  }, []);
 
 
  const totalZonesPages = Math.ceil(data.length / PAGE_SIZE);
  const pagedZones = data.slice(pageZones * PAGE_SIZE, (pageZones + 1) * PAGE_SIZE);
 
  const allSites = getAllSites();
  const totalSitesPages = Math.ceil(allSites.length / PAGE_SIZE);
  const pagedSites = allSites.slice(pageSites * PAGE_SIZE, (pageSites + 1) * PAGE_SIZE);
 
  const exportToExcel = async () => {
    try {
      const query = new URLSearchParams();
      if (filters.department !== "all") query.set("department", filters.department);
      if (filters.type !== "all") query.set("type", filters.type);
      if (filters.status !== "all") query.set("health", filters.status);
      if (filters.search) query.set("search", filters.search);
      
      const response = await fetch(`/api/report/excel/detailed?${query.toString()}`, {
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });
      
      if (!response.ok) throw new Error("Error al descargar el reporte");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Reporte_Detallado_${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error("Error exporting to Excel:", e);
      alert("No se pudo exportar el reporte");
    }
  };
 
  if (loading) return <div className="chart-placeholder">Cargando reporte...</div>;
 
  return (
    <div>
      <div className="panel">
        <div className="panel-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Reporte Detallado de Juntas</span>
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
           <select 
             className="filter-select"
             style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", minWidth: "180px", cursor: "pointer" }}
             value={filters.type} 
             onChange={e => setFilters({...filters, type: e.target.value})}
           >
             <option value="all">Todas las juntas</option>
             <option value="operacion">En Operación</option>
             <option value="implementacion">En Implementación</option>
           </select>
  
  
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
              style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", minWidth: "200px", cursor: "pointer" }}
              value={filters.status} 
              onChange={e => setFilters({...filters, status: e.target.value})}
            >
              <option value="all">Todo estado</option>
              <option value="total_online">Total Online</option>
              <option value="parcial">Parcialmente Caída</option>
              <option value="total_caida">Totalmente Caída</option>
            </select>
  
             <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
               <select 
                 className="filter-select"
                 style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #ccc", minWidth: "150px", cursor: "pointer" }}
                 value={filters.availabilityRange} 
                 onChange={e => setFilters({...filters, availabilityRange: e.target.value})}
               >
                 <option value="all">Todos los rangos</option>
                 <option value="0-50">0% - 50%</option>
                 <option value="51-75">51% - 75%</option>
                 <option value="76-90">76% - 91%</option>
                 <option value="91-100">90% - 100%</option>
               </select>
             </div>
  
            <div style={{ position: "relative" }}>
              <input 
                className="site-search-input"
                placeholder="Buscar junta..." 
                value={filters.search} 
                onChange={e => {
                  const val = e.target.value;
                  setFilters({...filters, search: val});
                  if (val) {
                    const filtered = allJuntas.filter(j => j.toLowerCase().includes(val.toLowerCase()));
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
                  marginTop: "4px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
                }}>
                  {suggestions.map((j) => (
                    <li
                      key={j}
                      onClick={() => {
                        setFilters({...filters, search: j});
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
  
             <button 
               className="btn-refresh" 
               onClick={fetchReportData}
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
 
         <div style={{ display: "grid", gridTemplateColumns: "350px 1fr", gap: "20px", marginTop: "20px" }}>
            <div className="panel" style={{ minHeight: "400px" }}>
              <div className="panel-header">Distribución de Salud</div>
              <div className="panel-body" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "300px", position: "relative" }}>
                 <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                     <Pie
                       data={getHealthData()}
                       cx="50%"
                       cy="50%"
                       innerRadius={70}
                       outerRadius={90}
                       paddingAngle={8}
                       cornerRadius={6}
                       dataKey="value"
                     >
                       {getHealthData().map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={
                           entry.name === "TOTAL ONLINE" ? "#10b981" :
                           entry.name === "PARCIAL" ? "#f59e0b" :
                           entry.name === "TOTAL CAIDA" ? "#ef4444" : "#6b7280"
                         } />
                       ))}
                     </Pie>
                     <Tooltip />
                     <Legend verticalAlign="bottom" align="center" />
                   </PieChart>
                 </ResponsiveContainer>
                 <div style={{ 
                   position: "absolute", 
                   top: "50%", 
                   left: "50%", 
                   transform: "translate(-50%, -50%)", 
                   textAlign: "center", 
                   pointerEvents: "none" 
                 }}>
                   <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "var(--text)" }}>
                     {getHealthData().reduce((acc, curr) => acc + curr.value, 0)}
                   </div>
                   <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                     Total Sites
                   </div>
                 </div>
              </div>
            </div>
           <div className="panel" style={{ minHeight: "600px" }}>
             <div className="panel-header">Mapa Interactivo de Juntas</div>
             <div className="panel-body" style={{ height: "550px", borderRadius: "8px", overflow: "hidden" }} >
                <MapContainer 
                  key={JSON.stringify(data)} 
                  center={[4.5709, -74.2973]} 
                  zoom={6} 
                  style={{ height: "100%", width: "100%" }}
                >
               <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
               {getAllSites().map(site => (
                 site.lat && site.lon && (
                   <CircleMarker 
                     key={site.site_id}
                     center={[site.lat, site.lon]}
                     radius={6}
                     pathOptions={{
                       fillColor: site.health === "total_online" ? "#22c55e" :
                                   site.health === "parcial" ? "#eab308" :
                                   site.health === "total_caida" ? "#ef4444" : "#6b7280",
                       color: "#fff",
                       weight: 1,
                       fillOpacity: 0.8
                     }}
                   >
                     <Popup>
                       <strong>{site.name}</strong><br/>
                       Estado: {site.health}<br/>
                       Clientes: {site.clients}
                     </Popup>
                   </CircleMarker>
                 )
               ))}
             </MapContainer>
           </div>
         </div>
 
         </div>
  
         <div className="panel" style={{ marginTop: "20px" }}>
           <div className="panel-header">Detalle de Juntas Filtradas</div>
             <div style={{ 
               display: "flex", 
               justifyContent: "space-between", 
               alignItems: "center", 
               padding: "12px 20px", 
               backgroundColor: "#fff",
               fontSize: "13px",
               color: "#666",
               borderBottom: "1px solid #eee"
             }}>
             <div>
               <strong>Juntas</strong> {allSites.length} encontradas · Click para ver detalle
             </div>
             <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
               <button 
                 disabled={pageSites === 0} 
                 onClick={() => setPageSites(p => p - 1)}
                 style={{ 
                   padding: "4px 12px", 
                   cursor: pageSites === 0 ? "not-allowed" : "pointer",
                   borderRadius: "20px",
                   border: "1px solid #ddd",
                   backgroundColor: "#fff",
                   fontSize: "12px"
                 }}
               >
                 ←
               </button>
               <span>
                 {pageSites * PAGE_SIZE + 1}-{Math.min((pageSites + 1) * PAGE_SIZE, allSites.length)} de {allSites.length || 0}
               </span>
               <button 
                 disabled={pageSites >= totalSitesPages - 1} 
                 onClick={() => setPageSites(p => p + 1)}
                 style={{ 
                   padding: "4px 12px", 
                   cursor: pageSites >= totalSitesPages - 1 ? "not-allowed" : "pointer",
                   borderRadius: "20px",
                   border: "1px solid #ddd",
                   backgroundColor: "#fff",
                   fontSize: "12px"
                 }}
               >
                 →
               </button>
             </div>
           </div>
           <div className="panel-body table-wrapper">
             <table>
                <thead>
                  <tr>
                    <th>Junta</th>
                    <th>Departamento</th>
                    <th>Estado</th>
                    <th>Operación</th>
                    <th>APs Totales</th>
                    <th>APs Online</th>
                    <th>Disponibilidad</th>
                    <th>Clientes</th>
                    <th>Online</th>
                    <th>Última Conexión</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedSites.map((s, i) => (
                    <tr key={i}>
                      <td><strong>{s.name}</strong></td>
                       <td>{s.department}</td>
                      <td>
                        <span className={`badge ${s.health === "total_online" ? "badge-active" : s.health === "parcial" ? "badge-warning" : "badge-inactive"}`}>
                          {s.health}
                        </span>
                      </td>
                      <td>{s.op_status}</td>
                      <td>{s.ap_total || 0}</td>
                      <td>{s.ap_online || 0}</td>
                      <td>
                        {s.ap_total > 0 
                          ? ((s.ap_online / s.ap_total) * 100).toFixed(0) + "%" 
                          : "0%"}
                      </td>
                      <td>{s.clients}</td>
                       <td>{s.clients_online}</td>
                       <td>
                         {s.last_seen && s.last_seen !== "0001-01-01T00:00:00Z" 
                           ? new Date(s.last_seen).toLocaleString("es-CO") 
                           : "—"}
                       </td>
                    </tr>
                  ))}
                  {allSites.length === 0 && (
                    <tr>
                      <td colSspan="7" style={{ textAlign: "center", padding: "20px", color: "#888" }}>
                        No se encontraron juntas con los filtros aplicados
                      </td>
                    </tr>
                  )}
                </tbody>
               </table>
             </div>
          </div>
 
      </div>
 
       <footer className="footer">Reporte generado: {new Date().toLocaleString("es-CO")}</footer>
     </div>
   );
}
