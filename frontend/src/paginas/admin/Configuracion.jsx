import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import api, { mensajeError } from '../../servicios/api';
import useConsulta from '../../hooks/useConsulta';
import Cargando from '../../componentes/ui/Cargando';
import EstadoVacio from '../../componentes/ui/EstadoVacio';

function Fila({ estado, titulo, children }) {
  const Icono = estado === 'ok' ? CheckCircle2 : estado === 'mal' ? XCircle : CircleDashed;
  const clase = estado === 'ok' ? 'marca-ok' : estado === 'mal' ? 'marca-mal' : 'marca-no';
  return (
    <div className="verificacion">
      <Icono size={18} className={clase} aria-label={estado === 'ok' ? 'Configurado' : estado === 'mal' ? 'Falta' : 'Opcional, sin configurar'} />
      <div><strong>{titulo}</strong><span>{children}</span></div>
    </div>
  );
}

export default function Configuracion() {
  const { datos, error: fallo } = useConsulta('configuracion', () =>
    Promise.all([api.get('/correo/diagnostico'), api.get('/admin/railway/estado')])
      .then(([a, b]) => ({ diag: a.data, railway: b.data })));
  const { diag, railway } = datos || {};
  const error = fallo && mensajeError(fallo);

  if (error) return <EstadoVacio tono="error" titulo="No se pudo leer la configuración">{error}</EstadoVacio>;
  if (!diag) return <Cargando>Leyendo configuración…</Cargando>;

  const correoOk = diag.modo_envio === 'brevo_api' && diag.EMAIL_SENDER && diag.EMAIL_RECEIVER;
  const volumen = !diag.base_de_datos?.startsWith('repositorio');

  return (
    <div className="rejilla-admin">
      <section className="tarjeta">
        <h2>Variables del servidor</h2>
        <p className="subtitulo">Se configuran en Railway, en la pestaña Variables del servicio. Los valores nunca se muestran aquí.</p>
        <Fila estado={correoOk ? 'ok' : 'mal'} titulo="Envío de correos">
          {correoOk ? 'Brevo configurado con remitente y destinatarios.' : <>Requiere <code>BREVO_API_KEY</code>, <code>EMAIL_SENDER</code> y <code>EMAIL_RECEIVER</code>. Modo actual: {diag.modo_envio}.</>}
        </Fila>
        <Fila estado={volumen ? 'ok' : 'mal'} titulo="Base de datos persistente">
          {volumen ? `Guardada en ${diag.base_de_datos}.` : <>Monte un Volume en <code>/data</code> y defina <code>DB_PATH=/data/anm_notificaciones.db</code>.</>}
        </Fila>
        <Fila estado={diag.usuario_panel ? 'ok' : 'no'} titulo="Usuario del panel">
          {diag.usuario_panel ? 'Hay un usuario sin acceso al monitoreo para el día a día.' : <>Defina <code>PANEL_USER</code> y <code>PANEL_PASSWORD</code> para dar acceso sin mostrar el monitoreo.</>}
        </Fila>
        <Fila estado={diag.resumen_ia_gemini ? 'ok' : 'no'} titulo="Resúmenes con IA">
          {diag.resumen_ia_gemini ? 'Gemini activo (capa gratuita).' : <>Opcional: <code>GEMINI_API_KEY</code> de Google AI Studio.</>}
        </Fila>
        <Fila estado={diag.telegram_canales?.cliente ? 'ok' : 'no'} titulo="Telegram: bot del cliente">
          {diag.telegram_canales?.cliente ? 'Configurado.' : <>Opcional: <code>TG_CLIENTE_TOKEN</code> y <code>TG_CLIENTE_CHATS</code>.</>}
        </Fila>
        <Fila estado={diag.telegram_canales?.admin ? 'ok' : 'no'} titulo="Telegram: bot del administrador">
          {diag.telegram_canales?.admin ? 'Configurado.' : <>Opcional: <code>TG_ADMIN_TOKEN</code> y <code>TG_ADMIN_CHAT</code>.</>}
        </Fila>
        <Fila estado={railway?.token_configurado ? 'ok' : 'no'} titulo="Logs de Railway">
          {railway?.token_configurado ? 'Token configurado.' : <>Opcional: <code>RAILWAY_API_TOKEN</code> (token de proyecto).</>}
        </Fila>
      </section>

      <section className="tarjeta">
        <h2>Entorno</h2>
        <p className="subtitulo">Datos que Railway entrega al servidor.</p>
        <ul className="lista-simple">
          <li><span>Corre en Railway</span><strong>{railway?.en_railway ? 'Sí' : 'No'}</strong></li>
          <li><span>Entorno</span><strong>{railway?.entorno || '—'}</strong></li>
          <li><span>Servicio</span><strong>{railway?.servicio || '—'}</strong></li>
          <li><span>Notificaciones pendientes de envío</span><strong className="num">{diag.notificaciones_pendientes}</strong></li>
        </ul>
      </section>
    </div>
  );
}
