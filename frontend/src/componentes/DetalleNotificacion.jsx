import { useEffect, useState } from 'react';
import { X, Sparkles, ExternalLink, FileText, Trash2, Save } from 'lucide-react';
import api, { API_BASE, mensajeError } from '../servicios/api';
import { useDatos } from '../contexto/datos';
import { useAvisos, useConfirmar } from '../contexto/avisos';
import Boton from './ui/Boton';
import { InsigniaUrgencia, InsigniaEstado, InsigniaCoactivo } from './Insignias';
import { ESTADOS, fechaLarga, fechaCorta, fechaHora, nivelPlazo, textoRestante, tituloActo, nombreDocumento, listaRegionales, etiquetaRegional } from '../utilidades';

/**
 * Panel con el detalle de una notificación.
 * Quien lo use debe pasarle key={notif.id_notificacion}: al cambiar de notificación
 * React crea un componente nuevo y el estado local (notas) se reinicia solo,
 * sin necesidad de un useEffect que lo sincronice.
 */
export default function Detalle({ notif, onCerrar }) {
  const { clientePorId, actualizarNotificacion, recargar } = useDatos();
  const avisos = useAvisos();
  const confirmar = useConfirmar();
  const cliente = clientePorId(notif.id_cliente) || {};
  const [notas, setNotas] = useState(notif.notas || '');
  const [guardando, setGuardando] = useState(null);

  useEffect(() => {
    const tecla = (e) => {
      if (e.key === 'Escape' && !document.querySelector('.modal-velo')) onCerrar();
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  const guardar = async (cambios, que) => {
    setGuardando(que);
    try {
      const r = await api.put(`/notificaciones/${notif.id_notificacion}`, cambios);
      actualizarNotificacion(r.data);
      if (que === 'notas') avisos.exito('Notas guardadas.');
      if (que === 'estado' && cambios.estado === 'respondida') avisos.exito('Marcada como respondida. Ya no se recordará su vencimiento.');
    } catch (e) {
      avisos.error(mensajeError(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(null);
    }
  };

  const resumir = async () => {
    setGuardando('ia');
    try {
      const r = await api.post(`/notificaciones/${notif.id_notificacion}/resumir`);
      actualizarNotificacion(r.data);
    } catch (e) {
      avisos.error(mensajeError(e, 'No se pudo generar el resumen.'));
    } finally {
      setGuardando(null);
    }
  };

  const quitar = async () => {
    const ok = await confirmar({
      titulo: 'Quitar esta notificación',
      mensaje: `Se eliminará "${tituloActo(notif)}" del historial de ${cliente.placa}. Si vuelve a aparecer en la ANM, el sistema la registrará otra vez.`,
      confirmar: 'Quitar notificación',
      peligro: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/notificaciones/${notif.id_notificacion}`);
      avisos.exito('Notificación quitada.');
      onCerrar();
      recargar();
    } catch (e) {
      avisos.error(mensajeError(e));
    }
  };

  const nivel = nivelPlazo(notif) || 'normal';
  const urlCopia = `${API_BASE}/notificaciones/${notif.id_notificacion}/pdf`;
  const notasCambiaron = (notas || '') !== (notif.notas || '');

  return (
    <article className="panel-detalle" aria-label={`Notificación de ${cliente.placa}`}>
      <header className="detalle-cabecera">
        <div className="encoger">
          <div className="placa">{cliente.placa || '—'}</div>
          <div className="titular">{cliente.nombre_empresa}</div>
          <div className="detalle-insignias">
            <InsigniaUrgencia notif={notif} />
            <InsigniaEstado estado={notif.estado} />
            {notif.fuente === 'coactivo' && <InsigniaCoactivo />}
          </div>
        </div>
        <button className="boton-icono cerrar" onClick={onCerrar} aria-label="Cerrar detalle" title="Cerrar (Esc)"><X size={20} /></button>
      </header>

      <div className="detalle-cuerpo">
        <section className="bloque">
          <h2 className="titulo-acto">{tituloActo(notif)}</h2>
          {notif.resumen ? (
            <div className="resumen-ia">
              <div className="origen"><Sparkles size={13} /> Resumen generado con IA</div>
              {notif.resumen}
            </div>
          ) : notif.motivo_urgencia ? (
            <p className="motivo">El sistema encontró en el documento: {notif.motivo_urgencia}.</p>
          ) : (
            <p className="motivo">Aún no se ha leído el contenido de este documento.</p>
          )}
          <div className="separado-arriba">
            <Boton variante="ia" tamano="pequeno" icono={Sparkles} cargando={guardando === 'ia'} onClick={resumir}>
              {guardando === 'ia' ? 'Leyendo el acto, puede tardar un minuto…' : notif.resumen ? 'Generar otro resumen' : 'Resumir con IA'}
            </Boton>
          </div>
        </section>

        <section className="bloque">
          <h3>Plazo</h3>
          {notif.fecha_limite ? (
            <>
              <div className={`plazo-grande ${nivel}`}>
                <span className="fecha">{fechaLarga(notif.fecha_limite)}</span>
                <span className="restante">{textoRestante(notif)}</span>
              </div>
              <ol className="linea-tiempo">
                <li><span>Publicado</span><strong>{fechaCorta(notif.fecha_aviso)}</strong></li>
                <li><span>Notificado</span><strong>{fechaCorta(notif.fecha_surtida)}</strong></li>
                <li><span>Fecha límite</span><strong>{fechaCorta(notif.fecha_limite)}</strong></li>
              </ol>
              {notif.base_plazo && <p className="base-calculo">Cálculo: {notif.base_plazo}.</p>}
            </>
          ) : (
            <p className="motivo">
              {notif.procesada ? 'Este tipo de notificación no tiene un plazo calculado.' : 'El plazo se calculará cuando el sistema procese el documento.'}
              {' '}Publicado el {fechaCorta(notif.fecha_aviso)}.
            </p>
          )}
        </section>

        <section className="bloque">
          <h3>Gestión</h3>
          <div className="segmentado" role="group" aria-label="Estado de la gestión">
            {ESTADOS.map(e => (
              <button key={e.id} aria-pressed={(notif.estado || 'nueva') === e.id}
                onClick={() => guardar({ estado: e.id }, 'estado')} disabled={guardando === 'estado'}>
                {e.etiqueta}
              </button>
            ))}
          </div>
          <div className="grupo-campo separado-arriba">
            <label className="etiqueta" htmlFor={`notas-${notif.id_notificacion}`}>Notas</label>
            <textarea id={`notas-${notif.id_notificacion}`} className="campo" rows={3} value={notas}
              placeholder="Ej.: Radicado el PTO el 20 de octubre, radicado No. 2026-123."
              onChange={(e) => setNotas(e.target.value)} />
            {notasCambiaron && (
              <div className="hilera separado-arriba">
                <Boton tamano="pequeno" icono={Save} cargando={guardando === 'notas'} onClick={() => guardar({ notas }, 'notas')}>Guardar notas</Boton>
                <Boton variante="fantasma" tamano="pequeno" onClick={() => setNotas(notif.notas || '')}>Descartar</Boton>
              </div>
            )}
          </div>
        </section>

        <section className="bloque">
          <h3>Documento</h3>
          <div className="acciones-documento">
            <a className="boton secundario pequeno" href={notif.url_pdf} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} /> Abrir en la ANM
            </a>
            {notif.tiene_archivo && (
              <a className="boton secundario pequeno" href={urlCopia} target="_blank" rel="noopener noreferrer">
                <FileText size={15} /> Abrir copia guardada
              </a>
            )}
          </div>
          {notif.tiene_archivo ? (
            <iframe className="visor-pdf" src={urlCopia} title={`Documento ${nombreDocumento(notif.url_pdf)}`} />
          ) : (
            <p className="motivo">Aún no hay copia guardada de este documento. Se archiva al procesarlo o al resumirlo con IA.</p>
          )}
        </section>

        <section className="bloque">
          <h3>Datos</h3>
          <dl className="datos">
            {notif.tipo_notificacion && <><dt>Tipo</dt><dd>{notif.tipo_notificacion}</dd></>}
            {notif.numero && <><dt>Número</dt><dd>{notif.numero}</dd></>}
            {notif.tipo_acto && <><dt>Acto</dt><dd>{notif.tipo_acto}</dd></>}
            <dt>Archivo</dt><dd>{nombreDocumento(notif.url_pdf)}</dd>
            <dt>Regional</dt><dd>{listaRegionales(cliente.regional).map(etiquetaRegional).join(', ') || '—'}</dd>
            <dt>Correo</dt><dd>{notif.notificacion_enviada ? 'Enviado' : 'Pendiente de envío'}</dd>
            <dt>Detectada</dt><dd>{fechaHora(notif.fecha_registro)}</dd>
          </dl>
          <Boton variante="peligro-suave" tamano="pequeno" icono={Trash2} onClick={quitar} className="separado-arriba">Quitar notificación</Boton>
        </section>
      </div>
    </article>
  );
}
