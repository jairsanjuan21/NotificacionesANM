import { useState } from 'react';
import { useBarrido } from '../contexto/barrido';
import { useDatos } from '../contexto/datos';
import useIntervalo from '../hooks/useIntervalo';
import { haceCuanto } from '../utilidades';

/** Aviso discreto en la barra lateral mientras se consulta la ANM, en cualquier página. */
export default function IndicadorBarrido() {
  const { ejecucion } = useBarrido();
  const { clientePorId } = useDatos();
  // Re-pintar cada 20 s para que "hace X min" avance aunque no cambie nada más
  const [, setPulso] = useState(0);
  useIntervalo(() => setPulso(p => p + 1), ejecucion ? 20000 : null);

  if (!ejecucion) return null;
  const placa = ejecucion.id_cliente != null ? clientePorId(ejecucion.id_cliente)?.placa : null;
  const que = placa ? `Consultando ${placa}` : ejecucion.origen === 'automatico' ? 'Consulta automática' : 'Consultando la ANM';

  return (
    <div className="indicador-barrido" role="status">
      <span className="pulso" aria-hidden="true" />
      <span>
        <strong>{que}</strong>
        <span className="cuando">empezó {haceCuanto(ejecucion.inicio)}</span>
      </span>
    </div>
  );
}
