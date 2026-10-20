import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api, { mensajeError } from '../servicios/api';
import useIntervalo from '../hooks/useIntervalo';
import { useAvisos } from './avisos';
import { useDatos } from './datos';
import { ContextoBarrido } from './barrido';

const SEGUIR_MS = 3000;    // mientras hay un barrido: consultar su avance
const VIGILAR_MS = 60000;  // en reposo: ¿empezó uno automático?

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Mensaje final según cómo terminó el barrido y quién lo lanzó. */
function avisarResultado(avisos, ejec, propio) {
  const nuevas = ejec.nuevas ?? 0;
  if (ejec.estado === 'fallida') {
    avisos.error(propio ? 'La consulta a la ANM falló. El administrador recibió el detalle.' : 'La consulta automática a la ANM falló.');
    return;
  }
  const quien = propio ? 'Consulta terminada' : 'Terminó la consulta automática';
  const texto = nuevas === 0
    ? `${quien}: no hay notificaciones nuevas.`
    : `${quien}: ${plural(nuevas, 'notificación nueva', 'notificaciones nuevas')}.`;
  if (ejec.estado === 'con_alertas') avisos.info(`${texto} Algunas consultas tuvieron problemas.`);
  else if (nuevas > 0 || propio) avisos.exito(texto);
}

/*
 * Una sola máquina de estados para el barrido, en vez de un bucle dentro de cada botón:
 *
 *   reposo ──(clic o barrido automático detectado)──▶ en curso ──(estado ≠ en_curso)──▶ reposo
 *
 * Ventajas frente a seguir el barrido dentro de BotonConsultar:
 *  - Si el botón desaparece (se cierra el cajón de un título), el seguimiento continúa.
 *  - Todos los botones y la barra lateral ven el mismo estado.
 *  - Detecta los barridos del programador (8:30 a. m. y 5:30 p. m.) aunque nadie haga clic.
 */
export default function ProveedorBarrido({ children }) {
  const avisos = useAvisos();
  const { recargar } = useDatos();
  const [ejecucion, setEjecucion] = useState(null);
  const propio = useRef(false);      // ¿lo lanzó esta pestaña?
  const avisoEspera = useRef(null);  // id del aviso "Consultando…" para quitarlo al final

  const quitarAvisoEspera = useCallback(() => {
    if (avisoEspera.current) avisos.quitar(avisoEspera.current);
    avisoEspera.current = null;
  }, [avisos]);

  const terminar = useCallback((ejec) => {
    quitarAvisoEspera();
    avisarResultado(avisos, ejec, propio.current);
    propio.current = false;
    setEjecucion(null);
    recargar();
  }, [avisos, quitarAvisoEspera, recargar]);

  // Al abrir la app: ¿hay un barrido corriendo (por ejemplo, el automático)?
  useEffect(() => {
    api.get('/scraper/estado').then(r => { if (r.data) setEjecucion(r.data); }).catch(() => {});
  }, []);

  useIntervalo(async () => {
    try {
      if (ejecucion) {
        const { data } = await api.get(`/scraper/ejecuciones/${ejecucion.id_ejecucion}`);
        if (data.estado !== 'en_curso') terminar(data);
      } else if (document.visibilityState === 'visible') {
        const { data } = await api.get('/scraper/estado');
        if (data) setEjecucion(data);
      }
    } catch (e) {
      // Un fallo de red puntual no detiene el seguimiento; un 404 sí (la ejecución ya no existe)
      if (ejecucion && e.response?.status === 404) { quitarAvisoEspera(); setEjecucion(null); }
    }
  }, ejecucion ? SEGUIR_MS : VIGILAR_MS);

  const iniciar = useCallback(async (idCliente, placa) => {
    avisoEspera.current = avisos.info(
      placa ? `Consultando la ANM para ${placa}…` : 'Consultando la ANM para todos los títulos. Puede tardar unos minutos.', 0);
    try {
      const r = await api.post('/scraper/ejecutar', null, { params: idCliente ? { id_cliente: idCliente } : {} });
      propio.current = true;
      setEjecucion({ id_ejecucion: r.data.id_ejecucion, estado: 'en_curso', origen: 'manual', id_cliente: idCliente ?? null, inicio: new Date().toISOString() });
    } catch (e) {
      quitarAvisoEspera();
      const enCurso = e.response?.status === 409 && e.response.data?.id_ejecucion;
      if (!enCurso) { avisos.error(mensajeError(e, 'No se pudo consultar la ANM.')); return; }
      // Ya había uno corriendo: seguir ese y avisar su resultado como propio
      propio.current = true;
      avisoEspera.current = avisos.info('Ya había una consulta a la ANM en curso. Se mostrará su resultado al terminar.', 0);
      const { data } = await api.get(`/scraper/ejecuciones/${e.response.data.id_ejecucion}`).catch(() => ({ data: null }));
      setEjecucion(data || { id_ejecucion: e.response.data.id_ejecucion, estado: 'en_curso' });
    }
  }, [avisos, quitarAvisoEspera]);

  const valor = useMemo(() => ({ ejecucion, enCurso: Boolean(ejecucion), iniciar }), [ejecucion, iniciar]);
  return <ContextoBarrido.Provider value={valor}>{children}</ContextoBarrido.Provider>;
}
