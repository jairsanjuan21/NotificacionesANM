import { createContext, useContext } from 'react';

export const ContextoBarrido = createContext(null);

/**
 * Estado del barrido a la ANM, compartido por toda la app:
 *   { ejecucion, enCurso, iniciar(idCliente, placa) }
 * `ejecucion` es la que corre ahora (manual o automática) o null.
 */
export const useBarrido = () => useContext(ContextoBarrido);
