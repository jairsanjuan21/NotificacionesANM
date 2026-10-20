import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Send, Mail, Globe, BellRing, Archive, RefreshCw } from 'lucide-react';
import api, { mensajeError } from '../../servicios/api';
import { useAvisos } from '../../contexto/avisos';
import { useDatos } from '../../contexto/datos';
import Barras from './Barras';
import useConsulta from '../../hooks/useConsulta';
import Boton from '../../componentes/ui/Boton';
import Tarjeta from '../../componentes/ui/Tarjeta';
import Cargando from '../../componentes/ui/Cargando';
import EstadoVacio from '../../componentes/ui/EstadoVacio';
import useIntervalo from '../../hooks/useIntervalo';
import { bytesLegibles, diagnosticarProblemas, fechaHora, haceCuanto } from '../../utilidades';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function duracionLegible(seg) {
  if (seg === null || seg === undefined) return '—';
  return seg < 60 ? `${seg} s` : `${Math.floor(seg / 60)} min ${seg % 60} s`;
}

async function consultarResumen() {
  const [metricas, diag, agenda, historico] = await Promise.all([
    api.get('/admin/metricas'), api.get('/correo/diagnostico'),
    api.get('/scheduler/estado'), api.get('/mantenimiento/procesar-historico'),
  ]);
  return { m: metricas.data, diag: diag.data, agenda: agenda.data, historico: historico.data };
}

