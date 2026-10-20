import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * useConsulta — carga datos asíncronos con estado de carga, error y recarga.
 *
 *   const { datos, error, cargando, recargar } = useConsulta(
 *     `logs-${deployId}`,                         // clave: si cambia, se vuelve a consultar
 *     () => api.get('/admin/logs').then(r => r.data),
 *     { activo: Boolean(deployId) },             // opcional: no consultar todavía
 *   );
 *
 * Por qué existe:
 *  - Reemplaza el patrón `useEffect(() => { cargar() }, [cargar])`, que llama
 *    setState de forma síncrona dentro del efecto (regla set-state-in-effect)
 *    y provoca renders en cascada.
 *  - Evita condiciones de carrera: si la clave cambia antes de que llegue la
 *    respuesta anterior, esa respuesta vieja se descarta.
 *  - Mantiene los datos previos mientras recarga (no "parpadea" la pantalla).
 *
 * Cómo funciona: cada consulta tiene un id = clave + versión. `cargando` no es
 * un estado guardado sino DERIVADO: es verdadero mientras el id del último
 * resultado recibido no coincide con el id actual.
 */
export default function useConsulta(clave, consultar, { activo = true } = {}) {
  // La función más reciente, sin obligar al componente a memorizarla con useCallback
  const consultarRef = useRef(consultar);
  useLayoutEffect(() => { consultarRef.current = consultar; });

  const [version, setVersion] = useState(0);
  const [resultado, setResultado] = useState({ id: null, datos: undefined, error: null });
  const pendientes = useRef([]); // promesas de recargar() esperando la respuesta

  const id = activo ? `${clave}#${version}` : null;

  useEffect(() => {
    if (!id) return undefined;
    let vigente = true;
    Promise.resolve()
      .then(() => consultarRef.current())
      .then(
        (datos) => { if (vigente) setResultado({ id, datos, error: null }); },
        (error) => { if (vigente) setResultado(r => ({ id, datos: r.datos, error })); },
      )
      .finally(() => { if (vigente) pendientes.current.splice(0).forEach(fin => fin()); });
    return () => { vigente = false; };
  }, [id]);

  /** Vuelve a consultar. Devuelve una promesa que se resuelve al llegar los datos. */
  const recargar = useCallback(() => new Promise((fin) => {
    pendientes.current.push(fin);
    setVersion(v => v + 1);
  }), []);

  /** Modifica los datos en memoria sin volver al servidor (actualización optimista). */
  const fijarDatos = useCallback((cambio) => {
    setResultado(r => ({ ...r, datos: typeof cambio === 'function' ? cambio(r.datos) : cambio }));
  }, []);

  return {
    datos: resultado.datos,
    error: resultado.error,
    cargando: Boolean(id) && resultado.id !== id,
    recargar,
    fijarDatos,
  };
}
