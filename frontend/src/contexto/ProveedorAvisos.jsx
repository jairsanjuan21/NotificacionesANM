import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

import Modal from '../componentes/ui/Modal';
import { ContextoAvisos, ContextoConfirmar } from './avisos';

let contador = 0;

/**
 * Provee dos servicios globales:
 *  - avisos (toasts): avisos.exito('…'), avisos.error('…'), avisos.info('…', 0)
 *  - confirmar: `if (await confirmar({ titulo, mensaje, peligro: true })) …`
 */
export default function ProveedorAvisos({ children }) {
  const [avisos, setAvisos] = useState([]);
  const [confirmacion, setConfirmacion] = useState(null);

  const quitar = useCallback((id) => setAvisos(a => a.filter(x => x.id !== id)), []);

  const avisar = useCallback((texto, tipo = 'exito', duracion = 4500) => {
    const id = ++contador;
    setAvisos(a => [...a.slice(-3), { id, texto, tipo }]);
    if (duracion) setTimeout(() => quitar(id), duracion);
    return id;
  }, [quitar]);

  const servicio = useMemo(() => ({
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
    <ContextoAvisos.Provider value={servicio}>
      <ContextoConfirmar.Provider value={confirmar}>
        {children}
        {createPortal(
          <div className="avisos" role="status" aria-live="polite">
            {avisos.map(a => (
              <div key={a.id} className={`aviso ${a.tipo}`}>
                {a.tipo === 'error' ? <AlertCircle size={18} /> : a.tipo === 'info' ? <Info size={18} /> : <CheckCircle2 size={18} />}
                <span className="aviso-texto">{a.texto}</span>
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
