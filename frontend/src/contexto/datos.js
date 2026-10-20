import { createContext, useContext } from 'react';

export const ContextoDatos = createContext(null);

/** Fecha desde la que se muestran notificaciones si el usuario no eligió otra. */
export const FECHA_DESDE_POR_DEFECTO = '2025-06-01';

/**
 * Datos compartidos por toda la app: clientes (títulos), notificaciones,
 * filtro de fecha y estado del barrido manual.
 */
export const useDatos = () => useContext(ContextoDatos);
