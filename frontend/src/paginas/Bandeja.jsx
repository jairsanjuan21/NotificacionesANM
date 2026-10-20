import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, RefreshCw } from 'lucide-react';
import api, { mensajeError } from '../servicios/api';
import { useDatos } from '../contexto/datos';
import { useAvisos, useConfirmar } from '../contexto/avisos';
import FilaNotificacion from '../componentes/FilaNotificacion';
import BarraSuperior from '../componentes/BarraSuperior';
import FiltroFecha from '../componentes/FiltroFecha';
import BotonConsultar from '../componentes/BotonConsultar';
import Detalle from '../componentes/DetalleNotificacion';
import Cajon from '../componentes/ui/Cajon';
import Boton from '../componentes/ui/Boton';
import Cargando from '../componentes/ui/Cargando';
import EstadoVacio from '../componentes/ui/EstadoVacio';
import usePantallaAncha from '../hooks/usePantallaAncha';
import usePreferencia from '../hooks/usePreferencia';
import {
  REGIONALES, listaRegionales, prioridad, requiereAtencion, respondida, tiempoDe, fechaCorta, diaSemana,
  compararPorPublicacion, agruparConsecutivos, etiquetaDia, resumenTipos, sinRevisar,
} from '../utilidades';

const SIN_CLIENTE = {};

/** "hoy", "ayer" o "el jueves 15 de octubre", para usar dentro de una frase. */
function cuandoFue(fecha) {
  const e = etiquetaDia(fecha);
  return e === 'Hoy' || e === 'Ayer' ? e.toLowerCase() : `el ${e.charAt(0).toLowerCase()}${e.slice(1)}`;
}

const FILTROS = [
  { id: 'sin_responder', texto: 'Sin responder', prueba: n => !respondida(n) },
  { id: 'atencion', texto: 'Requieren atención', prueba: requiereAtencion },
  { id: 'nuevas', texto: 'Sin revisar', prueba: sinRevisar },
  { id: 'en_tramite', texto: 'En trámite', prueba: n => n.estado === 'en_tramite' },
  { id: 'coactivo', texto: 'Cobro coactivo', prueba: n => n.fuente === 'coactivo' },
  { id: 'respondidas', texto: 'Respondidas', prueba: respondida },
  { id: 'todas', texto: 'Todas', prueba: () => true },
];

/*
 * Tres formas de leer la bandeja. "publicacion" es la predeterminada:
 * el ingeniero revisa lo que la ANM publicó, día por día, como en el portal;
 * la urgencia es una segunda capa (veta de color e insignia), no el orden.
 */
