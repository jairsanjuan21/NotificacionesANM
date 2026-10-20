import { haceCuanto } from './fechas';

/**
 * Revisa las métricas del sistema y devuelve, en lenguaje claro,
 * la lista de problemas que el administrador debería atender.
 * Es una función pura: misma entrada → misma salida, fácil de probar.
 */
export function diagnosticarProblemas(m, diag) {
  const problemas = [];
  if (!m) return problemas;
  const b = m.barridos;
  if (!b.ultimo_exitoso) problemas.push('No hay ningún barrido exitoso registrado todavía.');
  else {
    const horas = (Date.now() - new Date(b.ultimo_exitoso).getTime()) / 36e5;
    if (horas > 72) problemas.push(`El último barrido correcto fue ${haceCuanto(b.ultimo_exitoso)}.`);
  }
  if (b.ultimo_estado === 'fallida') problemas.push('El último barrido falló. Revise la pestaña Barridos o los logs.');
  if (b.ultimo_estado === 'con_alertas') problemas.push('El último barrido terminó con alertas.');
  if (m.notificaciones.pendientes_envio > 0) problemas.push(`${m.notificaciones.pendientes_envio} notificaciones no se han podido enviar por correo.`);
  if (diag && diag.modo_envio === 'sin_configurar') problemas.push('El envío de correos no está configurado.');
  if (diag && diag.base_de_datos?.startsWith('repositorio')) problemas.push('La base de datos no está en un Volume: los cambios se pierden en cada deploy.');
  return problemas;
}
