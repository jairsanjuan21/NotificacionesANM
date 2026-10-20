import { useCallback, useState } from 'react';

function leer(clave, porDefecto) {
  try {
    const v = localStorage.getItem(clave);
    return v === null ? porDefecto : v;
  } catch {
    return porDefecto; // modo privado o almacenamiento bloqueado
  }
}

/**
 * Como useState, pero recordado en localStorage entre visitas.
 * Si el navegador bloquea el almacenamiento, sigue funcionando en memoria.
 */
export default function usePreferencia(clave, porDefecto) {
  const [valor, setValor] = useState(() => leer(clave, porDefecto));
  const fijar = useCallback((nuevo) => {
    setValor(nuevo);
    try { localStorage.setItem(clave, nuevo); } catch { /* solo en memoria */ }
  }, [clave]);
  return [valor, fijar];
}
