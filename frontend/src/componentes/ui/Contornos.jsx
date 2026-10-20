import { curva } from '../../utilidades/topografia';

const CACHE = {};

function generar(semilla) {
  if (CACHE[semilla]) return CACHE[semilla];
  const caminos = [];
  const centros = semilla === 'login'
    ? [[260, 330, 15], [600, 140, 7]]
    : [[150, 260, 12], [40, 70, 5]];
  centros.forEach(([cx, cy, cantidad], j) => {
    for (let k = 1; k <= cantidad; k++) caminos.push(curva(cx, cy, k * 26, k * 0.38 + j * 2.1));
  });
  CACHE[semilla] = caminos;
  return caminos;
}

/** Curvas de nivel de fondo (barra lateral e inicio de sesión). */
export default function Contornos({ className, semilla = 'lateral' }) {
  const caminos = generar(semilla);
  const vista = semilla === 'login' ? '0 0 800 600' : '0 0 300 360';
  return (
    <svg className={className} viewBox={vista} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.1">
        {caminos.map((d, i) => <path key={i} d={d} opacity={i % 5 === 0 ? 1 : 0.6} strokeWidth={i % 5 === 0 ? 1.6 : 1} />)}
      </g>
    </svg>
  );
}
