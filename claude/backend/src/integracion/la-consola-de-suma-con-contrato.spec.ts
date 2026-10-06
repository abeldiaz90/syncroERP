import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  AsignarAdministradorDto,
  CrearEmpresaDto,
  EmpresaPorRutaDto,
  RegistrarIdentidadDto,
  RegistrarReservaDto,
  SolicitadoPorDto,
} from './dto/alta-empresas.dto';

/**
 * ============================================================================
 * LA CONSOLA DE SUMA ERA EL ÚNICO SITIO SIN CONTRATO
 * ----------------------------------------------------------------------------
 * EL CASO
 *
 * El `ValidationPipe` global del ERP va con `whitelist: true` y
 * `forbidNonWhitelisted: true`: un campo que ningún DTO declare no se ignora,
 * se rechaza con 400. Es la postura más fuerte posible, y es la que hace que el
 * barrido multiempresa no encontrara ni una suplantación de empresa.
 *
 * Pero ese pipe sólo actúa sobre cuerpos tipados como CLASE con decoradores.
 * `alta-empresas.controller.ts` declaraba los suyos como tipos de objeto EN
 * LÍNEA —`@Body() cuerpo: { correo?: string; … }`—, y esos tipos se borran al
 * compilar: Nest entrega `req.body` crudo y el pipe no mira nada.
 *
 * Era el único controlador de los 69 así. Y justamente el que cruza empresas
 * por diseño: crea clientes, les asigna administrador, y decide **qué
 * directorios pueden autenticar contra el ERP**.
 *
 * LO QUE ESTO NO ES
 *
 * No es un agujero de acceso: la puerta sigue siendo la credencial de servicio
 * en `x-aprovisionamiento` —mínimo 32 caracteres, comparada en tiempo
 * constante, y 404 si no está configurada—, y eso está bien hecho. Esto es lo
 * que va DETRÁS de la puerta: que lo que entre por ella tenga forma comprobada.
 *
 * EL CAMPO QUE MÁS IMPORTA
 *
 * `emisor`. Lo que entre ahí pasa a formar parte de la lista de emisores cuyos
 * tokens el ERP acepta. Sin forma comprobada, una cadena cualquiera acaba en el
 * control de acceso de todos los inicios de sesión.
 * ============================================================================
 */

const validar = <T extends object>(
  clase: new () => T,
  valor: Record<string, unknown>,
) => validateSync(plainToInstance(clase, valor) as object, {
  whitelist: true,
  forbidNonWhitelisted: true,
});

const campos = (errores: ReturnType<typeof validateSync>) =>
  errores.map((e) => e.property).sort();

describe('quién autoriza, del lado de SUMA', () => {
  it('es obligatorio: una credencial de servicio dice qué sistema, no quién', () => {
    /*
     * La bitácora de un alta de empresa tiene que poder responder a quién se le
     * pregunta. «La consola» no es una respuesta.
     */
    expect(campos(validar(SolicitadoPorDto, {}))).toEqual(['solicitadoPor']);
  });

  it('y con largo mínimo: «x» no es un nombre', () => {
    expect(campos(validar(SolicitadoPorDto, { solicitadoPor: 'x' }))).toEqual([
      'solicitadoPor',
    ]);
  });

  it('se le quitan los espacios de los lados antes de guardarlo', () => {
    const dto = plainToInstance(SolicitadoPorDto, {
      solicitadoPor: '  Abel Díaz  ',
    });
    expect(dto.solicitadoPor).toBe('Abel Díaz');
  });
});

