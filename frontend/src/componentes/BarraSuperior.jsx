/** Encabezado común de cada página. */
export default function BarraSuperior({ titulo, descripcion, children }) {
  return (
    <header className="barra-superior">
      <div className="titulo-pagina">
        <h1>{titulo}</h1>
        {descripcion && <p>{descripcion}</p>}
      </div>
      <div className="acciones">{children}</div>
    </header>
  );
}
