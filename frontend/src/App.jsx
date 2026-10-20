import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import api, { registrarAlExpirar } from './servicios/api';
import useConsulta from './hooks/useConsulta';
import ProveedorAvisos from './contexto/ProveedorAvisos';
import ProveedorDatos from './contexto/ProveedorDatos';
import Marco from './layout/Marco';
import Login from './paginas/Login';
import Bandeja from './paginas/Bandeja';
import Agenda from './paginas/Agenda';
import Titulos from './paginas/Titulos';
import Admin from './paginas/admin/Admin';

/** Pregunta al backend quién tiene la sesión abierta; null si nadie. */
const consultarSesion = () => api.get('/auth/yo').then(r => r.data).catch(() => null);

export default function App() {
  // datos: undefined = comprobando · null = sin sesión · objeto = usuario
  const { datos: sesion, fijarDatos: setSesion } = useConsulta('sesion', consultarSesion);

  // Si cualquier petición recibe 401, volver a la pantalla de inicio de sesión
  useEffect(() => registrarAlExpirar(() => setSesion(null)), [setSesion]);

  const salir = async () => {
    try { await api.post('/auth/logout'); } catch { /* sin conexión: igual se cierra */ }
    setSesion(null);
  };

  if (sesion === undefined) return <div className="cargando" style={{ padding: 40 }}>Cargando…</div>;

  return (
    <ProveedorAvisos>
      {!sesion ? (
        <Login onEntrar={setSesion} />
      ) : (
        <ProveedorDatos>
          <Routes>
            <Route element={<Marco sesion={sesion} onSalir={salir} />}>
              <Route index element={<Bandeja />} />
              <Route path="agenda" element={<Agenda />} />
              <Route path="titulos" element={<Titulos />} />
              <Route
                path="admin/*"
                element={sesion.rol === 'admin' ? <Admin /> : <Navigate to="/" replace />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ProveedorDatos>
      )}
    </ProveedorAvisos>
  );
}
