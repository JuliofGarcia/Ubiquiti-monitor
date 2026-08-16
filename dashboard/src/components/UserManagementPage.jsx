import { useState, useEffect } from "react";
 
export default function UserManagementPage() {
  const [users, setUsers] = useState({});
  const [loading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "viewer", name: "" });
  const [message, setMessage] = useState("");
  const [editingUser, setEditingUser] = useState(null);
 
  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (!res.ok) throw new Error("Error fetching users");
      const data = await res.json();
      setUsers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
 
  useEffect(() => {
    fetchUsers();
  }, []);
 
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}` 
        },
        body: JSON.stringify(newUser),
      });
      if (!res.ok) throw new Error("Error creating user");
      setMessage(editingUser ? "Usuario actualizado exitosamente" : "Usuario creado exitosamente");
      setNewUser({ username: "", password: "", role: "viewer", name: "" });
      setEditingUser(null);
      fetchUsers();
    } catch (e) {
      setMessage("Error: " + e.message);
    }
  };
 
  const handleEdit = (username, data) => {
    setEditingUser(username);
    setNewUser({
      username: username,
      name: data.name,
      role: data.role,
      password: "" // Password remains empty unless they want to change it
    });
  };
 
  const handleDelete = async (username) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar al usuario ${username}?`)) return;
    
    try {
      const res = await fetch(`/api/users/${username}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (!res.ok) throw new Error("Error deleting user");
      setMessage("Usuario eliminado exitosamente");
      fetchUsers();
    } catch (e) {
      setMessage("Error: " + e.message);
    }
  };
 
  if (loading) return <div className="chart-placeholder">Cargando usuarios...</div>;
 
  return (
    <div className="user-management">
      <div className="panel">
        <div className="panel-header">Gestión de Usuarios</div>
        <div className="panel-body">
          <form onSubmit={handleCreateUser} className="user-form">
            <h3>{editingUser ? `Editando Usuario: ${editingUser}` : "Crear Nuevo Usuario"}</h3>
            <div className="form-grid">
              <input 
                type="text" placeholder="Usuario (ID)" 
                value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} required 
                disabled={!!editingUser}
              />
              <input 
                type="text" placeholder="Nombre Completo" 
                value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} required 
              />
              <input 
                type="password" placeholder="Contraseña (dejar vacío para no cambiar)" 
                value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} 
                required={!editingUser}
              />
              <select 
                value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}
              >
                <option value="viewer">Consultor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "15px" }}>
              <button type="submit" className="btn-refresh">
                {editingUser ? "Actualizar Usuario" : "Guardar Usuario"}
              </button>
              {editingUser && (
                <button 
                  type="button" 
                  className="btn-back" 
                  onClick={() => { setEditingUser(null); setNewUser({ username: "", password: "", role: "viewer", name: "" }); }}
                >
                  Cancelar
                </button>
              )}
            </div>
            {message && <p className="user-message">{message}</p>}
          </form>
 
          <div className="user-table-container">
            <h3>Lista de Usuarios</h3>
            <table className="user-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th style={{ textAlign: "center" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(users).map(([username, data]) => (
                  <tr key={username}>
                    <td>{username}</td>
                    <td>{data.name}</td>
                    <td>
                      <span className={`role-badge ${data.role === "admin" ? "badge-admin" : "badge-viewer"}`}>
                        {data.role === "admin" ? "Administrador" : "Consultor"}
                      </span>
                    </td>
                    <td style={{ textAlign: "center", display: "flex", gap: "8px", justifyContent: "center" }}>
                      <button 
                        className="page-btn" 
                        onClick={() => handleEdit(username, data)}
                        style={{ color: "var(--blue)", borderColor: "var(--blue)" }}
                      >
                        Editar
                      </button>
                      <button 
                        className="page-btn" 
                        onClick={() => handleDelete(username)}
                        style={{ color: "var(--red)", borderColor: "var(--red)" }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

