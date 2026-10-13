/**
 * ============================================================================
 * El prospecto con empresa no es el cliente: es por quién preguntas
 * ----------------------------------------------------------------------------
 * CÓMO SALIÓ
 *
 * 13-oct, recorriendo el embudo de punta a punta. Al ganar la oportunidad el
 * CRM hace lo correcto: no se calla, dice que el prospecto todavía no es
 * cliente —«sin RFC, régimen fiscal y domicilio no se le puede facturar»— y
 * pone el enlace que abre el alta con lo que ya se sabe.
 *
 * El enlace funcionaba. Lo que llevaba estaba mal repartido:
 *
 *     Nombre comercial  Rosa Elena Cárdenas Vigil      ← la persona
 *     Razón social      Muebles del Centro SA de CV    ← la empresa
 *     Nombre del contacto                              ← vacío
 *
 * Con tipo de persona MORAL. O sea: un cliente que se llama como una señora y
 * cuya razón social es una empresa, y la señora sin aparecer por ningún lado
 * como lo que es —la persona por la que se pregunta al llamar—.
 *
 * Quién es el cliente y quién es la persona con la que se habló no son lo
 * mismo cuando el prospecto trae empresa. Sin empresa sí: el prospecto es la
 * persona y esa persona es el cliente.
 *
 * LO QUE ESTA PRUEBA VIGILA
 *
 * El reparto, en las dos direcciones. Es estructural —mira la pantalla— porque
 * el reparto vive ahí: el servidor sólo entrega el prospecto tal cual.
 * ============================================================================
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['frontend', '../frontend', 'claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

const PANTALLA = FRONTEND
  ? readFileSync(join(FRONTEND, 'app/dashboard/clientes/page.tsx'), 'utf8')
  : '';

/** El bloque que rellena el alta desde un prospecto, y sólo ése. */
const BLOQUE = (() => {
  const i = PANTALLA.indexOf("get('desdeProspecto')");
  return i < 0 ? '' : PANTALLA.slice(i, i + 2600);
})();

describe('el alta desde un prospecto reparte bien lo que sabe', () => {
  it('encuentra el árbol de frontend y el bloque, o truena', () => {
    expect(FRONTEND).toBeDefined();
    expect(BLOQUE).not.toBe('');
  });

  it('decide por la empresa, no por el nombre', () => {
    expect(BLOQUE).toMatch(/const esMoral = Boolean\(p\.empresa\);/);
    expect(BLOQUE).toMatch(/tipoPersona: esMoral \? 'MORAL' : 'FISICA'/);
  });

  it('con empresa: el cliente es la empresa', () => {
    /* El nombre comercial deja de ser el de la persona. */
    expect(BLOQUE).toMatch(/nombre: esMoral \? p\.empresa : \(p\.nombre \?\? ''\)/);
    expect(BLOQUE).toMatch(/razonSocial: esMoral \? p\.empresa : ''/);
    /* Y la forma vieja no vuelve. */
    expect(BLOQUE).not.toMatch(/nombre: p\.nombre \?\? '',\s*\n\s*razonSocial: p\.empresa/);
  });

  it('con empresa: la persona es el contacto, que es lo que quedaba vacío', () => {
    expect(BLOQUE).toMatch(/contactoNombre: esMoral \? \(p\.nombre \?\? ''\) : ''/);
    expect(BLOQUE).toMatch(/contactoTelefono: esMoral \? \(p\.telefono \?\? ''\) : ''/);
  });

  it('sin empresa no se inventa un contacto: el prospecto ES el cliente', () => {
    /*
     * Las dos ramas `: ''` de arriba son esto. Se comprueba aparte porque es
     * la mitad del arreglo que se olvida: dejar el contacto repitiendo al
     * propio cliente es ruido en todas las pantallas que lo enseñan.
     */
    const contacto = BLOQUE.match(/contactoNombre: esMoral \? \(p\.nombre \?\? ''\) : (.*)/);
    expect(contacto).not.toBeNull();
    expect(contacto![1].trim()).toBe("'',");
  });

  it('los datos siguen viajando por la API y NO por la barra de direcciones', () => {
    /*
     * El enlace lleva un id, no un nombre y un teléfono: acabarían en el
     * historial del navegador y en los registros del servidor. Esto ya estaba
     * y se vigila para que el arreglo de arriba no lo deshaga por comodidad.
     */
    expect(BLOQUE).toMatch(/fetch\(`\$\{api\}\/crm\/prospectos`/);
    const pipeline = readFileSync(
      join(FRONTEND!, 'app/dashboard/crm/pipeline/page.tsx'),
      'utf8',
    );
    expect(pipeline).toMatch(/desdeProspecto=\$\{encodeURIComponent\(porDarDeAlta\.id\)\}/);
    expect(pipeline).not.toMatch(/desdeProspecto=\$\{[^}]*nombre/);
  });

  it('ganar la oportunidad sigue nombrando lo que falta, y abriendo la puerta', () => {
    /*
     * La prueba de la prueba: todo lo de arriba sólo importa si alguien llega
     * a ese enlace. Si el aviso de «todavía no es cliente» desapareciera, el
     * reparto quedaría perfecto y nadie lo usaría nunca.
     */
    const pipeline = readFileSync(
      join(FRONTEND!, 'app/dashboard/crm/pipeline/page.tsx'),
      'utf8',
    );
    expect(pipeline).toContain('no se le puede facturar');
    expect(pipeline).toContain('Dar de alta el cliente');
  });
});
