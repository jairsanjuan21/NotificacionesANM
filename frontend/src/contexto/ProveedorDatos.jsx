import { useCallback, useMemo } from 'react';
import api from '../servicios/api';
import useConsulta from '../hooks/useConsulta';
import usePreferencia from '../hooks/usePreferencia';
import { tiempoDe } from '../utilidades';
import { ContextoDatos, FECHA_DESDE_POR_DEFECTO } from './datos';

async function consultarTodo() {
  const [clientes, notificaciones] = await Promise.all([api.get('/clientes'), api.get('/notificaciones')]);
  return { clientes: clientes.data, notificaciones: notificaciones.data };
}

const VACIO = { clientes: [], notificaciones: [] };

export default function ProveedorDatos({ children }) {
  const { datos = VACIO, error, cargando, recargar, fijarDatos } = useConsulta('datos', consultarTodo);
  const { clientes, notificaciones } = datos;
  const [fechaDesde, setFechaDesde] = usePreferencia('fechaDesde', FECHA_DESDE_POR_DEFECTO);

  // Reemplaza una notificación en memoria tras editarla (evita recargar todo)
  const actualizarNotificacion = useCallback((nueva) => {
    fijarDatos(d => ({
      ...d,
      notificaciones: d.notificaciones.map(n => (n.id_notificacion === nueva.id_notificacion ? nueva : n)),
    }));
  }, [fijarDatos]);

  const valor = useMemo(() => {
    const porId = new Map(clientes.map(c => [c.id_cliente, c]));
    const desde = fechaDesde ? tiempoDe(fechaDesde) : 0;
    const enPeriodo = desde ? notificaciones.filter(n => tiempoDe(n.fecha_aviso) >= desde) : notificaciones;
    return {
      clientes, notificaciones, enPeriodo,
      // "cargando" solo en la primera carga: las recargas mantienen la lista visible
      cargando: cargando && datos === VACIO,
      error, recargar,
      clientePorId: (id) => porId.get(id),
      fechaDesde, setFechaDesde, actualizarNotificacion,
    };
  }, [clientes, notificaciones, datos, cargando, error, recargar, fechaDesde, setFechaDesde, actualizarNotificacion]);

  return <ContextoDatos.Provider value={valor}>{children}</ContextoDatos.Provider>;
}
