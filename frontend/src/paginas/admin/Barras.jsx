import { useState } from 'react';

/**
 * Gráfico de barras simple (una o dos series apiladas) con globo al pasar el mouse.
 * series: [{ clave, nombre, clase }]  (clase: 'barra-principal' | 'barra-alerta')
 */
export default function Barras({ datos, series, etiqueta, alto = 180, formatoEje = (v) => v, descripcion }) {
  const [activo, setActivo] = useState(null);
  const ancho = 640;
  const margen = { izq: 30, der: 8, arr: 10, aba: 24 };
  const total = (d) => series.reduce((s, x) => s + (d[x.clave] || 0), 0);
  const maximo = Math.max(1, ...datos.map(total));
  const paso = maximo <= 4 ? 1 : Math.ceil(maximo / 4);
  const tope = Math.ceil(maximo / paso) * paso;
  const anchoUtil = ancho - margen.izq - margen.der;
  const altoUtil = alto - margen.arr - margen.aba;
  const col = anchoUtil / datos.length;
  const barra = Math.max(2, Math.min(28, col - 2));
  const y = (v) => margen.arr + altoUtil - (v / tope) * altoUtil;
  const marcas = [];
  for (let v = 0; v <= tope; v += paso) marcas.push(v);
  const cadaEtiqueta = Math.ceil(datos.length / 8);

  return (
    <div className="grafico">
      {series.length > 1 && (
        <div className="leyenda">
          {series.map(s => <span key={s.clave}><i className={s.clase} />{s.nombre}</span>)}
        </div>
      )}
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={descripcion}>
        {marcas.map(v => (
          <g key={v}>
            <line className="rejilla-linea" x1={margen.izq} x2={ancho - margen.der} y1={y(v)} y2={y(v)} />
            <text className="eje" x={margen.izq - 6} y={y(v) + 3.5} textAnchor="end">{v}</text>
          </g>
        ))}
        {datos.map((d, i) => {
          const x = margen.izq + i * col + (col - barra) / 2;
          let acumulado = 0;
          return (
            <g key={i}>
              {series.map((s, j) => {
                const v = d[s.clave] || 0;
                if (!v) return null;
                const y1 = y(acumulado + v);
                const h = y(acumulado) - y1 - (j > 0 ? 2 : 0); // 2px de separación entre segmentos
                acumulado += v;
                const esTope = series.slice(j + 1).every(t => !(d[t.clave] || 0));
                const r = esTope ? Math.min(4, barra / 2) : 0;
                return (
                  <path key={s.clave} className={s.clase}
                    d={`M${x},${y1 + h} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barra - r} Q${x + barra},${y1} ${x + barra},${y1 + r} V${y1 + h} Z`}
                    opacity={activo === null || activo === i ? 1 : 0.45} />
                );
              })}
              {i % cadaEtiqueta === 0 && (
                <text className="eje" x={x + barra / 2} y={alto - 6} textAnchor="middle">{formatoEje(d[etiqueta])}</text>
              )}
              <rect className="zona-hover" x={margen.izq + i * col} y={margen.arr} width={col} height={altoUtil}
                onMouseEnter={() => setActivo(i)} onMouseLeave={() => setActivo(null)} />
            </g>
          );
        })}
      </svg>
      {activo !== null && (
        <div className="globo" style={{
          left: `${((margen.izq + activo * col + col / 2) / ancho) * 100}%`,
          top: `${(y(total(datos[activo])) / alto) * 100}%`,
        }}>
          <div>{formatoEje(datos[activo][etiqueta], true)}</div>
          {series.map(s => <div key={s.clave}>{s.nombre}: <strong>{datos[activo][s.clave] || 0}</strong></div>)}
        </div>
      )}
    </div>
  );
}
