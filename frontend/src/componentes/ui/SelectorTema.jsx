import { Monitor, Moon, Sun } from 'lucide-react';
import useTema from '../../hooks/useTema';

const OPCIONES = [
  { id: 'claro', Icono: Sun, texto: 'Claro' },
  { id: 'oscuro', Icono: Moon, texto: 'Oscuro' },
  { id: 'sistema', Icono: Monitor, texto: 'Como el sistema' },
];

/** Interruptor de tres posiciones para el tema de color. */
export default function SelectorTema({ className = '' }) {
  const [tema, setTema] = useTema();
  return (
    <div className={`selector-tema ${className}`} role="radiogroup" aria-label="Tema de color">
      {OPCIONES.map(({ id, Icono, texto }) => (
        <button key={id} type="button" role="radio" aria-checked={tema === id} title={texto} aria-label={texto} onClick={() => setTema(id)}>
          <Icono size={15} />
        </button>
      ))}
    </div>
  );
}