describe('dar de alta una empresa', () => {
  const bueno = {
    nombreComercial: 'Cliente Dos',
    solicitadoPor: 'Abel Díaz',
  };

  it('acepta lo mínimo', () => {
    expect(validar(CrearEmpresaDto, bueno)).toHaveLength(0);
  });

  it('un campo que nadie declaró se rechaza, no se ignora', () => {
    /*
     * ESTO ES LO QUE EL CONTROLADOR NO TENÍA. Con el cuerpo tipado en línea,
     * `empresaId` o cualquier otro campo entraba sin que nada lo mirara.
     */
    const errores = validar(CrearEmpresaDto, {
      ...bueno,
      empresaId: 'la-de-otro',
    });
    expect(errores.length).toBeGreaterThan(0);
  });

  it('el correo del administrador tiene que ser un correo', () => {
    const errores = validar(CrearEmpresaDto, {
      ...bueno,
      administrador: { correo: 'no-es-un-correo' },
    });
    expect(errores.length).toBeGreaterThan(0);
  });

  it('y se guarda en minúsculas, que es como se busca después', () => {
    /*
     * El enganche por correo de la estrategia Keycloak busca en minúsculas. Un
     * administrador dado de alta con mayúsculas no se encontraría a sí mismo.
     */
    const dto = plainToInstance(CrearEmpresaDto, {
      ...bueno,
      administrador: { correo: '  ABEL@SUMA.MX ' },
    });
    expect(dto.administrador?.correo).toBe('abel@suma.mx');
  });

  it('sin nombre comercial no se da de alta', () => {
    expect(campos(validar(CrearEmpresaDto, { solicitadoPor: 'Abel' }))).toContain(
      'nombreComercial',
    );
  });
});

describe('registrar la identidad de una empresa', () => {
  const bueno = {
    emisor: 'https://key-access.sumamexico.com/realms/cliente-dos',
    realm: 'cliente-dos',
    clientIdPublico: 'erp-cliente-dos',
    solicitadoPor: 'Abel Díaz',
  };

  it('acepta un emisor https bien formado', () => {
    expect(validar(RegistrarIdentidadDto, bueno)).toHaveLength(0);
  });

  it('un emisor en claro NO: quien esté en medio serviría sus propias llaves', () => {
    /*
     * El emisor acaba en la lista contra la que se valida cada inicio de
     * sesión, y de ahí sale la URL de la que el ERP descarga las llaves de
     * firma. Sobre http, quien esté en medio emite tokens válidos.
     */
    expect(
      campos(validar(RegistrarIdentidadDto, { ...bueno, emisor: 'http://keycloak.local/realms/x' })),
    ).toContain('emisor');
  });

  it('ni una cadena que no es una URL', () => {
    expect(
      campos(validar(RegistrarIdentidadDto, { ...bueno, emisor: 'cualquier cosa' })),
    ).toContain('emisor');
  });

  it('ni uno con espacios o saltos de línea', () => {
    expect(
      campos(
        validar(RegistrarIdentidadDto, {
          ...bueno,
          emisor: 'https://bueno.com/realms/x\nhttps://malo.com',
        }),
      ),
    ).toContain('emisor');
  });

  it('la barra final se quita, porque la lista compara sin ella', () => {
    /*
     * `emisoresAceptados()` guarda `f.emisor.replace(/\/$/, '')`. Si aquí
     * entrara con barra, la fila no coincidiría con ningún token y esa empresa
     * no podría entrar — un fallo silencioso el día del alta.
     */
    const dto = plainToInstance(RegistrarIdentidadDto, {
      ...bueno,
      emisor: 'https://key-access.sumamexico.com/realms/cliente-dos/',
    });
    expect(dto.emisor).toBe('https://key-access.sumamexico.com/realms/cliente-dos');
  });

  it('el realm y el client id no admiten texto libre: van a una URL', () => {
    expect(
      campos(validar(RegistrarIdentidadDto, { ...bueno, realm: 'cliente dos/../admin' })),
    ).toContain('realm');
    expect(
      campos(validar(RegistrarIdentidadDto, { ...bueno, clientIdPublico: 'a b c' })),
    ).toContain('clientIdPublico');
  });

  it('los secretos tienen tope de largo', () => {
    expect(
      campos(
        validar(RegistrarIdentidadDto, {
          ...bueno,
          secretoServicio: 'x'.repeat(501),
        }),
      ),
    ).toContain('secretoServicio');
  });
});

