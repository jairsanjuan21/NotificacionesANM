/**
 * Cliente HTTP único del frontend. Todas las peticiones pasan por aquí:
 * envía la cookie de sesión y detecta cuando expira (401).
 */
import axios from 'axios';

export const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api';

const api = axios.create({ baseURL: API_BASE, withCredentials: true });

// Si la sesión expira, avisar a la aplicación para que muestre el inicio de sesión
let alExpirar = null;
/** Registra qué hacer cuando la sesión expira. Devuelve la función para anular el registro. */
export const registrarAlExpirar = (fn) => {
  alExpirar = fn;
  return () => { if (alExpirar === fn) alExpirar = null; };
};

api.interceptors.response.use(
  (r) => r,
  (error) => {
    const url = error.config?.url || '';
    if (error.response?.status === 401 && !url.includes('/auth/')) alExpirar?.();
    return Promise.reject(error);
  },
);

export const mensajeError = (error, porDefecto = 'No se pudo completar la acción.') =>
  error?.response?.data?.detail || (error?.message === 'Network Error' ? 'Sin conexión con el servidor.' : error?.message) || porDefecto;

export default api;
