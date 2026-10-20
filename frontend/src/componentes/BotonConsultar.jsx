import { RefreshCw } from 'lucide-react';
import api, { mensajeError } from '../servicios/api';
import { useDatos } from '../contexto/datos';
import { useAvisos } from '../contexto/avisos';

/** Lanza un barrido manual en el portal de la ANM. */
export default function BotonConsultar({ idCliente, placa, variante = '' }) {
  const { recargar, barriendo, setBarriendo } = useDatos();
  const avisos = useAvisos();

  const consultar = async () => {
    setBarriendo(true);
    const espera = avisos.info(placa ? `Consultando la ANM para ${placa}…` : 'Consultando la ANM para todos los títulos. Puede tardar unos minutos.', 0);
    try {
      const r = await api.post('/scraper/ejecutar', null, { params: idCliente ? { id_cliente: idCliente } : {} });
      const n = r.data.nuevas_notificaciones;
      avisos.quitar(espera);
      avisos.exito(n === 0 ? 'Consulta terminada: no hay notificaciones nuevas.' : `Consulta terminada: ${n} notificación${n === 1 ? '' : 'es'} nueva${n === 1 ? '' : 's'}.`);
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
