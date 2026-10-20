import { Loader2 } from 'lucide-react';

/**
 * Botón del sistema de diseño.
 *
 *   <Boton icono={Save} onClick={guardar} cargando={guardando}>Guardar notas</Boton>
 *   <Boton variante="secundario" tamano="pequeno">Cancelar</Boton>
 *   <Boton variante="peligro" icono={Trash2}>Eliminar</Boton>
 *
 * variante: primario (por defecto) · secundario · fantasma · peligro · peligro-suave · ia
 * Mientras `cargando` es verdadero el botón se deshabilita y el icono gira:
 * así nadie envía dos veces el mismo formulario.
 */
export default function Boton({
  variante = 'primario', tamano, icono: Icono, cargando = false,
  type = 'button', className = '', children, disabled, ...resto
}) {
  const clases = ['boton', variante !== 'primario' && variante, tamano, className].filter(Boolean).join(' ');
  const tamIcono = tamano === 'pequeno' ? 15 : 16;
  return (
    <button type={type} className={clases} disabled={disabled || cargando} aria-busy={cargando || undefined} {...resto}>
      {cargando ? <Loader2 size={tamIcono} className="girando" /> : Icono && <Icono size={tamIcono} />}
      {children}
    </button>
  );
}
