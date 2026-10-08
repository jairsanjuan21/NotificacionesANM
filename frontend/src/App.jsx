import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'http://127.0.0.1:8000/api';

const REGIONALES_ANM = [
  { id: 'bogota', label: 'Bogotá' },
  { id: 'bucaramanga', label: 'Bucaramanga' },
  { id: 'cartagena', label: 'Cartagena' },
  { id: 'valledupar', label: 'Valledupar' },
  { id: 'ibague', label: 'Ibagué' },
  { id: 'pasto', label: 'Pasto' },
  { id: 'cali', label: 'Cali' },
  { id: 'cucuta', label: 'Cúcuta' },
  { id: 'manizales', label: 'Manizales' },
  { id: 'medellin', label: 'Medellín' },
  { id: 'nobsa', label: 'Nobsa' },
  { id: 'quibdo', label: 'Quibdó' }
];

// Función utilitaria para convertir fechas de la ANM (DD/MM/YYYY o YYYY-MM-DD) a Timestamp numérico
const parsearFechaANM = (fechaStr) => {
  if (!fechaStr) return 0;
  const limpia = fechaStr.trim();

  // Caso 1: Formato DD/MM/YYYY o DD-MM-YYYY
  const matchDMY = limpia.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (matchDMY) {
    const [, dia, mes, anio] = matchDMY;
    return new Date(Number(anio), Number(mes) - 1, Number(dia)).getTime();
  }

  // Caso 2: Formato ISO YYYY-MM-DD
  const matchYMD = limpia.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (matchYMD) {
    const [, anio, mes, dia] = matchYMD;
    return new Date(Number(anio), Number(mes) - 1, Number(dia)).getTime();
  }

  // Fallback estándar
  const parsed = Date.parse(limpia);
  return isNaN(parsed) ? 0 : parsed;
};

