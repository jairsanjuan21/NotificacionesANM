import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Send, Mail, Globe, BellRing, Archive, Loader2, RefreshCw } from 'lucide-react';
import api, { mensajeError } from '../../api';
import { useAvisos } from '../../ui/Avisos';
import { useDatos } from '../../datos';
import Barras from './Barras';
import { bytesLegibles, haceCuanto, fechaHora } from '../../util';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function duracionLegible(seg) {
  if (seg === null || seg === undefined) return '—';
  return seg < 60 ? `${seg} s` : `${Math.floor(seg / 60)} min ${seg % 60} s`;
}

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

export default function Resumen() {
  const avisos = useAvisos();
  const { recargar } = useDatos();
  const [m, setM] = useState(null);
  const [diag, setDiag] = useState(null);
  const [agenda, setAgenda] = useState(null);
  const [historico, setHistorico] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const [a, b, c, d] = await Promise.all([
        api.get('/admin/metricas'), api.get('/correo/diagnostico'), api.get('/scheduler/estado'), api.get('/mantenimiento/procesar-historico'),
      ]);
      setM(a.data); setDiag(b.data); setAgenda(c.data); setHistorico(d.data); setError(null);
    } catch (e) {
      setError(mensajeError(e));
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!historico?.en_curso) return undefined;
    const t = setInterval(async () => {
      const h = await api.get('/mantenimiento/procesar-historico');
      setHistorico(h.data);
      if (!h.data.en_curso) { cargar(); recargar(); }
    }, 5000);
    return () => clearInterval(t);
  }, [historico?.en_curso, cargar, recargar]);

  const accion = async (id, metodo, url, exito) => {
    setOcupado(id);
    try {
      const r = await api.request({ method: metodo, url });
      avisos.exito(typeof exito === 'function' ? exito(r.data) : exito);
      cargar();
    } catch (e) {
      avisos.error(mensajeError(e));
    } finally {
      setOcupado(null);
    }
  };

  if (error) return <div className="vacio"><h3>No se pudo cargar el monitoreo</h3><p>{error}</p><button className="boton" onClick={cargar}>Intentar de nuevo</button></div>;
  if (!m) return <div className="cargando"><Loader2 size={18} className="girando" /> Cargando métricas…</div>;

  const problemas = diagnosticarProblemas(m, diag);
  const b = m.barridos;
  const serie = b.serie.map(d => ({ ...d, exitosos: d.barridos - d.fallidos }));
  const totalAlmacen = m.almacenamiento.base_datos_bytes + m.almacenamiento.pdfs_bytes + m.almacenamiento.logs_bytes;

  return (
    <>
      <section className={`estado-general ${problemas.length ? 'mal' : 'bien'}`}>
        <span className="icono-estado">{problemas.length ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}</span>
        <div>
          <h2>{problemas.length ? `${problemas.length === 1 ? 'Hay un punto' : `Hay ${problemas.length} puntos`} por revisar` : 'Todo funciona con normalidad'}</h2>
          {problemas.length ? (
            <ul>{problemas.map(p => <li key={p}>{p}</li>)}</ul>
          ) : (
            <p className="secundario-texto" style={{ marginTop: 4 }}>
              Último barrido correcto {haceCuanto(b.ultimo_exitoso)}. Servidor en línea desde: {fechaHora(m.proceso.en_linea_desde)}
            </p>
          )}
        </div>
        <button className="boton-icono" style={{ marginLeft: 'auto' }} onClick={cargar} title="Actualizar" aria-label="Actualizar"><RefreshCw size={17} /></button>
      </section>

      <div className="cifras">
        <div className="cifra-item"><div className="valor">{haceCuanto(b.ultimo)}</div><div className="nombre">Último barrido</div><div className="nota">{b.ultimo ? fechaHora(b.ultimo) : 'Sin registros'}</div></div>
        <div className="cifra-item"><div className="valor">{b.total ? `${Math.round((b.tasa_exito || 0) * 100)} %` : '—'}</div><div className="nombre">Barridos exitosos</div><div className="nota">{b.exitosos} de {b.total} en {m.periodo_dias} días</div></div>
        <div className="cifra-item"><div className="valor">{duracionLegible(b.duracion_media_seg)}</div><div className="nombre">Duración media</div><div className="nota">{b.consultas_error} consultas fallidas</div></div>
        <div className="cifra-item"><div className="valor">{b.nuevas}</div><div className="nombre">Notificaciones nuevas</div><div className="nota">en {m.periodo_dias} días</div></div>
        <div className="cifra-item"><div className="valor" style={{ color: m.notificaciones.pendientes_envio ? 'var(--oxido)' : undefined }}>{m.notificaciones.pendientes_envio}</div><div className="nombre">Pendientes de envío</div><div className="nota">{m.notificaciones.con_resumen_ia} con resumen IA</div></div>
        <div className="cifra-item"><div className="valor">{bytesLegibles(totalAlmacen)}</div><div className="nombre">Almacenamiento</div><div className="nota">{m.almacenamiento.pdfs_archivos} PDF archivados</div></div>
      </div>

      <div className="rejilla-admin">
        <div>
          <section className="tarjeta">
            <h2>Barridos por día</h2>
            <p className="subtitulo">Últimos {m.periodo_dias} días. Un barrido cuenta como fallido si no logró ninguna consulta a la ANM.</p>
            <Barras datos={serie} etiqueta="dia" alto={190}
              series={[{ clave: 'exitosos', nombre: 'Exitosos', clase: 'barra-principal' }, { clave: 'fallidos', nombre: 'Fallidos', clase: 'barra-alerta' }]}
              formatoEje={(d, largo) => { const [, mes, dia] = d.split('-'); return largo ? `${+dia} de ${MESES[+mes - 1]}` : `${+dia} ${MESES[+mes - 1]}`; }}
              descripcion="Barridos exitosos y fallidos por día" />
          </section>
          <section className="tarjeta">
            <h2>Notificaciones publicadas por mes</h2>
            <p className="subtitulo">Según la fecha de publicación en la ANM, últimos 12 meses.</p>
            <Barras datos={m.notificaciones.por_mes} etiqueta="mes" alto={170}
              series={[{ clave: 'cantidad', nombre: 'Notificaciones', clase: 'barra-principal' }]}
              formatoEje={(v, largo) => { const [a, mes] = v.split('-'); return largo ? `${MESES[+mes - 1]} ${a}` : MESES[+mes - 1]; }}
              descripcion="Notificaciones publicadas por mes" />
          </section>
        </div>

        <div>
          <section className="tarjeta">
            <h2>Acciones</h2>
            <p className="subtitulo">Herramientas de mantenimiento.</p>
            <div className="acciones-admin">
              <button className="boton secundario" disabled={!!ocupado} onClick={() => accion('enviar', 'post', '/notificaciones/enviar-pendientes', (d) => `${d.enviadas || 0} notificaciones enviadas.`)}>
                <Send size={16} /> {ocupado === 'enviar' ? 'Enviando…' : 'Reenviar notificaciones pendientes'}
              </button>
              <button className="boton secundario" disabled={!!ocupado} onClick={() => accion('prueba', 'post', '/alertas/prueba', (d) => `Correo: ${d.correo}. Telegram: ${d.telegram}.`)}>
                <Mail size={16} /> {ocupado === 'prueba' ? 'Enviando…' : 'Enviar correo de prueba'}
              </button>
              <button className="boton secundario" disabled={!!ocupado} onClick={() => accion('portal', 'get', '/salud/fuentes', (d) => {
                const okA = d.avisos?.filtro_placa_encontrado, okC = d.cobro_coactivo?.campo_palabra_clave;
                return `Avisos: ${okA ? 'estructura correcta' : 'revisar'}.\nCobro coactivo: ${okC ? 'estructura correcta' : 'revisar'}.`;
              })}>
                <Globe size={16} /> {ocupado === 'portal' ? 'Revisando…' : 'Verificar el portal de la ANM'}
              </button>
              <button className="boton secundario" disabled={!!ocupado} onClick={() => accion('record', 'post', '/recordatorios/ejecutar', (d) => `${d.recordatorios || 0} recordatorios enviados.`)}>
                <BellRing size={16} /> {ocupado === 'record' ? 'Revisando…' : 'Enviar recordatorios ahora'}
              </button>
              <button className="boton secundario" disabled={!!ocupado || historico?.en_curso || !historico?.sin_procesar}
                onClick={() => accion('hist', 'post', '/mantenimiento/procesar-historico', 'Procesamiento del histórico iniciado.')}>
                <Archive size={16} />
                {historico?.en_curso ? `Procesando histórico (${historico.sin_procesar} restantes)…`
                  : historico?.sin_procesar ? `Analizar y archivar ${historico.sin_procesar} notificaciones antiguas` : 'Histórico procesado'}
              </button>
            </div>
          </section>

          <section className="tarjeta">
            <h2>Tareas programadas</h2>
            <p className="subtitulo">Hora de Colombia. {agenda?.activo ? 'El programador está activo.' : 'El programador está detenido.'}</p>
            <ul className="lista-simple">
              {agenda?.tareas_programadas?.map(t => (
                <li key={t.id}><span>{t.descripcion}</span><span className="num tenue pequeno" style={{ whiteSpace: 'nowrap' }}>{t.proxima_ejecucion?.slice(5, 16)}</span></li>
              ))}
            </ul>
          </section>

          <section className="tarjeta">
            <h2>Datos</h2>
            <ul className="lista-simple">
              <li><span>Títulos vigilados</span><strong className="num">{m.clientes.activos} de {m.clientes.total}</strong></li>
              <li><span>Notificaciones en total</span><strong className="num">{m.notificaciones.total}</strong></li>
              <li><span>Sin procesar</span><strong className="num">{m.notificaciones.sin_procesar}</strong></li>
              <li><span>Con copia del PDF</span><strong className="num">{m.notificaciones.con_copia_pdf}</strong></li>
              <li><span>Base de datos</span><strong className="num">{bytesLegibles(m.almacenamiento.base_datos_bytes)}</strong></li>
              <li><span>PDF archivados</span><strong className="num">{bytesLegibles(m.almacenamiento.pdfs_bytes)}</strong></li>
              <li><span>Logs guardados</span><strong className="num">{bytesLegibles(m.almacenamiento.logs_bytes)}</strong></li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
