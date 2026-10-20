import { useState } from 'react';
import { LogIn } from 'lucide-react';
import api, { mensajeError } from '../servicios/api';
import Contornos from '../componentes/ui/Contornos';

export default function Login({ onEntrar }) {
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const r = await api.post('/auth/login', { usuario, clave });
      onEntrar(r.data);
    } catch (err) {
      setError(mensajeError(err, 'No se pudo iniciar sesión.'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="pantalla-login">
      <div className="login-paisaje">
        <Contornos className="contornos" semilla="login" />
        <div className="lema">
          <h1>Notificaciones de la ANM, al día</h1>
          <p>Avisos, estados y cobros coactivos de sus títulos mineros, con sus plazos y su gestión en un solo lugar.</p>
        </div>
      </div>
      <div className="login-formulario">
        <form onSubmit={entrar}>
          <div>
            <h2>Iniciar sesión</h2>
            <p className="secundario-texto">Use el usuario y la contraseña que le entregaron.</p>
          </div>
          {error && <div className="mensaje-error" role="alert">{error}</div>}
          <div className="grupo-campo">
            <label className="etiqueta" htmlFor="usuario">Usuario</label>
            <input id="usuario" className="campo" autoComplete="username" value={usuario}
              onChange={(e) => setUsuario(e.target.value)} required autoFocus />
          </div>
          <div className="grupo-campo">
            <label className="etiqueta" htmlFor="clave">Contraseña</label>
            <input id="clave" type="password" className="campo" autoComplete="current-password" value={clave}
              onChange={(e) => setClave(e.target.value)} required />
          </div>
          <button className="boton" type="submit" disabled={enviando}>
            <LogIn size={17} /> {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
