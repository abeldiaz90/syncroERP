import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { Proveedor } from '../proveedores/entities/proveedor.entity';

/**
 * ============================================================================
 * La firma no sabía a quién se le compra
 * ----------------------------------------------------------------------------
 * MEDIDO EL 28-SEP-2026, por pantalla, con la sesión de `gerencia`
 *
 * La bandeja de aprobaciones de compras mostraba las dos adjudicaciones que
 * esperaban firma de REQ-0C5BE1A8. Las dos decían, donde va el proveedor:
 *
 *     «Proveedor no disponible»
 *
 * Lo único que las distinguía eran los importes —$1,252.80 y $1,148.40—. Se le
 * estaba pidiendo a gerencia que firmara A QUIÉN SE LE COMPRA sin decirle a
 * quién.
 *
 * El servidor sí manda el proveedor: la consulta de la bandeja trae la relación
 * `proveedor`. El hueco estaba en la tarjeta, que leía
 *
 *     proveedor.razonSocial ?? proveedor.nombreComercial ?? 'Proveedor no disponible'
 *
 * y de esos dos campos uno es OPCIONAL —`razonSocial` casi nunca se captura en
 * un alta rápida— y el otro NO EXISTE en la entidad. El campo que sí existe y
 * que además es obligatorio, `nombre`, no se miraba. Con lo cual el aviso no
 * era «falta el dato»: el dato estaba ahí al lado.
 *
 * Y el fallback mentía dos veces, porque «Proveedor no disponible» se lee como
 * si el proveedor estuviera dado de baja o bloqueado —que es un estado real en
 * este ERP, y uno que impide adjudicar—.
 *
 * LA REGLA: quien firma ve el nombre. Y se nombra por el campo obligatorio,
 * cayendo a los opcionales sólo para mejorarlo, nunca al revés.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['syncro-erp-frontend', 'frontend', '../syncro-erp-frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

describe('Proveedor · qué campo lo nombra', () => {
  it('`nombre` es el campo obligatorio de la entidad', () => {
    const fuente = readFileSync(
      join(__dirname, '..', 'proveedores/entities/proveedor.entity.ts'),
      'utf8',
    );
    // Obligatorio: sin `?` ni `nullable: true` en su columna.
    expect(fuente).toMatch(/\n\s*nombre:\s*string;/);
    expect(new Proveedor()).toBeDefined();
  });

  it('`razonSocial` es opcional, así que no puede ser el único que se mire', () => {
    const fuente = readFileSync(
      join(__dirname, '..', 'proveedores/entities/proveedor.entity.ts'),
      'utf8',
    );
    expect(fuente).toMatch(/razonSocial\?:\s*string;/);
  });

  it('`nombreComercial` no existe: leerlo era leer `undefined`', () => {
    const fuente = readFileSync(
      join(__dirname, '..', 'proveedores/entities/proveedor.entity.ts'),
      'utf8',
    );
    expect(fuente).not.toMatch(/nombreComercial/);
  });
});

const describeSiHayFrontend = FRONTEND ? describe : describe.skip;

describeSiHayFrontend('Bandeja de aprobaciones · quien firma ve el nombre', () => {
  const pagina = () =>
    readFileSync(
      join(FRONTEND!, 'app/dashboard/compras/aprobaciones/page.tsx'),
      'utf8',
    );

  it('la tarjeta nombra al proveedor por su campo obligatorio', () => {
    const texto = pagina();
    const inicio = texto.indexOf('const prov =');
    expect(texto.slice(inicio, texto.indexOf(';', inicio) + 1)).toMatch(
      /proveedor\?\.nombre\b/,
    );
  });

  it('no se queda en campos opcionales o inexistentes', () => {
    /*
     * Puede seguir prefiriendo `razonSocial` —es el nombre fiscal y para una
     * firma es mejor—, pero la caída tiene que llegar a `nombre` antes que al
     * texto de «no disponible».
     */
    const texto = pagina();
    /*
     * Se mide la ASIGNACIÓN, no el archivo: el comentario que explica el
     * defecto nombra los campos viejos a propósito, y medir el archivo entero
     * castigaría justamente al que dejó escrito por qué.
     */
    const inicio = texto.indexOf('const prov =');
    expect(inicio).toBeGreaterThan(-1);
    const asignacion = texto.slice(inicio, texto.indexOf(';', inicio) + 1);

    expect(asignacion).toMatch(/\.nombre\b/);
    expect(asignacion).not.toMatch(/nombreComercial/);
  });
});
