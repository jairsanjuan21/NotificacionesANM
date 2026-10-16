import { NavLink, Outlet } from 'react-router-dom';
import { Inbox, CalendarClock, Mountain, Gauge, LogOut, RefreshCw, CalendarRange, X } from 'lucide-react';
import api, { mensajeError } from '../api';
import { useDatos, FECHA_DESDE_POR_DEFECTO } from '../datos';
import { useAvisos } from '../ui/Avisos';
import Contornos from '../ui/Contornos';
import { requiereAtencion, iniciales, respondida } from '../util';

export default function Marco({ sesion, onSalir }) {
  const { enPeriodo } = useDatos();
  const atencion = enPeriodo.filter(requiereAtencion).length;
  const porVencer = enPeriodo.filter(n => !respondida(n) && n.dias_habiles_restantes !== null
    && n.dias_habiles_restantes >= 0 && n.dias_habiles_restantes <= 5).length;
  const esAdmin = sesion.rol === 'admin';

  const enlaces = [
    { a: '/', fin: true, Icono: Inbox, texto: 'Bandeja', cuenta: atencion },
    { a: '/agenda', Icono: CalendarClock, texto: 'Vencimientos', cuenta: porVencer },
    { a: '/titulos', Icono: Mountain, texto: 'Títulos mineros' },
  ];

  return (
    <div className="marco">
      <aside className="lateral">
        <Contornos className="lateral-contornos" />
        <NavLink to="/" className="marca">
          <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="14" fill="#2A3840" />
            <path d="M10 44c8-3 12-12 22-12s14 9 22 12" fill="none" stroke="#5FB3A8" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M16 34c6-3 9-10 16-10s10 7 16 10" fill="none" stroke="#5FB3A8" strokeWidth="3.5" strokeLinecap="round" opacity=".7" />
            <path d="M23 25c3-2 5-6 9-6s6 4 9 6" fill="none" stroke="#5FB3A8" strokeWidth="3.5" strokeLinecap="round" opacity=".45" />
          </svg>
          <span className="marca-texto"><strong>Notificaciones ANM</strong><span>Seguimiento de títulos mineros</span></span>
        </NavLink>

        <nav className="navegacion" aria-label="Principal">
          {enlaces.map(({ a, fin, Icono, texto, cuenta }) => (
            <NavLink key={a} to={a} end={fin} className="nav-enlace">
              <Icono size={18} /> {texto}
              {cuenta > 0 && <span className="contador" aria-label={`${cuenta} pendientes`}>{cuenta}</span>}
            </NavLink>
          ))}
          {esAdmin && (
            <>
              <div className="navegacion-grupo">Solo administrador</div>
              <NavLink to="/admin" className="nav-enlace"><Gauge size={18} /> Monitoreo del sistema</NavLink>
            </>
          )}
        </nav>

        <div className="lateral-pie">
          <div className="usuario-actual">
            <span className="avatar">{iniciales(sesion.usuario)}</span>
            <span>
              <span className="nombre">{sesion.usuario}</span><br />
              <span className="rol">{esAdmin ? 'Administrador' : 'Usuario'}</span>
            </span>
            {sesion.autenticacion !== false && (
              <button className="boton-icono" onClick={onSalir} title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={17} /></button>
            )}
          </div>
        </div>
      </aside>

      <main className="principal">
        <Outlet />
      </main>

      <nav className="nav-movil" aria-label="Principal">
        {enlaces.map(({ a, fin, Icono, texto, cuenta }) => (
          <NavLink key={a} to={a} end={fin}>
            <Icono size={20} /> {texto.split(' ')[0]}
            {cuenta > 0 && <span className="contador">{cuenta}</span>}
          </NavLink>
        ))}
        {esAdmin && <NavLink to="/admin"><Gauge size={20} /> Sistema</NavLink>}
        {sesion.autenticacion !== false && <button onClick={onSalir}><LogOut size={20} /> Salir</button>}
      </nav>
    </div>
  );
}

/** Encabezado común de cada página. */
export function BarraSuperior({ titulo, descripcion, children }) {
  return (
    <header className="barra-superior">
      <div className="titulo-pagina">
        <h1>{titulo}</h1>
        {descripcion && <p>{descripcion}</p>}
      </div>
      <div className="acciones">{children}</div>
    </header>
  );
}

/** Filtro global de fecha: oculta las notificaciones publicadas antes de la fecha elegida. */
export function FiltroFecha() {
  const { fechaDesde, setFechaDesde } = useDatos();
  return (
    <div className="buscador" style={{ gap: 6 }}>
      <CalendarRange size={16} />
      <label className="oculto-visual" htmlFor="fecha-desde">Mostrar notificaciones publicadas desde</label>
      <input
        id="fecha-desde" type="date" className="campo" value={fechaDesde}
        onChange={(e) => setFechaDesde(e.target.value)}
        title="Mostrar notificaciones publicadas desde esta fecha"
        style={{ width: 178 }}
      />
      {fechaDesde ? (
        <button className="boton-icono" onClick={() => setFechaDesde('')} title="Ver todas las fechas" aria-label="Ver todas las fechas"><X size={16} /></button>
      ) : (
        <button className="boton fantasma pequeno" onClick={() => setFechaDesde(FECHA_DESDE_POR_DEFECTO)}>Desde jun 2025</button>
      )}
    </div>
  );
}

/** Lanza un barrido manual en el portal de la ANM. */
export function BotonConsultar({ idCliente, placa, variante = '' }) {
  const { recargar, barriendo, setBarriendo } = useDatos();
  const avisos = useAvisos();

  const consultar = async () => {
    setBarriendo(true);
    const espera = avisos.info(placa ? `Consultando la ANM para ${placa}…` : 'Consultando la ANM para todos los títulos. Puede tardar unos minutos.', 0);
    try {
      const r = await api.post('/scraper/ejecutar', null, { params: idCliente ? { id_cliente: idCliente } : {} });
      const n = r.data.nuevas_notificaciones;
      avisos.quitar(espera);
      avisos.exito(n === 0 ? 'Consulta terminada: no hay notificaciones nuevas.' : `Consulta terminada: ${n} notificación${n === 1 ? '' : 'es'} nueva${n === 1 ? '' : 's'}.`);
      await recargar();
    } catch (e) {
      avisos.quitar(espera);
      avisos.error(mensajeError(e, 'No se pudo consultar la ANM.'));
    } finally {
      setBarriendo(false);
    }
  };

  return (
    <button className={`boton ${variante}`} onClick={consultar} disabled={barriendo}>
      <RefreshCw size={16} className={barriendo ? 'girando' : ''} />
      {barriendo ? 'Consultando…' : placa ? 'Consultar ANM' : 'Consultar ANM ahora'}
    </button>
  );
}
