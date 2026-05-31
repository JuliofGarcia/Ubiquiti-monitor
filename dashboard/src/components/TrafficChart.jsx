import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const RANGES = [
  { label: "1h", value: "1h", hours: 1 },
  { label: "6h", value: "6h", hours: 6 },
  { label: "24h", value: "24h", hours: 24 },
  { label: "7d", value: "168h", hours: 168 },
  { label: "30d", value: "720h", hours: 720 },
];

export default function TrafficChart({ data, range, onRangeChange, loading, title }) {
  const [customMode, setCustomMode] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const hasData = data && data.length > 0;
  const allZero = hasData && data.every((d) => d.download === 0 && d.upload === 0);

  // Escalar los datos a GB para mejor visualización
  const scaled = data.map((d) => ({
    ...d,
    download: Number((d.download * 1000).toFixed(4)),
    upload: Number((d.upload * 1000).toFixed(4)),
  }));

  const applyCustomRange = () => {
    if (dateFrom && dateTo) {
      onRangeChange(`custom|${dateFrom}|${dateTo}`);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <span>{title || "Tráfico de Red"}</span>
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
          <div className="chart-placeholder">Cargando tráfico...</div>
        ) : allZero ? (
          <div className="chart-placeholder">
            Sin datos de tráfico en este período.
            <br />
            <small>Los datos se acumulan con cada ciclo de recolección (5 min).</small>
          </div>
        ) : !hasData ? (
          <div className="chart-placeholder">Sin datos de tráfico disponibles</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={scaled}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 11 }}
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
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v.toFixed(1)} />
              <Tooltip
                labelFormatter={(t) => new Date(t).toLocaleString("es-CO")}
                formatter={(v) => `${Number(v).toFixed(2)} GB`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="download"
                name="Descarga (Rx) GB"
                stroke="var(--blue)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="upload"
                name="Carga (Tx) GB"
                stroke="var(--orange)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
