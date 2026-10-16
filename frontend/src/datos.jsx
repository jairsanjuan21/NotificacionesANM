import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from './api';
import { tiempoDe } from './util';

const ContextoDatos = createContext(null);
// eslint-disable-next-line react-refresh/only-export-components
export const useDatos = () => useContext(ContextoDatos);

export const FECHA_DESDE_POR_DEFECTO = '2025-06-01';

function leerPreferencia(clave, porDefecto) {
  try {
    const v = localStorage.getItem(clave);
    return v === null ? porDefecto : v;
  } catch {
    return porDefecto;
  }
}

export function ProveedorDatos({ children }) {
  const [clientes, setClientes] = useState([]);
  const [notificaciones, setNotificaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [fechaDesde, setFechaDesdeEstado] = useState(() => leerPreferencia('fechaDesde', FECHA_DESDE_POR_DEFECTO));
  const [barriendo, setBarriendo] = useState(false);

  const setFechaDesde = useCallback((v) => {
    setFechaDesdeEstado(v);
    try { localStorage.setItem('fechaDesde', v); } catch { /* solo en memoria */ }
  }, []);

  const recargar = useCallback(async () => {
    try {
      const [c, n] = await Promise.all([api.get('/clientes'), api.get('/notificaciones')]);
      setClientes(c.data);
      setNotificaciones(n.data);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { recargar(); }, [recargar]);

  // Reemplaza una notificación en memoria tras editarla (evita recargar todo)
  const actualizarNotificacion = useCallback((nueva) => {
    setNotificaciones(lista => lista.map(n => (n.id_notificacion === nueva.id_notificacion ? nueva : n)));
  }, []);

  const valor = useMemo(() => {
    const porId = new Map(clientes.map(c => [c.id_cliente, c]));
    const desde = fechaDesde ? tiempoDe(fechaDesde) : 0;
    const enPeriodo = desde ? notificaciones.filter(n => tiempoDe(n.fecha_aviso) >= desde) : notificaciones;
    return {
      clientes, notificaciones, enPeriodo, cargando, error, recargar,
      clientePorId: (id) => porId.get(id),
      fechaDesde, setFechaDesde, actualizarNotificacion,
      barriendo, setBarriendo,
    };
  }, [clientes, notificaciones, cargando, error, recargar, fechaDesde, setFechaDesde, actualizarNotificacion, barriendo]);

  return <ContextoDatos.Provider value={valor}>{children}</ContextoDatos.Provider>;
}