describe('la reserva de inquilinos', () => {
  it('cada identificador acaba siendo un inquilino de Fineract', () => {
    /*
     * Va en una cabecera y en el nombre de un esquema de base de datos. Texto
     * libre ahí no es una validación que falte: es un nombre de esquema que
     * alguien elige.
     */
    expect(
      campos(validar(RegistrarReservaDto, { identificadores: ['cliente dos'] })),
    ).toContain('identificadores');
    expect(
      campos(validar(RegistrarReservaDto, { identificadores: ['buen_cliente-2'] })),
    ).toEqual([]);
  });

  it('una lista vacía no es una reserva', () => {
    expect(campos(validar(RegistrarReservaDto, { identificadores: [] }))).toContain(
      'identificadores',
    );
  });
});

describe('el id de empresa que llega por la ruta', () => {
  it('tiene forma de GUID', () => {
    expect(
      campos(validar(EmpresaPorRutaDto, { empresaId: 'no-es-un-guid' })),
    ).toContain('empresaId');
    expect(
      campos(
        validar(EmpresaPorRutaDto, {
          empresaId: '11111111-2222-3333-4444-555555555555',
        }),
      ),
    ).toEqual([]);
  });
});

describe('y el controlador ya no tiene ni un cuerpo sin contrato', () => {
  /*
   * LA PRUEBA QUE IMPORTA DENTRO DE UN AÑO. Los DTO pueden estar perfectos y no
   * servir de nada si el controlador sigue declarando sus cuerpos en línea: el
   * tipo se borra al compilar y el pipe global no mira nada. Es, palabra por
   * palabra, el defecto que esto cierra.
   */
  const controlador = readFileSync(
    join(__dirname, 'controllers', 'alta-empresas.controller.ts'),
    'utf8',
  );

  it('ningún @Body declara un objeto en línea', () => {
    /*
     * `@Body() x: { … }` en cualquiera de sus dos formas, en la misma línea o
     * partido en varias.
     */
    const sinComentarios = controlador
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(sinComentarios).not.toMatch(/@Body\(\)\s*\n?\s*\w+:\s*\{/);
  });

  it('y los cinco cuerpos usan su DTO', () => {
    for (const dto of [
      'CrearEmpresaDto',
      'AsignarAdministradorDto',
      'RegistrarReservaDto',
      'RegistrarIdentidadDto',
      'SolicitadoPorDto',
    ]) {
      expect(controlador).toContain(`@Body() cuerpo: ${dto}`);
    }
  });

  it('el id de empresa de la ruta se comprueba antes de usarse', () => {
    /*
     * El path no pasa por el `ValidationPipe` de cuerpo, así que su forma se
     * exige a mano. Va antes de cualquier lectura o escritura con ese id.
     */
    expect(controlador).toMatch(/private exigirGuid\(empresaId: string\): void \{/);
    const registrar = controlador.slice(
      controlador.indexOf('async registrarIdentidad('),
    );
    const guardia = registrar.indexOf('this.exigirGuid(empresaId)');
    const uso = registrar.indexOf('await this.alta.estado(empresaId)');
    expect(guardia).toBeGreaterThan(0);
    expect(uso).toBeGreaterThan(guardia);
  });

  it('y la credencial de servicio sigue siendo lo primero de todo', () => {
    /*
     * Lo que ya estaba bien, atado para que siga estándolo: la puerta se
     * comprueba ANTES que nada más. Validar el cuerpo primero convertiría los
     * mensajes de validación en un oráculo para quien no tiene la credencial.
     */
    for (const metodo of [
      'async crear(',
      'async asignarAdministrador(',
      'async registrarIdentidad(',
      'async registrarReserva(',
    ]) {
      const cuerpo = controlador.slice(controlador.indexOf(metodo));
      const servicio = cuerpo.indexOf('this.exigirServicio(clave)');
      expect(servicio).toBeGreaterThan(0);
      expect(servicio).toBeLessThan(400);
    }
  });
});
