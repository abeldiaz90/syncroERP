/**
 * ============================================================================
 * Un campo con dos significados
 * ----------------------------------------------------------------------------
 * `parametrosProveedor.capacidadesValidacion` se lee en dos sitios y cada uno
 * entendía otra cosa cuando el campo NO ESTÁ:
 *
 *   · `capacidadPermitida` —el servicio— trata la ausencia como «SUMA no ha
 *     declarado nada, así que no se restringe». Está escrito y comentado como
 *     decisión deliberada, y es la que gobierna de verdad: es la que decide si
 *     un flujo se puede activar.
 *
 *   · `GET /integracion/contratacion` —lo que mira la interfaz para pintar el
 *     menú— hacía `capacidades.length > 0` sobre `?? []`, con lo que la
 *     ausencia significaba «no contratado».
 *
 * Como HOY NINGUNA CONSOLA ESCRIBE ESA LISTA —lo dice el comentario de
 * `capacidadPermitida`—, el campo está ausente en todas las instalaciones. El
 * resultado no era un matiz: el servidor permitía diseñar y activar cualquier
 * flujo, y el menú escondía la pantalla de «Flujo de verificación» a TODAS las
 * empresas, para siempre. Una pantalla entera invisible por un `?? []`.
 *
 * La regla vive una sola vez, en `validacion.constants`, y los dos lados la
 * llaman. Un campo, un significado.
 * ============================================================================
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  capacidadPermitida,
  hayValidacionContratada,
  TIPOS_PASO_CONTRATABLES,
} from './validacion.constants';
import { TipoPasoValidacion } from './validacion.constants';

const SRC = join(__dirname, '..', '..');

describe('un campo con dos significados', () => {
  describe('la ausencia significa lo mismo en los dos lados', () => {
    it('no declarado no es no contratado', () => {
      // El servicio no restringe nada cuando no hay lista…
      expect(capacidadPermitida(TIPOS_PASO_CONTRATABLES[0], null)).toBe(true);
      expect(capacidadPermitida(TIPOS_PASO_CONTRATABLES[0], undefined)).toBe(
        true,
      );
      // …así que la interfaz tampoco puede esconder la pantalla.
      expect(hayValidacionContratada(null)).toBe(true);
      expect(hayValidacionContratada(undefined)).toBe(true);
    });

    it('una lista vacía sí es una decisión: ninguna capacidad externa', () => {
      expect(capacidadPermitida(TIPOS_PASO_CONTRATABLES[0], [])).toBe(false);
      expect(hayValidacionContratada([])).toBe(false);
    });

    it('una lista con algo dentro está contratada', () => {
      expect(hayValidacionContratada([TipoPasoValidacion.BURO_CREDITO])).toBe(
        true,
      );
    });

    it('lo que no es una lista se trata como no declarado, no como vacío', () => {
      // Un JSON mal escrito a mano en la columna no puede apagar una pantalla.
      expect(hayValidacionContratada('BURO_CREDITO')).toBe(true);
      expect(hayValidacionContratada(42)).toBe(true);
      expect(hayValidacionContratada({})).toBe(true);
    });
  });

  describe('nadie vuelve a escribir la regla por su cuenta', () => {
    it('el controlador de integración no cuenta capacidades a mano', () => {
      const texto = readFileSync(
        join(SRC, 'integracion', 'controllers', 'integracion.controller.ts'),
        'utf8',
      );
      const sospechosas = texto
        .split('\n')
        .map((linea, i) => ({ linea, n: i + 1 }))
        .filter(({ linea }) => /capacidadesValidacion/.test(linea))
        .filter(({ linea }) => !/^\s*[*/]/.test(linea))
        // La lista de claves que el PATCH copia tal cual no es una lectura.
        .filter(({ linea }) => !/^\s*'capacidadesValidacion',\s*$/.test(linea));

      // Si el controlador toca el campo, tiene que ser para pasárselo a la
      // regla, no para decidir por su cuenta.
      for (const { linea, n } of sospechosas) {
        expect(
          /hayValidacionContratada/.test(linea) ||
            /hayValidacionContratada/.test(texto),
        ).toBe(true);
        expect(`${n}: ${linea}`).not.toMatch(/\.length\s*>\s*0/);
        expect(`${n}: ${linea}`).not.toMatch(/\?\?\s*\[\]/);
      }
    });
  });
});
