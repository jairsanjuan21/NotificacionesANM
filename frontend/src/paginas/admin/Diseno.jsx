import { useState } from 'react';
import { Save, Trash2, Sparkles, RefreshCw, Search, Plus } from 'lucide-react';
import { useAvisos } from '../../contexto/avisos';
import Boton from '../../componentes/ui/Boton';
import Tarjeta from '../../componentes/ui/Tarjeta';
import Cargando from '../../componentes/ui/Cargando';
import EstadoVacio from '../../componentes/ui/EstadoVacio';
import MensajeError from '../../componentes/ui/MensajeError';
import SelectorTema from '../../componentes/ui/SelectorTema';
import { InsigniaUrgencia, InsigniaEstado, InsigniaCoactivo, Plazo } from '../../componentes/Insignias';

/*
 * Guía de diseño: muestra cada token y cada componente en vivo.
 * Sirve para revisar el sistema de un vistazo (en claro y en oscuro)
 * y como documentación: si algo no está aquí, no es parte del sistema.
 */

const MINERALES = [
  { token: '--verdin', nombre: 'Verdín de cobre', uso: 'Acciones, enlaces y selección' },
  { token: '--oxido', nombre: 'Óxido', uso: 'Urgente, vencido, error' },
  { token: '--ocre', nombre: 'Ocre', uso: 'Por vencer, advertencia' },
  { token: '--malaquita', nombre: 'Malaquita', uso: 'Respondida, todo en orden' },
  { token: '--cuarzo', nombre: 'Cuarzo', uso: 'Cobro coactivo, IA, revisar a mano' },
];
const ESTRATOS = ['--roca', '--superficie-hundida', '--superficie-2', '--superficie', '--linea', '--tinta-3', '--tinta-2', '--tinta', '--pizarra'];
const ESCALA = [
  ['--texto-4xl', 'Lema'], ['--texto-3xl', 'Título de página'], ['--texto-2xl', 'Cifras'], ['--texto-xl', 'Sección'],
  ['--texto-l', 'Subtítulo, placa en lista'], ['--texto-base', 'Lectura'], ['--texto-m', 'Controles y tablas'],
  ['--texto-s', 'Texto secundario'], ['--texto-xs', 'Metadatos'], ['--texto-mini', 'Contadores'],
];
const ESPACIOS = [1, 2, 3, 4, 5, 6, 8, 12];

// Notificaciones de ejemplo para las insignias de plazo
const EJEMPLOS_PLAZO = [
  { estado: 'nueva', dias_habiles_restantes: 1, fecha_limite: '2026-11-04' },
  { estado: 'nueva', dias_habiles_restantes: 6, fecha_limite: '2026-11-12' },
  { estado: 'nueva', dias_habiles_restantes: 14, fecha_limite: '2026-11-24' },
  { estado: 'nueva', dias_habiles_restantes: -2, fecha_limite: '2026-10-16' },
];

function Muestra({ token, nombre, uso }) {
  return (
    <div className="muestra" style={{ '--muestra': `var(${token})`, '--muestra-suave': `var(${token}-suave)` }}>
      <div className="muestra-color"><span /></div>
      <strong>{nombre}</strong>
      <code>{token}</code>
      <span className="muestra-uso">{uso}</span>
    </div>
  );
}

