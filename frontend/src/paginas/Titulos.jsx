import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, Search, Pencil, Trash2, X, Download, FileSpreadsheet, Mail } from 'lucide-react';
import api, { API_BASE, mensajeError } from '../servicios/api';
import { useDatos } from '../contexto/datos';
import { useAvisos, useConfirmar } from '../contexto/avisos';
import Modal from '../componentes/ui/Modal';
import { InsigniaEstado } from '../componentes/Insignias';
import BarraSuperior from '../componentes/BarraSuperior';
import BotonConsultar from '../componentes/BotonConsultar';
import Cajon from '../componentes/ui/Cajon';
import Boton from '../componentes/ui/Boton';
import EstadoVacio from '../componentes/ui/EstadoVacio';
import { REGIONALES, etiquetaRegional, listaRegionales, respondida, tiempoDe, fechaCorta, tituloActo, textoRestante, nivelPlazo } from '../utilidades';

export default function Titulos() {
  const { clientes, notificaciones, recargar } = useDatos();
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState('pendientes');
  const [editando, setEditando] = useState(null); // null | {} (nuevo) | cliente
  const [importando, setImportando] = useState(false);
  const [abierto, setAbierto] = useState(null);

  const filas = useMemo(() => {
    const porCliente = new Map();
    notificaciones.forEach(n => {
      if (!porCliente.has(n.id_cliente)) porCliente.set(n.id_cliente, []);
      porCliente.get(n.id_cliente).push(n);
    });
    const t = busqueda.trim().toLowerCase();
    return clientes
      .filter(c => !t || [c.placa, c.nombre_empresa, c.nit, c.email, c.regional].some(x => (x || '').toLowerCase().includes(t)))
      .map(c => {
        const ns = porCliente.get(c.id_cliente) || [];
        const pendientes = ns.filter(n => !respondida(n));
        const proximo = pendientes.filter(n => n.fecha_limite && n.dias_habiles_restantes >= 0)
          .sort((a, b) => tiempoDe(a.fecha_limite) - tiempoDe(b.fecha_limite))[0];
        const ultima = ns.reduce((m, n) => Math.max(m, tiempoDe(n.fecha_aviso)), 0);
        return { c, ns, pendientes: pendientes.length, proximo, ultima };
      })
      .sort((a, b) => {
        if (orden === 'placa') return a.c.placa.localeCompare(b.c.placa);
        if (orden === 'reciente') return b.ultima - a.ultima;
        return (b.pendientes - a.pendientes) || ((a.proximo ? tiempoDe(a.proximo.fecha_limite) : Infinity) - (b.proximo ? tiempoDe(b.proximo.fecha_limite) : Infinity)) || a.c.placa.localeCompare(b.c.placa);
      });
  }, [clientes, notificaciones, busqueda, orden]);

  const filaAbierta = filas.find(f => f.c.id_cliente === abierto);

  return (
    <>
      <BarraSuperior titulo="Títulos mineros" descripcion={`${clientes.length} títulos vigilados en el portal de notificaciones de la ANM.`}>
        <button className="boton secundario" onClick={() => setImportando(true)}><Upload size={16} /> Importar desde Excel</button>
        <button className="boton" onClick={() => setEditando({})}><Plus size={16} /> Agregar título</button>
      </BarraSuperior>

      <div className="herramientas">
        <div className="buscador">
          <Search size={16} />
          <input className="campo" type="search" placeholder="Buscar por placa, titular, NIT o correo" value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar títulos" />
        </div>
        <span className="separador" />
        <select className="campo" value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar títulos">
          <option value="pendientes">Con más pendientes primero</option>
          <option value="reciente">Con publicaciones más recientes</option>
          <option value="placa">Por placa (A–Z)</option>
        </select>
      </div>

      {filas.length === 0 ? (
        <EstadoVacio titulo={clientes.length ? 'Ningún título coincide con la búsqueda' : 'Aún no hay títulos registrados'}>
          {clientes.length ? 'Pruebe con otra placa o titular.' : 'Agregue el primer título minero o importe la lista desde Excel.'}
        </EstadoVacio>
      ) : (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>Placa</th>
                <th>Titular</th>
                <th>Regional</th>
                <th className="derecha">Sin responder</th>
                <th>Próximo vencimiento</th>
                <th>Última publicación</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ c, pendientes, proximo, ultima }) => (
                <tr key={c.id_cliente} className="clicable" onClick={() => setAbierto(c.id_cliente)}
                  tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setAbierto(c.id_cliente); }}>
                  <td><span className="placa">{c.placa}</span>{!c.activo && <span className="muy-pequeno tenue"> pausado</span>}</td>
                  <td>
                    {c.nombre_empresa}
                    {c.email && <div className="muy-pequeno tenue" title="Recibe copia de sus notificaciones"><Mail size={11} className="icono-en-linea" /> {c.email}</div>}
                  </td>
                  <td><span className="regionales">{listaRegionales(c.regional).map(r => <span key={r} className="regional">{etiquetaRegional(r)}</span>)}</span></td>
                  <td className={`derecha num ${pendientes ? 'texto-fuerte' : 'texto-apagado'}`}>{pendientes}</td>
                  <td>
                    {proximo ? (
                      <span className={`proximo-plazo texto-plazo-${nivelPlazo(proximo)}`}>
                        {fechaCorta(proximo.fecha_limite)} <span className="pequeno">({textoRestante(proximo).toLowerCase()})</span>
                      </span>
                    ) : <span className="tenue">—</span>}
                  </td>
                  <td className="num secundario-texto">{ultima ? fechaCorta(new Date(ultima).toISOString().slice(0, 10)) : <span className="tenue">Sin notificaciones</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filaAbierta && (
        <FichaTitulo fila={filaAbierta} onCerrar={() => setAbierto(null)} onEditar={() => setEditando(filaAbierta.c)} />
      )}
      {editando && <FormularioTitulo cliente={editando} onCerrar={() => setEditando(null)} onGuardado={recargar} onEliminado={() => { setAbierto(null); recargar(); }} />}
      {importando && <ImportarTitulos onCerrar={() => setImportando(false)} onImportado={recargar} />}
    </>
  );
}

