import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ============================================================================
 * El enlace que no llevaba al prospecto
 * ----------------------------------------------------------------------------
 * MEDIDO EL 28-SEP-2026, por pantalla, con la sesión de `empleado`
 *
 * Se recorrió el embudo entero: prospecto nuevo —Ing. Marta Salgado,
 * Constructora Cerro Alto—, oportunidad OPP-000003 por $18,500, y de Prospecto
 * a Contactado, a Propuesta, a Ganada.
 *
 * Al ganar, el CRM hace lo correcto y lo hace bien: no finge que el cliente
 * existe, lo dice con nombre y ofrece el paso siguiente.
 *
 *     «Falta dar de alta a Ing. Marta Salgado (Constructora Cerro Alto) como
 *      cliente. La oportunidad quedó ganada, pero el prospecto todavía no es
 *      cliente: sin RFC, régimen fiscal y domicilio no se le puede facturar.
 *      El alta los pide.»   → [Dar de alta el cliente]
 *
 * Y el enlace era `href="/dashboard/clientes"` a secas. Dejaba en la cartera,
 * con el formulario por abrir y el nombre, la empresa y el teléfono —que el ERP
 * acababa de capturar— por volver a teclear.
 *
 * El riesgo no es la molestia. Es que se teclee distinto: «Marta Salgado» en el
 * cliente y «Ing. Marta Salgado» en el prospecto, y queden dos fichas que ya
 * nadie puede emparejar. Que es exactamente lo que el aviso existe para evitar.
 *
 * CÓMO VIAJA: el ID por la dirección, los DATOS por la API. Un nombre y un
 * teléfono en la barra de direcciones acaban en el historial del navegador y en
 * los registros del servidor, y no hay ninguna razón para ponerlos ahí cuando
 * la pantalla de destino puede pedirlos con la sesión de quien mira.
 * ============================================================================
 */

const RAIZ = join(__dirname, '..', '..', '..');
const FRONTEND = ['claude/frontend', 'frontend', '../claude/frontend']
  .map((nombre) => join(RAIZ, nombre))
  .find((ruta) => existsSync(join(ruta, 'app/dashboard/module-config.ts')));

const describeSiHayFrontend = FRONTEND ? describe : describe.skip;

describeSiHayFrontend('CRM · del embudo al alta de cliente', () => {
  const pipeline = () =>
    readFileSync(join(FRONTEND!, 'app/dashboard/crm/pipeline/page.tsx'), 'utf8');
  const clientes = () =>
    readFileSync(join(FRONTEND!, 'app/dashboard/clientes/page.tsx'), 'utf8');

  it('el aviso sigue existiendo: ganar no da por hecho el cliente', () => {
    expect(pipeline()).toMatch(/Falta dar de alta a/);
  });

  it('el enlace lleva al prospecto, no sólo a la lista', () => {
    expect(pipeline()).toMatch(/desdeProspecto=/);
  });

  it('por la dirección viaja el id, nunca el nombre ni el teléfono', () => {
    const texto = pipeline();
    const inicio = texto.indexOf('/dashboard/clientes?');
    expect(inicio).toBeGreaterThan(-1);
    const enlace = texto.slice(inicio, texto.indexOf('`', inicio + 1) + 1);

    expect(enlace).toMatch(/porDarDeAlta\.id/);
    expect(enlace).not.toMatch(/nombre|telefono|correo|empresa/);
  });

  it('la pantalla de clientes recoge el prospecto y abre el alta con lo que se sabe', () => {
    const texto = clientes();
    expect(texto).toMatch(/desdeProspecto/);
    expect(texto).toMatch(/crm\/prospectos/);
    expect(texto).toMatch(/setModal\(true\)/);
  });

  it('lo que falta lo sigue pidiendo el formulario', () => {
    /*
     * El alta se abre con nombre, empresa y contacto. RFC, régimen fiscal y
     * domicilio NO se inventan: son justo lo que el aviso del CRM dice que
     * hace falta para poder facturar.
     */
    const texto = clientes();
    const inicio = texto.indexOf('desdeProspecto');
    const bloque = texto.slice(inicio, inicio + 2000);

    expect(bloque).toMatch(/nombre:/);
    expect(bloque).toMatch(/telefono:/);
    expect(bloque).not.toMatch(/\brfc:\s*p\./);
  });
});
