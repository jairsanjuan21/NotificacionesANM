import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Panel lateral superpuesto (agenda, títulos y pantallas angostas). */
export default function Cajon({ children, onCerrar }) {
  return createPortal(
    <>
      <div className="velo" onClick={onCerrar} />
      <div className="cajon" role="dialog" aria-modal="true">{children}</div>
    </>,
    document.body,
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePantallaAncha(minimo = 1181) {
  const consulta = `(min-width: ${minimo}px)`;
  const [ancha, setAncha] = useState(() => window.matchMedia(consulta).matches);
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const cambio = () => setAncha(mq.matches);
    mq.addEventListener('change', cambio);
    return () => mq.removeEventListener('change', cambio);
  }, [consulta]);
  return ancha;
}