const VISTAS = {
  publicacion: { texto: 'Publicación', fn: compararPorPublicacion, agrupar: true },
  prioridad: { texto: 'Urgencia', fn: (a, b) => prioridad(a) - prioridad(b) || limite(a) - limite(b) || tiempoDe(b.fecha_aviso) - tiempoDe(a.fecha_aviso) },
  limite: { texto: 'Vencimiento', fn: (a, b) => limite(a) - limite(b) || compararPorPublicacion(a, b) },
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
  const [filtro, setFiltro] = useState(params.get('filtro') || 'sin_responder');
  const [busqueda, setBusqueda] = useState('');
  const [regional, setRegional] = useState('');
  const [orden, setOrden] = usePreferencia('vistaBandeja', 'publicacion');
  const vista = VISTAS[orden] || VISTAS.publicacion;
  // Paginación que vuelve a la primera página cuando cambia cualquier filtro.
  // En vez de un useEffect que llame setMostrar(POR_PAGINA), guardamos junto al
  // número la "firma" de los filtros con que se calculó; si no coincide, se descarta.
  const firmaFiltros = [filtro, busqueda, regional, orden, fechaDesde].join('|');
  const [paginacion, setPaginacion] = useState({ firma: firmaFiltros, mostrar: POR_PAGINA });
  const mostrar = paginacion.firma === firmaFiltros ? paginacion.mostrar : POR_PAGINA;
  const setMostrar = (fn) => setPaginacion({ firma: firmaFiltros, mostrar: fn(mostrar) });
  const ancha = usePantallaAncha();
  const listaRef = useRef(null);

  const seleccion = params.get('n') ? Number(params.get('n')) : null;
  // La notificación abierta vive en la URL (?n=123): se puede compartir, recargar o volver atrás.
  // Se usa la forma funcional de setParams para que la función sea estable y FilaNotificacion
  // (memorizada) no se vuelva a pintar entera en cada render.
  const seleccionar = useCallback((id) => {
    setParams((actual) => {
      const p = new URLSearchParams(actual);
      if (id) p.set('n', id); else p.delete('n');
      return p;
    }, { replace: true });
  }, [setParams]);
  const elegirFila = useCallback((id) => {
    // En pantalla ancha, volver a pulsar la fila abierta la cierra
    seleccionar(id === seleccion && ancha ? null : id);
  }, [seleccionar, seleccion, ancha]);

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
    return { visibles: base.filter(prueba).sort(vista.fn), cuentas };
  }, [enPeriodo, clientePorId, busqueda, regional, filtro, vista]);

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
  const porRevisar = enPeriodo.filter(sinRevisar).length;
  const ultimaPublicacion = enPeriodo.reduce((max, n) => (tiempoDe(n.fecha_aviso) > tiempoDe(max) ? n.fecha_aviso : max), null);
  const ocultas = notificaciones.length - enPeriodo.length;

  // En la vista por publicación se pintan encabezados por día; en las otras, un solo bloque sin título.
  const pagina = visibles.slice(0, mostrar);
  const grupos = vista.agrupar
    ? agruparConsecutivos(pagina, n => n.fecha_aviso || '').map(g => ({
      ...g,
      titulo: etiquetaDia(g.clave),
      urgentes: g.items.filter(n => !respondida(n) && n.urgencia === 'alta').length,
    }))
    : [{ clave: 'todas', items: pagina }];
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

  if (cargando) return <Cargando>Cargando notificaciones…</Cargando>;
  if (error) {
    return (
      <EstadoVacio tono="error" titulo="No se pudieron cargar las notificaciones"
        accion={<Boton icono={RefreshCw} onClick={recargar}>Intentar de nuevo</Boton>}>
        {mensajeError(error)}
      </EstadoVacio>
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
        <p className="frase">
          {porRevisar > 0
            ? <><span className="cifra">{porRevisar}</span> {porRevisar === 1 ? 'notificación sin revisar' : 'notificaciones sin revisar'}</>
            : <span className="tranquila">Todo revisado</span>}
        </p>
        <p className="detalle">
          {ultimaPublicacion && <>La ANM publicó por última vez {cuandoFue(ultimaPublicacion)}. </>}
          {atencion.length > 0 && (
            <>
              <button onClick={() => setFiltro('atencion')}>
                {atencion.length} {atencion.length === 1 ? 'requiere' : 'requieren'} atención
              </button>
              {proxima && <> y el próximo vencimiento es el {diaSemana(proxima.fecha_limite)} (<button onClick={() => seleccionar(proxima.id_notificacion)}>{clientePorId(proxima.id_cliente)?.placa}</button>).</>}
            </>
          )}
        </p>
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
        <span className="estirar" />
        <span className="pequeno tenue etiqueta-orden">Ordenar por</span>
        <div className="segmentado" role="group" aria-label="Ordenar por">
          {Object.entries(VISTAS).map(([id, v]) => (
            <button key={id} aria-pressed={orden === id} onClick={() => setOrden(id)}>{v.texto}</button>
          ))}
        </div>
      </div>

      <div className={`bandeja ${conDetalle ? 'con-detalle' : ''}`}>
        <div className={`lista ${vista.agrupar ? 'por-dia' : ''}`} ref={listaRef}>
          <div className="lista-cabecera" aria-hidden="true">
            <span />
            <span>Título minero</span>
            <span>Acto</span>
            {!vista.agrupar && <span className="col-publicado">Publicado</span>}
            <span className="col-plazo">Fecha límite</span>
            <span className="col-estado">Gestión</span>
          </div>

          {visibles.length === 0 ? (
            <EstadoVacio
              titulo={filtro === 'sin_responder' ? 'No hay notificaciones pendientes' : filtro === 'atencion' ? 'No hay nada que requiera atención' : 'Ninguna notificación coincide'}
              accion={filtro !== 'todas' && (
                <Boton variante="secundario" onClick={() => { setFiltro('todas'); setBusqueda(''); setRegional(''); }}>Ver todas</Boton>
              )}>
              {filtro === 'sin_responder'
                ? 'Todo lo publicado por la ANM en este período ya está respondido.'
                : filtro === 'atencion'
                  ? 'Las notificaciones urgentes y las que vencen en los próximos 5 días hábiles aparecerán aquí.'
                  : 'Pruebe con otro filtro o borre la búsqueda.'}
            </EstadoVacio>
          ) : (
            <div role="listbox" aria-label="Notificaciones">
              {grupos.map(g => (
                <section key={g.clave} className="grupo-dia" aria-label={g.titulo || undefined}>
                  {g.titulo && (
                    <header className="cabecera-dia">
                      <h2>{g.titulo}</h2>
                      <span className="composicion">{resumenTipos(g.items)}</span>
                      {g.urgentes > 0 && <span className="urgentes-dia">{g.urgentes} {g.urgentes === 1 ? 'urgente' : 'urgentes'}</span>}
                    </header>
                  )}
                  {g.items.map(n => (
                    <FilaNotificacion
                      key={n.id_notificacion}
                      notif={n}
                      cliente={clientePorId(n.id_cliente) || SIN_CLIENTE}
                      seleccionada={n.id_notificacion === seleccion}
                      mostrarPublicado={!vista.agrupar}
                      onElegir={elegirFila}
                    />
                  ))}
                </section>
              ))}
            </div>
          )}

          <div className="lista-pie">
            <span>
              {visibles.length} de {enPeriodo.length} notificaciones
              {fechaDesde && ocultas > 0 && <>, {ocultas} anteriores al {fechaCorta(fechaDesde)} ocultas</>}
            </span>
            <span className="hilera">
              {antiguasSinResolver > 0 && (
                <Boton variante="fantasma" tamano="pequeno" onClick={marcarAntiguas}>Marcar {antiguasSinResolver} anteriores como respondidas</Boton>
              )}
              {visibles.length > mostrar && (
                <Boton variante="secundario" tamano="pequeno" onClick={() => setMostrar(m => m + POR_PAGINA)}>Mostrar más</Boton>
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
