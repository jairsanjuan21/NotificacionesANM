import { colina } from '../../utilidades/topografia';

const CURVAS = colina(32, 32, 4, 6.4, 1.1);

/**
 * Indicador de carga: curvas de nivel que se van trazando desde la cima,
 * como un levantamiento topográfico en curso.
 *
 *   <Cargando>Cargando métricas…</Cargando>
 *   <Cargando compacto />          dentro de paneles pequeños
 *   <Cargando pantalla />          ocupa toda la ventana (arranque)
 */
export default function Cargando({ children = 'Cargando…', compacto = false, pantalla = false }) {
  return (
    <div className={`cargando ${compacto ? 'compacto' : ''} ${pantalla ? 'pantalla' : ''}`} role="status" aria-live="polite">
      <svg className="levantamiento" viewBox="0 0 64 64" aria-hidden="true">
        {CURVAS.map((d, i) => <path key={i} d={d} pathLength="1" style={{ '--i': i }} />)}
        <circle cx="32" cy="32" r="2.2" />
      </svg>
      <span>{children}</span>
    </div>
  );
}
