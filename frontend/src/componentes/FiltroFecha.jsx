import { CalendarRange, X } from 'lucide-react';
import { useDatos, FECHA_DESDE_POR_DEFECTO } from '../contexto/datos';

/** Filtro global de fecha: oculta las notificaciones publicadas antes de la fecha elegida. */
export default function FiltroFecha() {
  const { fechaDesde, setFechaDesde } = useDatos();
  return (
    <div className="buscador filtro-fecha">
      <CalendarRange size={16} />
      <label className="oculto-visual" htmlFor="fecha-desde">Mostrar notificaciones publicadas desde</label>
      <input
        id="fecha-desde" type="date" className="campo" value={fechaDesde}
        onChange={(e) => setFechaDesde(e.target.value)}
        title="Mostrar notificaciones publicadas desde esta fecha"
      />
      {fechaDesde ? (
        <button className="boton-icono" onClick={() => setFechaDesde('')} title="Ver todas las fechas" aria-label="Ver todas las fechas"><X size={16} /></button>
      ) : (
        <button className="boton fantasma pequeno" onClick={() => setFechaDesde(FECHA_DESDE_POR_DEFECTO)}>Desde jun 2025</button>
      )}
    </div>
  );
}
