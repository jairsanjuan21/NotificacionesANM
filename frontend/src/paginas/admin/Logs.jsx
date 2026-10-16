import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Download, Pause, Play, ArrowDownToLine } from 'lucide-react';
import api, { mensajeError } from '../../api';

const MAX_LINEAS = 4000;

// Peticiones HTTP correctas del panel (mucho ruido); las que fallan con 5xx se muestran siempre
const esPeticionNormal = (l) => /"(GET|POST|PUT|DELETE|HEAD|OPTIONS) \/[^"]*" [1-4]\d\d\b/.test(l.texto);

export function resaltar(texto, busqueda) {
  if (!busqueda) return texto;
  const partes = texto.split(new RegExp(`(${busqueda.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return partes.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>));
}

export function horaLocal(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || '';
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function ConsolaLogs({ lineas, busqueda, vacio, contenedorRef, onScroll }) {
  return (
    <div className="consola" ref={contenedorRef} onScroll={onScroll} role="log" aria-live="off">
      {lineas.length === 0 ? <div className="vacia">{vacio}</div> : lineas.map((l, i) => (
        <div key={l.id ?? i} className={`linea-log ${l.nivel === 'error' ? 'error' : l.nivel === 'aviso' ? 'aviso-log' : ''}`}>
          <span className="hora">{horaLocal(l.ts)}</span>
          <span>{resaltar(l.texto, busqueda)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Logs() {
  const [lineas, setLineas] = useState([]);
  const [nivel, setNivel] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [enVivo, setEnVivo] = useState(true);
  const [ocultarHttp, setOcultarHttp] = useState(true);
  const [error, setError] = useState(null);
  const [alFinal, setAlFinal] = useState(true);
  const ultimoId = useRef(0);
  const ref = useRef(null);

  const traer = useCallback(async () => {
    try {
      const r = await api.get('/admin/logs', { params: { despues_de: ultimoId.current, limite: 2000 } });
      const nuevas = r.data.registros;
      if (nuevas.length) {
        ultimoId.current = nuevas[nuevas.length - 1].id;
        setLineas(prev => [...prev, ...nuevas].slice(-MAX_LINEAS));
      }
      setError(null);
    } catch (e) {
      setError(mensajeError(e));
    }
  }, []);

  useEffect(() => { traer(); }, [traer]);
  useEffect(() => {
    if (!enVivo) return undefined;
    const t = setInterval(traer, 4000);
    return () => clearInterval(t);
  }, [enVivo, traer]);

  const visibles = useMemo(() => {
    const t = busqueda.toLowerCase();
    return lineas.filter(l => !(ocultarHttp && esPeticionNormal(l))
      && (nivel === 'todos' || (nivel === 'aviso' ? l.nivel !== 'info' : l.nivel === 'error'))
      && (!t || l.texto.toLowerCase().includes(t)));
  }, [lineas, nivel, busqueda, ocultarHttp]);

  // Mantener la vista al final mientras llegan líneas, salvo que el usuario haya subido
  useEffect(() => {
    if (alFinal && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [visibles, alFinal]);

  const alDesplazar = () => {
    const el = ref.current;
    if (el) setAlFinal(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  const descargar = () => {
    const texto = visibles.map(l => `${l.ts}\t${l.nivel.toUpperCase()}\t${l.texto}`).join('\n');
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `logs-anm-${new Date().toISOString().slice(0, 10)}.txt` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const cuentaErrores = lineas.filter(l => l.nivel === 'error').length;

  return (
    <>
      <p className="secundario-texto" style={{ marginBottom: 14, maxWidth: '75ch' }}>
        Todo lo que imprime la aplicación: barridos, envíos de correo, inicios de sesión y errores. Se guarda en el Volume, así que
        se conserva entre reinicios y deploys (últimas {MAX_LINEAS.toLocaleString('es-CO')} líneas en pantalla).
      </p>
      <div className="consola-barra">
        <div className="segmentado" role="group" aria-label="Nivel">
          <button aria-pressed={nivel === 'todos'} onClick={() => setNivel('todos')}>Todo</button>
          <button aria-pressed={nivel === 'aviso'} onClick={() => setNivel('aviso')}>Avisos y errores</button>
          <button aria-pressed={nivel === 'error'} onClick={() => setNivel('error')}>Solo errores {cuentaErrores > 0 && <span className="num">({cuentaErrores})</span>}</button>
        </div>
        <div className="buscador">
          <Search size={16} />
          <input className="campo" type="search" placeholder="Buscar en los logs" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar en los logs" />
        </div>
        <label className="interruptor pequeno">
          <input type="checkbox" checked={ocultarHttp} onChange={(e) => setOcultarHttp(e.target.checked)} /> Ocultar peticiones del panel
        </label>
        <span className="separador" style={{ flex: 1 }} />
        <button className="boton secundario pequeno" onClick={() => setEnVivo(v => !v)} aria-pressed={enVivo}>
          {enVivo ? <><Pause size={15} /> Pausar</> : <><Play size={15} /> En vivo</>}
        </button>
        {!alFinal && (
          <button className="boton secundario pequeno" onClick={() => { setAlFinal(true); }}><ArrowDownToLine size={15} /> Ir al final</button>
        )}
        <button className="boton secundario pequeno" onClick={descargar}><Download size={15} /> Descargar</button>
      </div>
      {error && <div className="mensaje-error" style={{ marginBottom: 10 }}>{error}</div>}
      <ConsolaLogs lineas={visibles} busqueda={busqueda} contenedorRef={ref} onScroll={alDesplazar}
        vacio={busqueda || nivel !== 'todos' ? 'Ninguna línea coincide con el filtro.' : 'Aún no hay líneas registradas.'} />
      <p className="muy-pequeno tenue" style={{ marginTop: 8 }}>
        {enVivo ? 'Actualizando cada 4 segundos.' : 'En pausa.'} {visibles.length.toLocaleString('es-CO')} líneas visibles.
      </p>
    </>
  );
}
