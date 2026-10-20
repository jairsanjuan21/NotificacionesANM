import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Download, Pause, Play, ArrowDownToLine } from 'lucide-react';
import api, { mensajeError } from '../../servicios/api';
import ConsolaLogs from '../../componentes/ConsolaLogs';
import Boton from '../../componentes/ui/Boton';
import MensajeError from '../../componentes/ui/MensajeError';
import { esPeticionNormal } from '../../utilidades';

const MAX_LINEAS = 4000;

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
    <div className="pila">
      <p className="secundario-texto medida">
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
        <span className="estirar" />
        <Boton variante="secundario" tamano="pequeno" icono={enVivo ? Pause : Play} onClick={() => setEnVivo(v => !v)} aria-pressed={enVivo}>
          {enVivo ? 'Pausar' : 'En vivo'}
        </Boton>
        {!alFinal && <Boton variante="secundario" tamano="pequeno" icono={ArrowDownToLine} onClick={() => setAlFinal(true)}>Ir al final</Boton>}
        <Boton variante="secundario" tamano="pequeno" icono={Download} onClick={descargar}>Descargar</Boton>
      </div>
      <MensajeError>{error}</MensajeError>
      <ConsolaLogs lineas={visibles} busqueda={busqueda} contenedorRef={ref} onScroll={alDesplazar}
        vacio={busqueda || nivel !== 'todos' ? 'Ninguna línea coincide con el filtro.' : 'Aún no hay líneas registradas.'} />
      <p className="muy-pequeno tenue">
        {enVivo ? 'Actualizando cada 4 segundos.' : 'En pausa.'} {visibles.length.toLocaleString('es-CO')} líneas visibles.
      </p>
    </div>
  );
}
