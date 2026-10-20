/**
 * Utilidades para las consolas de logs (propios y de Railway).
 */

/** Peticiones HTTP correctas del panel (mucho ruido); las que fallan con 5xx se muestran siempre. */
export const esPeticionNormal = (linea) => /"(GET|POST|PUT|DELETE|HEAD|OPTIONS) \/[^"]*" [1-4]\d\d\b/.test(linea.texto);

/** Traduce la severidad de Railway ('ERROR', 'warn', …) a los niveles de la consola. */
export function nivelDe(severidad) {
  const s = (severidad || '').toLowerCase();
  if (s.includes('err')) return 'error';
  if (s.includes('warn')) return 'aviso';
  return 'info';
}

/** Hora con segundos, en formato 24 h, para cada línea del log. */
export function horaLocal(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || '';
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

/** Escapa un texto para usarlo literal dentro de una expresión regular. */
export const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
