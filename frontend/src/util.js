// ------------------------------------------------------------ Fechas

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

export function bytesLegibles(n) {
  if (!n) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ------------------------------------------------------------ Dominio

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

export const iniciales = (nombre) => (nombre || '?').trim().slice(0, 1).toUpperCase();
