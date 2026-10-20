import { NavLink, Route, Routes } from 'react-router-dom';
import BarraSuperior from '../../componentes/BarraSuperior';
import Resumen from './Resumen';
import Barridos from './Barridos';
import Logs from './Logs';
import Railway from './Railway';
import Configuracion from './Configuracion';

export default function Admin() {
  return (
    <>
      <BarraSuperior titulo="Monitoreo del sistema" descripcion="Salud de los barridos, envíos y servidor. Esta sección solo la ve el administrador." />
      <nav className="pestanas" aria-label="Secciones de monitoreo">
        <NavLink to="/admin" end>Resumen</NavLink>
        <NavLink to="/admin/barridos">Barridos</NavLink>
        <NavLink to="/admin/logs">Logs de la aplicación</NavLink>
        <NavLink to="/admin/railway">Railway</NavLink>
        <NavLink to="/admin/configuracion">Configuración</NavLink>
      </nav>
      <Routes>
        <Route index element={<Resumen />} />
        <Route path="barridos" element={<Barridos />} />
        <Route path="logs" element={<Logs />} />
        <Route path="railway" element={<Railway />} />
        <Route path="configuracion" element={<Configuracion />} />
      </Routes>
    </>
  );
}
