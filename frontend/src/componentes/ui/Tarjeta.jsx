/**
 * Panel con borde para agrupar contenido relacionado.
 *
 *   <Tarjeta titulo="Variables del servidor" subtitulo="Se configuran en Railway" acciones={<Boton …/>}>
 *     …
 *   </Tarjeta>
 *
 * `sinRelleno` quita el relleno interno para listas que llegan hasta el borde.
 */
export default function Tarjeta({ titulo, icono: Icono, subtitulo, acciones, sinRelleno, className = '', children, ...resto }) {
  return (
    <section className={`tarjeta ${sinRelleno ? 'sin-relleno' : ''} ${className}`} {...resto}>
      {(titulo || acciones) && (
        <header className="tarjeta-cabecera">
          <div className="encoger">
            {titulo && <h2>{Icono && <Icono size={18} />}{titulo}</h2>}
            {subtitulo && <p className="subtitulo">{subtitulo}</p>}
          </div>
          {acciones && <div className="hilera empujar">{acciones}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
