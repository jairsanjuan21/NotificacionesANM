/**
 * Formatos de presentación que no dependen del dominio minero.
 */

export function bytesLegibles(n) {
  if (!n) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const iniciales = (nombre) => (nombre || '?').trim().slice(0, 1).toUpperCase();
