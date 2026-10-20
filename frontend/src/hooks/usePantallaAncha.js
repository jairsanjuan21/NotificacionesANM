import { useSyncExternalStore } from 'react';

/**
 * ¿La ventana mide al menos `minimo` px de ancho?
 *
 * Usa useSyncExternalStore, el hook pensado para suscribirse a fuentes
 * externas a React (aquí, matchMedia del navegador). Así no hace falta
 * copiar el valor a un useState dentro de un useEffect.
 */
export default function usePantallaAncha(minimo = 1181) {
  const consulta = `(min-width: ${minimo}px)`;
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia(consulta);
      mq.addEventListener('change', avisar);
      return () => mq.removeEventListener('change', avisar);
    },
    () => window.matchMedia(consulta).matches,
  );
}
