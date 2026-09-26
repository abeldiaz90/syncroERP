/**
 * Un campo que falta se dice una vez, y en español.
 * Ver la cabecera del validador para el caso medido que lo motivó.
 */
import { validate } from 'class-validator';
import { EsCampoCondicional } from './campo-condicional.validator';

class Puesto {
  tipo!: string;

  @EsCampoCondicional({
    requeridoCuando: (o: Puesto) => o?.tipo === 'PUESTO',
    cuandoFalta: 'Falta la clave del puesto.',
    etiqueta: 'La clave del puesto',
    forma: 'texto',
    minimo: 1,
    maximo: 20,
  })
  clave?: string;

  @EsCampoCondicional({
    requeridoCuando: (o: Puesto) => o?.tipo === 'PUESTO',
    cuandoFalta: 'Indica cuántas plazas se autorizan.',
    etiqueta: 'El número de plazas',
    forma: 'entero',
    minimo: 1,
  })
  plazas?: number;

  @EsCampoCondicional({
    requeridoCuando: (o: Puesto) => o?.tipo === 'PUESTO',
    cuandoFalta: 'Elige el departamento.',
    etiqueta: 'El departamento',
    forma: 'uuid',
  })
  departamentoId?: string;
}

const mensajes = async (o: object) =>
  (await validate(o)).flatMap((e) => Object.values(e.constraints ?? {}));

describe('EsCampoCondicional · un campo, un mensaje', () => {
  it('cuando faltan todos, dice exactamente uno por campo y todos ciertos', async () => {
    const dto = Object.assign(new Puesto(), { tipo: 'PUESTO' });
    expect(await mensajes(dto)).toEqual([
      'Falta la clave del puesto.',
      'Indica cuántas plazas se autorizan.',
      'Elige el departamento.',
    ]);
  });

  it('un texto en blanco cuenta como ausente, no como demasiado corto', async () => {
    const dto = Object.assign(new Puesto(), {
      tipo: 'PUESTO',
      clave: '   ',
      plazas: 1,
      departamentoId: '11111111-1111-1111-1111-111111111111',
    });
    expect(await mensajes(dto)).toEqual(['Falta la clave del puesto.']);
  });

  it('cuando no hace falta, no dice nada', async () => {
    const dto = Object.assign(new Puesto(), { tipo: 'AREA' });
    expect(await mensajes(dto)).toEqual([]);
  });

  it('un valor presente pero mal formado se dice por su nombre', async () => {
    const dto = Object.assign(new Puesto(), {
      tipo: 'PUESTO',
      clave: 'X'.repeat(21),
      plazas: 1.5,
      departamentoId: 'no-es-un-uuid',
    });
    expect(await mensajes(dto)).toEqual([
      'La clave del puesto no puede pasar de 20 caracteres.',
      'El número de plazas debe ser un número entero.',
      'El departamento no tiene la forma de un identificador del sistema.',
    ]);
  });

  it('un número por debajo del mínimo se dice como tal', async () => {
    const dto = Object.assign(new Puesto(), {
      tipo: 'PUESTO',
      clave: 'JEFE',
      plazas: 0,
      departamentoId: '11111111-1111-1111-1111-111111111111',
    });
    expect(await mensajes(dto)).toEqual([
      'El número de plazas no puede ser menor que 1.',
    ]);
  });

  it('con todo bien no dice nada', async () => {
    const dto = Object.assign(new Puesto(), {
      tipo: 'PUESTO',
      clave: 'JEFE',
      plazas: 2,
      departamentoId: '11111111-1111-1111-1111-111111111111',
    });
    expect(await mensajes(dto)).toEqual([]);
  });
});
