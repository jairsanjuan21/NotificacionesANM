import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Ventana modal accesible: cierra con Esc o clic en el velo, enfoca el
 * primer campo al abrir y devuelve el foco al elemento anterior al cerrar.
 */
export default function Modal({ titulo, children, pie, onCerrar, ancho }) {
  const ref = useRef(null);
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') onCerrar?.(); };
    document.addEventListener('keydown', tecla);
    const anterior = document.activeElement;
    ref.current?.querySelector('input, textarea, select, button[autofocus]')?.focus();
    return () => { document.removeEventListener('keydown', tecla); anterior?.focus?.(); };
  }, [onCerrar]);

  return createPortal(
    <div className="modal-velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar?.(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} ref={ref} style={ancho ? { width: `min(${ancho}px, 100%)` } : undefined}>
        <div className="modal-cabecera">
          <h2>{titulo}</h2>
          <button className="boton-icono" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal-cuerpo">{children}</div>
        {pie && <div className="modal-pie">{pie}</div>}
      </div>
    </div>,
    document.body,
  );
}
