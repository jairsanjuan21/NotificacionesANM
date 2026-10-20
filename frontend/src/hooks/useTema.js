import { useSyncExternalStore } from 'react';

export const TEMAS = ['sistema', 'claro', 'oscuro'];
const ATRIBUTO = { claro: 'light', oscuro: 'dark' };
const CLAVE = 'tema';

/*
 * El tema vive FUERA de React, en un pequeño "almacén" de módulo:
 * localStorage + el atributo data-theme de <html> + una lista de oyentes.
 * Así todos los selectores de tema de la app (barra lateral, guía de estilos)
 * comparten el mismo valor sin necesidad de un Context.
 * El script en index.html aplica el tema guardado antes de que React cargue,
 * para que la página no "parpadee" en el modo equivocado.
 */
const oyentes = new Set();

function leer() {
  try { return localStorage.getItem(CLAVE) || 'sistema'; } catch { return 'sistema'; }
}

function aplicar(tema) {
  const raiz = document.documentElement;
  if (ATRIBUTO[tema]) raiz.dataset.theme = ATRIBUTO[tema];
  else delete raiz.dataset.theme;
}

export function fijarTema(tema) {
  try { localStorage.setItem(CLAVE, tema); } catch { /* solo en esta visita */ }
  aplicar(tema);
  oyentes.forEach(avisar => avisar());
}

function suscribir(avisar) {
  oyentes.add(avisar);
  return () => oyentes.delete(avisar);
}

/** Tema elegido: 'sistema' | 'claro' | 'oscuro', y la función para cambiarlo. */
export default function useTema() {
  return [useSyncExternalStore(suscribir, leer), fijarTema];
}
