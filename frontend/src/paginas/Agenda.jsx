import { useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { useDatos } from '../datos';
import { InsigniaUrgencia, InsigniaEstado } from '../ui/Insignias';
import { BarraSuperior, FiltroFecha } from './Marco';
import Detalle from './Detalle';
import Cajon from './Cajon';
import { aFecha, mesCorto, nivelPlazo, respondida, textoRestante, tiempoDe, tituloActo } from '../util';

function grupoDe(n, hoy) {
  const d = n.dias_habiles_restantes;
  if (d < 0) return 'vencidas';
  const f = aFecha(n.fecha_limite);
  const finSemana = new Date(hoy); finSemana.setDate(hoy.getDate() + (7 - ((hoy.getDay() + 6) % 7)) - 1);
  const finProxima = new Date(finSemana); finProxima.setDate(finSemana.getDate() + 7);
  if (f <= finSemana) return 'semana';
  if (f <= finProxima) return 'proxima';
  return 'despues';
}

const GRUPOS = [
  { id: 'semana', titulo: 'Esta semana' },
  { id: 'proxima', titulo: 'La próxima semana' },
  { id: 'despues', titulo: 'Más adelante' },
  { id: 'vencidas', titulo: 'Vencidas sin marcar como respondidas' },
];

export default function Agenda() {
  const { enPeriodo, clientePorId, notificaciones } = useDatos();
  const [seleccion, setSeleccion] = useState(null);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

  const items = enPeriodo
    .filter(n => n.fecha_limite && !respondida(n) && n.dias_habiles_restantes !== null && n.dias_habiles_restantes >= -22)
    .sort((a, b) => tiempoDe(a.fecha_limite) - tiempoDe(b.fecha_limite));
  const porGrupo = Object.fromEntries(GRUPOS.map(g => [g.id, items.filter(n => grupoDe(n, hoy) === g.id)]));
  const seleccionada = notificaciones.find(n => n.id_notificacion === seleccion);

  return (
    <>
      <BarraSuperior
        titulo="Vencimientos"
        descripcion="Fechas límite estimadas en días hábiles, con festivos de Colombia. Marque una notificación como respondida para sacarla de esta lista y de los recordatorios."
      >
        <FiltroFecha />
      </BarraSuperior>

      {items.length === 0 ? (
        <div className="vacio">
          <CalendarCheck size={30} className="tenue" />
          <h3>No hay vencimientos pendientes</h3>
          <p>Cuando llegue una notificación con plazo, aparecerá aquí ordenada por fecha.</p>
        </div>
      ) : (
        <div className="agenda">
          {GRUPOS.filter(g => porGrupo[g.id].length).map(g => (
            <section key={g.id} className="agenda-grupo">
              <h2>{g.titulo} <span className="cuenta">{porGrupo[g.id].length}</span></h2>
              <div className="agenda-items">
                {porGrupo[g.id].map(n => {
                  const c = clientePorId(n.id_cliente) || {};
                  const f = aFecha(n.fecha_limite);
                  const nivel = nivelPlazo(n);
                  return (
                    <button key={n.id_notificacion} className="agenda-item" onClick={() => setSeleccion(n.id_notificacion)}>
                      <span className={`dia-calendario ${nivel === 'critico' || nivel === 'vencido' ? 'critico' : nivel === 'cerca' ? 'cerca' : ''}`}>
                        <span className="dia-num">{f.getDate()}</span>
                        <span className="dia-mes">{mesCorto(n.fecha_limite)}</span>
                      </span>
                      <span className="que">
                        <span className="linea1">
                          <span className="placa">{c.placa}</span>
                          <strong style={{ fontSize: 14 }}>{tituloActo(n)}</strong>
                        </span>
                        <span className="linea2">{n.resumen || c.nombre_empresa}</span>
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <strong className="pequeno" style={{ color: nivel === 'critico' ? 'var(--oxido)' : nivel === 'cerca' ? 'var(--ocre)' : 'var(--tinta-2)' }}>
                          {textoRestante(n)}
                        </strong>
                        <span style={{ display: 'flex', gap: 4 }}>
                          {n.urgencia === 'alta' && <InsigniaUrgencia notif={n} />}
                          <InsigniaEstado estado={n.estado} />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {seleccionada && (
        <Cajon onCerrar={() => setSeleccion(null)}>
          <Detalle key={seleccionada.id_notificacion} notif={seleccionada} onCerrar={() => setSeleccion(null)} />
        </Cajon>
      )}
    </>
  );
}
