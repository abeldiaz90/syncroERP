/**
 * Una condición, un mensaje. Ver la cabecera del validador para el porqué.
 */
import { validate } from 'class-validator';
import { EsJustificacion } from './es-justificacion.validator';

class Descartar {
  decision!: string;

  @EsJustificacion({
    requeridaCuando: (dto: Descartar) => dto?.decision === 'DESCARTADO',
    cuandoFalta: 'Descartar exige una nota.',
    maximo: 40,
  })
  nota?: string;
}

class Cerrar {
  @EsJustificacion({ cuandoFalta: 'Cerrar exige una nota.', maximo: 40 })
  nota!: string;
}

const mensajes = async (objeto: object) =>
  (await validate(objeto)).flatMap((e) => Object.values(e.constraints ?? {}));

describe('EsJustificacion · una condición, un mensaje', () => {
  it('cuando falta y hace falta, dice una sola cosa y es cierta', async () => {
    const dto = Object.assign(new Descartar(), { decision: 'DESCARTADO' });
    expect(await mensajes(dto)).toEqual(['Descartar exige una nota.']);
  });

  it('una cadena en blanco cuenta como que falta', async () => {
    const dto = Object.assign(new Descartar(), {
      decision: 'DESCARTADO',
      nota: '   ',
    });
    expect(await mensajes(dto)).toEqual(['Descartar exige una nota.']);
  });

  it('cuando no hace falta, ausente está bien', async () => {
    const dto = Object.assign(new Descartar(), { decision: 'PROCESADO' });
    expect(await mensajes(dto)).toEqual([]);
  });

  it('demasiado larga se dice por su nombre, no como si faltara', async () => {
    const dto = Object.assign(new Cerrar(), { nota: 'x'.repeat(41) });
    expect(await mensajes(dto)).toEqual([
      'La justificación no puede pasar de 40 caracteres.',
    ]);
  });

  it('un tipo equivocado se dice por su nombre', async () => {
    const dto = Object.assign(new Cerrar(), { nota: 12345 as any });
    expect(await mensajes(dto)).toEqual(['La justificación debe ser texto.']);
  });

  it('una nota válida no produce ningún mensaje', async () => {
    const dto = Object.assign(new Cerrar(), { nota: 'Conciliada a mano.' });
    expect(await mensajes(dto)).toEqual([]);
  });
});
