import { memo } from 'react';
import { InsigniaEstado, Plazo } from './Insignias';
import { URGENCIAS, fechaCorta, respondida, tituloActo } from '../utilidades';

/** Texto corto bajo el título: el resumen IA o, si no existe, de qué trata el documento. */
function extracto(n) {
  if (n.resumen) return n.resumen;
  if (!n.tipo_notificacion) return 'Documento sin analizar';
  const menciona = n.motivo_urgencia && n.urgencia !== 'baja' ? `, menciona ${n.motivo_urgencia}` : '';
  return `${n.tipo_notificacion}${menciona}`;
}

/**
 * Una notificación en la lista de la Bandeja.
 *  - La veta izquierda es la urgencia, como una veta de mineral en la roca.
 *  - El punto verde marca lo que aún no se ha revisado (estado "nueva").
 *  - El tipo de acto va tenue y el número fuerte: se lee "Auto · PARM 0699".
 *
 * memo(): la lista puede tener cientos de filas y el padre re-renderiza al
 * escribir en el buscador; así solo se vuelven a pintar las filas que cambian.
 */
function FilaNotificacion({ notif: n, cliente, seleccionada, mostrarPublicado, onElegir }) {
  const u = URGENCIAS[n.urgencia];
  const hecha = respondida(n);
  const nueva = (n.estado || 'nueva') === 'nueva';
  const destacarUrgencia = !hecha && u && (n.urgencia === 'alta' || n.urgencia === 'revisar');
  const tipoSeparado = n.fuente !== 'coactivo' && n.tipo_acto && n.numero;

  return (
    <button
      data-id={n.id_notificacion}
      role="option"
      aria-selected={seleccionada}
      className={`fila ${hecha ? 'respondida' : ''} ${nueva ? 'nueva' : ''}`}
      onClick={() => onElegir(n.id_notificacion)}
    >
      <span className={`veta ${!hecha && u ? u.clase : 'u-ninguna'}`} />
      <span className="celda-titulo">
        <span className="placa">
          {nueva && <span className="punto-nueva" title="Sin revisar" aria-label="Sin revisar" />}
          {cliente.placa}
        </span>
        <span className="titular">{cliente.nombre_empresa}</span>
      </span>
      <span className="celda-acto">
        <span className="acto">
          {tipoSeparado ? (
            <span className="recortar"><span className="tipo-acto">{n.tipo_acto}</span> {n.numero}</span>
          ) : (
            <span className="recortar">{tituloActo(n)}</span>
          )}
          {destacarUrgencia && <span className={`insignia mini ${u.clase}`}>{u.etiqueta}</span>}
        </span>
        <span className="extracto">{extracto(n)}</span>
      </span>
      {mostrarPublicado && <span className="col-publicado num pequeno secundario-texto">{fechaCorta(n.fecha_aviso)}</span>}
      <span className="col-plazo"><Plazo notif={n} /></span>
      <span className="col-estado"><InsigniaEstado estado={n.estado} /></span>
    </button>
  );
}

export default memo(FilaNotificacion);
