import { NavLink, Outlet } from 'react-router-dom';
import { Inbox, CalendarClock, Mountain, Gauge, LogOut } from 'lucide-react';
import { useDatos } from '../contexto/datos';
import Contornos from '../componentes/ui/Contornos';
import SelectorTema from '../componentes/ui/SelectorTema';
import { requiereAtencion, iniciales, respondida } from '../utilidades';

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
          <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true" className="marca-logo">
            <rect width="64" height="64" rx="14" fill="#2A3840" />
            <path d="M10 44c8-3 12-12 22-12s14 9 22 12" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M16 34c6-3 9-10 16-10s10 7 16 10" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity=".7" />
            <path d="M23 25c3-2 5-6 9-6s6 4 9 6" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" opacity=".45" />
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
          <div className="lateral-tema">
            <span>Tema</span>
            <SelectorTema />
          </div>
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
        {/* En el celular la barra lateral no existe: el tema se elige al final de la página */}
        <footer className="pie-movil">
          <span>Tema de color</span>
          <SelectorTema className="sobre-superficie" />
        </footer>
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
