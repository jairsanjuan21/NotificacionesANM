import { Fragment } from 'react';
import { escaparRegex, horaLocal } from '../utilidades';

/** Resalta con <mark> las coincidencias de la búsqueda dentro de una línea. */
function Resaltado({ texto, busqueda }) {
  if (!busqueda) return texto;
  const partes = texto.split(new RegExp(`(${escaparRegex(busqueda)})`, 'ig'));
  return partes.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>));
}

const claseNivel = { error: 'error', aviso: 'aviso-log' };

/** Consola de solo lectura que muestra líneas { id, ts, nivel, texto }. */
export default function ConsolaLogs({ lineas, busqueda, vacio, contenedorRef, onScroll }) {
  return (
    <div className="consola" ref={contenedorRef} onScroll={onScroll} role="log" aria-live="off">
      {lineas.length === 0 ? <div className="vacia">{vacio}</div> : lineas.map((l, i) => (
        <div key={l.id ?? i} className={`linea-log ${claseNivel[l.nivel] || ''}`}>
          <span className="hora">{horaLocal(l.ts)}</span>
          <span><Resaltado texto={l.texto} busqueda={busqueda} /></span>
        </div>
      ))}
    </div>
  );
}