export default function Resumen() {
  const avisos = useAvisos();
  const { recargar: recargarDatos } = useDatos();
  const { datos, error, recargar: cargar, fijarDatos } = useConsulta('admin-resumen', consultarResumen);
  const { m, diag, agenda, historico } = datos || {};
  const [ocupado, setOcupado] = useState(null);

  // Mientras se procesa el histórico, consultar su avance cada 5 s
  useIntervalo(async () => {
    const h = await api.get('/mantenimiento/procesar-historico');
    fijarDatos(d => ({ ...d, historico: h.data }));
    if (!h.data.en_curso) { cargar(); recargarDatos(); }
  }, historico?.en_curso ? 5000 : null);

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

  if (error && !m) {
    return (
      <EstadoVacio tono="error" titulo="No se pudo cargar el monitoreo" accion={<Boton icono={RefreshCw} onClick={cargar}>Intentar de nuevo</Boton>}>
        {mensajeError(error)}
      </EstadoVacio>
    );
  }
  if (!m) return <Cargando>Cargando métricas…</Cargando>;

  const problemas = diagnosticarProblemas(m, diag);

  // Las acciones de mantenimiento son DATOS: agregar una nueva es agregar un objeto,
  // no copiar y pegar otro botón con su lógica.
  const acciones = [
    { id: 'enviar', icono: Send, metodo: 'post', url: '/notificaciones/enviar-pendientes', texto: 'Reenviar notificaciones pendientes', enCurso: 'Enviando…',
      exito: (d) => `${d.enviadas || 0} notificaciones enviadas.` },
    { id: 'prueba', icono: Mail, metodo: 'post', url: '/alertas/prueba', texto: 'Enviar correo de prueba', enCurso: 'Enviando…',
      exito: (d) => `Correo: ${d.correo}. Telegram: ${d.telegram}.` },
    { id: 'portal', icono: Globe, metodo: 'get', url: '/salud/fuentes', texto: 'Verificar el portal de la ANM', enCurso: 'Revisando…',
      exito: (d) => `Avisos: ${d.avisos?.filtro_placa_encontrado ? 'estructura correcta' : 'revisar'}.\nCobro coactivo: ${d.cobro_coactivo?.campo_palabra_clave ? 'estructura correcta' : 'revisar'}.` },
    { id: 'record', icono: BellRing, metodo: 'post', url: '/recordatorios/ejecutar', texto: 'Enviar recordatorios ahora', enCurso: 'Revisando…',
      exito: (d) => `${d.recordatorios || 0} recordatorios enviados.` },
    { id: 'hist', icono: Archive, metodo: 'post', url: '/mantenimiento/procesar-historico', exito: 'Procesamiento del histórico iniciado.',
      deshabilitada: historico?.en_curso || !historico?.sin_procesar, enCurso: 'Iniciando…',
      texto: historico?.en_curso ? `Procesando histórico (${historico.sin_procesar} restantes)…`
        : historico?.sin_procesar ? `Analizar y archivar ${historico.sin_procesar} notificaciones antiguas` : 'Histórico procesado' },
  ];
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
            <p className="secundario-texto">
              Último barrido correcto {haceCuanto(b.ultimo_exitoso)}. Servidor en línea desde: {fechaHora(m.proceso.en_linea_desde)}
            </p>
          )}
        </div>
        <button className="boton-icono empujar" onClick={cargar} title="Actualizar" aria-label="Actualizar"><RefreshCw size={17} /></button>
      </section>

      <div className="cifras">
        <div className="cifra-item"><div className="valor">{haceCuanto(b.ultimo)}</div><div className="nombre">Último barrido</div><div className="nota">{b.ultimo ? fechaHora(b.ultimo) : 'Sin registros'}</div></div>
        <div className="cifra-item"><div className="valor">{b.total ? `${Math.round((b.tasa_exito || 0) * 100)} %` : '—'}</div><div className="nombre">Barridos exitosos</div><div className="nota">{b.exitosos} de {b.total} en {m.periodo_dias} días</div></div>
        <div className="cifra-item"><div className="valor">{duracionLegible(b.duracion_media_seg)}</div><div className="nombre">Duración media</div><div className="nota">{b.consultas_error} consultas fallidas</div></div>
        <div className="cifra-item"><div className="valor">{b.nuevas}</div><div className="nombre">Notificaciones nuevas</div><div className="nota">en {m.periodo_dias} días</div></div>
        <div className="cifra-item"><div className={`valor ${m.notificaciones.pendientes_envio ? 'texto-peligro' : ''}`}>{m.notificaciones.pendientes_envio}</div><div className="nombre">Pendientes de envío</div><div className="nota">{m.notificaciones.con_resumen_ia} con resumen IA</div></div>
        <div className="cifra-item"><div className="valor">{bytesLegibles(totalAlmacen)}</div><div className="nombre">Almacenamiento</div><div className="nota">{m.almacenamiento.pdfs_archivos} PDF archivados</div></div>
      </div>

      <div className="rejilla-admin">
        <div>
          <Tarjeta titulo="Barridos por día" subtitulo={`Últimos ${m.periodo_dias} días. Un barrido cuenta como fallido si no logró ninguna consulta a la ANM.`}>
            <Barras datos={serie} etiqueta="dia" alto={190}
              series={[{ clave: 'exitosos', nombre: 'Exitosos', clase: 'barra-principal' }, { clave: 'fallidos', nombre: 'Fallidos', clase: 'barra-alerta' }]}
              formatoEje={(d, largo) => { const [, mes, dia] = d.split('-'); return largo ? `${+dia} de ${MESES[+mes - 1]}` : `${+dia} ${MESES[+mes - 1]}`; }}
              descripcion="Barridos exitosos y fallidos por día" />
          </Tarjeta>
          <Tarjeta titulo="Notificaciones publicadas por mes" subtitulo="Según la fecha de publicación en la ANM, últimos 12 meses.">
            <Barras datos={m.notificaciones.por_mes} etiqueta="mes" alto={170}
              series={[{ clave: 'cantidad', nombre: 'Notificaciones', clase: 'barra-principal' }]}
              formatoEje={(v, largo) => { const [a, mes] = v.split('-'); return largo ? `${MESES[+mes - 1]} ${a}` : MESES[+mes - 1]; }}
              descripcion="Notificaciones publicadas por mes" />
          </Tarjeta>
        </div>

        <div>
          <Tarjeta titulo="Acciones" subtitulo="Herramientas de mantenimiento.">
            <div className="acciones-admin">
              {acciones.map(x => (
                <Boton key={x.id} variante="secundario" icono={x.icono} cargando={ocupado === x.id}
                  disabled={!!ocupado || x.deshabilitada} onClick={() => accion(x.id, x.metodo, x.url, x.exito)}>
                  {ocupado === x.id ? x.enCurso : x.texto}
                </Boton>
              ))}
            </div>
          </Tarjeta>

          <Tarjeta titulo="Tareas programadas" subtitulo={`Hora de Colombia. ${agenda?.activo ? 'El programador está activo.' : 'El programador está detenido.'}`}>
            <ul className="lista-simple">
              {agenda?.tareas_programadas?.map(t => (
                <li key={t.id}><span>{t.descripcion}</span><span className="num tenue pequeno sin-salto">{t.proxima_ejecucion?.slice(5, 16)}</span></li>
              ))}
            </ul>
          </Tarjeta>

          <Tarjeta titulo="Datos">
            <ul className="lista-simple">
              <li><span>Títulos vigilados</span><strong className="num">{m.clientes.activos} de {m.clientes.total}</strong></li>
              <li><span>Notificaciones en total</span><strong className="num">{m.notificaciones.total}</strong></li>
              <li><span>Sin procesar</span><strong className="num">{m.notificaciones.sin_procesar}</strong></li>
              <li><span>Con copia del PDF</span><strong className="num">{m.notificaciones.con_copia_pdf}</strong></li>
              <li><span>Base de datos</span><strong className="num">{bytesLegibles(m.almacenamiento.base_datos_bytes)}</strong></li>
              <li><span>PDF archivados</span><strong className="num">{bytesLegibles(m.almacenamiento.pdfs_bytes)}</strong></li>
              <li><span>Logs guardados</span><strong className="num">{bytesLegibles(m.almacenamiento.logs_bytes)}</strong></li>
            </ul>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
