import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE, BadgeUrgencia, CeldaPlazo, SelectorEstado, CeldaDocumento } from './componentes';
import Vencimientos from './Vencimientos';
import Monitoreo from './Monitoreo';

const botonPestana = (activa) => ({
  padding: '10px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold',
  background: activa ? '#1f3a52' : '#ecf0f1', color: activa ? 'white' : '#2c3e50'
});

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

// Normalizador de fechas de la ANM (DD/MM/YYYY o YYYY-MM-DD) a Timestamp numérico
const parsearFechaANM = (fechaStr) => {
  if (!fechaStr) return 0;
  const limpia = fechaStr.trim();

  const matchDMY = limpia.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (matchDMY) {
    const [, dia, mes, anio] = matchDMY;
    return new Date(Number(anio), Number(mes) - 1, Number(dia)).getTime();
  }

  const matchYMD = limpia.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (matchYMD) {
    const [, anio, mes, dia] = matchYMD;
    return new Date(Number(anio), Number(mes) - 1, Number(dia)).getTime();
  }

  const parsed = Date.parse(limpia);
  return isNaN(parsed) ? 0 : parsed;
};

function App() {
  const [pestanaActiva, setPestanaActiva] = useState('boletines'); // 'boletines' | 'vencimientos' | 'placas' | 'monitoreo'
  const [clientes, setClientes] = useState([]);
  const [notificaciones, setNotificaciones] = useState([]);
  
  // Filtros y ordenamiento
  const [busqueda, setBusqueda] = useState('');
  const [filtroRegional, setFiltroRegional] = useState('todas');
  const [filtroEstado, setFiltroEstado] = useState('todos'); // 'todos' | 'con_boletines' | 'sin_boletines'
  const [criterioOrden, setCriterioOrden] = useState('fecha_desc'); // 'fecha_desc' | 'fecha_asc' | 'placa_asc'
  const [filtroGestion, setFiltroGestion] = useState('todas'); // 'todas' | 'sin_responder' | 'urgentes'

  // Estados para formulario CRUD de Placa
  const [editandoId, setEditandoId] = useState(null);
  const [formPlaca, setFormPlaca] = useState('');
  const [formNombre, setFormNombre] = useState('');
  const [formRegionales, setFormRegionales] = useState(['bucaramanga']);
  const [formEmail, setFormEmail] = useState('');
  const [formNit, setFormNit] = useState('');
  const [importando, setImportando] = useState(false);

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
      activo: true,
      email: formEmail.trim(),
      nit: formNit.trim()
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
    const regs = cliente.regional
      ? cliente.regional.split(',').map(r => r.trim().toLowerCase()).filter(r => r !== 'all')
      : ['bucaramanga'];
    setFormRegionales(regs.length > 0 ? regs : ['bucaramanga']);
    setFormEmail(cliente.email || '');
    setFormNit(cliente.nit || '');
    setPestanaActiva('placas');
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

  const eliminarNotificacionIndividual = async (idNotificacion, nombreArchivo) => {
    if (!window.confirm(`¿Deseas desvincular el documento "${nombreArchivo}" de esta placa?`)) return;
    try {
      await axios.delete(`${API_BASE}/notificaciones/${idNotificacion}`);
      cargarDatos();
    } catch (error) {
      alert("No se pudo eliminar la notificación.");
    }
  };

  const resetearFormulario = () => {
    setEditandoId(null);
    setFormPlaca('');
    setFormNombre('');
    setFormRegionales(['bucaramanga']);
    setFormEmail('');
    setFormNit('');
  };

  const importarArchivo = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setImportando(true);
    try {
      const datos = new FormData();
      datos.append('archivo', archivo);
      const res = await axios.post(`${API_BASE}/clientes/importar`, datos);
      const { creados, actualizados, omitidos } = res.data;
      alert(`Importación completada:\n• ${creados} placas nuevas\n• ${actualizados} actualizadas` +
        (omitidos.length ? `\n• Omitidas:\n  ${omitidos.join('\n  ')}` : ''));
      cargarDatos();
    } catch (error) {
      alert('Error al importar: ' + (error.response?.data?.detail || error.message));
    } finally {
      setImportando(false);
    }
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
          ? `Consulta completada para la placa ${nombrePlaca}: ${nuevas} resoluciones nuevas detectadas.`
          : `Sincronización general completada: ${nuevas} notificaciones nuevas detectadas.`
      );
      await cargarDatos();
    } catch (error) {
      if (error.response?.status === 409) {
        alert(error.response.data.detail);
      } else {
        alert("Error ejecutando la consulta en la ANM: " + (error.response?.data?.detail || error.message));
      }
    } finally {
      setEscaneandoGlobal(false);
      setEscaneandoClienteId(null);
    }
  };

  // Procesar clientes y ordenar sus notificaciones internamente
  const clientesProcesados = clientes.map(cliente => {
    const notifsOrdenadas = notificaciones
      .filter(n => n.id_cliente === cliente.id_cliente)
      .filter(n =>
        filtroGestion === 'todas' ||
        (filtroGestion === 'sin_responder' && n.estado !== 'respondida') ||
        (filtroGestion === 'urgentes' && n.urgencia === 'alta' && n.estado !== 'respondida'))
      .sort((a, b) => {
        const diffFecha = parsearFechaANM(b.fecha_aviso) - parsearFechaANM(a.fecha_aviso);
        return diffFecha !== 0 ? diffFecha : b.id_notificacion - a.id_notificacion;
      });

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

  // Aplicar filtros y ordenamiento
  const clientesFiltradosYOrdenados = clientesProcesados
    .filter(c => {
      const coincideTexto = 
        c.placa.toLowerCase().includes(busqueda.toLowerCase()) ||
        (c.nombre_empresa && c.nombre_empresa.toLowerCase().includes(busqueda.toLowerCase()));
      
      const coincideRegion = 
        filtroRegional === 'todas' || 
        (c.regional && c.regional.toLowerCase().includes(filtroRegional));

      const coincideEstado =
        filtroEstado === 'todos' ||
        (filtroEstado === 'con_boletines' && c.notificacionesOrdenadas.length > 0) ||
        (filtroEstado === 'sin_boletines' && c.notificacionesOrdenadas.length === 0);

      const coincideGestion = filtroGestion === 'todas' || c.notificacionesOrdenadas.length > 0;

      return coincideTexto && coincideRegion && coincideEstado && coincideGestion;
    })
    .sort((a, b) => {
      if (criterioOrden === 'fecha_desc') {
        if (b.ultimaFechaTimestamp !== a.ultimaFechaTimestamp) {
          return b.ultimaFechaTimestamp - a.ultimaFechaTimestamp;
        }
        return a.placa.localeCompare(b.placa);
      }
      if (criterioOrden === 'fecha_asc') {
        if (a.ultimaFechaTimestamp === 0 && b.ultimaFechaTimestamp > 0) return 1;
        if (b.ultimaFechaTimestamp === 0 && a.ultimaFechaTimestamp > 0) return -1;
        return a.ultimaFechaTimestamp - b.ultimaFechaTimestamp;
      }
      return a.placa.localeCompare(b.placa);
    });

  // Métricas KPI globales
  const totalConResoluciones = clientesProcesados.filter(c => c.notificacionesOrdenadas.length > 0).length;
  const fechaMasRecienteGlobal = clientesProcesados.reduce((max, c) => 
    c.ultimaFechaTimestamp > max.ts ? { ts: c.ultimaFechaTimestamp, txt: c.ultimaFechaTexto } : max
  , { ts: 0, txt: 'N/A' }).txt;
  const porVencer = notificaciones.filter(n =>
    n.estado !== 'respondida' && n.dias_habiles_restantes !== null && n.dias_habiles_restantes >= 0 && n.dias_habiles_restantes <= 5).length;
  const urgentesSinGestion = notificaciones.filter(n => n.urgencia === 'alta' && n.estado === 'nueva').length;

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '1200px', margin: '0 auto', padding: '20px', color: '#2c3e50' }}>
      
      {/* CABECERA PRINCIPAL */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #ecf0f1', paddingBottom: '16px', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '26px', color: '#1f3a52' }}>Sistema de Monitoreo Minero ANM</h1>
          <span style={{ color: '#7f8c8d', fontSize: '14px' }}>Vigilancia automatizada de Estados y Avisos por Punto de Atención Regional</span>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setPestanaActiva('boletines')} style={botonPestana(pestanaActiva === 'boletines')}>📄 Boletines</button>
          <button onClick={() => setPestanaActiva('vencimientos')} style={botonPestana(pestanaActiva === 'vencimientos')}>
            📅 Vencimientos{porVencer > 0 && <span style={{ marginLeft: '6px', background: '#c0392b', color: 'white', borderRadius: '10px', padding: '1px 7px', fontSize: '12px' }}>{porVencer}</span>}
          </button>
          <button onClick={() => setPestanaActiva('placas')} style={botonPestana(pestanaActiva === 'placas')}>⚙️ Placas</button>
          <button onClick={() => setPestanaActiva('monitoreo')} style={botonPestana(pestanaActiva === 'monitoreo')}>🩺 Monitoreo</button>
        </div>
      </header>

      {/* TARJETAS DE RESUMEN EJECUTIVO (KPIs) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px', marginBottom: '20px' }}>
        <div style={{ background: '#ffffff', border: '1px solid #e1e8ed', borderLeft: '4px solid #2980b9', padding: '14px 18px', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: '#7f8c8d', fontWeight: 'bold', textTransform: 'uppercase' }}>Títulos Monitoreados</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '4px' }}>{clientes.length} <span style={{ fontSize: '13px', color: '#27ae60', fontWeight: 'normal' }}>({totalConResoluciones} con historial)</span></div>
        </div>
        <div style={{ background: '#ffffff', border: '1px solid #e1e8ed', borderLeft: '4px solid #27ae60', padding: '14px 18px', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: '#7f8c8d', fontWeight: 'bold', textTransform: 'uppercase' }}>Resoluciones Extraídas</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '4px' }}>{notificaciones.length}</div>
        </div>
        <div style={{ background: '#ffffff', border: '1px solid #e1e8ed', borderLeft: '4px solid #8e44ad', padding: '14px 18px', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: '#7f8c8d', fontWeight: 'bold', textTransform: 'uppercase' }}>Último Aviso Registrado</div>
          <div style={{ fontSize: '22px', fontWeight: 'bold', marginTop: '4px', color: '#2c3e50' }}>{fechaMasRecienteGlobal}</div>
        </div>
        <div onClick={() => setPestanaActiva('vencimientos')} style={{ cursor: 'pointer', background: '#ffffff', border: '1px solid #e1e8ed', borderLeft: '4px solid #c0392b', padding: '14px 18px', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: '#7f8c8d', fontWeight: 'bold', textTransform: 'uppercase' }}>Vencen en ≤ 5 días hábiles</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '4px', color: porVencer ? '#c0392b' : '#2c3e50' }}>{porVencer}</div>
        </div>
        <div onClick={() => { setFiltroGestion('urgentes'); setPestanaActiva('boletines'); }} style={{ cursor: 'pointer', background: '#ffffff', border: '1px solid #e1e8ed', borderLeft: '4px solid #d35400', padding: '14px 18px', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', color: '#7f8c8d', fontWeight: 'bold', textTransform: 'uppercase' }}>Urgentes sin revisar</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '4px', color: urgentesSinGestion ? '#d35400' : '#2c3e50' }}>{urgentesSinGestion}</div>
        </div>
      </div>

      {/* BARRA DE FILTROS Y SINCRONIZACIÓN */}
      {(pestanaActiva === 'boletines' || pestanaActiva === 'placas') && (
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', background: '#f8f9fa', padding: '14px', borderRadius: '8px', alignItems: 'center', flexWrap: 'wrap', border: '1px solid #e9ecef' }}>
        <input
          type="text"
          placeholder="🔍 Buscar por placa o titular..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ flex: 1, minWidth: '200px', padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
        />
        
        <select
          value={filtroRegional}
          onChange={(e) => setFiltroRegional(e.target.value)}
          style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
        >
          <option value="todas">📍 Todas las Regiones</option>
          {REGIONALES_ANM.map(r => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>

        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
        >
          <option value="todos">📂 Todos los Expedientes</option>
          <option value="con_boletines">✅ Con Resoluciones ({totalConResoluciones})</option>
          <option value="sin_boletines">⚪ Sin Resoluciones ({clientes.length - totalConResoluciones})</option>
        </select>

        <select
          value={criterioOrden}
          onChange={(e) => setCriterioOrden(e.target.value)}
          style={{ padding: '10px', borderRadius: '6px', border: '1px solid #2980b9', background: '#ebf5fb', color: '#1f3a52', fontWeight: 'bold' }}
        >
          <option value="fecha_desc">📅 Últimos Boletines Publicados</option>
          <option value="fecha_asc">📅 Boletines Más Antiguos Primero</option>
          <option value="placa_asc">🔤 Orden Alfabético (Placa A-Z)</option>
        </select>

        {pestanaActiva === 'boletines' && (
          <select
            value={filtroGestion}
            onChange={(e) => setFiltroGestion(e.target.value)}
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }}
          >
            <option value="todas">🗂️ Todas las notificaciones</option>
            <option value="sin_responder">🛠️ Sin responder</option>
            <option value="urgentes">🚨 Urgentes sin responder</option>
          </select>
        )}

        {pestanaActiva === 'boletines' && (
          <button
            onClick={() => consultarBoletinesNuevos(null)}
            disabled={escaneandoGlobal || escaneandoClienteId !== null}
            style={{
              padding: '10px 16px', background: escaneandoGlobal ? '#95a5a6' : '#27ae60',
              color: 'white', border: 'none', borderRadius: '6px', cursor: escaneandoGlobal ? 'not-allowed' : 'pointer', fontWeight: 'bold'
            }}
          >
            {escaneandoGlobal ? '⏳ Escaneando ANM...' : '🔄 Consultar Nuevos Boletines'}
          </button>
        )}
      </div>
      )}

      {mensajeSync && (
        <div style={{ padding: '12px 16px', background: '#d4edda', color: '#155724', borderRadius: '6px', marginBottom: '20px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✅ {mensajeSync}</span>
          <button onClick={() => setMensajeSync(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 'bold', color: '#155724' }}>✕</button>
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

              <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap' }}>
                <div style={{ flex: '2', minWidth: '280px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>
                    Correo del titular (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Si lo llena, el titular también recibe sus notificaciones. Varios: separados por coma"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    style={{ width: '100%', padding: '9px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: '1', minWidth: '180px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>
                    NIT / C.C. (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Para buscar en cobro coactivo"
                    value={formNit}
                    onChange={(e) => setFormNit(e.target.value)}
                    style={{ width: '100%', padding: '9px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}
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

          <div style={{ background: '#f8f9fa', border: '1px dashed #95a5a6', padding: '14px 20px', borderRadius: '8px', marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <strong>📥 Importar placas desde Excel o CSV</strong>
            <span style={{ fontSize: '13px', color: '#7f8c8d', flex: 1, minWidth: '220px' }}>
              Columnas: placa, titular, regional, email, nit. Las placas existentes se actualizan.
            </span>
            <a href={`${API_BASE}/clientes/plantilla`} style={{ fontSize: '13px', color: '#2980b9' }}>Descargar plantilla</a>
            <label style={{ padding: '9px 16px', background: importando ? '#95a5a6' : '#16a085', color: 'white', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
              {importando ? '⏳ Importando…' : 'Elegir archivo'}
              <input type="file" accept=".xlsx,.csv" onChange={importarArchivo} disabled={importando} style={{ display: 'none' }} />
            </label>
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
                  <td style={{ padding: '12px' }}>
                    {c.nombre_empresa}
                    {(c.email || c.nit) && (
                      <div style={{ fontSize: '12px', color: '#7f8c8d' }}>
                        {c.email && <span title="Recibe copia de sus notificaciones">✉️ {c.email}</span>}
                        {c.email && c.nit && ' · '}
                        {c.nit && <span>NIT {c.nit}</span>}
                      </div>
                    )}
                  </td>
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
              <div key={cliente.id_cliente} style={{ marginBottom: '22px', border: '1px solid #dcdde1', borderRadius: '8px', overflow: 'hidden', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div style={{ background: '#2c3e50', color: 'white', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <strong style={{ fontSize: '18px' }}>Placa: {cliente.placa}</strong>
                    <span style={{ marginLeft: '12px', color: '#bdc3c7' }}>| {cliente.nombre_empresa}</span>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {cliente.ultimaFechaTexto && (
                      <span style={{ background: '#27ae60', color: 'white', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                        📅 Último: {cliente.ultimaFechaTexto}
                      </span>
                    )}
                    <span style={{ background: '#34495e', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', textTransform: 'uppercase' }}>
                      📍 {cliente.regional || 'bucaramanga'}
                    </span>
                    <button
                      onClick={() => iniciarEdicion(cliente)}
                      title="Editar placa o región"
                      style={{ padding: '6px 10px', background: '#34495e', color: 'white', border: '1px solid #7f8c8d', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                    >
                      ⚙️
                    </button>
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

                <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                  <thead style={{ background: '#f1f2f6' }}>
                    <tr>
                      <th style={{ padding: '10px 12px', width: '105px' }}>Publicación</th>
                      <th style={{ padding: '10px 12px' }}>Acto / Documento</th>
                      <th style={{ padding: '10px 12px', width: '85px' }}>Urgencia</th>
                      <th style={{ padding: '10px 12px', width: '130px' }}>Fecha límite</th>
                      <th style={{ padding: '10px 12px', width: '165px' }}>Gestión</th>
                      <th style={{ padding: '10px 12px', width: '85px' }}>Correo</th>
                      <th style={{ padding: '10px 12px', width: '50px', textAlign: 'center' }}>Quitar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifsCliente.map(notif => {
                      const nombreDoc = decodeURIComponent(notif.url_pdf.split('/').pop());
                      return (
                        <tr key={notif.id_notificacion} style={{ borderBottom: '1px solid #f1f2f6', verticalAlign: 'top', background: notif.estado === 'respondida' ? '#fbfcfc' : 'white' }}>
                          <td style={{ padding: '10px 12px', fontWeight: '500' }}>{notif.fecha_aviso}</td>
                          <td style={{ padding: '10px 12px' }}><CeldaDocumento notif={notif} onCambio={cargarDatos} /></td>
                          <td style={{ padding: '10px 12px' }}><BadgeUrgencia notif={notif} /></td>
                          <td style={{ padding: '10px 12px' }}><CeldaPlazo notif={notif} /></td>
                          <td style={{ padding: '10px 12px' }}><SelectorEstado notif={notif} onCambio={cargarDatos} /></td>
                          <td style={{ padding: '10px 12px', fontSize: '12px' }}>
                            {notif.notificacion_enviada ? (
                              <span style={{ color: '#27ae60', fontWeight: 'bold' }}>✅ Enviado</span>
                            ) : (
                              <span style={{ color: '#e67e22', fontWeight: 'bold' }}>⏳ Pendiente</span>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <button
                              onClick={() => eliminarNotificacionIndividual(notif.id_notificacion, nombreDoc)}
                              title="Desvincular esta resolución"
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#e74c3c', fontSize: '15px' }}
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {notifsCliente.length === 0 && (
                      <tr>
                        <td colSpan="7" style={{ padding: '14px', textAlign: 'center', color: '#7f8c8d' }}>
                          Sin resoluciones registradas para esta placa.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {pestanaActiva === 'vencimientos' && <Vencimientos clientes={clientes} onCambio={cargarDatos} />}
      {pestanaActiva === 'monitoreo' && <Monitoreo onCambio={cargarDatos} />}
    </div>
  );
}

export default App;