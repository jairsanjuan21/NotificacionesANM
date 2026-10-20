import { AlertTriangle, Eye, CircleDot, ArrowDown, CheckCheck, Clock3, Circle, Wrench, Banknote } from 'lucide-react';
import { URGENCIAS, etiquetaEstado, nivelPlazo, textoRestante, fechaCorta } from '../utilidades';

const ICONO_URGENCIA = { alta: AlertTriangle, revisar: Eye, media: CircleDot, baja: ArrowDown };
const ICONO_ESTADO = { nueva: Circle, revisada: Eye, en_tramite: Wrench, respondida: CheckCheck };

export function InsigniaUrgencia({ notif, compacta }) {
  const u = URGENCIAS[notif.urgencia];
  if (!u) return compacta ? null : <span className="insignia u-ninguna">Sin analizar</span>;
  const Icono = ICONO_URGENCIA[notif.urgencia];
  return (
    <span className={`insignia ${u.clase}`} title={notif.motivo_urgencia ? `Detectado: ${notif.motivo_urgencia}` : undefined}>
      <Icono size={13} strokeWidth={2.4} /> {u.etiqueta}
    </span>
  );
}

export function InsigniaEstado({ estado }) {
  const id = estado || 'nueva';
  const Icono = ICONO_ESTADO[id] || Circle;
  return <span className={`insignia e-${id}`}><Icono size={13} strokeWidth={2.4} /> {etiquetaEstado(id)}</span>;
}

export function InsigniaCoactivo() {
  return <span className="insignia marca-coactivo"><Banknote size={13} strokeWidth={2.4} /> Cobro coactivo</span>;
}

export function Plazo({ notif }) {
  if (!notif.fecha_limite) {
    return <span className="plazo normal"><span className="restante tenue">{notif.procesada ? 'Sin plazo' : '—'}</span></span>;
  }
  const nivel = nivelPlazo(notif) || 'normal';
  return (
    <span className={`plazo ${nivel}`} title={notif.base_plazo || undefined}>
      <span className="fecha">{fechaCorta(notif.fecha_limite)}</span><br />
      <span className="restante">
        {nivel === 'critico' && <Clock3 size={12} strokeWidth={2.6} style={{ verticalAlign: '-1px', marginRight: 3 }} />}
        {textoRestante(notif)}
      </span>
    </span>
  );
}
