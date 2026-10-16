import { useState } from 'react';
import axios from 'axios';

export const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api';

export const URGENCIAS = {
  alta: { label: 'Alta', color: '#c0392b', fondo: '#fdecea' },
  revisar: { label: 'Revisar', color: '#7d3c98', fondo: '#f4ecf7' },
  media: { label: 'Media', color: '#d35400', fondo: '#fdf2e9' },
  baja: { label: 'Baja', color: '#1e8449', fondo: '#eafaf1' },
};

export const ESTADOS_GESTION = [
  { id: 'nueva', label: '🆕 Nueva', color: '#2980b9' },
  { id: 'revisada', label: '👀 Revisada', color: '#7f8c8d' },
  { id: 'en_tramite', label: '🛠️ En trámite', color: '#d35400' },
  { id: 'respondida', label: '✅ Respondida', color: '#27ae60' },
];

export function BadgeUrgencia({ notif }) {
  const u = URGENCIAS[notif.urgencia];
  if (!u) return <span style={{ color: '#95a5a6', fontSize: '12px' }}>Sin analizar</span>;
  return (
    <span
      title={notif.motivo_urgencia || ''}
      style={{ background: u.fondo, color: u.color, border: `1px solid ${u.color}`, padding: '2px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}
    >
      {u.label}
    </span>
  );
}

export function CeldaPlazo({ notif }) {
  if (!notif.fecha_limite) {
    return <span style={{ color: '#95a5a6', fontSize: '12px' }}>{notif.procesada ? 'Sin plazo' : '—'}</span>;
  }
  const d = notif.dias_habiles_restantes;
  const respondida = notif.estado === 'respondida';
  let color = '#2c3e50';
  let texto = `${d} día(s) hábil(es)`;
  if (respondida) { color = '#27ae60'; texto = 'Respondida'; }
  else if (d < 0) { color = '#7f8c8d'; texto = 'Vencido'; }
  else if (d === 0) { color = '#c0392b'; texto = '¡Vence hoy!'; }
  else if (d <= 3) color = '#c0392b';
  else if (d <= 7) color = '#d35400';

  return (
    <div title={notif.base_plazo || ''} style={{ fontSize: '13px', lineHeight: 1.3 }}>
      <div style={{ fontWeight: 'bold' }}>{notif.fecha_limite}</div>
      <div style={{ color, fontWeight: 'bold', fontSize: '12px' }}>{texto}</div>
    </div>
  );
}

export function SelectorEstado({ notif, onCambio }) {
  const actual = ESTADOS_GESTION.find(e => e.id === notif.estado) || ESTADOS_GESTION[0];

  const cambiarEstado = async (estado) => {
    try {
      await axios.put(`${API_BASE}/notificaciones/${notif.id_notificacion}`, { estado });
      onCambio && onCambio();
    } catch {
      alert('No se pudo actualizar el estado.');
    }
  };

  const editarNotas = async () => {
    const notas = window.prompt('Notas de gestión (ej. "Radicado PTO el 20/10, radicado No. 123"):', notif.notas || '');
    if (notas === null) return;
    try {
      await axios.put(`${API_BASE}/notificaciones/${notif.id_notificacion}`, { notas });
      onCambio && onCambio();
    } catch {
      alert('No se pudieron guardar las notas.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <select
        value={actual.id}
        onChange={(e) => cambiarEstado(e.target.value)}
        style={{ padding: '4px', borderRadius: '4px', border: `1px solid ${actual.color}`, color: actual.color, fontWeight: 'bold', fontSize: '12px', background: 'white' }}
      >
        {ESTADOS_GESTION.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
      </select>
      <button
        onClick={editarNotas}
        title={notif.notas || 'Agregar notas'}
        style={{ background: 'transparent', border: 'none', color: notif.notas ? '#2c3e50' : '#95a5a6', cursor: 'pointer', fontSize: '12px', textAlign: 'left', padding: 0 }}
      >
        📝 {notif.notas ? (notif.notas.length > 28 ? notif.notas.slice(0, 28) + '…' : notif.notas) : 'Agregar nota'}
      </button>
    </div>
  );
}

function BotonResumir({ notif, onCambio }) {
  const [cargando, setCargando] = useState(false);
  const resumir = async () => {
    setCargando(true);
    try {
      await axios.post(`${API_BASE}/notificaciones/${notif.id_notificacion}/resumir`);
      onCambio && onCambio();
    } catch (e) {
      alert('No se pudo generar el resumen:\n\n' + (e.response?.data?.detail || e.message));
    } finally {
      setCargando(false);
    }
  };
  return (
    <button
      onClick={resumir}
      disabled={cargando}
      title={notif.resumen ? 'Volver a generar el resumen' : 'Generar un resumen corto con Gemini'}
      style={{ marginTop: '4px', background: cargando ? '#ecf0f1' : '#f4ecf7', color: '#7d3c98', border: '1px solid #d2b4de', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: cargando ? 'wait' : 'pointer', fontWeight: 'bold' }}
    >
      {cargando ? '⏳ Leyendo el acto (puede tardar hasta 1 min)…' : notif.resumen ? '↻ Regenerar resumen' : '✨ Resumir con IA'}
    </button>
  );
}

export function CeldaDocumento({ notif, onCambio }) {
  const nombreDoc = decodeURIComponent(notif.url_pdf.split('/').pop());
  const etiquetas = [notif.tipo_notificacion, notif.tipo_acto, notif.numero && `No. ${notif.numero}`].filter(Boolean);
  return (
    <div>
      <a href={notif.url_pdf} target="_blank" rel="noopener noreferrer" style={{ color: '#2980b9', fontWeight: 'bold', textDecoration: 'none', wordBreak: 'break-word' }}>
        📄 {nombreDoc}
      </a>
      {notif.tiene_archivo && (
        <a href={`${API_BASE}/notificaciones/${notif.id_notificacion}/pdf`} target="_blank" rel="noopener noreferrer"
          title="Copia guardada en el sistema (sirve aunque la ANM retire el documento)"
          style={{ marginLeft: '8px', fontSize: '11px', color: '#16a085', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          💾 copia
        </a>
      )}
      {notif.fuente === 'coactivo' && (
        <span style={{ marginLeft: '8px', fontSize: '11px', background: '#c0392b', color: 'white', padding: '1px 6px', borderRadius: '4px' }}>COBRO COACTIVO</span>
      )}
      {etiquetas.length > 0 && <div style={{ fontSize: '12px', color: '#566573', marginTop: '3px' }}>{etiquetas.join(' · ')}</div>}
      {(notif.resumen || notif.motivo_urgencia) && (
        <div style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '3px', fontStyle: notif.resumen ? 'normal' : 'italic' }}>
          {notif.resumen ? <><strong style={{ color: '#7d3c98' }}>✨ </strong>{notif.resumen}</> : `Detectado: ${notif.motivo_urgencia}`}
        </div>
      )}
      <BotonResumir notif={notif} onCambio={onCambio} />
    </div>
  );
}
