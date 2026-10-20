/**
 * Punto de entrada único de las utilidades.
 * Permite `import { fechaCorta, prioridad } from '../utilidades'`
 * sin que cada página sepa en qué archivo vive cada función.
 */
export * from './fechas';
export * from './formato';
export * from './dominio';
export * from './logs';
export * from './diagnostico';
export * from './topografia';
