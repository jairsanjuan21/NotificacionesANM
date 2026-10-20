import { useState } from 'react';
import { RefreshCw, KeyRound, Search } from 'lucide-react';
import api, { mensajeError } from '../../servicios/api';
import ConsolaLogs from '../../componentes/ConsolaLogs';
import useConsulta from '../../hooks/useConsulta';
import Boton from '../../componentes/ui/Boton';
import Tarjeta from '../../componentes/ui/Tarjeta';
import Cargando from '../../componentes/ui/Cargando';
import MensajeError from '../../componentes/ui/MensajeError';
import { fechaHora, nivelDe } from '../../utilidades';

const ESTADOS = {
  SUCCESS: { texto: 'Activo', clase: 'ok' }, BUILDING: { texto: 'Construyendo', clase: 'curso' },
  DEPLOYING: { texto: 'Desplegando', clase: 'curso' }, QUEUED: { texto: 'En cola', clase: 'curso' },
  WAITING: { texto: 'Esperando', clase: 'curso' }, FAILED: { texto: 'Falló', clase: 'mal' },
  CRASHED: { texto: 'Se cayó', clase: 'mal' }, REMOVED: { texto: 'Reemplazado', clase: '' },
  SLEEPING: { texto: 'Dormido', clase: 'alerta' }, SKIPPED: { texto: 'Omitido', clase: '' },
};

const consultarEstado = () => api.get('/admin/railway/estado').then(r => r.data).catch(() => ({}));

export default function Railway() {
  const [seleccion, setElegido] = useState(null);
  const [tipo, setTipo] = useState('deploy');
  const [filtro, setFiltro] = useState('');
  const [filtroAplicado, setFiltroAplicado] = useState('');

  // 1) ¿Hay token y estamos en Railway?
  const { datos: estado } = useConsulta('railway-estado', consultarEstado);
  const conectado = Boolean(estado?.token_configurado && estado?.en_railway);

  // 2) Deployments (solo si hay conexión)
  const deploysQ = useConsulta(
    'railway-deploys',
    () => api.get('/admin/railway/deployments', { params: { cantidad: 12 } }).then(r => r.data),
    { activo: conectado },
  );
  const deploys = deploysQ.datos;
  const errorDeploys = deploysQ.error && mensajeError(deploysQ.error);
  const cargarDeploys = deploysQ.recargar;

  // El elegido por el usuario o, por defecto, el deployment en uso. Es un valor
  // derivado: no hace falta un efecto que lo "inicialice" cuando llegan los datos.
  const elegido = seleccion ?? deploys?.find(d => d.actual)?.id ?? deploys?.[0]?.id ?? null;

  // 3) Logs del deployment elegido: la clave cambia con deployment, tipo o filtro
  const logsQ = useConsulta(
    `railway-logs|${elegido}|${tipo}|${filtroAplicado}`,
    () => api.get('/admin/railway/logs', { params: { deployment_id: elegido, tipo, limite: 800, filtro: filtroAplicado || undefined } })
      .then(r => r.data.map((l, i) => ({ id: i, ts: l.timestamp, nivel: nivelDe(l.severity), texto: l.message }))),
    { activo: Boolean(elegido) },
  );
  const cargando = logsQ.cargando;
  const errorLogs = logsQ.error && mensajeError(logsQ.error);
  const logs = logsQ.error ? [] : logsQ.datos;
  const cargarLogs = logsQ.recargar;

  if (!estado) return <Cargando>Consultando configuración…</Cargando>;

  if (!conectado) {
    return (
      <Tarjeta className="tarjeta-angosta" icono={KeyRound} titulo="Conectar los logs de Railway"
        subtitulo={estado.en_railway ? 'Falta un token para leer los logs del servidor y del build.' : 'Esta sección funciona cuando la aplicación corre en Railway.'}>
        {estado.en_railway && (
          <ol className="pasos">
            <li>En Railway, abra el proyecto y vaya a <strong>Project Settings → Tokens</strong>.</li>
            <li>Cree un token para el entorno <strong>{estado.entorno || 'production'}</strong> y cópielo.</li>
            <li>En el servicio, abra <strong>Variables</strong> y agregue <code>RAILWAY_API_TOKEN</code> con ese valor.</li>
            <li>Espere el redeploy y vuelva a esta pestaña.</li>
          </ol>
        )}
      </Tarjeta>
    );
  }

  return (
    <div className="rejilla-railway">
      <Tarjeta sinRelleno titulo="Deployments"
        acciones={<button className="boton-icono" onClick={cargarDeploys} title="Actualizar" aria-label="Actualizar deployments"><RefreshCw size={16} /></button>}>
        <div className="relleno-lateral"><MensajeError>{errorDeploys}</MensajeError></div>
        {!deploys && !errorDeploys && <Cargando compacto />}
        <div role="listbox" aria-label="Deployments">
          {deploys?.map(d => {
            const est = ESTADOS[d.status] || { texto: d.status, clase: '' };
            return (
              <button key={d.id} role="option" aria-selected={d.id === elegido} className="opcion-deploy" onClick={() => setElegido(d.id)}>
                <span className="hilera">
                  <span className="pequeno texto-fuerte"><span className={`punto-estado ${est.clase}`} />{est.texto}</span>
                  {d.actual && <span className="insignia mini e-nueva empujar">En uso</span>}
                </span>
                <span className="muy-pequeno tenue num">{fechaHora(d.createdAt)}</span>
              </button>
            );
          })}
        </div>
      </Tarjeta>

      <section className="pila">
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
          <span className="estirar" />
          <Boton variante="secundario" tamano="pequeno" icono={RefreshCw} cargando={cargando} onClick={cargarLogs}>Actualizar</Boton>
        </div>
        <MensajeError>{errorLogs}</MensajeError>
        <ConsolaLogs lineas={logs || []} busqueda={filtroAplicado}
          vacio={cargando ? 'Cargando logs de Railway…' : 'Railway no devolvió líneas para este deployment.'} />
        <p className="muy-pequeno tenue">Últimas 800 líneas del deployment seleccionado, leídas desde la API de Railway.</p>
      </section>
    </div>
  );
}
