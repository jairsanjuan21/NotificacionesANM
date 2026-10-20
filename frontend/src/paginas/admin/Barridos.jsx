import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import api, { mensajeError } from '../../servicios/api';
import useConsulta from '../../hooks/useConsulta';
import Cargando from '../../componentes/ui/Cargando';
import EstadoVacio from '../../componentes/ui/EstadoVacio';
import { fechaHora } from '../../utilidades';

const ESTADO = {
  ok: { texto: 'Correcto', clase: 'ok' },
  con_alertas: { texto: 'Con alertas', clase: 'alerta' },
  fallida: { texto: 'Falló', clase: 'mal' },
  en_curso: { texto: 'En curso', clase: 'curso' },
};

function duracion(a, b) {
  if (!a || !b) return '—';
  const s = Math.round((new Date(`${b}Z`) - new Date(`${a}Z`)) / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

export default function Barridos() {
  const { datos: lista, error: fallo } = useConsulta('barridos', () => api.get('/ejecuciones', { params: { limite: 100 } }).then(r => r.data));
  const error = fallo && mensajeError(fallo);
  const [abierto, setAbierto] = useState(null);

  if (error) return <EstadoVacio tono="error" titulo="No se pudo cargar el historial">{error}</EstadoVacio>;
  if (!lista) return <Cargando>Cargando barridos…</Cargando>;
  if (!lista.length) {
    return (
      <EstadoVacio titulo="Aún no hay barridos registrados">
        El primero se registrará en la próxima ejecución programada o al consultar la ANM manualmente.
      </EstadoVacio>
    );
  }

  return (
    <div className="tabla-contenedor">
      <table className="tabla">
        <thead>
          <tr>
            <th aria-label="Detalle" />
            <th>Inicio</th>
            <th>Origen</th>
            <th>Resultado</th>
            <th>Duración</th>
            <th className="derecha">Títulos</th>
            <th className="derecha">Consultas correctas</th>
            <th className="derecha">Consultas fallidas</th>
            <th className="derecha">Nuevas</th>
          </tr>
        </thead>
        <tbody>
          {lista.map(e => {
            const est = ESTADO[e.estado] || { texto: e.estado, clase: 'curso' };
            const expandir = Boolean(e.alertas);
            return (
              <Fragment key={e.id_ejecucion}>
                <tr className={expandir ? 'clicable' : ''} onClick={() => expandir && setAbierto(abierto === e.id_ejecucion ? null : e.id_ejecucion)}>
                  <td className="celda-icono">{expandir ? (abierto === e.id_ejecucion ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : null}</td>
                  <td className="num sin-salto">{fechaHora(e.inicio)}</td>
                  <td>{e.origen === 'automatico' ? 'Programado' : 'Manual'}</td>
                  <td className="sin-salto"><span className={`punto-estado ${est.clase}`} />{est.texto}</td>
                  <td className="num">{duracion(e.inicio, e.fin)}</td>
                  <td className="derecha num">{e.placas_consultadas}</td>
                  <td className="derecha num">{e.consultas_ok}</td>
                  <td className={`derecha num ${e.consultas_error ? 'texto-peligro texto-fuerte' : ''}`}>{e.consultas_error}</td>
                  <td className={`derecha num ${e.nuevas ? 'texto-fuerte' : ''}`}>{e.nuevas}</td>
                </tr>
                {abierto === e.id_ejecucion && (
                  <tr>
                    <td />
                    <td colSpan={8}>
                      <pre className="texto-registro">{e.alertas}</pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
