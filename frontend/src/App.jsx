import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import api, { registrarAlExpirar } from './api';
import { ProveedorAvisos } from './ui/Avisos';
import { ProveedorDatos } from './datos';
import Marco from './paginas/Marco';
import Login from './paginas/Login';
import Bandeja from './paginas/Bandeja';
import Agenda from './paginas/Agenda';
import Titulos from './paginas/Titulos';
import Admin from './paginas/admin/Admin';

export default function App() {
  const [sesion, setSesion] = useState(undefined); // undefined = comprobando, null = sin sesión

  const comprobar = useCallback(async () => {
    try {
      const r = await api.get('/auth/yo');
      setSesion(r.data);
    } catch {
      setSesion(null);
    }
  }, []);

  useEffect(() => {
    comprobar();
    registrarAlExpirar(() => setSesion(null));
  }, [comprobar]);

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
