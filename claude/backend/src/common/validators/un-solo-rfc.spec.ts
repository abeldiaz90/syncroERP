/**
 * ============================================================================
 * Seis expresiones regulares para el mismo RFC, y ninguna miraba la fecha
 * ----------------------------------------------------------------------------
 * El RFC se validaba en seis sitios, cada uno con su propia expresión escrita a
 * mano —configuración fiscal, configuración de México, timbrado de venta,
 * configuración patronal, onboarding, empleados— y en tres más **no se
 * validaba en absoluto**: el alta de empresa desde la consola de SUMA, el
 * cliente, el proveedor y el receptor de la factura.
 *
 * Las seis comprobaban la forma. **Ninguna comprobaba que la fecha existiera**,
 * así que `ABC130229XX1` —29 de febrero de un año que no es bisiesto— pasaba
 * las seis. Y `12345` pasaba en los cuatro sitios sin validación.
 *
 * Es la misma forma de defecto que la cuarta lista de roles y los tres DTO que
 * decían cosas distintas de la misma regla: cuando una regla vive en varios
 * sitios, no es una regla, son varias, y divergen sin que nadie lo note.
 *
 * Esta prueba fija que la regla sea UNA, y que nadie escriba la séptima.
 * ============================================================================
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..');

function archivosTs(directorio: string): string[] {
  return readdirSync(directorio).flatMap((entrada) => {
    const ruta = join(directorio, entrada);
    if (statSync(ruta).isDirectory()) {
      if (entrada === 'node_modules') return [];
      return archivosTs(ruta);
    }
    return entrada.endsWith('.ts') ? [ruta] : [];
  });
}

/**
 * La forma de un RFC escrita a mano: 3 o 4 letras, seis dígitos y tres
 * caracteres de homoclave. Busca la figura, no una cadena literal, para que
 * también encuentre las variantes con `i`, con `&` en otro orden o con los
 * grupos agrupados de otra manera.
 */
const REGEX_DE_RFC = /\[A-Z[^\]]*\]\{3,\s*4\}\s*\\d\{6\}\s*\[A-Z0-9\]\{3\}/;

describe('RFC · una sola regla en todo el sistema', () => {
  const archivos = archivosTs(RAIZ).filter(
    (ruta) =>
      !ruta.endsWith('rfc.util.ts') &&
      !ruta.endsWith('rfc.util.spec.ts') &&
      !ruta.endsWith('un-solo-rfc.spec.ts'),
  );

  it('encuentra los archivos del árbol (si no, no está midiendo nada)', () => {
    expect(archivos.length).toBeGreaterThan(200);
  });

  it('nadie vuelve a escribir la expresión del RFC a mano', () => {
    const culpables = archivos
      .filter((ruta) => REGEX_DE_RFC.test(readFileSync(ruta, 'utf8')))
      .map((ruta) => ruta.slice(RAIZ.length + 1).replace(/\\/g, '/'))
      .sort();

    expect(culpables).toEqual([]);
  });
});

/*
 * Y la regla, aplicada de verdad por los DTO. Se comprueba el que más lejos
 * llega: el receptor de un CFDI, que antes sólo pedía `@IsString()`.
 */
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { TimbrarVentaDto } from '../../cfdi/timbrar-venta.dto';
import { CrearClienteDto } from '../../clientes/crear-cliente.dto';

const errores = (dto: object) =>
  validateSync(dto as never).flatMap((e) => Object.values(e.constraints ?? {}));

describe('RFC · los DTO aplican la regla', () => {
  it('el receptor del CFDI rechaza un RFC inventado', () => {
    const dto = plainToInstance(TimbrarVentaDto, {
      rfcReceptor: '12345',
      nombreReceptor: 'Quien sea',
    });

    expect(errores(dto).join(' ')).toMatch(/RFC/);
  });

  it('el receptor del CFDI acepta el genérico del SAT', () => {
    // «Público en general». Sin él no hay CFDI de mostrador.
    const dto = plainToInstance(TimbrarVentaDto, {
      rfcReceptor: 'XAXX010101000',
      nombreReceptor: 'PUBLICO EN GENERAL',
      regimenFiscalReceptor: '616',
      codigoPostalReceptor: '06600',
      usoCfdi: 'S01',
    });

    // Lo que importa es que NINGUNA queja sea del RFC.
    expect(errores(dto).join(' ')).not.toMatch(/rfc/i);
  });

  it('el cliente rechaza una fecha que no existe en su RFC', () => {
    const dto = plainToInstance(CrearClienteDto, {
      nombre: 'Cliente de prueba',
      rfc: 'ABC130229XX1',
    });

    expect(errores(dto).join(' ')).toMatch(/no existe/i);
  });

  it('el cliente avisa si el RFC no cuadra con el tipo de persona', () => {
    /*
     * Un RFC de 12 caracteres es de persona moral. Declararlo como física
     * significa que una de las dos cosas se tecleó mal, y el dato acabaría en
     * una factura. Esta regla ya existía en el servicio, escrita a mano con su
     * propia expresión regular; ahora usa la misma comprobación que el resto.
     */
    const { revisarRfcDeTipo } = require('../utils/rfc.util');

    expect(revisarRfcDeTipo('SUM230815AB1', 'FISICA').valido).toBe(false);
    expect(revisarRfcDeTipo('SUM230815AB1', 'FISICA').motivo).toMatch(
      /persona moral/i,
    );
    expect(revisarRfcDeTipo('SUM230815AB1', 'MORAL').valido).toBe(true);
    // El genérico no declara tipo: vale para los dos.
    expect(revisarRfcDeTipo('XAXX010101000', 'FISICA').valido).toBe(true);
    expect(revisarRfcDeTipo('XAXX010101000', 'MORAL').valido).toBe(true);
  });

  it('el cliente sigue pudiendo no tener RFC', () => {
    // Mostrador: se da de alta y el dato fiscal llega después.
    const dto = plainToInstance(CrearClienteDto, { nombre: 'Cliente nuevo' });

    expect(errores(dto)).toEqual([]);
  });
});
