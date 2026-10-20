import { RefreshCw } from 'lucide-react';
import { useBarrido } from '../contexto/barrido';

/**
 * Lanza un barrido en el portal de la ANM: de todos los títulos o, con `idCliente`, de uno solo.
 *
 * El seguimiento (polling, avisos, recarga de datos) lo hace ProveedorBarrido;
 * este botón solo refleja el estado. Como el backend permite un barrido a la vez,
 * mientras corre cualquiera todos los botones quedan deshabilitados, pero solo
 * dice "Consultando…" el que corresponde a ese barrido.
 */
export default function BotonConsultar({ idCliente, placa, variante = '' }) {
  const { ejecucion, enCurso, iniciar } = useBarrido();
  const esEste = enCurso && (ejecucion.id_cliente == null || ejecucion.id_cliente === idCliente);
  const automatico = esEste && ejecucion.origen === 'automatico';

  let texto = placa ? 'Consultar ANM' : 'Consultar ANM ahora';
  if (esEste) texto = automatico ? 'Consulta automática en curso…' : 'Consultando…';

  return (
    <button
      type="button"
      className={`boton ${variante}`}
      onClick={() => iniciar(idCliente, placa)}
      disabled={enCurso}
      aria-busy={esEste || undefined}
      title={enCurso && !esEste ? 'Hay otra consulta a la ANM en curso' : undefined}
    >
      <RefreshCw size={16} className={esEste ? 'girando' : ''} />
      {texto}
    </button>
  );
}
