import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
 
const RANGES = [
  { label: "1h", value: "1" },
  { label: "6h", value: "6" },
  { label: "24h", value: "24" },
  { label: "7d", value: "168" },
  { label: "30d", value: "720" },
];
 
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-traffic-tooltip">
        <p className="tooltip-label">{new Date(label).toLocaleString("es-CO")}</p>
        <div className="tooltip-values">
          {payload.map((entry, index) => (
            <div key={index} style={{ color: entry.color }}>
              <span className="tooltip-name">{entry.name}: </span>
              <span className="tooltip-value">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};
 
export default function ActivityChart({ data, range, onRangeChange, loading, title }) {
  const [customMode, setCustomMode] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
 
  const hasData = data && data.length > 0;
 
  const applyCustomRange = () => {
    if (dateFrom && dateTo) {
      onRangeChange(`custom|${dateFrom}|${dateTo}`);
    }
  };
 
  return (
    <div className="panel">
      <div className="panel-header">
        <span>{title || "Actividad de Clientes"}</span>
        <div className="range-selector">
          {!customMode &&
            RANGES.map((r) => (
              <button
                key={r.value}
                className={`range-btn ${range === r.value ? "range-btn-active" : ""}`}
                onClick={() => onRangeChange(r.value)}
              >
                {r.label}
              </button>
            ))}
          <button
            className={`range-btn ${customMode ? "range-btn-active" : ""}`}
            onClick={() => setCustomMode(!customMode)}
          >
            {customMode ? "Predef" : "Fecha"}
          </button>
        </div>
      </div>
      {customMode && (
        <div className="custom-dates">
          <label>
            Desde:
            <input type="datetime-local" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            Hasta:
            <input type="datetime-local" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <button className="btn-refresh" onClick={applyCustomRange} disabled={!dateFrom || !dateTo}>
            Consultar
          </button>
        </div>
      )}
      <div className="panel-body">
        {loading ? (
          <div className="chart-placeholder">Cargando actividad...</div>
        ) : !hasData ? (
          <div className="chart-placeholder">Sin datos de actividad</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--blue)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--blue)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorOnline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--green)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--green)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorOffline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--red)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--red)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(t) => {
                  const d = new Date(t);
                  return d.toLocaleString("es-CO", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                }}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: "var(--text-muted)" }} 
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="total"
                name="Total Clientes"
                stroke="var(--blue)"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorTotal)"
                dot={false}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
              <Area
                type="monotone"
                dataKey="online"
                name="Online"
                stroke="var(--green)"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorOnline)"
                dot={false}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
              <Area
                type="monotone"
                dataKey="offline"
                name="Caídos"
                stroke="var(--red)"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorOffline)"
                dot={false}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
