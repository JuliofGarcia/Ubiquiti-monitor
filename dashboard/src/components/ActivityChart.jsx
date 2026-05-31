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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11 }}
                tickFormatter={(t) => {
                  const d = new Date(t);
                  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" })
                    + " " + d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
                }}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip labelFormatter={(t) => new Date(t).toLocaleString("es-CO")} />
              <Legend />
              <Area
                type="monotone"
                dataKey="total"
                name="Total Clientes"
                stroke="var(--blue)"
                fill="var(--blue)"
                fillOpacity={0.1}
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="online"
                name="Online"
                stroke="var(--green)"
                fill="var(--green)"
                fillOpacity={0.15}
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="offline"
                name="Caídos"
                stroke="var(--red)"
                fill="var(--red)"
                fillOpacity={0.1}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
