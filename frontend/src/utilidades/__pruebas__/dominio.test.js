import { describe, expect, it } from 'vitest';
import { agruparConsecutivos, compararPorPublicacion, ordenTipoActo, resumenTipos, prioridad } from '../dominio';
import { etiquetaDia } from '../fechas';

const n = (id, extra) => ({ id_notificacion: id, estado: 'nueva', dias_habiles_restantes: null, ...extra });

describe('compararPorPublicacion', () => {
  it('pone primero el día de publicación más reciente', () => {
    const lista = [n(1, { fecha_aviso: '2026-10-15' }), n(2, { fecha_aviso: '2026-10-19' })];
    expect(lista.sort(compararPorPublicacion).map(x => x.id_notificacion)).toEqual([2, 1]);
  });

  it('dentro del mismo día pone los autos antes que las resoluciones', () => {
    const lista = [
      n(1, { fecha_aviso: '2026-10-19', tipo_acto: 'Resolución', urgencia: 'alta' }),
      n(2, { fecha_aviso: '2026-10-19', tipo_acto: 'Auto', urgencia: 'baja' }),
      n(3, { fecha_aviso: '2026-10-19', tipo_acto: 'Aviso' }),
    ];
    expect(lista.sort(compararPorPublicacion).map(x => x.id_notificacion)).toEqual([2, 1, 3]);
  });

  it('entre actos del mismo tipo y día, decide la prioridad', () => {
    const urgente = n(1, { fecha_aviso: '2026-10-19', tipo_acto: 'Auto', urgencia: 'alta' });
    const normal = n(2, { fecha_aviso: '2026-10-19', tipo_acto: 'Auto', urgencia: 'baja' });
    expect(prioridad(urgente)).toBeLessThan(prioridad(normal));
    expect([normal, urgente].sort(compararPorPublicacion)[0]).toBe(urgente);
  });

  it('acepta fechas DD/MM/YYYY igual que YYYY-MM-DD', () => {
    const lista = [n(1, { fecha_aviso: '15/10/2026' }), n(2, { fecha_aviso: '2026-10-19' })];
    expect(lista.sort(compararPorPublicacion)[0].id_notificacion).toBe(2);
  });
});

describe('agruparConsecutivos', () => {
  it('forma grupos solo con elementos seguidos y conserva el orden', () => {
    const grupos = agruparConsecutivos(['a1', 'a2', 'b1', 'a3'], x => x[0]);
    expect(grupos).toEqual([
      { clave: 'a', items: ['a1', 'a2'] },
      { clave: 'b', items: ['b1'] },
      { clave: 'a', items: ['a3'] },
    ]);
  });

  it('devuelve una lista vacía si no hay elementos', () => {
    expect(agruparConsecutivos([], x => x)).toEqual([]);
  });
});

describe('ordenTipoActo y resumenTipos', () => {
  it('ordena Auto < Resolución < resto', () => {
    expect(ordenTipoActo({ tipo_acto: 'Auto' })).toBeLessThan(ordenTipoActo({ tipo_acto: 'Resolución' }));
    expect(ordenTipoActo({ tipo_acto: 'Resolución' })).toBeLessThan(ordenTipoActo({ tipo_acto: 'Aviso' }));
  });

  it('describe la composición de un día en español natural', () => {
    const dia = [n(1, { tipo_acto: 'Resolución' }), n(2, { tipo_acto: 'Auto' }), n(3, { tipo_acto: 'Auto' }), n(4, { tipo_acto: 'Aviso' })];
    expect(resumenTipos(dia)).toBe('2 autos, 1 resolución y 1 aviso');
    expect(resumenTipos([n(1, { tipo_acto: 'Auto' })])).toBe('1 auto');
  });
});

describe('etiquetaDia', () => {
  const hoy = new Date(2026, 9, 20); // 20 de octubre de 2026
  it('usa Hoy y Ayer para los días cercanos', () => {
    expect(etiquetaDia('2026-10-20', hoy)).toBe('Hoy');
    expect(etiquetaDia('2026-10-19', hoy)).toBe('Ayer');
  });
  it('escribe el día de la semana para fechas anteriores', () => {
    expect(etiquetaDia('2026-10-15', hoy)).toMatch(/^Jueves 15 de octubre$/);
  });
  it('agrega el año si no es el actual', () => {
    expect(etiquetaDia('2025-12-01', hoy)).toMatch(/2025/);
  });
});
