/**
 * Reglas del negocio: urgencias, estados, regionales, plazos y prioridad
 * de las notificaciones de la ANM.
 */

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
