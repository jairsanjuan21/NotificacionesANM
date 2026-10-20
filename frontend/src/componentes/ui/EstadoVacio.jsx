import { colina } from '../../utilidades/topografia';

const MAPA = [...colina(46, 40, 4, 7, 0.4), ...colina(104, 30, 2, 6, 2.3)];

/**
 * Pantalla para cuando no hay nada que mostrar o algo falló.
 * Siempre dice qué pasó y, si se puede, qué hacer a continuación.
 *
 *   <EstadoVacio titulo="Sin vencimientos" accion={<Boton …/>}>
 *     Ninguna notificación tiene fecha límite en este período.
 *   </EstadoVacio>
 *
 * tono="error" pinta el mapa en óxido.
 */
export default function EstadoVacio({ titulo, children, accion, tono = 'neutro', compacto = false }) {
  return (
    <div className={`estado-vacio tono-${tono} ${compacto ? 'compacto' : ''}`} role={tono === 'error' ? 'alert' : undefined}>
      {!compacto && (
        <svg className="mapa" viewBox="0 0 150 80" aria-hidden="true">
          {MAPA.map((d, i) => <path key={i} d={d} />)}
          <path className="cota" d="M46 40v-14" />
          <circle className="cota" cx="46" cy="40" r="2.5" />
        </svg>
      )}
      <h3>{titulo}</h3>
      {children && <p>{children}</p>}
      {accion && <div className="hilera accion">{accion}</div>}
    </div>
  );
}
