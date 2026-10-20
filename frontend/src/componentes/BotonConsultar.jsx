import { RefreshCw } from 'lucide-react';
import api, { mensajeError } from '../servicios/api';
import { useDatos } from '../contexto/datos';
import { useAvisos } from '../contexto/avisos';

const INTERVALO_MS = 3000;
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Sigue un barrido hasta que termine. El backend lo ejecuta en segundo plano,
 * así que se consulta su estado cada pocos segundos (polling).
 */
async function seguirBarrido(idEjecucion) {
  for (;;) {
    const { data } = await api.get(`/scraper/ejecuciones/${idEjecucion}`);
    if (data.estado !== 'en_curso') return data;
    await esperar(INTERVALO_MS);
  }
}

/** Lanza un barrido manual en el portal de la ANM. */
export default function BotonConsultar({ idCliente, placa, variante = '' }) {
  const { recargar, barriendo, setBarriendo } = useDatos();
  const avisos = useAvisos();

  const consultar = async () => {
    setBarriendo(true);
    let espera = avisos.info(placa ? `Consultando la ANM para ${placa}…` : 'Consultando la ANM para todos los títulos. Puede tardar unos minutos.', 0);
    try {
      let idEjecucion;
      try {
        const r = await api.post('/scraper/ejecutar', null, { params: idCliente ? { id_cliente: idCliente } : {} });
        idEjecucion = r.data.id_ejecucion;
      } catch (e) {
        // Ya había un barrido corriendo (por ejemplo, el automático): seguir ese en vez de fallar
        if (e.response?.status !== 409 || !e.response.data?.id_ejecucion) throw e;
        idEjecucion = e.response.data.id_ejecucion;
        avisos.quitar(espera);
        espera = avisos.info('Ya había una consulta a la ANM en curso. Se mostrará su resultado al terminar.', 0);
      }

      const ejec = await seguirBarrido(idEjecucion);
      avisos.quitar(espera);
      const n = ejec.nuevas ?? 0;
      if (ejec.estado === 'fallida') {
        avisos.error('La consulta a la ANM falló. El administrador recibió el detalle.');
      } else {
        const texto = n === 0 ? 'Consulta terminada: no hay notificaciones nuevas.' : `Consulta terminada: ${n} notificación${n === 1 ? '' : 'es'} nueva${n === 1 ? '' : 's'}.`;
        if (ejec.estado === 'con_alertas') avisos.info(`${texto} Algunas consultas tuvieron problemas.`);
        else avisos.exito(texto);
      }
      await recargar();
    } catch (e) {
      avisos.quitar(espera);
      avisos.error(mensajeError(e, 'No se pudo consultar la ANM.'));
    } finally {
      setBarriendo(false);
    }
  };

  return (
    <button className={`boton ${variante}`} onClick={consultar} disabled={barriendo}>
      <RefreshCw size={16} className={barriendo ? 'girando' : ''} />
      {barriendo ? 'Consultando…' : placa ? 'Consultar ANM' : 'Consultar ANM ahora'}
    </button>
  );
}