export default function Diseno() {
  const avisos = useAvisos();
  const [chip, setChip] = useState('atencion');
  const [vista, setVista] = useState('lista');

  return (
    <div className="guia">
      <section className="guia-intro">
        <p className="medida secundario-texto">
          Cada color, tamaño y componente del panel, en vivo. La paleta viene de la geología de una mina:
          la roca es el fondo, la pizarra enmarca y cada mineral tiene un solo significado.
        </p>
        <div className="hilera">
          <span className="pequeno tenue">Probar en</span>
          <SelectorTema className="sobre-superficie" />
        </div>
      </section>

      <Tarjeta titulo="Minerales" subtitulo="Un color, un significado. Nunca se usan como decoración.">
        <div className="muestras">{MINERALES.map(m => <Muestra key={m.token} {...m} />)}</div>
      </Tarjeta>

      <Tarjeta titulo="Estratos" subtitulo="De la roca al papel y de la tinta tenue a la fuerte: superficies y texto.">
        <div className="estratos">
          {ESTRATOS.map(t => <div key={t} style={{ '--muestra': `var(${t})` }}><code>{t}</code></div>)}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Tipografía" subtitulo="Archivo variable. Diez tamaños y tres anchos: el ancho también comunica.">
        <div className="anchos">
          <div><span className="ancho-muestra condensado">JB8-15091</span><code>--ancho-condensado</code><span>Placas y códigos</span></div>
          <div><span className="ancho-muestra">Auto 0699</span><code>normal</code><span>Lectura</span></div>
          <div><span className="ancho-muestra amplio">Bandeja</span><code>--ancho-amplio</code><span>Títulos de página</span></div>
        </div>
        <ul className="escala">
          {ESCALA.map(([t, uso]) => (
            <li key={t}><code>{t}</code><span style={{ fontSize: `var(${t})` }}>{uso}</span></li>
          ))}
        </ul>
      </Tarjeta>

      <Tarjeta titulo="Espaciado" subtitulo="Múltiplos de 4 px. Todo margen y relleno sale de esta escala.">
        <ul className="espacios">
          {ESPACIOS.map(n => <li key={n}><span style={{ width: `var(--espacio-${n})` }} /><code>--espacio-{n}</code></li>)}
        </ul>
      </Tarjeta>

      <Tarjeta titulo="Botones" subtitulo="Un botón principal por zona. Al cargar, el botón se bloquea solo.">
        <div className="pila">
          <div className="hilera">
            <Boton icono={Save}>Primario</Boton>
            <Boton variante="secundario" icono={Plus}>Secundario</Boton>
            <Boton variante="fantasma">Fantasma</Boton>
            <Boton variante="ia" icono={Sparkles}>Resumir con IA</Boton>
            <Boton variante="peligro" icono={Trash2}>Peligro</Boton>
            <Boton variante="peligro-suave" icono={Trash2}>Peligro suave</Boton>
          </div>
          <div className="hilera">
            <Boton tamano="pequeno">Pequeño</Boton>
            <Boton variante="secundario" tamano="pequeno" icono={RefreshCw}>Actualizar</Boton>
            <Boton cargando>Guardando…</Boton>
            <Boton variante="secundario" disabled>Deshabilitado</Boton>
          </div>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Insignias" subtitulo="Urgencia, estado de gestión y plazo de una notificación.">
        <div className="pila">
          <div className="hilera">
            {['alta', 'revisar', 'media', 'baja'].map(u => <InsigniaUrgencia key={u} notif={{ urgencia: u }} />)}
            <InsigniaCoactivo />
          </div>
          <div className="hilera">
            {['nueva', 'revisada', 'en_tramite', 'respondida'].map(e => <InsigniaEstado key={e} estado={e} />)}
          </div>
          <div className="hilera hueco-4">
            {EJEMPLOS_PLAZO.map(n => <Plazo key={n.fecha_limite} notif={n} />)}
          </div>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Controles">
        <div className="pila">
          <div className="hilera">
            <div className="buscador guia-campo"><Search size={16} /><input className="campo" placeholder="Buscar placa o titular" aria-label="Ejemplo de búsqueda" /></div>
            <select className="campo" aria-label="Ejemplo de lista"><option>Todas las regionales</option><option>Cúcuta</option></select>
          </div>
          <div className="chips">
            {[['atencion', 'Requieren atención', 10], ['nuevas', 'Nuevas', 4], ['todas', 'Todas', 18]].map(([id, t, n]) => (
              <button key={id} className="chip" aria-pressed={chip === id} onClick={() => setChip(id)}>{t} <span className="cuenta">{n}</span></button>
            ))}
          </div>
          <div className="segmentado" role="group" aria-label="Ejemplo de control segmentado">
            {['lista', 'calendario', 'mapa'].map(v => <button key={v} aria-pressed={vista === v} onClick={() => setVista(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}
          </div>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Retroalimentación" subtitulo="Cargar, vaciar, fallar y avisar: cada estado dice qué pasa y qué hacer.">
        <div className="guia-retro">
          <div className="guia-caja"><Cargando>Cargando notificaciones…</Cargando></div>
          <div className="guia-caja">
            <EstadoVacio compacto={false} titulo="No hay vencimientos pendientes">Cuando llegue una notificación con plazo, aparecerá aquí.</EstadoVacio>
          </div>
          <div className="guia-caja">
            <EstadoVacio tono="error" titulo="No se pudo conectar" accion={<Boton variante="secundario" tamano="pequeno" icono={RefreshCw}>Intentar de nuevo</Boton>}>
              El servidor no respondió.
            </EstadoVacio>
          </div>
        </div>
        <div className="pila separado-arriba">
          <MensajeError>La contraseña no coincide con el usuario.</MensajeError>
          <div className="hilera">
            <Boton variante="secundario" tamano="pequeno" onClick={() => avisos.exito('Notas guardadas.')}>Aviso de éxito</Boton>
            <Boton variante="secundario" tamano="pequeno" onClick={() => avisos.info('Consultando la ANM para JB8-15091…')}>Aviso informativo</Boton>
            <Boton variante="secundario" tamano="pequeno" onClick={() => avisos.error('No se pudo consultar la ANM.')}>Aviso de error</Boton>
          </div>
        </div>
      </Tarjeta>
    </div>
  );
}