function App() {
  const [pestanaActiva, setPestanaActiva] = useState('boletines'); // 'boletines' | 'placas'
  const [clientes, setClientes] = useState([]);
  const [notificaciones, setNotificaciones] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroRegional, setFiltroRegional] = useState('todas');
  const [criterioOrden, setCriterioOrden] = useState('fecha_desc'); // 'fecha_desc' | ' fecha_asc' | 'placa_asc'

  // Estados para formulario de Crear / Editar Placa
  const [editandoId, setEditandoId] = useState(null);
  const [formPlaca, setFormPlaca] = useState('');
  const [formNombre, setFormNombre] = useState('');
  const [formRegionales, setFormRegionales] = useState(['bucaramanga']);

  // Estados para el motor de sincronización (Scraper)
  const [escaneandoGlobal, setEscaneandoGlobal] = useState(false);
  const [escaneandoClienteId, setEscaneandoClienteId] = useState(null);
  const [mensajeSync, setMensajeSync] = useState(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const [resCli, resNot] = await Promise.all([
        axios.get(`${API_BASE}/clientes`),
        axios.get(`${API_BASE}/notificaciones`)
      ]);
      setClientes(resCli.data);
      setNotificaciones(resNot.data);
    } catch (error) {
      console.error("Error cargando datos:", error);
    }
  };

  const toggleRegionalForm = (idReg) => {
    if (formRegionales.includes(idReg)) {
      if (formRegionales.length > 1) {
        setFormRegionales(formRegionales.filter(r => r !== idReg));
      }
    } else {
      setFormRegionales([...formRegionales, idReg]);
    }
  };

  const guardarCliente = async (e) => {
    e.preventDefault();
    const payload = {
      placa: formPlaca.trim().toUpperCase(),
      nombre_empresa: formNombre.trim().toUpperCase() || 'SIN NOMBRE',
      regional: formRegionales.join(','),
      activo: true
    };

    try {
      if (editandoId) {
        await axios.put(`${API_BASE}/clientes/${editandoId}`, payload);
      } else {
        await axios.post(`${API_BASE}/clientes`, payload);
      }
      resetearFormulario();
      cargarDatos();
    } catch (error) {
      alert("Error: " + (error.response?.data?.detail || "No se pudo guardar la placa."));
    }
  };

  const iniciarEdicion = (cliente) => {
    setEditandoId(cliente.id_cliente);
    setFormPlaca(cliente.placa);
    setFormNombre(cliente.nombre_empresa || '');
    const regs = cliente.regional ? cliente.regional.split(',').map(r => r.trim().toLowerCase()) : ['bucaramanga'];
    setFormRegionales(regs);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const eliminarCliente = async (id, placa) => {
    if (!window.confirm(`¿Estás seguro de eliminar la placa ${placa} y todo su historial?`)) return;
    try {
      await axios.delete(`${API_BASE}/clientes/${id}`);
      cargarDatos();
    } catch (error) {
      alert("Error al eliminar la placa.");
    }
  };

  const resetearFormulario = () => {
    setEditandoId(null);
    setFormPlaca('');
    setFormNombre('');
    setFormRegionales(['bucaramanga']);
  };

  const consultarBoletinesNuevos = async (idCliente = null, nombrePlaca = '') => {
    setMensajeSync(null);
    if (idCliente) {
      setEscaneandoClienteId(idCliente);
    } else {
      setEscaneandoGlobal(true);
    }

    try {
      const url = idCliente 
        ? `${API_BASE}/scraper/ejecutar?id_cliente=${idCliente}` 
        : `${API_BASE}/scraper/ejecutar`;
      
      const res = await axios.post(url);
      const nuevas = res.data.nuevas_notificaciones;
      
      setMensajeSync(
        idCliente
          ? `Consulta finalizada para ${nombrePlaca}: ${nuevas} boletines nuevos encontrados.`
          : `Barrido general completado: ${nuevas} notificaciones nuevas detectadas.`
      );
      await cargarDatos();
    } catch (error) {
      alert("Error ejecutando la consulta en la ANM: " + (error.response?.data?.detail || error.message));
    } finally {
      setEscaneandoGlobal(false);
      setEscaneandoClienteId(null);
    }
  };

  // 1. Enriquecer cada cliente con sus notificaciones ya ordenadas por fecha (de más reciente a más antigua)
  const clientesProcesados = clientes.map(cliente => {
    const notifsOrdenadas = notificaciones
      .filter(n => n.id_cliente === cliente.id_cliente)
      .sort((a, b) => {
        const diffFecha = parsearFechaANM(b.fecha_aviso) - parsearFechaANM(a.fecha_aviso);
        return diffFecha !== 0 ? diffFecha : b.id_notificacion - a.id_notificacion;
      });

    // El timestamp más reciente del cliente es el de su primera notificación tras ordenar
    const ultimaFechaTimestamp = notifsOrdenadas.length > 0 
      ? parsearFechaANM(notifsOrdenadas[0].fecha_aviso) 
      : 0;

    const ultimaFechaTexto = notifsOrdenadas.length > 0 
      ? notifsOrdenadas[0].fecha_aviso 
      : null;

    return {
      ...cliente,
      notificacionesOrdenadas: notifsOrdenadas,
      ultimaFechaTimestamp,
      ultimaFechaTexto
    };
  });

  // 2. Aplicar filtros de búsqueda y región + Ordenamiento seleccionado
  const clientesFiltradosYOrdenados = clientesProcesados
    .filter(c => {
      const coincideTexto = 
        c.placa.toLowerCase().includes(busqueda.toLowerCase()) ||
        (c.nombre_empresa && c.nombre_empresa.toLowerCase().includes(busqueda.toLowerCase()));
      
      const coincideRegion = 
        filtroRegional === 'todas' || 
        (c.regional && c.regional.toLowerCase().includes(filtroRegional));

      return coincideTexto && coincideRegion;
    })
    .sort((a, b) => {
      if (criterioOrden === 'fecha_desc') {
        // Primero las placas con notificaciones más recientes; las que no tienen van al final
        if (b.ultimaFechaTimestamp !== a.ultimaFechaTimestamp) {
          return b.ultimaFechaTimestamp - a.ultimaFechaTimestamp;
        }
        return a.placa.localeCompare(b.placa);
      }
      if (criterioOrden === 'fecha_asc') {
        // Si no tienen fecha, mandarlas al final igualmente
        if (a.ultimaFechaTimestamp === 0 && b.ultimaFechaTimestamp > 0) return 1;
        if (b.ultimaFechaTimestamp === 0 && a.ultimaFechaTimestamp > 0) return -1;
        return a.ultimaFechaTimestamp - b.ultimaFechaTimestamp;
      }
      // Orden alfabético por placa
      return a.placa.localeCompare(b.placa);
    });

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '1150px', margin: '0 auto', padding: '20px', color: '#2c3e50' }}>
      
      {/* CABECERA PRINCIPAL Y NAVEGACIÓN DE MÓDULOS */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #ecf0f1', paddingBottom: '15px', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px' }}>Sistema de Monitoreo Minero ANM</h1>
          <span style={{ color: '#7f8c8d', fontSize: '14px' }}>Total placas monitoreadas: {clientes.length} | Resoluciones registradas: {notificaciones.length}</span>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setPestanaActiva('boletines')}
            style={{
              padding: '10px 18px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold',
              background: pestanaActiva === 'boletines' ? '#1f3a52' : '#ecf0f1',
              color: pestanaActiva === 'boletines' ? 'white' : '#2c3e50'
            }}
          >
            📄 Boletines y Consulta ANM
          </button>
          <button
            onClick={() => setPestanaActiva('placas')}
            style={{
              padding: '10px 18px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold',
              background: pestanaActiva === 'placas' ? '#1f3a52' : '#ecf0f1',
              color: pestanaActiva === 'placas' ? 'white' : '#2c3e50'
            }}
          >
            ⚙️ Gestionar Placas y Regiones
          </button>
        </div>
      </header>

      {/* BARRA DE FILTROS Y ORDENAMIENTO */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', background: '#f8f9fa', padding: '15px', borderRadius: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="🔍 Buscar por placa o titular..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ flex: 1, minWidth: '220px', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
        />
        
        <select
          value={filtroRegional}
          onChange={(e) => setFiltroRegional(e.target.value)}
          style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc', minWidth: '170px' }}
        >
          <option value="todas">📍 Todas las Regiones</option>
          {REGIONALES_ANM.map(r => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>

        {/* Nuevo selector de Orden Cronológico */}
        <select
          value={criterioOrden}
          onChange={(e) => setCriterioOrden(e.target.value)}
          style={{ padding: '10px', borderRadius: '6px', border: '1px solid #2980b9', background: '#ebf5fb', color: '#1f3a52', fontWeight: 'bold', minWidth: '220px' }}
        >
          <option value="fecha_desc">📅 Últimos Boletines Publicados</option>
          <option value="fecha_asc">📅 Boletines Más Antiguos Primero</option>
          <option value="placa_asc">🔤 Orden Alfabético (Placa A-Z)</option>
        </select>

        {pestanaActiva === 'boletines' && (
          <button
            onClick={() => consultarBoletinesNuevos(null)}
            disabled={escaneandoGlobal || escaneandoClienteId !== null}
            style={{
              padding: '10px 18px', background: escaneandoGlobal ? '#95a5a6' : '#27ae60',
              color: 'white', border: 'none', borderRadius: '6px', cursor: escaneandoGlobal ? 'not-allowed' : 'pointer', fontWeight: 'bold'
            }}
          >
            {escaneandoGlobal ? '⏳ Consultando ANM...' : '🔄 Consultar Nuevos Boletines'}
          </button>
        )}
      </div>

      {mensajeSync && (
        <div style={{ padding: '12px 15px', background: '#d4edda', color: '#155724', borderRadius: '6px', marginBottom: '20px', fontWeight: 'bold' }}>
          ✅ {mensajeSync}
        </div>
      )}

      {/* =========================================================
          MÓDULO 1: GESTIÓN DE PLACAS, REGIONES Y TITULARES (CRUD)
         ========================================================= */}
      {pestanaActiva === 'placas' && (
        <div>
          <div style={{ background: '#ffffff', border: '1px solid #dcdde1', padding: '20px', borderRadius: '8px', marginBottom: '25px', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <h3 style={{ marginTop: 0 }}>{editandoId ? '✏️ Actualizar Placa Existente' : '➕ Registrar Nueva Placa'}</h3>
            <form onSubmit={guardarCliente}>
              <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1', minWidth: '180px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Código de Placa *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: HAN-111"
                    value={formPlaca}
                    onChange={(e) => setFormPlaca(e.target.value)}
                    style={{ width: '100%', padding: '9px', borderRadius: '5px', border: '1px solid #ccc', textTransform: 'uppercase', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: '2', minWidth: '280px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Nombre del Titular / Empresa *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: CONYSER SAS"
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value)}
                    style={{ width: '100%', padding: '9px', borderRadius: '5px', border: '1px solid #ccc', textTransform: 'uppercase', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>
                  Punto de Atención Regional ANM (Puedes marcar más de una si comparte sede):
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px', background: '#f8f9fa', padding: '12px', borderRadius: '6px' }}>
                  {REGIONALES_ANM.map(reg => (
                    <label key={reg.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formRegionales.includes(reg.id)}
                        onChange={() => toggleRegionalForm(reg.id)}
                      />
                      {reg.label}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" style={{ padding: '10px 20px', background: '#2980b9', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {editandoId ? 'Guardar Cambios' : 'Registrar Placa'}
                </button>
                {editandoId && (
                  <button type="button" onClick={resetearFormulario} style={{ padding: '10px 15px', background: '#7f8c8d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                    Cancelar Edición
                  </button>
                )}
              </div>
            </form>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', border: '1px solid #dcdde1', borderRadius: '8px', overflow: 'hidden' }}>
            <thead style={{ background: '#1f3a52', color: 'white', textAlign: 'left' }}>
              <tr>
                <th style={{ padding: '12px' }}>Placa</th>
                <th style={{ padding: '12px' }}>Titular / Cliente</th>
                <th style={{ padding: '12px' }}>Último Boletín</th>
                <th style={{ padding: '12px' }}>Región(es)</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientesFiltradosYOrdenados.map(c => (
                <tr key={c.id_cliente} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>{c.placa}</td>
                  <td style={{ padding: '12px' }}>{c.nombre_empresa}</td>
                  <td style={{ padding: '12px', color: c.ultimaFechaTexto ? '#27ae60' : '#95a5a6', fontWeight: 'bold', fontSize: '13px' }}>
                    {c.ultimaFechaTexto || 'Sin boletines'}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {(c.regional || 'bucaramanga').split(',').map(r => (
                      <span key={r} style={{ display: 'inline-block', background: '#e1f0fa', color: '#1f3a52', padding: '3px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', marginRight: '5px', textTransform: 'capitalize' }}>
                        {r.trim()}
                      </span>
                    ))}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <button
                      onClick={() => iniciarEdicion(c)}
                      style={{ marginRight: '8px', padding: '6px 12px', background: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => eliminarCliente(c.id_cliente, c.placa)}
                      style={{ padding: '6px 12px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                    >
                      🗑️ Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* =========================================================
          MÓDULO 2: VISUALIZACIÓN Y ACTUALIZACIÓN DE BOLETINES
         ========================================================= */}
      {pestanaActiva === 'boletines' && (
        <div>
          {clientesFiltradosYOrdenados.map(cliente => {
            const notifsCliente = cliente.notificacionesOrdenadas;
            const estaEscaneandoEsta = escaneandoClienteId === cliente.id_cliente;

            return (
              <div key={cliente.id_cliente} style={{ marginBottom: '22px', border: '1px solid #dcdde1', borderRadius: '8px', overflow: 'hidden', background: 'white' }}>
                <div style={{ background: '#2c3e50', color: 'white', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <strong style={{ fontSize: '18px' }}>Placa: {cliente.placa}</strong>
                    <span style={{ marginLeft: '12px', color: '#bdc3c7' }}>| {cliente.nombre_empresa}</span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {cliente.ultimaFechaTexto && (
                      <span style={{ background: '#27ae60', color: 'white', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                        📅 Último: {cliente.ultimaFechaTexto}
                      </span>
                    )}
                    <span style={{ background: '#34495e', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', textTransform: 'uppercase' }}>
                      📍 {cliente.regional || 'bucaramanga'}
                    </span>
                    <button
                      onClick={() => consultarBoletinesNuevos(cliente.id_cliente, cliente.placa)}
                      disabled={escaneandoGlobal || escaneandoClienteId !== null}
                      style={{
                        padding: '6px 12px', background: estaEscaneandoEsta ? '#95a5a6' : '#3498db',
                        color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
                      }}
                    >
                      {estaEscaneandoEsta ? '⏳ Consultando...' : '🔍 Buscar Boletín Ahora'}
                    </button>
                  </div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                  <thead style={{ background: '#f1f2f6' }}>
                    <tr>
                      <th style={{ padding: '10px 15px' }}>Fecha del Aviso (Más reciente primero)</th>
                      <th style={{ padding: '10px 15px' }}>Acto Administrativo / Resolución</th>
                      <th style={{ padding: '10px 15px' }}>Estado de Alerta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifsCliente.map(notif => (
                      <tr key={notif.id_notificacion} style={{ borderBottom: '1px solid #f1f2f6' }}>
                        <td style={{ padding: '10px 15px', fontWeight: '500' }}>{notif.fecha_aviso}</td>
                        <td style={{ padding: '10px 15px' }}>
                          <a href={notif.url_pdf} target="_blank" rel="noopener noreferrer" style={{ color: '#2980b9', fontWeight: 'bold', textDecoration: 'none' }}>
                            📄 {notif.url_pdf.split('/').pop()}
                          </a>
                        </td>
                        <td style={{ padding: '10px 15px' }}>
                          {notif.notificacion_enviada ? (
                            <span style={{ color: '#27ae60', fontWeight: 'bold' }}>✅ Notificado</span>
                          ) : (
                            <span style={{ color: '#e67e22', fontWeight: 'bold' }}>⏳ Pendiente</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {notifsCliente.length === 0 && (
                      <tr>
                        <td colSpan="3" style={{ padding: '14px', textAlign: 'center', color: '#7f8c8d' }}>
                          Sin resoluciones registradas para esta placa.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default App;