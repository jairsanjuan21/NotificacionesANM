import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ContextoAvisos = createContext(null);
const ContextoConfirmar = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useAvisos = () => useContext(ContextoAvisos);
// eslint-disable-next-line react-refresh/only-export-components
export const useConfirmar = () => useContext(ContextoConfirmar);

let contador = 0;

export function ProveedorAvisos({ children }) {
  const [avisos, setAvisos] = useState([]);
  const [confirmacion, setConfirmacion] = useState(null);

  const quitar = useCallback((id) => setAvisos(a => a.filter(x => x.id !== id)), []);

  const avisar = useCallback((texto, tipo = 'exito', duracion = 4500) => {
    const id = ++contador;
    setAvisos(a => [...a.slice(-3), { id, texto, tipo }]);
    if (duracion) setTimeout(() => quitar(id), duracion);
    return id;
  }, [quitar]);

  const api = useMemo(() => ({
    exito: (t, d) => avisar(t, 'exito', d),
    error: (t, d = 8000) => avisar(t, 'error', d),
    info: (t, d) => avisar(t, 'info', d),
    quitar,
  }), [avisar, quitar]);

  const confirmar = useCallback((opciones) => new Promise((resolver) => {
    setConfirmacion({ ...opciones, resolver });
  }), []);

  const cerrarConfirmacion = (valor) => {
    confirmacion?.resolver(valor);
    setConfirmacion(null);
  };

  return (
    <ContextoAvisos.Provider value={api}>
      <ContextoConfirmar.Provider value={confirmar}>
        {children}
        {createPortal(
          <div className="avisos" role="status" aria-live="polite">
            {avisos.map(a => (
              <div key={a.id} className={`aviso ${a.tipo}`}>
                {a.tipo === 'error' ? <AlertCircle size={18} /> : a.tipo === 'info' ? <Info size={18} /> : <CheckCircle2 size={18} />}
                <span style={{ whiteSpace: 'pre-line' }}>{a.texto}</span>
                <button className="boton-icono" onClick={() => quitar(a.id)} aria-label="Cerrar aviso"><X size={15} /></button>
              </div>
            ))}
          </div>,
          document.body,
        )}
        {confirmacion && (
          <Modal titulo={confirmacion.titulo} onCerrar={() => cerrarConfirmacion(false)} pie={
            <>
              <button className="boton secundario" onClick={() => cerrarConfirmacion(false)}>Cancelar</button>
              <button className={`boton ${confirmacion.peligro ? 'peligro' : ''}`} onClick={() => cerrarConfirmacion(true)} autoFocus>
                {confirmacion.confirmar || 'Confirmar'}
              </button>
            </>
          }>
            <p>{confirmacion.mensaje}</p>
          </Modal>
        )}
      </ContextoConfirmar.Provider>
    </ContextoAvisos.Provider>
  );
}

export function Modal({ titulo, children, pie, onCerrar, ancho }) {
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
