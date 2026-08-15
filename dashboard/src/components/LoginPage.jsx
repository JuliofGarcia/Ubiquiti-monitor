import React, { useState } from "react";
 
export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
 
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) throw new Error("Credenciales inválidas");
      const data = await res.json();
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      localStorage.setItem("user_name", data.name);
      onLogin();
    } catch (err) {
      setError(err.message);
    }
  };
 
  return (
    <div className="login-page">
      <div className="login-bg-overlay"></div>
      <div className="login-card">
        <div className="login-logo-section">
          <img src="/images/logo-Inred.png" alt="Logo" className="login-logo" />
        </div>
        <form onSubmit={handleSubmit}>
          <h2>Iniciar Sesión</h2>
          {error && <p className="error">{error}</p>}
          <div className="input-group">
            <input type="text" placeholder="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="input-group">
            <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn-login">Ingresar</button>
        </form>
      </div>
    </div>
  );
}
