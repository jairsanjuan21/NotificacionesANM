/**
 * Fechas: conversión y presentación. Las fechas de la ANM llegan como texto
 * (YYYY-MM-DD o DD/MM/YYYY) y los registros del servidor como ISO en UTC.
 */

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Convierte 'YYYY-MM-DD' o 'DD/MM/YYYY' a Date local (sin desfase de zona). */
export function aFecha(texto) {
  if (!texto) return null;
  const t = String(texto).trim();
  let m = t.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(t);
  return isNaN(d) ? null : d;
}

export const tiempoDe = (texto) => aFecha(texto)?.getTime() ?? 0;

export function fechaCorta(texto) {
  const d = aFecha(texto);
  if (!d) return '—';
  const anio = d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}${anio}`;
}

export function fechaLarga(texto) {
  const d = aFecha(texto);
  if (!d) return '—';
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function diaSemana(texto) {
  const d = aFecha(texto);
  return d ? d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }) : '—';
}

export const mesCorto = (texto) => { const d = aFecha(texto); return d ? MESES_CORTOS[d.getMonth()] : ''; };

/** Fecha y hora en Colombia a partir de un ISO en UTC del servidor. */
export function fechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function haceCuanto(iso) {
  if (!iso) return 'nunca';
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  const dias = Math.round(s / 86400);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}
