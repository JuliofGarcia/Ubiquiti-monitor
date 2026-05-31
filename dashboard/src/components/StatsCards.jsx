export default function StatsCards({ stats, loading }) {
  const cards = [
    {
      label: "Juntas: Todas Online",
      value: stats?.sites_online_total ?? "-",
      total: stats?.sites_total ?? "-",
      color: "var(--green)",
      icon: "▲",
    },
    {
      label: "Juntas: Parciales",
      value: stats?.sites_parcial ?? "-",
      total: stats?.sites_total ?? "-",
      color: "var(--orange)",
      icon: "◆",
    },
    {
      label: "Juntas: Caídas",
      value: stats?.sites_caidas ?? "-",
      total: stats?.sites_total ?? "-",
      color: "var(--red)",
      icon: "▼",
    },
    {
      label: "Operación: Todas Online",
      value: stats?.ops_online_total ?? "-",
      total: stats?.ops_total ?? "-",
      color: "var(--green)",
      icon: "▲",
    },
    {
      label: "Operación: Parciales",
      value: stats?.ops_parcial ?? "-",
      total: stats?.ops_total ?? "-",
      color: "var(--orange)",
      icon: "◆",
    },
    {
      label: "Operación: Caídas",
      value: stats?.ops_caidas ?? "-",
      total: stats?.ops_total ?? "-",
      color: "var(--red)",
      icon: "▼",
    },
    {
      label: "Access Point Online",
      value: stats?.aps_online ?? "-",
      total: stats?.aps_total ?? "-",
      color: "var(--green)",
      icon: "⬡",
    },
    {
      label: "Access Point Offline",
      value: stats ? (stats.aps_total || 0) - (stats.aps_online || 0) : "-",
      total: stats?.aps_total ?? "-",
      color: "var(--red)",
      icon: "⬠",
    },
    {
      label: "Hogares Online",
      value: stats?.clients_online ?? "-",
      total: stats?.clients_total ?? "-",
      color: "var(--green)",
      icon: "●",
    },
    {
      label: "Hogares Offline",
      value: stats?.clients_offline ?? "-",
      total: stats?.clients_total ?? "-",
      color: "var(--orange)",
      icon: "○",
    },
  ];

  return (
    <div className="stats-grid stats-grid-8">
      {cards.map((card) => (
        <div key={card.label} className="stat-card">
          <div className="stat-icon" style={{ color: card.color }}>
            {card.icon}
          </div>
          <div className="stat-info">
            <span className="stat-label">{card.label}</span>
            <span className="stat-value" style={{ color: card.color }}>
              {loading ? "..." : card.value}
            </span>
            <span className="stat-total">de {loading ? "..." : card.total}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
