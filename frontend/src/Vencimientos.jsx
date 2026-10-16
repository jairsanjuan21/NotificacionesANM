import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE, BadgeUrgencia, CeldaPlazo, SelectorEstado, CeldaDocumento } from './componentes';

export default function Vencimientos({ clientes, onCambio }) {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await axios.get(`${API_BASE}/vencimientos`);
      setItems(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const cliente = (id) => clientes.find(c => c.id_cliente === id) || {};
  const proximos = items.filter(n => n.dias_habiles_restantes !== null && n.dias_habiles_restantes >= 0);
  const vencidos = items.filter(n => n.dias_habiles_restantes !== null && n.dias_habiles_restantes < 0);

  const actualizar = () => { cargar(); onCambio && onCambio(); };

  const tabla = (lista, vacio) => (
    <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', border: '1px solid #dcdde1', fontSize: '14px', textAlign: 'left' }}>
      <thead style={{ background: '#1f3a52', color: 'white', textAlign: 'left' }}>
        <tr>
          <th style={{ padding: '10px' }}>Fecha límite</th>
          <th style={{ padding: '10px' }}>Placa / Titular</th>
          <th style={{ padding: '10px' }}>Documento</th>
          <th style={{ padding: '10px' }}>Urgencia</th>
          <th style={{ padding: '10px', width: '170px' }}>Gestión</th>
        </tr>
      </thead>
      <tbody>
        {lista.map(n => {
          const c = cliente(n.id_cliente);
          return (
            <tr key={n.id_notificacion} style={{ borderBottom: '1px solid #eee', verticalAlign: 'top' }}>
              <td style={{ padding: '10px' }}><CeldaPlazo notif={n} /></td>
              <td style={{ padding: '10px' }}>
                <strong>{c.placa}</strong>
                <div style={{ fontSize: '12px', color: '#7f8c8d' }}>{c.nombre_empresa}</div>
                <div style={{ fontSize: '11px', color: '#95a5a6' }}>Publicado: {n.fecha_aviso}</div>
              </td>
              <td style={{ padding: '10px' }}><CeldaDocumento notif={n} /></td>
              <td style={{ padding: '10px' }}><BadgeUrgencia notif={n} /></td>
              <td style={{ padding: '10px' }}><SelectorEstado notif={n} onCambio={actualizar} /></td>
            </tr>
          );
        })}
        {lista.length === 0 && (
          <tr><td colSpan="5" style={{ padding: '16px', textAlign: 'center', color: '#7f8c8d' }}>{vacio}</td></tr>
        )}
      </tbody>
    </table>
  );

  if (cargando) return <p>Cargando vencimientos…</p>;

  return (
    <div>
      <div style={{ background: '#fef9e7', border: '1px solid #f7dc6f', padding: '12px 16px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px', color: '#7d6608' }}>
        ⚠️ Las fechas límite son <strong>estimadas</strong> en días hábiles con festivos de Colombia: aviso fijado 5 días hábiles,
        notificado al día hábil siguiente y, si el acto menciona un término (ej. "treinta (30) días"), se usa ese término; si no,
        los 10 días del recurso de reposición. Verifique siempre en el acto. Pase el mouse sobre la fecha para ver cómo se calculó.
        Marque la notificación como <strong>Respondida</strong> para que deje de recordarse.
      </div>

      <h3 style={{ marginBottom: '8px' }}>📅 Próximos vencimientos ({proximos.length})</h3>
      {tabla(proximos, 'No hay vencimientos próximos sin responder. 🎉')}

      <h3 style={{ margin: '24px 0 8px' }}>⌛ Vencidos en los últimos 10 días sin marcar como respondidos ({vencidos.length})</h3>
      {tabla(vencidos, 'Nada vencido recientemente.')}
    </div>
  );
}
