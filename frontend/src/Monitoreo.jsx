import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE } from './componentes';

const ESTADO_EJEC = {
  ok: { label: '✅ OK', color: '#27ae60' },
  con_alertas: { label: '⚠️ Con alertas', color: '#d35400' },
  fallida: { label: '❌ Fallida', color: '#c0392b' },
  en_curso: { label: '⏳ En curso', color: '#2980b9' },
};

const fechaLocal = (iso) => (iso ? new Date(iso.endsWith('Z') ? iso : iso + 'Z').toLocaleString('es-CO') : '—');

const duracion = (a, b) => {
  if (!a || !b) return '—';
  const s = Math.round((new Date(b + 'Z') - new Date(a + 'Z')) / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

const boton = (color) => ({
  padding: '9px 14px', background: color, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px',
});

function Indicador({ ok, texto, ayuda }) {
  return (
    <div title={ayuda || ''} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', padding: '4px 0' }}>
      <span>{ok ? '🟢' : '⚪'}</span>
      <span>{texto}</span>
    </div>
  );
}

export default function Monitoreo({ onCambio }) {
  const [ejecuciones, setEjecuciones] = useState([]);
  const [diag, setDiag] = useState(null);
  const [scheduler, setScheduler] = useState(null);
  const [historico, setHistorico] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  const cargar = async () => {
    try {
      const [e, d, s, h] = await Promise.all([
        axios.get(`${API_BASE}/ejecuciones`),
        axios.get(`${API_BASE}/correo/diagnostico`),
        axios.get(`${API_BASE}/scheduler/estado`),
        axios.get(`${API_BASE}/mantenimiento/procesar-historico`),
      ]);
      setEjecuciones(e.data); setDiag(d.data); setScheduler(s.data); setHistorico(h.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { cargar(); }, []);

  // Mientras se procesa el histórico, refrescar cada 5 s
  useEffect(() => {
    if (!historico?.en_curso) return;
    const t = setInterval(async () => {
      const h = await axios.get(`${API_BASE}/mantenimiento/procesar-historico`);
      setHistorico(h.data);
      if (!h.data.en_curso) { onCambio && onCambio(); }
    }, 5000);
    return () => clearInterval(t);
  }, [historico?.en_curso]);

  const accion = async (nombre, metodo, url) => {
    setOcupado(nombre); setResultado(null);
    try {
      const res = await axios({ method: metodo, url: `${API_BASE}${url}` });
      setResultado({ ok: true, titulo: nombre, datos: res.data });
    } catch (e) {
      setResultado({ ok: false, titulo: nombre, datos: e.response?.data?.detail || e.message });
    } finally {
      setOcupado(null);
      cargar();
      onCambio && onCambio();
    }
  };

  const ultimoOk = ejecuciones.find(e => (e.estado === 'ok' || e.estado === 'con_alertas') && e.consultas_ok > 0);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px', marginBottom: '20px' }}>
        <div style={{ background: 'white', border: '1px solid #dcdde1', borderRadius: '8px', padding: '16px', textAlign: 'left' }}>
          <h3 style={{ marginTop: 0 }}>🩺 Estado del sistema</h3>
          <Indicador ok={scheduler?.activo} texto={`Programador ${scheduler?.activo ? 'activo' : 'detenido'}`} />
          <Indicador ok={!!ultimoOk} texto={`Último barrido correcto: ${ultimoOk ? fechaLocal(ultimoOk.inicio) : 'ninguno registrado'}`} />
          {diag && (
            <>
              <Indicador ok={diag.modo_envio === 'brevo_api'} texto={`Correo: ${diag.modo_envio}`} ayuda="En Railway debe ser brevo_api" />
              <Indicador ok={diag.telegram} texto={`Telegram: ${diag.telegram ? 'configurado' : 'no configurado (opcional)'}`} />
              <Indicador ok={diag.resumen_ia_gemini} texto={`Resumen con IA (Gemini gratis): ${diag.resumen_ia_gemini ? 'activo' : 'no configurado (opcional)'}`} />
              <Indicador ok={diag.base_de_datos !== 'repositorio (se reinicia en cada deploy)'} texto={`Base de datos: ${diag.base_de_datos}`} />
              <Indicador ok={diag.notificaciones_pendientes === 0} texto={`Notificaciones pendientes de envío: ${diag.notificaciones_pendientes}`} />
            </>
          )}
        </div>

        <div style={{ background: 'white', border: '1px solid #dcdde1', borderRadius: '8px', padding: '16px', textAlign: 'left' }}>
          <h3 style={{ marginTop: 0 }}>⏰ Tareas programadas</h3>
          {scheduler?.tareas_programadas?.map(t => (
            <div key={t.id} style={{ fontSize: '13px', padding: '4px 0', borderBottom: '1px solid #f1f2f6' }}>
              <strong>{t.descripcion}</strong>
              <div style={{ color: '#7f8c8d' }}>Próxima: {t.proxima_ejecucion}</div>
            </div>
          ))}
        </div>

        <div style={{ background: 'white', border: '1px solid #dcdde1', borderRadius: '8px', padding: '16px', textAlign: 'left' }}>
          <h3 style={{ marginTop: 0 }}>🧰 Acciones</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button disabled={!!ocupado} style={boton('#2980b9')} onClick={() => accion('Enviar pendientes', 'post', '/notificaciones/enviar-pendientes')}>
              {ocupado === 'Enviar pendientes' ? '⏳ Enviando…' : '📨 Reenviar notificaciones pendientes'}
            </button>
            <button disabled={!!ocupado} style={boton('#16a085')} onClick={() => accion('Prueba de alertas', 'post', '/alertas/prueba')}>
              {ocupado === 'Prueba de alertas' ? '⏳ Enviando…' : '✉️ Enviar correo/Telegram de prueba'}
            </button>
            <button disabled={!!ocupado} style={boton('#8e44ad')} onClick={() => accion('Revisar portal ANM', 'get', '/salud/fuentes')}>
              {ocupado === 'Revisar portal ANM' ? '⏳ Revisando…' : '🌐 Verificar estructura del portal ANM'}
            </button>
            <button disabled={!!ocupado} style={boton('#d35400')} onClick={() => accion('Recordatorios', 'post', '/recordatorios/ejecutar')}>
              {ocupado === 'Recordatorios' ? '⏳ Revisando…' : '⏰ Enviar recordatorios de vencimiento ahora'}
            </button>
            <button
              disabled={!!ocupado || historico?.en_curso || historico?.sin_procesar === 0}
              style={boton(historico?.sin_procesar === 0 ? '#95a5a6' : '#2c3e50')}
              onClick={() => accion('Procesar histórico', 'post', '/mantenimiento/procesar-historico')}
              title="Descarga, archiva y analiza las notificaciones antiguas para calcular su urgencia y plazos"
            >
              {historico?.en_curso
                ? `⏳ Procesando histórico… (${historico.sin_procesar} restantes)`
                : historico?.sin_procesar
                  ? `🗂️ Analizar y archivar histórico (${historico.sin_procesar} sin procesar)`
                  : '🗂️ Histórico procesado'}
            </button>
          </div>
        </div>
      </div>

      {resultado && (
        <div style={{ padding: '12px 16px', background: resultado.ok ? '#d4edda' : '#f8d7da', color: resultado.ok ? '#155724' : '#721c24', borderRadius: '6px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>{resultado.ok ? '✅' : '❌'} {resultado.titulo}</strong>
            <button onClick={() => setResultado(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0', fontSize: '12px' }}>
            {typeof resultado.datos === 'string' ? resultado.datos : JSON.stringify(resultado.datos, null, 2)}
          </pre>
        </div>
      )}

      <h3>📜 Historial de barridos</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', border: '1px solid #dcdde1', fontSize: '13px', textAlign: 'left' }}>
        <thead style={{ background: '#1f3a52', color: 'white', textAlign: 'left' }}>
          <tr>
            <th style={{ padding: '10px' }}>Inicio</th>
            <th style={{ padding: '10px' }}>Origen</th>
            <th style={{ padding: '10px' }}>Estado</th>
            <th style={{ padding: '10px' }}>Duración</th>
            <th style={{ padding: '10px' }}>Placas</th>
            <th style={{ padding: '10px' }}>Consultas OK / error</th>
            <th style={{ padding: '10px' }}>Nuevas</th>
            <th style={{ padding: '10px' }}>Alertas</th>
          </tr>
        </thead>
        <tbody>
          {ejecuciones.map(e => {
            const est = ESTADO_EJEC[e.estado] || { label: e.estado, color: '#2c3e50' };
            return (
              <tr key={e.id_ejecucion} style={{ borderBottom: '1px solid #eee', verticalAlign: 'top' }}>
                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fechaLocal(e.inicio)}</td>
                <td style={{ padding: '8px 10px' }}>{e.origen === 'automatico' ? '🤖 Automático' : '👤 Manual'}</td>
                <td style={{ padding: '8px 10px', color: est.color, fontWeight: 'bold', whiteSpace: 'nowrap' }}>{est.label}</td>
                <td style={{ padding: '8px 10px' }}>{duracion(e.inicio, e.fin)}</td>
                <td style={{ padding: '8px 10px' }}>{e.placas_consultadas}</td>
                <td style={{ padding: '8px 10px' }}>{e.consultas_ok} / <span style={{ color: e.consultas_error ? '#c0392b' : 'inherit' }}>{e.consultas_error}</span></td>
                <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>{e.nuevas}</td>
                <td style={{ padding: '8px 10px', maxWidth: '380px' }}>
                  {e.alertas ? (
                    <details>
                      <summary style={{ cursor: 'pointer', color: '#d35400' }}>{e.alertas.split('\n')[0].slice(0, 70)}…</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', fontSize: '11px' }}>{e.alertas}</pre>
                    </details>
                  ) : '—'}
                </td>
              </tr>
            );
          })}
          {ejecuciones.length === 0 && (
            <tr><td colSpan="8" style={{ padding: '16px', textAlign: 'center', color: '#7f8c8d' }}>Aún no hay barridos registrados.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
