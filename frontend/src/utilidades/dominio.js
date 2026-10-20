/**
 * Reglas del negocio: urgencias, estados, regionales, plazos y prioridad
 * de las notificaciones de la ANM.
 */

import { aFecha } from './fechas';

export const URGENCIAS = {
  alta: { etiqueta: 'Urgente', clase: 'u-alta', orden: 0 },
  revisar: { etiqueta: 'Revisar a mano', clase: 'u-revisar', orden: 1 },
  media: { etiqueta: 'Media', clase: 'u-media', orden: 2 },
  baja: { etiqueta: 'Baja', clase: 'u-baja', orden: 3 },
};

export const ESTADOS = [
  { id: 'nueva', etiqueta: 'Nueva' },
  { id: 'revisada', etiqueta: 'Revisada' },
  { id: 'en_tramite', etiqueta: 'En trámite' },
  { id: 'respondida', etiqueta: 'Respondida' },
];
export const etiquetaEstado = (id) => ESTADOS.find(e => e.id === id)?.etiqueta || 'Nueva';

export const REGIONALES = [
  { id: 'bogota', etiqueta: 'Bogotá' }, { id: 'bucaramanga', etiqueta: 'Bucaramanga' },
  { id: 'cartagena', etiqueta: 'Cartagena' }, { id: 'valledupar', etiqueta: 'Valledupar' },
  { id: 'ibague', etiqueta: 'Ibagué' }, { id: 'pasto', etiqueta: 'Pasto' }, { id: 'cali', etiqueta: 'Cali' },
  { id: 'cucuta', etiqueta: 'Cúcuta' }, { id: 'manizales', etiqueta: 'Manizales' },
  { id: 'medellin', etiqueta: 'Medellín' }, { id: 'nobsa', etiqueta: 'Nobsa' }, { id: 'quibdo', etiqueta: 'Quibdó' },
];
export const etiquetaRegional = (id) => (id === 'all' ? 'Todas' : REGIONALES.find(r => r.id === id)?.etiqueta || id);
export const listaRegionales = (texto) => (texto || '').split(',').map(r => r.trim().toLowerCase()).filter(Boolean);

export const respondida = (n) => n.estado === 'respondida';

/** Aún nadie la ha abierto ni gestionado: es lo "no leído" de la bandeja. */
export const sinRevisar = (n) => (n.estado || 'nueva') === 'nueva';

/** Clasifica qué tan cerca está el vencimiento (para colores y textos). */
export function nivelPlazo(n) {
  const d = n.dias_habiles_restantes;
  if (d === null || d === undefined || respondida(n)) return null;
  if (d < 0) return 'vencido';
  if (d <= 3) return 'critico';
  if (d <= 7) return 'cerca';
  return 'normal';
}

export function textoRestante(n) {
  const d = n.dias_habiles_restantes;
  if (respondida(n)) return 'Respondida';
  if (d === null || d === undefined) return '';
  if (d < 0) return `Vencido hace ${-d} día${d === -1 ? '' : 's'}`;
  if (d === 0) return 'Vence hoy';
  if (d === 1) return 'Vence mañana';
  return `${d} días hábiles`;
}

/** ¿Requiere atención del ingeniero? (no respondida y urgente, por vencer o sin leer). */
export function requiereAtencion(n) {
  if (respondida(n)) return false;
  const d = n.dias_habiles_restantes;
  return n.urgencia === 'alta' || n.urgencia === 'revisar' || (d !== null && d !== undefined && d >= 0 && d <= 5);
}

/** Orden de la bandeja: primero lo que requiere atención, luego lo nuevo, al final lo respondido. */
export function prioridad(n) {
  if (respondida(n)) return 9;
  const d = n.dias_habiles_restantes;
  if (d !== null && d !== undefined && d >= 0 && d <= 3) return 0;
  if (n.urgencia === 'alta') return 1;
  if (d !== null && d !== undefined && d >= 0 && d <= 7) return 2;
  if (n.urgencia === 'revisar') return 3;
  if (n.estado === 'nueva') return 4;
  return 5;
}

export function nombreDocumento(url) {
  try {
    return decodeURIComponent((url || '').split('/').pop().split('?')[0]).replace(/\.pdf$/i, '').replace(/[_]+/g, ' ');
  } catch {
    return url;
  }
}

/** Título legible del acto: "Auto No. 0699" / "Aviso de cobro coactivo" / nombre del archivo. */
export function tituloActo(n) {
  if (n.fuente === 'coactivo') return n.numero ? `Cobro coactivo, aviso ${n.numero}` : 'Aviso de cobro coactivo';
  if (n.tipo_acto && n.numero) return `${n.tipo_acto} ${n.numero}`;
  return nombreDocumento(n.url_pdf);
}

/**
 * Orden de los tipos de acto dentro de un mismo día.
 * El ingeniero revisa primero los autos (suelen traer requerimientos con plazo),
 * luego las resoluciones y al final avisos y demás.
 */
const ORDEN_TIPO = { Auto: 0, 'Resolución': 1 };
export const ordenTipoActo = (n) => ORDEN_TIPO[n.tipo_acto] ?? 2;

/**
 * Orden "como publica la ANM": día de publicación más reciente primero;
 * dentro del día, autos antes que resoluciones; y luego por prioridad.
 */
export function compararPorPublicacion(a, b) {
  const fa = aFecha(a.fecha_aviso)?.getTime() ?? 0;
  const fb = aFecha(b.fecha_aviso)?.getTime() ?? 0;
  return fb - fa || ordenTipoActo(a) - ordenTipoActo(b) || prioridad(a) - prioridad(b) || b.id_notificacion - a.id_notificacion;
}

/**
 * Agrupa una lista YA ORDENADA en bloques consecutivos con la misma clave.
 * Recorre una sola vez (O(n)) y conserva el orden: por eso sirve para
 * pintar encabezados por día sin volver a ordenar.
 *   agruparConsecutivos([a, b, c], n => n.fecha_aviso) → [{ clave, items: [a, b] }, { clave, items: [c] }]
 */
export function agruparConsecutivos(lista, claveDe) {
  const grupos = [];
  for (const item of lista) {
    const clave = claveDe(item);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.clave === clave) ultimo.items.push(item);
    else grupos.push({ clave, items: [item] });
  }
  return grupos;
}

/** "2 autos, 1 resolución y 1 aviso": composición de un día en palabras. */
export function resumenTipos(lista) {
  const cuenta = {};
  lista.forEach(n => {
    const t = n.fuente === 'coactivo' ? 'cobro coactivo' : (n.tipo_acto || 'otro documento').toLowerCase();
    cuenta[t] = (cuenta[t] || 0) + 1;
  });
  const plural = { auto: 'autos', 'resolución': 'resoluciones', aviso: 'avisos', 'otro documento': 'otros documentos', 'cobro coactivo': 'cobros coactivos' };
  const partes = Object.entries(cuenta)
    .sort(([a], [b]) => ordenTipoActo({ tipo_acto: a[0].toUpperCase() + a.slice(1) }) - ordenTipoActo({ tipo_acto: b[0].toUpperCase() + b.slice(1) }))
    .map(([t, n]) => `${n} ${n === 1 ? t : plural[t] || t}`);
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : partes[0] || '';
}
