/**
 * ============================================================================
 * Un arranque que releía el mundo entero
 * ----------------------------------------------------------------------------
 * LO QUE PASABA
 *
 * `CatalogosGeograficosService` corre en cada arranque y le pasaba a `save()`
 * las 250 filas de países y las 4,963 de subdivisiones, cambiaran o no.
 *
 * TypeORM no emitía ni un `UPDATE` cuando nada había cambiado —hasta ahí,
 * bien—, pero para saberlo recarga cada lote de la base. Con `chunk: 100`, eso
 * son unos cincuenta
 *
 *     SELECT … FROM "estados" WHERE "Estado"."id" IN ($1 … $100)
 *
 * en fila. En el registro de arranque que Abel pegó el 1-oct-2026, diez de
 * esos `SELECT` tardaron entre 2.0 y 2.4 segundos cada uno: alrededor de
 * veinte segundos de arranque gastados en releer un catálogo intacto, para no
 * escribir nada.
 *
 * El `DeprecationWarning` de `pg` que salía en el mismo registro —«client.query()
 * when the client is already executing a query»— venía del mismo sitio: lo
 * produce `save()` al partir en lotes.
 *
 * CÓMO SE MIDIÓ
 *
 * Contra un PostgreSQL de verdad, con el catálogo ya puesto: 55 consultas por
 * arranque antes, 2 después. Primer arranque con la base vacía: llena las
 * 250/4,963 y luego vuelve a 2.
 *
 * QUÉ VIGILA ESTA PRUEBA
 *
 * Lo que importa no es la cifra de consultas —depende de TypeORM— sino la
 * decisión: **cuando nada cambió, no se llama a `save()`**. Y la contraparte,
 * que es la que impide «arreglarlo» no escribiendo nunca: cuando una fila
 * difiere, se escribe esa fila, y sólo esa.
 *
 * Se prueba con dobles de repositorio y sin base de datos, para que corra en
 * cada `npm test` en vez de ser la prueba que todo el mundo se salta.
 * ============================================================================
 */
import { CatalogosGeograficosService } from './services/catalogos-geograficos.service';
import { Country, State } from 'country-state-city';

type Fila = Record<string, any>;

/**
 * Un repositorio de mentira que recuerda lo que se le guardó y cuenta las
 * veces que se le pidió guardar.
 */
class RepoFalso {
  public filas: Fila[] = [];
  public llamadasASave = 0;
  public filasEscritas = 0;
  private siguienteId = 1;

  constructor(private readonly nombre: string) {}

  create(datos: Fila): Fila {
    return { ...datos };
  }

  async find(): Promise<Fila[]> {
    /* Copias, como haría la base: el servicio no debe poder mutar lo guardado. */
    return this.filas.map((f) => ({ ...f }));
  }

  async save(entidades: Fila[]): Promise<Fila[]> {
    this.llamadasASave++;
    this.filasEscritas += entidades.length;
    for (const entidad of entidades) {
      if (!entidad.id) {
        entidad.id = `${this.nombre}-${this.siguienteId++}`;
        this.filas.push({ ...entidad });
      } else {
        const i = this.filas.findIndex((f) => f.id === entidad.id);
        if (i >= 0) this.filas[i] = { ...entidad };
        else this.filas.push({ ...entidad });
      }
    }
    return entidades;
  }
}

const nuevoServicio = () => {
  const paises = new RepoFalso('pais');
  const estados = new RepoFalso('estado');
  const servicio = new CatalogosGeograficosService(
    paises as any,
    estados as any,
  );
  /* El logger escribe en la consola en cada vuelta; aquí no aporta. */
  (servicio as any).logger = {
    log: () => undefined,
    error: () => undefined,
    warn: () => undefined,
  };
  return { servicio, paises, estados };
};

const cuantosPaises = Country.getAllCountries().length;
const cuantasSubdivisiones = Country.getAllCountries().reduce(
  (suma, pais) => suma + State.getStatesOfCountry(pais.isoCode).length,
  0,
);

