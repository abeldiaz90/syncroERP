import {
  cuentaDeLaPartida,
  cuentasVigentesPorClave,
} from './cuenta-de-la-partida.util';

describe('cuenta contable de una partida de nómina', () => {
  const vigentes = cuentasVigentesPorClave([
    { clave: 'P001', cuentaContableId: 'cta-sueldos-hoy' },
    { clave: 'P002', cuentaContableId: null },
    { clave: 'p003', cuentaContableId: 'cta-prima' },
  ]);

  it('respeta la cuenta congelada aunque el catálogo haya cambiado', () => {
    expect(
      cuentaDeLaPartida(
        { clave: 'P001', cuentaContableId: 'cta-sueldos-de-entonces' },
        vigentes,
      ),
    ).toBe('cta-sueldos-de-entonces');
  });

  it('cuando no se congeló nada, resuelve con el catálogo vigente', () => {
    expect(cuentaDeLaPartida({ clave: 'P001' }, vigentes)).toBe(
      'cta-sueldos-hoy',
    );
    expect(
      cuentaDeLaPartida({ clave: 'P001', cuentaContableId: null }, vigentes),
    ).toBe('cta-sueldos-hoy');
  });

  it('compara claves sin distinguir mayúsculas ni espacios', () => {
    expect(cuentaDeLaPartida({ clave: ' p003 ' }, vigentes)).toBe('cta-prima');
  });

  it('si tampoco el catálogo la tiene, sigue faltando y se dice', () => {
    expect(cuentaDeLaPartida({ clave: 'P002' }, vigentes)).toBeUndefined();
    expect(cuentaDeLaPartida({ clave: 'NO_EXISTE' }, vigentes)).toBeUndefined();
    expect(cuentaDeLaPartida({ clave: '' }, vigentes)).toBeUndefined();
  });
});
