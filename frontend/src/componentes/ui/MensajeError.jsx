import { AlertCircle } from 'lucide-react';

/** Aviso de error en línea, dentro de un formulario o panel. No se muestra si no hay mensaje. */
export default function MensajeError({ children }) {
  if (!children) return null;
  return (
    <div className="mensaje-error" role="alert">
      <AlertCircle size={16} />
      <span>{children}</span>
    </div>
  );
}
