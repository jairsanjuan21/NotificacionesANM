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
    api.get('/correo/diagnostico').then(r => ({ diag: r.data })));
  const { diag } = datos || {};
  const error = fallo && mensajeError(fallo);

  if (error) return <EstadoVacio tono="error" titulo="No se pudo leer la configuración">{error}</EstadoVacio>;
  if (!diag) return <Cargando>Leyendo configuración…</Cargando>;

  const correoOk = diag.modo_envio !== 'sin_configurar' && diag.EMAIL_SENDER && diag.EMAIL_RECEIVER;
  const volumen = !diag.base_de_datos?.startsWith('repositorio');

  return (
    <div className="rejilla-admin">
      <section className="tarjeta">
        <h2>Variables del servidor</h2>
        <p className="subtitulo">Se configuran en el archivo .env del servidor. Los valores nunca se muestran aquí.</p>
        <Fila estado={correoOk ? 'ok' : 'mal'} titulo="Envío de correos">
          {correoOk
            ? (diag.modo_envio === 'gmail_smtp' ? `SMTP de Gmail (${diag.smtp_servidor}) con remitente y destinatarios.` : 'Brevo configurado con remitente y destinatarios.')
            : <>Requiere <code>EMAIL_SENDER</code>, <code>EMAIL_RECEIVER</code> y <code>EMAIL_PASSWORD</code> (contraseña de aplicación de Gmail). Modo actual: {diag.modo_envio}.</>}
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
      </section>

      <section className="tarjeta">
        <h2>Entorno</h2>
        <p className="subtitulo">Dónde está corriendo el sistema.</p>
        <ul className="lista-simple">
          <li><span>Plataforma</span><strong>Servidor propio (VPS, Docker + Caddy)</strong></li>
          <li><span>Notificaciones pendientes de envío</span><strong className="num">{diag.notificaciones_pendientes}</strong></li>
        </ul>
      </section>

      <section className="tarjeta">
        <h2>Respaldo</h2>
        <p className="subtitulo">Base de datos y PDF archivados en un solo archivo .tar.gz. Guárdelo fuera del servidor.</p>
        <a className="boton secundario" href="/api/admin/respaldo" download>Descargar respaldo</a>
      </section>
    </div>
  );
}
