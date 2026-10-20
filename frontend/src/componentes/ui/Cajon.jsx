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