describe('El catálogo geográfico no se reescribe en cada arranque', () => {
  it('el primer arranque llena la base', async () => {
    const { servicio, paises, estados } = nuevoServicio();
    const resultado = await servicio.sincronizar();

    expect(paises.filas).toHaveLength(cuantosPaises);
    expect(estados.filas).toHaveLength(cuantasSubdivisiones);
    expect(resultado.paisesEscritos).toBe(cuantosPaises);
    expect(resultado.estadosEscritos).toBe(cuantasSubdivisiones);
    /* Y el catálogo no está vacío, para que las demás pruebas midan algo. */
    expect(cuantosPaises).toBeGreaterThan(100);
    expect(cuantasSubdivisiones).toBeGreaterThan(1000);
  });

  it('el segundo arranque no llama a save() ni una vez', async () => {
    const { servicio, paises, estados } = nuevoServicio();
    await servicio.sincronizar();

    paises.llamadasASave = 0;
    estados.llamadasASave = 0;
    const resultado = await servicio.sincronizar();

    /*
     * Ésta es la prueba. Antes aquí había una llamada con 250 filas y otra con
     * 4,963, y la base releía cincuenta lotes para concluir que no había nada
     * que hacer.
     */
    expect(paises.llamadasASave).toBe(0);
    expect(estados.llamadasASave).toBe(0);
    expect(resultado.paisesEscritos).toBe(0);
    expect(resultado.estadosEscritos).toBe(0);
    /* Y sigue informando el total, no sólo lo escrito. */
    expect(resultado.paises).toBe(cuantosPaises);
    expect(resultado.estados).toBe(cuantasSubdivisiones);
  });

  it('un tercer y cuarto arranque tampoco escriben, y la tabla no crece', async () => {
    const { servicio, paises, estados } = nuevoServicio();
    await servicio.sincronizar();
    await servicio.sincronizar();
    await servicio.sincronizar();
    const resultado = await servicio.sincronizar();

    expect(resultado.estadosEscritos).toBe(0);
    /*
     * Que no crezca importa aparte: si la clave de búsqueda no coincidiera con
     * la de escritura, cada arranque insertaría el catálogo otra vez y nadie
     * lo notaría hasta que el desplegable tuviera cuatro «Nuevo León».
     */
    expect(paises.filas).toHaveLength(cuantosPaises);
    expect(estados.filas).toHaveLength(cuantasSubdivisiones);
  });

  it('una subdivisión con el nombre cambiado se corrige, y sólo ésa', async () => {
    const { servicio, estados } = nuevoServicio();
    await servicio.sincronizar();

    const victima = estados.filas.find((f) => f.codigo)!;
    const nombreBueno = victima.nombre;
    victima.nombre = 'Nombre Equivocado';

    estados.llamadasASave = 0;
    estados.filasEscritas = 0;
    const resultado = await servicio.sincronizar();

    expect(resultado.estadosEscritos).toBe(1);
    expect(estados.filasEscritas).toBe(1);
    expect(estados.filas.find((f) => f.id === victima.id)!.nombre).toBe(
      nombreBueno,
    );
    expect(estados.filas).toHaveLength(cuantasSubdivisiones);
  });

  it('un país desactivado a mano vuelve a activo, y sólo ése', async () => {
    const { servicio, paises } = nuevoServicio();
    await servicio.sincronizar();

    const victima = paises.filas[0];
    victima.activo = false;

    paises.filasEscritas = 0;
    const resultado = await servicio.sincronizar();

    expect(resultado.paisesEscritos).toBe(1);
    expect(paises.filasEscritas).toBe(1);
    expect(paises.filas.find((f) => f.id === victima.id)!.activo).toBe(true);
  });

  it('una fila a la que le falta una columna opcional se reconoce igual', async () => {
    /*
     * Una base vieja puede tener la columna en NULL donde el candidato arma
     * `null`, o traer la propiedad ausente. Si eso contara como diferencia, el
     * «no escribas si no cambió» no serviría de nada: escribiría siempre.
     */
    const { servicio, estados } = nuevoServicio();
    await servicio.sincronizar();
    for (const fila of estados.filas) delete fila.tipo;

    const resultado = await servicio.sincronizar();
    expect(resultado.estadosEscritos).toBe(0);
  });

  it('la cadena vacía no se confunde con el nulo', async () => {
    /*
     * El contrapeso de la prueba anterior: `??` trata `undefined` y `null`
     * como lo mismo, que es lo que hace falta, pero `''` es un valor que
     * alguien escribió y que no es el que toca. Con `||` en lugar de `??`
     * pasaría inadvertido.
     */
    const { servicio, estados } = nuevoServicio();
    await servicio.sincronizar();
    const victima = estados.filas.find((f) => f.codigo)!;
    victima.tipo = '';

    const resultado = await servicio.sincronizar();
    expect(resultado.estadosEscritos).toBe(1);
    expect(estados.filas.find((f) => f.id === victima.id)!.tipo).toBeNull();
  });

  it('el catálogo real no produce códigos repetidos dentro de un país', async () => {
    const { servicio, estados } = nuevoServicio();
    await servicio.sincronizar();

    for (const fila of estados.filas) {
      if (fila.codigo !== null)
        expect(fila.codigo.length).toBeLessThanOrEqual(10);
    }
    const claves = new Set(estados.filas.map((f) => `${f.paisId}|${f.codigo}`));
    expect(claves.size).toBe(estados.filas.length);
  });

  it('un código más largo que la columna sigue reconociéndose en el segundo arranque', async () => {
    /*
     * ======================================================================
     * EL DEFECTO QUE NO MORDÍA TODAVÍA
     * ----------------------------------------------------------------------
     * La búsqueda de la fila existente usaba el `isoCode` completo y la
     * escritura su recorte a diez caracteres —el largo de la columna—. Con el
     * catálogo de hoy no mordía: la subdivisión de código más largo tiene
     * cinco caracteres («UA-40», en RU). Bastaba una de once para que la fila
     * guardada no se reconociera nunca y se intentara insertar de nuevo en
     * cada arranque, hasta chocar con el índice único o llenar el desplegable
     * de repetidos.
     *
     * Por eso esta prueba no usa el catálogo real: lo sustituye por uno con
     * un código largo. Comprobar la invariante sobre los datos de hoy no
     * habría distinguido el código bueno del malo —lo intenté y el mutante
     * sobrevivió—, y una prueba que no puede fallar no está vigilando nada.
     * ======================================================================
     */
    const unPais = {
      isoCode: 'ZZ',
      name: 'Zedlandia',
      phonecode: '999',
      currency: 'ZZD',
    };
    const unaSubdivision = {
      isoCode: 'ZZ-LARGUISIMO',
      name: 'Provincia Larga',
    };

    const todosLosPaises = jest
      .spyOn(Country, 'getAllCountries')
      .mockReturnValue([unPais] as any);
    const subdivisiones = jest
      .spyOn(State, 'getStatesOfCountry')
      .mockReturnValue([unaSubdivision] as any);
    try {
      const { servicio, estados } = nuevoServicio();
      await servicio.sincronizar();
      expect(estados.filas).toHaveLength(1);
      expect(estados.filas[0].codigo).toBe('ZZ-LARGUIS'); // recortado a la columna

      const resultado = await servicio.sincronizar();
      expect(resultado.estadosEscritos).toBe(0);
      expect(estados.filas).toHaveLength(1);
    } finally {
      todosLosPaises.mockRestore();
      subdivisiones.mockRestore();
    }
  });
});
