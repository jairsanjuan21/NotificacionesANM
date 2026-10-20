import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ArrowUpDown, Inbox } from 'lucide-react';
import api, { mensajeError } from '../servicios/api';
import { useDatos } from '../contexto/datos';
import { useAvisos, useConfirmar } from '../contexto/avisos';
import { InsigniaEstado, Plazo } from '../componentes/Insignias';
import BarraSuperior from '../componentes/BarraSuperior';
import FiltroFecha from '../componentes/FiltroFecha';
import BotonConsultar from '../componentes/BotonConsultar';
import Detalle from '../componentes/DetalleNotificacion';
import Cajon from '../componentes/Cajon';
import usePantallaAncha from '../hooks/usePantallaAncha';
import {
  REGIONALES, URGENCIAS, listaRegionales, prioridad, requiereAtencion, respondida,
  tiempoDe, fechaCorta, diaSemana, tituloActo, textoRestante,
} from '../utilidades';

const FILTROS = [
  { id: 'atencion', texto: 'Requieren atención', prueba: requiereAtencion },
  { id: 'sin_responder', texto: 'Sin responder', prueba: n => !respondida(n) },
  { id: 'nuevas', texto: 'Nuevas', prueba: n => (n.estado || 'nueva') === 'nueva' },
  { id: 'en_tramite', texto: 'En trámite', prueba: n => n.estado === 'en_tramite' },
  { id: 'coactivo', texto: 'Cobro coactivo', prueba: n => n.fuente === 'coactivo' },
  { id: 'respondidas', texto: 'Respondidas', prueba: respondida },
  { id: 'todas', texto: 'Todas', prueba: () => true },
];

const ORDENES = {
  prioridad: { texto: 'Prioridad', fn: (a, b) => prioridad(a) - prioridad(b) || limite(a) - limite(b) || tiempoDe(b.fecha_aviso) - tiempoDe(a.fecha_aviso) },
  recientes: { texto: 'Publicación más reciente', fn: (a, b) => tiempoDe(b.fecha_aviso) - tiempoDe(a.fecha_aviso) || b.id_notificacion - a.id_notificacion },
  limite: { texto: 'Fecha límite más próxima', fn: (a, b) => limite(a) - limite(b) },
};
function limite(n) {
  if (!n.fecha_limite || respondida(n)) return Number.MAX_SAFE_INTEGER;
  return tiempoDe(n.fecha_limite);
}

const POR_PAGINA = 60;

