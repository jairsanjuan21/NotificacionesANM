import { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [clientesAgrupados, setClientesAgrupados] = useState([]);
  const [nuevaPlaca, setNuevaPlaca] = useState('');

  // Se ejecuta automáticamente al cargar la página
  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      // Extraemos clientes y notificaciones en paralelo
      const resClientes = await axios.get('http://127.0.0.1:8000/api/clientes');
      const resNotificaciones = await axios.get('http://127.0.0.1:8000/api/notificaciones');

      const clientes = resClientes.data;
      const notificaciones = resNotificaciones.data;

      // Estructuramos los datos: inyectamos las notificaciones dentro de su respectivo cliente
      const datosAgrupados = clientes.map(cliente => ({
        ...cliente,
        notificaciones: notificaciones.filter(notif => notif.id_cliente === cliente.id_cliente)
      }));

      setClientesAgrupados(datosAgrupados);
    } catch (error) {
      console.error("Error conectando con la API:", error);
    }
  };

  const registrarCliente = async (e) => {
    e.preventDefault();
    try {
      await axios.post('http://127.0.0.1:8000/api/clientes', { 
        placa: nuevaPlaca.toUpperCase(), 
        activo: true,
        nombre_empresa: "Nuevo Cliente" // Puedes habilitar un input para esto después
      });
      alert(`Placa ${nuevaPlaca.toUpperCase()} registrada exitosamente.`);
      setNuevaPlaca('');
      cargarDatos(); // Refrescar la vista automáticamente
    } catch (error) {
      alert("Error: " + (error.response?.data?.detail || "No se pudo registrar la placa"));
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1000px', margin: '0 auto' }}>
      <h1>Panel de Notificaciones ANM</h1>
      
      {/* Módulo de Ingesta (Agregar Cliente) */}
      <div style={{ marginBottom: '30px', padding: '15px', background: '#f5f5f5', borderRadius: '8px' }}>
        <h3>Registrar Nuevo Cliente</h3>
        <form onSubmit={registrarCliente}>
          <input 
            type="text" 
            placeholder="Ej: HAN-111" 
            value={nuevaPlaca}
            onChange={(e) => setNuevaPlaca(e.target.value)}
            required
            style={{ padding: '8px', marginRight: '10px', textTransform: 'uppercase' }}
          />
          <button type="submit" style={{ padding: '8px 15px', cursor: 'pointer', background: '#2980b9', color: 'white', border: 'none', borderRadius: '4px' }}>
            Guardar Placa
          </button>
        </form>
      </div>

      {/* Módulo de Visualización Agrupada */}
      <h3>Estado de Clientes Activos</h3>
      
      {clientesAgrupados.map((cliente) => (
        <div key={cliente.id_cliente} style={{ marginBottom: '30px', border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden' }}>
          
          <div style={{ background: '#2c3e50', color: 'white', padding: '15px', display: 'flex', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>Placa: {cliente.placa}</h2>
            <span style={{ margin: 0, alignSelf: 'center' }}>{cliente.nombre_empresa}</span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: '#ecf0f1' }}>
              <tr>
                <th style={{ padding: '12px' }}>Fecha del Boletín</th>
                <th style={{ padding: '12px' }}>Resolución Oficial</th>
                <th style={{ padding: '12px' }}>Estado de Email</th>
              </tr>
            </thead>
            <tbody>
              {cliente.notificaciones.map((notif) => (
                <tr key={notif.id_notificacion} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px' }}>{notif.fecha_aviso}</td>
                  <td style={{ padding: '12px' }}>
                    <a href={notif.url_pdf} target="_blank" rel="noopener noreferrer" style={{ color: '#2980b9', fontWeight: 'bold', textDecoration: 'none' }}>
                      📄 Ver Acto Administrativo
                    </a>
                  </td>
                  <td style={{ padding: '12px' }}>
                    {notif.notificacion_enviada ? (
                      <span style={{ color: '#27ae60', fontWeight: 'bold' }}>✅ Enviado</span>
                    ) : (
                      <span style={{ color: '#e67e22', fontWeight: 'bold' }}>⏳ Pendiente</span>
                    )}
                  </td>
                </tr>
              ))}
              
              {/* Renderizado condicional si no hay notificaciones */}
              {cliente.notificaciones.length === 0 && (
                <tr>
                  <td colSpan="3" style={{ padding: '15px', textAlign: 'center', color: '#7f8c8d' }}>
                    Sin notificaciones registradas para este cliente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      {clientesAgrupados.length === 0 && (
        <div style={{ padding: '20px', background: '#fff3cd', color: '#856404', borderRadius: '8px' }}>
          No hay clientes registrados en el sistema. Utiliza el formulario superior para añadir uno.
        </div>
      )}
    </div>
  );
}

export default App;