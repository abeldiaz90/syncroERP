import { mensajesDeValidacion } from './mensajes-de-validacion';

describe('mensajes de validación · un campo, un mensaje cierto', () => {
  it('un campo ausente con tres quejas deja una sola, y en español', () => {
    expect(
      mensajesDeValidacion([
        {
          property: 'motivo',
          value: undefined,
          constraints: {
            maxLength: 'motivo must be shorter than or equal to 500 characters',
            minLength: 'motivo must be longer than or equal to 5 characters',
            isString: 'motivo must be a string',
          },
        },
      ]),
    ).toEqual(['motivo: Falta motivo.']);
  });

  it('una cadena en blanco cuenta como ausente', () => {
    expect(
      mensajesDeValidacion([
        {
          property: 'nota',
          value: '   ',
          constraints: {
            minLength: 'nota must be longer than or equal to 5 characters',
            isString: 'nota must be a string',
          },
        },
      ]),
    ).toEqual(['nota: Falta nota.']);
  });

  it('si alguien escribió un mensaje propio, ese manda', () => {
    expect(
      mensajesDeValidacion([
        {
          property: 'rfc',
          value: undefined,
          constraints: {
            esRfc: 'El RFC es obligatorio.',
            isString: 'rfc must be a string',
          },
        },
      ]),
    ).toEqual(['rfc: El RFC es obligatorio.']);
  });

  it('con el valor presente se conservan todas las quejas distintas', () => {
    expect(
      mensajesDeValidacion([
        {
          property: 'clave',
          value: 'x'.repeat(30),
          constraints: {
            maxLength: 'clave must be shorter than or equal to 20 characters',
            matches: 'clave debe ser alfanumérica.',
          },
        },
      ]),
    ).toEqual([
      'clave: clave must be shorter than or equal to 20 characters',
      'clave: clave debe ser alfanumérica.',
    ]);
  });

  it('no repite el mismo texto dos veces', () => {
    expect(
      mensajesDeValidacion([
        {
          property: 'nota',
          value: 'ab',
          constraints: {
            minLength: 'La nota es obligatoria.',
            isString: 'La nota es obligatoria.',
          },
        },
      ]),
    ).toEqual(['nota: La nota es obligatoria.']);
  });

  it('un campo con una sola queja se deja tal cual', () => {
    expect(
      mensajesDeValidacion([
        {
          property: 'edad',
          value: undefined,
          constraints: { isInt: 'edad must be an integer number' },
        },
      ]),
    ).toEqual(['edad: edad must be an integer number']);
  });

  it('los anidados conservan su ruta', () => {
    expect(
      mensajesDeValidacion([
        {
          property: 'detalles',
          value: [{}],
          children: [
            {
              property: '0',
              children: [
                {
                  property: 'cantidad',
                  value: undefined,
                  constraints: {
                    min: 'cantidad must not be less than 1',
                    isNumber: 'cantidad must be a number',
                  },
                },
              ],
            },
          ],
        },
      ]),
    ).toEqual(['detalles.0.cantidad: Falta cantidad.']);
  });
});