export default function Bandeja() {
  const { enPeriodo, notificaciones, clientePorId, cargando, error, fechaDesde, recargar } = useDatos();
  const avisos = useAvisos();
  const confirmar = useConfirmar();
  const [params, setParams] = useSearchParams();
  const [filtro, setFiltro] = useState(params.get('filtro') || 'atencion');
  const [busqueda, setBusqueda] = useState('');
  const [regional, setRegional] = useState('');
  const [orden, setOrden] = useState('prioridad');
  // Paginación que vuelve a la primera página cuando cambia cualquier filtro.
  // En vez de un useEffect que llame setMostrar(POR_PAGINA), guardamos junto al
  // número la "firma" de los filtros con que se calculó; si no coincide, se descarta.
  const firmaFiltros = [filtro, busqueda, regional, orden, fechaDesde].join('|');
  const [pagina, setPagina] = useState({ firma: firmaFiltros, mostrar: POR_PAGINA });
  const mostrar = pagina.firma === firmaFiltros ? pagina.mostrar : POR_PAGINA;
  const setMostrar = (fn) => setPagina({ firma: firmaFiltros, mostrar: fn(mostrar) });
  const ancha = usePantallaAncha();
  const listaRef = useRef(null);

  const seleccion = params.get('n') ? Number(params.get('n')) : null;
  const seleccionar = (id) => {
    const p = new URLSearchParams(params);
    if (id) p.set('n', id); else p.delete('n');
    setParams(p, { replace: true });
  };

  // Notificaciones filtradas y ordenadas
  const { visibles, cuentas } = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    const base = enPeriodo.filter(n => {
      const c = clientePorId(n.id_cliente) || {};
      if (regional && !listaRegionales(c.regional).some(r => r === regional || r === 'all')) return false;
      if (!t) return true;
      return [c.placa, c.nombre_empresa, n.numero, n.tipo_acto, n.tipo_notificacion, n.resumen, n.url_pdf, n.notas]
        .some(x => (x || '').toLowerCase().includes(t));
    });
    const cuentas = Object.fromEntries(FILTROS.map(f => [f.id, base.filter(f.prueba).length]));
    const prueba = FILTROS.find(f => f.id === filtro)?.prueba || (() => true);
    return { visibles: base.filter(prueba).sort(ORDENES[orden].fn), cuentas };
  }, [enPeriodo, clientePorId, busqueda, regional, filtro, orden]);

  const seleccionada = notificaciones.find(n => n.id_notificacion === seleccion) || null;

  // Navegación con el teclado: ↑/↓ o j/k para moverse, Esc cierra el detalle (lo maneja Detalle)
  useEffect(() => {
    const tecla = (e) => {
      if (e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('.modal-velo')) return;
      if (!['ArrowDown', 'ArrowUp', 'j', 'k'].includes(e.key) || !visibles.length) return;
      e.preventDefault();
      const i = visibles.findIndex(n => n.id_notificacion === seleccion);
      const sig = e.key === 'ArrowDown' || e.key === 'j' ? Math.min(i + 1, visibles.length - 1) : Math.max(i - 1, 0);
      seleccionar(visibles[sig].id_notificacion);
      listaRef.current?.querySelector(`[data-id="${visibles[sig].id_notificacion}"]`)?.scrollIntoView({ block: 'nearest' });
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  });

  // Frase del encabezado
  const atencion = enPeriodo.filter(requiereAtencion);
  const proxima = enPeriodo
    .filter(n => !respondida(n) && n.dias_habiles_restantes !== null && n.dias_habiles_restantes >= 0)
    .sort((a, b) => limite(a) - limite(b))[0];
  const ocultas = notificaciones.length - enPeriodo.length;
  const antiguasSinResolver = fechaDesde
    ? notificaciones.filter(n => tiempoDe(n.fecha_aviso) < tiempoDe(fechaDesde) && !respondida(n)).length : 0;

  const marcarAntiguas = async () => {
    const ok = await confirmar({
      titulo: 'Marcar como respondidas las anteriores',
      mensaje: `Las ${antiguasSinResolver} notificaciones publicadas antes del ${fechaCorta(fechaDesde)} quedarán como respondidas y no se recordarán sus vencimientos. Puede cambiar cualquiera después.`,
      confirmar: `Marcar ${antiguasSinResolver} como respondidas`,
    });
    if (!ok) return;
    try {
      const r = await api.post('/notificaciones/marcar-respondidas', null, { params: { antes_de: fechaDesde } });
      avisos.exito(`${r.data.marcadas} notificaciones marcadas como respondidas.`);
      recargar();
    } catch (e) {
      avisos.error(mensajeError(e));
    }
  };

  if (cargando) return <div className="cargando">Cargando notificaciones…</div>;
  if (error) {
    return (
      <div className="vacio">
        <h3>No se pudieron cargar las notificaciones</h3>
        <p>{mensajeError(error)}</p>
        <button className="boton" onClick={recargar}>Intentar de nuevo</button>
      </div>
    );
  }

  const conDetalle = Boolean(seleccionada) && ancha;

  return (
    <>
      <BarraSuperior titulo="Bandeja">
        <FiltroFecha />
        <BotonConsultar />
      </BarraSuperior>

      <section className="resumen-dia" aria-live="polite">
        {atencion.length > 0 ? (
          <p className="frase"><span className="cifra">{atencion.length}</span> {atencion.length === 1 ? 'notificación requiere' : 'notificaciones requieren'} atención</p>
        ) : (
          <p className="frase tranquila"><span className="cifra">Nada urgente</span> por ahora</p>
        )}
        {proxima && (
          <p className="detalle">
            El próximo vencimiento es el {diaSemana(proxima.fecha_limite)}:{' '}
            <button onClick={() => seleccionar(proxima.id_notificacion)}>
              {clientePorId(proxima.id_cliente)?.placa}, {tituloActo(proxima)}
            </button>{' '}({textoRestante(proxima).toLowerCase()}).
          </p>
        )}
      </section>

      <div className="herramientas">
        <div className="chips" role="group" aria-label="Filtrar notificaciones">
          {FILTROS.map(f => (
            <button key={f.id} className="chip" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
              {f.texto} <span className="cuenta">{cuentas[f.id]}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="herramientas">
        <div className="buscador">
          <Search size={16} />
          <input className="campo" type="search" placeholder="Buscar placa, titular, número o texto" value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar notificaciones" />
        </div>
        <select className="campo" value={regional} onChange={(e) => setRegional(e.target.value)} aria-label="Regional">
          <option value="">Todas las regionales</option>
          {REGIONALES.map(r => <option key={r.id} value={r.id}>{r.etiqueta}</option>)}
        </select>
        <span className="separador" />
        <label className="pequeno tenue" htmlFor="orden" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowUpDown size={15} /> Ordenar
        </label>
        <select id="orden" className="campo" value={orden} onChange={(e) => setOrden(e.target.value)}>
          {Object.entries(ORDENES).map(([id, o]) => <option key={id} value={id}>{o.texto}</option>)}
        </select>
      </div>

      <div className={`bandeja ${conDetalle ? 'con-detalle' : ''}`}>
        <div className="lista" ref={listaRef}>
          <div className="lista-cabecera" aria-hidden="true">
            <span />
            <span>Título minero</span>
            <span>Acto</span>
            <span className="col-publicado">Publicado</span>
            <span className="col-plazo">Fecha límite</span>
            <span className="col-estado">Gestión</span>
          </div>

          {visibles.length === 0 ? (
            <div className="vacio">
              <Inbox size={28} className="tenue" />
              <h3>{filtro === 'atencion' ? 'No hay nada que requiera atención' : 'Ninguna notificación coincide'}</h3>
              <p>{filtro === 'atencion' ? 'Las notificaciones urgentes y las que vencen en los próximos 5 días hábiles aparecerán aquí.' : 'Pruebe con otro filtro o borre la búsqueda.'}</p>
              {filtro !== 'todas' && <button className="boton secundario" onClick={() => { setFiltro('todas'); setBusqueda(''); setRegional(''); }}>Ver todas</button>}
            </div>
          ) : (
            <div role="listbox" aria-label="Notificaciones">
              {visibles.slice(0, mostrar).map(n => {
                const c = clientePorId(n.id_cliente) || {};
                const u = URGENCIAS[n.urgencia];
                return (
                  <button
                    key={n.id_notificacion}
                    data-id={n.id_notificacion}
                    role="option"
                    aria-selected={n.id_notificacion === seleccion}
                    className={`fila ${respondida(n) ? 'respondida' : ''}`}
                    onClick={() => seleccionar(n.id_notificacion === seleccion && ancha ? null : n.id_notificacion)}
                  >
                    <span className={`veta ${!respondida(n) && u ? u.clase : 'u-ninguna'}`} />
                    <span className="celda-titulo">
                      <span className="placa">{c.placa}</span>
                      <span className="titular">{c.nombre_empresa}</span>
                    </span>
                    <span className="celda-acto">
                      <span className="acto">
                        <span>{tituloActo(n)}</span>
                        {!respondida(n) && u && n.urgencia !== 'baja' && n.urgencia !== 'media' && (
                          <span className={`insignia ${u.clase}`} style={{ height: 20, fontSize: 11.5, padding: '0 7px' }}>{u.etiqueta}</span>
                        )}
                      </span>
                      <span className="extracto">
                        {n.resumen || (n.tipo_notificacion ? `${n.tipo_notificacion}${n.motivo_urgencia && n.urgencia !== 'baja' ? `, menciona ${n.motivo_urgencia}` : ''}` : 'Documento sin analizar')}
                      </span>
                    </span>
                    <span className="col-publicado num pequeno secundario-texto">{fechaCorta(n.fecha_aviso)}</span>
                    <span className="col-plazo"><Plazo notif={n} /></span>
                    <span className="col-estado"><InsigniaEstado estado={n.estado} /></span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="lista-pie">
            <span>
              {visibles.length} de {enPeriodo.length} notificaciones
              {fechaDesde && ocultas > 0 && <>, {ocultas} anteriores al {fechaCorta(fechaDesde)} ocultas</>}
            </span>
            <span style={{ display: 'flex', gap: 8 }}>
              {antiguasSinResolver > 0 && (
                <button className="boton fantasma pequeno" onClick={marcarAntiguas}>Marcar {antiguasSinResolver} anteriores como respondidas</button>
              )}
              {visibles.length > mostrar && (
                <button className="boton secundario pequeno" onClick={() => setMostrar(m => m + POR_PAGINA)}>Mostrar más</button>
              )}
            </span>
          </div>
        </div>

        {conDetalle && <Detalle key={seleccionada.id_notificacion} notif={seleccionada} onCerrar={() => seleccionar(null)} />}
      </div>

      {seleccionada && !ancha && (
        <Cajon onCerrar={() => seleccionar(null)}>
          <Detalle key={seleccionada.id_notificacion} notif={seleccionada} onCerrar={() => seleccionar(null)} />
        </Cajon>
      )}
    </>
  );
}
