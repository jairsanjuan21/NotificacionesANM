import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2, KeyRound, Search } from 'lucide-react';
import api, { mensajeError } from '../../api';
import { ConsolaLogs } from './Logs';
import { fechaHora } from '../../util';

const ESTADOS = {
  SUCCESS: { texto: 'Activo', clase: 'ok' }, BUILDING: { texto: 'Construyendo', clase: 'curso' },
  DEPLOYING: { texto: 'Desplegando', clase: 'curso' }, QUEUED: { texto: 'En cola', clase: 'curso' },
  WAITING: { texto: 'Esperando', clase: 'curso' }, FAILED: { texto: 'Falló', clase: 'mal' },
  CRASHED: { texto: 'Se cayó', clase: 'mal' }, REMOVED: { texto: 'Reemplazado', clase: '' },
  SLEEPING: { texto: 'Dormido', clase: 'alerta' }, SKIPPED: { texto: 'Omitido', clase: '' },
};

const nivelDe = (sev) => {
  const s = (sev || '').toLowerCase();
  if (s.includes('err')) return 'error';
  if (s.includes('warn')) return 'aviso';
  return 'info';
};

export default function Railway() {
  const [estado, setEstado] = useState(null);
  const [deploys, setDeploys] = useState(null);
  const [errorDeploys, setErrorDeploys] = useState(null);
  const [elegido, setElegido] = useState(null);
  const [tipo, setTipo] = useState('deploy');
  const [filtro, setFiltro] = useState('');
  const [filtroAplicado, setFiltroAplicado] = useState('');
  const [logs, setLogs] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [errorLogs, setErrorLogs] = useState(null);

  useEffect(() => { api.get('/admin/railway/estado').then(r => setEstado(r.data)).catch(() => setEstado({})); }, []);

  const cargarDeploys = useCallback(async () => {
    try {
      const r = await api.get('/admin/railway/deployments', { params: { cantidad: 12 } });
      setDeploys(r.data);
      setErrorDeploys(null);
      setElegido(e => e || r.data.find(d => d.actual)?.id || r.data[0]?.id || null);
    } catch (e) {
      setErrorDeploys(mensajeError(e));
    }
  }, []);

  useEffect(() => { if (estado?.token_configurado && estado?.en_railway) cargarDeploys(); }, [estado, cargarDeploys]);

  const cargarLogs = useCallback(async () => {
    if (!elegido) return;
    setCargando(true);
    try {
      const r = await api.get('/admin/railway/logs', { params: { deployment_id: elegido, tipo, limite: 800, filtro: filtroAplicado || undefined } });
      setLogs(r.data.map((l, i) => ({ id: i, ts: l.timestamp, nivel: nivelDe(l.severity), texto: l.message })));
      setErrorLogs(null);
    } catch (e) {
      setErrorLogs(mensajeError(e));
      setLogs([]);
    } finally {
      setCargando(false);
    }
  }, [elegido, tipo, filtroAplicado]);

  useEffect(() => { cargarLogs(); }, [cargarLogs]);

  if (!estado) return <div className="cargando"><Loader2 size={18} className="girando" /> Consultando configuración…</div>;

  if (!estado.token_configurado || !estado.en_railway) {
    return (
      <section className="tarjeta" style={{ maxWidth: 720 }}>
        <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><KeyRound size={18} /> Conectar los logs de Railway</h2>
        <p className="subtitulo">{estado.en_railway ? 'Falta un token para leer los logs del servidor y del build.' : 'Esta sección funciona cuando la aplicación corre en Railway.'}</p>
        {estado.en_railway && (
          <ol style={{ paddingLeft: 20, display: 'grid', gap: 8, color: 'var(--tinta-2)', margin: 0 }}>
            <li>En Railway, abra el proyecto y vaya a <strong>Project Settings → Tokens</strong>.</li>
            <li>Cree un token para el entorno <strong>{estado.entorno || 'production'}</strong> y cópielo.</li>
            <li>En el servicio, abra <strong>Variables</strong> y agregue <code>RAILWAY_API_TOKEN</code> con ese valor.</li>
            <li>Espere el redeploy y vuelva a esta pestaña.</li>
          </ol>
        )}
      </section>
    );
  }

  return (
    <div className="rejilla-admin" style={{ gridTemplateColumns: 'minmax(240px, 300px) minmax(0, 1fr)' }}>
      <section className="tarjeta" style={{ padding: '14px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px 8px' }}>
          <h2 style={{ fontSize: 15 }}>Deployments</h2>
          <button className="boton-icono" style={{ marginLeft: 'auto' }} onClick={cargarDeploys} title="Actualizar" aria-label="Actualizar deployments"><RefreshCw size={16} /></button>
        </div>
        {errorDeploys && <div className="mensaje-error" style={{ margin: '0 16px' }}>{errorDeploys}</div>}
        {!deploys && !errorDeploys && <div className="cargando" style={{ padding: 16 }}><Loader2 size={16} className="girando" /> Cargando…</div>}
        <div role="listbox" aria-label="Deployments">
          {deploys?.map(d => {
            const est = ESTADOS[d.status] || { texto: d.status, clase: '' };
            return (
              <button key={d.id} role="option" aria-selected={d.id === elegido} className="fila"
                style={{ display: 'block', padding: '9px 16px', borderLeft: d.id === elegido ? '3px solid var(--verdin)' : '3px solid transparent' }}
                onClick={() => setElegido(d.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="pequeno" style={{ fontWeight: 600 }}><span className={`punto-estado ${est.clase}`} />{est.texto}</span>
                  {d.actual && <span className="insignia e-nueva" style={{ height: 20, fontSize: 11 }}>En uso</span>}
                </div>
                <div className="muy-pequeno tenue num">{fechaHora(d.createdAt)}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="consola-barra">
          <div className="segmentado" role="group" aria-label="Tipo de log">
            <button aria-pressed={tipo === 'deploy'} onClick={() => setTipo('deploy')}>Servidor</button>
            <button aria-pressed={tipo === 'build'} onClick={() => setTipo('build')}>Build</button>
          </div>
          <form className="buscador" onSubmit={(e) => { e.preventDefault(); setFiltroAplicado(filtro.trim()); }}>
            <Search size={16} />
            <input className="campo" type="search" placeholder="Filtrar en Railway y pulsar Enter" value={filtro}
              onChange={(e) => { setFiltro(e.target.value); if (!e.target.value) setFiltroAplicado(''); }} aria-label="Filtrar logs de Railway" />
          </form>
          <span style={{ flex: 1 }} />
          <button className="boton secundario pequeno" onClick={cargarLogs} disabled={cargando}>
            <RefreshCw size={15} className={cargando ? 'girando' : ''} /> Actualizar
          </button>
        </div>
        {errorLogs && <div className="mensaje-error" style={{ marginBottom: 10 }}>{errorLogs}</div>}
        <ConsolaLogs lineas={logs || []} busqueda={filtroAplicado}
          vacio={cargando ? 'Cargando logs de Railway…' : 'Railway no devolvió líneas para este deployment.'} />
        <p className="muy-pequeno tenue" style={{ marginTop: 8 }}>Últimas 800 líneas del deployment seleccionado, leídas desde la API de Railway.</p>
      </section>
    </div>
  );
}