function FichaTitulo({ fila, onCerrar, onEditar }) {
  const navegar = useNavigate();
  const { c, ns } = fila;
  const historial = [...ns].sort((a, b) => tiempoDe(b.fecha_aviso) - tiempoDe(a.fecha_aviso));
  return (
    <Cajon onCerrar={onCerrar}>
      <div className="panel-detalle">
        <header className="detalle-cabecera">
          <div className="encoger">
            <div className="placa">{c.placa}</div>
            <div className="titular">{c.nombre_empresa}</div>
            <div className="detalle-insignias">
              {listaRegionales(c.regional).map(r => <span key={r} className="regional">{etiquetaRegional(r)}</span>)}
            </div>
          </div>
          <button className="boton-icono cerrar" onClick={onCerrar} aria-label="Cerrar"><X size={20} /></button>
        </header>
        <div className="detalle-cuerpo">
          <section className="bloque hilera">
            <BotonConsultar idCliente={c.id_cliente} placa={c.placa} />
            <Boton variante="secundario" icono={Pencil} onClick={onEditar}>Editar datos</Boton>
          </section>
          <section className="bloque">
            <h3>Datos del título</h3>
            <dl className="datos">
              <dt>Titular</dt><dd>{c.nombre_empresa || '—'}</dd>
              <dt>NIT / C.C.</dt><dd>{c.nit || '—'}</dd>
              <dt>Correo del titular</dt><dd>{c.email || 'No recibe copia'}</dd>
              <dt>Vigilancia</dt><dd>{c.activo ? 'Activa' : 'Pausada'}</dd>
            </dl>
          </section>
          <section className="bloque">
            <h3>Historial ({historial.length})</h3>
            {historial.length === 0 ? (
              <p className="motivo">La ANM no ha publicado notificaciones para este título desde que se vigila.</p>
            ) : (
              <ul className="historial">
                {historial.map(n => (
                  <li key={n.id_notificacion}>
                    <button onClick={() => navegar(`/?filtro=todas&n=${n.id_notificacion}`)}>
                      <span className="num secundario-texto pequeno">{fechaCorta(n.fecha_aviso)}</span>
                      <span className="recortar">{tituloActo(n)}</span>
                      <InsigniaEstado estado={n.estado} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </Cajon>
  );
}

function FormularioTitulo({ cliente, onCerrar, onGuardado, onEliminado }) {
  const avisos = useAvisos();
  const confirmar = useConfirmar();
  const nuevo = !cliente.id_cliente;
  const [placa, setPlaca] = useState(cliente.placa || '');
  const [titular, setTitular] = useState(cliente.nombre_empresa || '');
  const [regionales, setRegionales] = useState(() => {
    const r = listaRegionales(cliente.regional).filter(x => x !== 'all');
    return r.length ? r : ['bucaramanga'];
  });
  const [email, setEmail] = useState(cliente.email || '');
  const [nit, setNit] = useState(cliente.nit || '');
  const [activo, setActivo] = useState(cliente.activo !== false);
  const [guardando, setGuardando] = useState(false);

  const alternar = (id) => setRegionales(r => (r.includes(id) ? (r.length > 1 ? r.filter(x => x !== id) : r) : [...r, id]));

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    const datos = { placa: placa.trim().toUpperCase(), nombre_empresa: titular.trim().toUpperCase() || 'SIN NOMBRE',
      regional: regionales.join(','), email: email.trim(), nit: nit.trim(), activo };
    try {
      if (nuevo) await api.post('/clientes', datos); else await api.put(`/clientes/${cliente.id_cliente}`, datos);
      avisos.exito(nuevo ? `Título ${datos.placa} agregado. Se consultará en el próximo barrido.` : `Título ${datos.placa} actualizado.`);
      onGuardado();
      onCerrar();
    } catch (err) {
      avisos.error(mensajeError(err, 'No se pudo guardar el título.'));
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    const ok = await confirmar({
      titulo: `Eliminar el título ${cliente.placa}`,
      mensaje: 'Se dejará de vigilar y se borrará todo su historial de notificaciones. Si solo quiere dejar de vigilarlo por un tiempo, desmarque "Vigilar este título".',
      confirmar: 'Eliminar título e historial',
      peligro: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/clientes/${cliente.id_cliente}`);
      avisos.exito(`Título ${cliente.placa} eliminado.`);
      onCerrar();
      onEliminado();
    } catch (err) {
      avisos.error(mensajeError(err));
    }
  };

  return (
    <Modal titulo={nuevo ? 'Agregar título minero' : `Editar ${cliente.placa}`} onCerrar={onCerrar} ancho={620} pie={
      <>
        {!nuevo && <Boton variante="peligro-suave" icono={Trash2} onClick={eliminar}>Eliminar</Boton>}
        <span className="estirar" />
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton type="submit" form="form-titulo" cargando={guardando}>{nuevo ? 'Agregar título' : 'Guardar cambios'}</Boton>
      </>
    }>
      <form onSubmit={guardar} id="form-titulo" className="pila hueco-4">
        <div className="rejilla-2">
          <div className="grupo-campo">
            <label className="etiqueta" htmlFor="f-placa">Placa</label>
            <input id="f-placa" className="campo placa campo-placa" value={placa} onChange={(e) => setPlaca(e.target.value)}
              placeholder="HAN-111" required />
          </div>
          <div className="grupo-campo">
            <label className="etiqueta" htmlFor="f-nit">NIT o C.C. del titular</label>
            <input id="f-nit" className="campo" value={nit} onChange={(e) => setNit(e.target.value)} placeholder="Opcional" />
            <span className="ayuda">Permite encontrar avisos de cobro coactivo por NIT.</span>
          </div>
        </div>
        <div className="grupo-campo">
          <label className="etiqueta" htmlFor="f-titular">Titular</label>
          <input id="f-titular" className="campo" value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Nombre de la persona o empresa" required />
        </div>
        <div className="grupo-campo">
          <span className="etiqueta" id="et-regionales">Punto de atención regional</span>
          <div className="chips" role="group" aria-labelledby="et-regionales">
            {REGIONALES.map(r => (
              <button type="button" key={r.id} className="chip" aria-pressed={regionales.includes(r.id)} onClick={() => alternar(r.id)}>{r.etiqueta}</button>
            ))}
          </div>
          <span className="ayuda">Marque más de una si el título se tramita en varias sedes.</span>
        </div>
        <div className="grupo-campo">
          <label className="etiqueta" htmlFor="f-email">Correo del titular</label>
          <input id="f-email" className="campo" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Opcional. Varios correos separados por coma" />
          <span className="ayuda">Si lo llena, el titular recibe una copia de sus notificaciones.</span>
        </div>
        <label className="interruptor">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Vigilar este título en los barridos
        </label>
      </form>
    </Modal>
  );
}

function ImportarTitulos({ onCerrar, onImportado }) {
  const avisos = useAvisos();
  const entrada = useRef(null);
  const [encima, setEncima] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState(null);

  const subir = async (archivo) => {
    if (!archivo) return;
    setSubiendo(true);
    try {
      const datos = new FormData();
      datos.append('archivo', archivo);
      const r = await api.post('/clientes/importar', datos);
      setResultado(r.data);
      onImportado();
    } catch (e) {
      avisos.error(mensajeError(e, 'No se pudo importar el archivo.'));
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <Modal titulo="Importar títulos desde Excel" onCerrar={onCerrar} pie={<Boton onClick={onCerrar}>{resultado ? 'Listo' : 'Cerrar'}</Boton>}>
      {resultado ? (
        <div>
          <p><strong>{resultado.creados}</strong> títulos nuevos y <strong>{resultado.actualizados}</strong> actualizados.</p>
          {resultado.omitidos.length > 0 && (
            <>
              <p className="separado-arriba">Filas omitidas:</p>
              <ul className="pequeno secundario-texto">{resultado.omitidos.map(o => <li key={o}>{o}</li>)}</ul>
            </>
          )}
        </div>
      ) : (
        <>
          <p>El archivo debe tener en la primera fila las columnas <strong>placa</strong> y, si las tiene, <strong>titular</strong>, <strong>regional</strong>, <strong>email</strong> y <strong>nit</strong>. Las placas que ya existan se actualizan.</p>
          <div
            className={`zona-archivo ${encima ? 'activa' : ''}`}
            onClick={() => entrada.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
            onDragLeave={() => setEncima(false)}
            onDrop={(e) => { e.preventDefault(); setEncima(false); subir(e.dataTransfer.files?.[0]); }}
            role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') entrada.current?.click(); }}
          >
            <FileSpreadsheet size={28} />
            <strong>{subiendo ? 'Importando…' : 'Arrastre aquí el archivo o haga clic para elegirlo'}</strong>
            <span className="pequeno">Excel (.xlsx) o CSV</span>
            <input ref={entrada} type="file" accept=".xlsx,.csv" hidden onChange={(e) => subir(e.target.files?.[0])} />
          </div>
          <a className="pequeno" href={`${API_BASE}/clientes/plantilla`}><Download size={13} className="icono-en-linea" /> Descargar una plantilla de ejemplo</a>
        </>
      )}
    </Modal>
  );
}
