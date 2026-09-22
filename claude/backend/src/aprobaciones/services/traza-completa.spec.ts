import { veTrazaCompleta } from './aprobaciones-documentos.service';
import { PLANTILLAS_PERMISOS } from '../../iam/data/plantillas-permisos';

/**
 * Quien ve el historial entero.
 *
 * Esta prueba existe porque la version anterior de la regla estaba escrita,
 * documentada, cubierta por una prueba de coherencia... y no acertaba nunca:
 * comparaba la lista en minusculas contra el rol ya normalizado, que sale en
 * MAYUSCULAS. `gobierno` abria su bandeja y el historial salia vacio.
 *
 * La leccion es la forma de la prueba, no su contenido: una prueba que mira el
 * texto del codigo dice que la regla esta escrita; solo una que la EJECUTA
 * dice que funciona.
 */
describe('quien ve la traza completa de aprobaciones', () => {
  it('no depende de como venga escrito el rol', () => {
    for (const variante of ['gobierno', 'GOBIERNO', 'Gobierno', '  gobierno  ']) {
      expect(veTrazaCompleta(variante)).toBe(true);
    }
  });

  it('el administrador siempre, con cualquiera de sus nombres', () => {
    for (const variante of ['admin', 'ADMIN', 'administrador', 'super_admin']) {
      expect(veTrazaCompleta(variante)).toBe(true);
    }
  });

  /*
   * Lo que este recorte protege: el comprador leyendo el expediente
   * crediticio de un cliente —nombre, RFC, limite, nivel de riesgo—. Se
   * verifico en vivo el 21-sep y por eso existe el filtro.
   */
  it('ningun rol operativo ve la traza entera', () => {
    for (const rol of ['comprador', 'credito', 'almacenista', 'contador', 'tesoreria', 'gerencia', 'direccion']) {
      expect(veTrazaCompleta(rol)).toBe(false);
    }
  });

  it('sin rol no se ve nada', () => {
    expect(veTrazaCompleta(undefined)).toBe(false);
    expect(veTrazaCompleta('')).toBe(false);
    expect(veTrazaCompleta('   ')).toBe(false);
  });

  /*
   * El invariante que hace segura la vista completa: quien ve todo no puede
   * firmar nada. Ver expedientes ajenos solo se justifica desde una posicion
   * que no pueda actuar sobre ellos.
   */
  it('todo rol con traza completa tiene vedado resolver', () => {
    const conTraza = PLANTILLAS_PERMISOS.filter((p) => veTrazaCompleta(p.rol));
    expect(conTraza.length).toBeGreaterThan(0);
    for (const plantilla of conTraza) {
      expect(plantilla.accionesVedadas ?? []).toContain(
        'PATCH /aprobaciones/:id/resolver',
      );
      expect(plantilla.modulos ?? []).not.toContain('aprobaciones');
    }
  });
});
