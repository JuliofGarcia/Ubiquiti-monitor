const API_BASE = "/api";

async function request(url, options = {}) {
  const token = localStorage.getItem("token");
  const headers = {
    ...options.headers,
    "Authorization": `Bearer ${token}`,
  };
  
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.reload();
  }
  if (!res.ok) throw new Error("Error en la solicitud");
  return res;
}

export async function fetchStats() {
  const res = await request("/stats");
  return res.json();
}

export async function fetchSites(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) query.set(k, v);
  });
  const res = await request(`/sites?${query}`);
  return res.json();
}

export async function fetchTraffic(range = "24h", siteId = null, extraParams = {}) {
  const query = new URLSearchParams();
  if (range.startsWith("custom|")) {
    const [, from, to] = range.split("|");
    query.set("from", from);
    query.set("to", to);
  } else {
    query.set("hours", range.replace("h", ""));
  }
  if (siteId) query.set("site_id", siteId);
  Object.entries(extraParams).forEach(([k, v]) => { if (v) query.set(k, v); });
  const res = await request(`/traffic?${query}`);
  return res.json();
}

export async function fetchActivity(range = "168", siteId = null, extraParams = {}) {
  const query = new URLSearchParams();
  if (range.startsWith("custom|")) {
    const [, from, to] = range.split("|");
    query.set("from", from);
    query.set("to", to);
  } else {
    query.set("hours", range);
  }
  if (siteId) query.set("site_id", siteId);
  Object.entries(extraParams).forEach(([k, v]) => { if (v) query.set(k, v); });
  const res = await request(`/activity?${query}`);
  return res.json();
}

export async function fetchDevices(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) query.set(k, v);
  });
  const res = await request(`/devices?${query}`);
  return res.json();
}

export async function fetchAlerts() {
  const res = await request("/alerts");
  return res.json();
}

export async function fetchSiteDevices(siteId) {
  const res = await request(`/site-devices?site_id=${siteId}`);
  return res.json();
}

export async function fetchDepartments() {
  const res = await request("/departments");
  return res.json();
}

export async function fetchReport(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v && v !== "all") query.set(k, v);
  });
  const res = await request(`/report?${query}`);
  return res.json();
}

export async function toggleEstado(code, estado, fecha_inicio) {
  const body = { code, estado };
  if (fecha_inicio) body.fecha_inicio = fecha_inicio;
  const res = await request("/toggle-estado", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function fetchExcelReport(siteId) {
  return request(`/report/excel?site_id=${siteId}`);
}

