import { createContext, useContext } from 'react';

/*
 * Los contextos y sus hooks viven en un archivo .js separado del proveedor (.jsx).
 * Así cada archivo de componentes exporta solo componentes y el Fast Refresh
 * de Vite puede recargar en caliente sin perder el estado (regla react-refresh).
 */
export const ContextoAvisos = createContext(null);
export const ContextoConfirmar = createContext(null);

/** Muestra avisos flotantes: `const avisos = useAvisos(); avisos.exito('Listo')`. */
export const useAvisos = () => useContext(ContextoAvisos);

/** Pide confirmación con un modal y devuelve una promesa<boolean>. */
export const useConfirmar = () => useContext(ContextoConfirmar);
