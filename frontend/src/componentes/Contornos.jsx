// Curvas de nivel generadas (determinísticas): el único elemento decorativo del panel.

function curva(cx, cy, radio, fase) {
  const puntos = [];
  const n = 48;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = radio * (1 + 0.16 * Math.sin(3 * a + fase) + 0.07 * Math.sin(5 * a - fase * 1.7) + 0.04 * Math.cos(7 * a + fase * 0.6));
    puntos.push([cx + r * Math.cos(a) * 1.25, cy + r * Math.sin(a)]);
  }
  // Catmull-Rom cerrado → curvas de Bézier
  let d = `M${puntos[0][0].toFixed(1)},${puntos[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = puntos[(i - 1 + n) % n], p1 = puntos[i], p2 = puntos[(i + 1) % n], p3 = puntos[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

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
