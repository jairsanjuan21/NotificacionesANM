import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Ejecuta `accion` cada `ms` milisegundos mientras `ms` no sea null.
 * Siempre llama a la versión más reciente de `accion`, así el intervalo
 * no se reinicia cada vez que el componente vuelve a renderizar.
 */
export default function useIntervalo(accion, ms) {
  const ref = useRef(accion);
  useLayoutEffect(() => { ref.current = accion; });
  useEffect(() => {
    if (ms === null || ms === undefined) return undefined;
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [ms]);
}
