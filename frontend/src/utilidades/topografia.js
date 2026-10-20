/**
 * Geometría de curvas de nivel. Funciones puras, sin React.
 *
 * Una curva de nivel es una línea cerrada que une puntos de igual altura.
 * Aquí se simula con un círculo cuyo radio "ondula" con la suma de varias
 * senoides (frecuencias 3, 5 y 7): así cada curva es irregular pero suave,
 * y siempre la misma para la misma fase (determinística, sin Math.random).
 */

/** Trazo SVG (atributo d) de una curva cerrada alrededor de (cx, cy). */
export function curva(cx, cy, radio, fase) {
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

/** Serie de curvas concéntricas, como una colina vista desde arriba. */
export function colina(cx, cy, cantidad, separacion, fase = 0) {
  return Array.from({ length: cantidad }, (_, i) => curva(cx, cy, (i + 1) * separacion, (i + 1) * 0.38 + fase));
}
