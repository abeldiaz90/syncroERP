/**
 * ============================================================================
 * Los tres modos de contratación, medidos en el alta
 * ----------------------------------------------------------------------------
 * Abel pidió probar el alta de una empresa nueva en los tres casos: sólo ERP,
 * sólo el core, y ERP + core. La primera respuesta útil de esta prueba es que
 * LOS TRES NO SON TRES:
 *
 *  · **Sólo ERP** — la empresa nace con los dos ejes APAGADOS, no toca la
 *    reserva y ni se entera de que el core existe.
 *  · **ERP + core** — nace en SOMBRA/ESPEJO y consume un inquilino de la
 *    reserva dentro de la misma transacción que la crea.
 *  · **Sólo core** — NO EXISTE, y no por falta de trabajo. Una institución que
 *    sólo usa Fineract no es cliente del ERP: se le crea su inquilino en el
 *    core y opera con las pantallas del core. No hay nada que dar de alta aquí,
 *    y por eso esta consola no lo ofrece. Lo que sí hay que sostener es que
 *    nadie pueda crear por accidente el híbrido imposible —una empresa del ERP
 *    con la cartera en el core y sin ERP—, que es lo que mediría el tercer
 *    caso. `servicios.erp` es siempre `true` y esta prueba lo fija.
 *
 * Lo demás que se fija aquí salió de la misma revisión:
 *
 *  · El catálogo se siembra fuera de la transacción y ANTES su fallo sólo
 *    constaba en el registro del servidor: la consola contestaba «LISTO» y la
 *    empresa se quedaba sin productos de crédito. Ahora el alta lo devuelve.
 *  · La reserva devolvía la lista de inquilinos que el core conoce, a secas,
 *    para que alguien los volviera a teclear. Ahora devuelve el estado de cada
 *    uno y cuáles faltan por registrar, que es lo que permite a la consola
 *    ofrecerlo de un clic en vez de pedir que se escriba.
 * ============================================================================
 */

import { AltaEmpresasService } from './services/alta-empresas.service';
import { EstadoTenantReserva } from './entities/tenant-reserva.entity';
import { ModoCartera, ModoContabilidad } from './integracion.constants';

type Cualquiera = Record<string, unknown>;

describe('los tres modos de contratación', () => {
  describe('lo que el alta devuelve del catálogo', () => {
    /**
     * El servicio con lo justo para llegar al `.then` posterior a la
     * transacción, que es donde vive la siembra. La transacción se sustituye
     * por una que ejecuta el cuerpo con un gestor de mentira: lo que se mide
     * aquí es lo que pasa DESPUÉS, no el SQL.
     */
    function servicio(sembrar: () => Promise<number>) {
      const s = Object.create(AltaEmpresasService.prototype) as Cualquiera;
      s.empresas = { findOne: () => Promise.resolve(null) };
      s.usuarios = { createQueryBuilder: () => ({}) };
      s.auditoria = { registrar: () => Promise.resolve(undefined) };
      s.logger = { error: () => undefined, log: () => undefined };
      s.sembrarCatalogo = sembrar;
      s.ds = {
        transaction: (cuerpo: (em: Cualquiera) => Promise<unknown>) =>
          cuerpo({
            create: (_e: unknown, datos: Cualquiera) => datos,
            save: (datos: Cualquiera) => Promise.resolve({ id: 'emp-1', ...datos }),
            query: () => Promise.resolve([]),
            findOne: () => Promise.resolve(null),
          }),
      };
      return s as unknown as AltaEmpresasService;
    }

    const datos = {
      nombreComercial: 'EMPRESA DE PRUEBA',
      usaFineract: false,
      solicitadoPor: 'abel@suma.mx',
      administrador: null,
    };

    it('dice cuántos productos sembró', async () => {
      const s = servicio(() => Promise.resolve(4));
      const r = (await s.crear(datos)) as unknown as Cualquiera;
      expect(r.catalogo).toEqual({ sembrados: 4, error: null });
    });

    it('y dice que falló, en vez de devolver el alta como si nada', async () => {
      /*
       * Éste es el defecto. La empresa SÍ queda creada —deshacerla por un
       * catálogo dejaría un inquilino de la reserva consumido y perdido— pero
       * quien opera tiene que enterarse, porque el remedio es un botón y no
       * una visita a la base de datos.
       */
      const s = servicio(() => Promise.reject(new Error('la tabla no existe')));
      const r = (await s.crear(datos)) as unknown as {
        empresa: { id: string };
        catalogo: { sembrados: number; error: string | null };
      };
      expect(r.empresa.id).toBe('emp-1');
      expect(r.catalogo.sembrados).toBe(0);
      expect(r.catalogo.error).toMatch(/la tabla no existe/);
    });
  });

  describe('el inventario de la reserva', () => {
    function servicio(
      conocidos: string[] | Error,
      anotados: Array<Cualquiera>,
    ) {
      const s = Object.create(AltaEmpresasService.prototype) as Cualquiera;
      s.reserva = {
        count: ({ where }: { where: { estado: EstadoTenantReserva } }) =>
          Promise.resolve(
            anotados.filter((a) => a.estado === where.estado).length,
          ),
        find: () => Promise.resolve(anotados),
      };
      s.tenantsDelCore = () =>
        conocidos instanceof Error
          ? Promise.reject(conocidos)
          : Promise.resolve(conocidos);
      return s as unknown as AltaEmpresasService;
    }

    it('dice el estado de cada inquilino que el core conoce', async () => {
      const s = servicio(
        ['t001', 't002', 't003'],
        [
          { identificador: 't001', estado: EstadoTenantReserva.ASIGNADO, empresaId: 'e9' },
          { identificador: 't002', estado: EstadoTenantReserva.DISPONIBLE, empresaId: null },
        ],
      );
      const r = (await s.estadoReserva()) as unknown as {
        inventarioDelCore: Array<{ identificador: string; estado: string; empresaId: string | null }>;
        sinRegistrar: string[];
      };
      expect(r.inventarioDelCore).toEqual([
        { identificador: 't001', estado: 'ASIGNADO', empresaId: 'e9' },
        { identificador: 't002', estado: 'DISPONIBLE', empresaId: null },
        { identificador: 't003', estado: 'SIN_REGISTRAR', empresaId: null },
      ]);
      /*
       * Y sobre todo esto: los que la consola puede registrar de un clic. Sin
       * ello la pantalla imprimía los tres y alguien tenía que distinguir a ojo
       * cuál era el que faltaba —y teclearlo—.
       */
      expect(r.sinRegistrar).toEqual(['t003']);
    });

    it('si no se puede leer el registro del core, se dice, y no se inventa un inventario vacío', async () => {
      const s = servicio(new Error('la base maestra no responde'), []);
      const r = (await s.estadoReserva()) as unknown as {
        inventarioDelCore: unknown;
        sinRegistrar: string[];
        motivoRegistro: string | null;
      };
      /*
       * `null` y no `[]`: una lista vacía se lee como «el core no conoce
       * ninguno», que es una afirmación, y aquí no se sabe nada.
       */
      expect(r.inventarioDelCore).toBeNull();
      expect(r.sinRegistrar).toEqual([]);
      expect(r.motivoRegistro).toMatch(/no responde/);
    });
  });

  describe('qué escribe cada modo', () => {
    /** Lo que el alta guardó, por entidad, sin tocar base de datos. */
    function capturar(usaFineract: boolean, hayInquilino = true) {
      const guardado: Cualquiera[] = [];
      const s = Object.create(AltaEmpresasService.prototype) as Cualquiera;
      s.empresas = { findOne: () => Promise.resolve(null) };
      s.usuarios = {
        createQueryBuilder: () => ({
          leftJoinAndSelect: () => ({ where: () => ({ getOne: () => Promise.resolve(null) }) }),
        }),
      };
      s.auditoria = { registrar: () => Promise.resolve(undefined) };
      s.logger = { error: () => undefined };
      s.sembrarCatalogo = () => Promise.resolve(0);
      s.ds = {
        transaction: (cuerpo: (em: Cualquiera) => Promise<unknown>) =>
          cuerpo({
            create: (entidad: { name: string }, datos: Cualquiera) => ({
              __entidad: entidad?.name,
              ...datos,
            }),
            save: (datos: Cualquiera) => {
              guardado.push(datos);
              return Promise.resolve({ id: datos.id ?? 'emp-1', ...datos });
            },
            query: () =>
              Promise.resolve(hayInquilino ? [{ id: 'res-1' }] : []),
            findOne: () =>
              Promise.resolve({
                id: 'res-1',
                identificador: 't001',
                estado: EstadoTenantReserva.DISPONIBLE,
              }),
          }),
      };
      return {
        s: s as unknown as AltaEmpresasService,
        guardado,
        datos: {
          nombreComercial: 'EMPRESA DE PRUEBA',
          usaFineract,
          solicitadoPor: 'abel@suma.mx',
          administrador: null,
        },
      };
    }

    const configuracion = (guardado: Cualquiera[]) =>
      guardado.find((g) => g.modo !== undefined) as Cualquiera;

    it('sólo ERP: los dos ejes apagados y ningún inquilino consumido', async () => {
      const { s, guardado, datos } = capturar(false);
      const r = (await s.crear(datos)) as unknown as { tenant: string | null };
      const cfg = configuracion(guardado);
      expect(cfg.modo).toBe(ModoCartera.APAGADO);
      expect(cfg.modoContabilidad).toBe(ModoContabilidad.APAGADO);
      expect(cfg.parametrosProveedor).toEqual({});
      expect(r.tenant).toBeNull();
      // Nadie tocó la reserva.
      expect(guardado.some((g) => g.estado === EstadoTenantReserva.ASIGNADO)).toBe(false);
    });

    it('ERP + core: nace en SOMBRA con el espejo contable y toma un inquilino', async () => {
      const { s, guardado, datos } = capturar(true);
      const r = (await s.crear(datos)) as unknown as { tenant: string | null };
      const cfg = configuracion(guardado);
      expect(cfg.modo).toBe(ModoCartera.SOMBRA);
      expect(cfg.modoContabilidad).toBe(ModoContabilidad.ESPEJO);
      expect(cfg.parametrosProveedor).toEqual({ tenant: 't001' });
      expect(r.tenant).toBe('t001');
      const inquilino = guardado.find((g) => g.identificador === 't001') as Cualquiera;
      expect(inquilino.estado).toBe(EstadoTenantReserva.ASIGNADO);
      // Queda dicho a petición de quién, que es lo que hace auditable el alta.
      expect(String(inquilino.nota)).toMatch(/abel@suma\.mx/);
    });

    it('sin inquilinos libres se niega ENTERA: ninguna empresa a medias', async () => {
      /*
       * El motivo por el que todo esto vive en una transacción. Una empresa que
       * dice usar el registro externo y no tiene inquilino se ve dada de alta y
       * falla al primer crédito.
       */
      const { s, datos } = capturar(true, false);
      await expect(s.crear(datos)).rejects.toThrow(/reserva/i);
    });
  });

  describe('una empresa que espeja contabilidad y no cartera', () => {
    /*
     * Los dos ejes son independientes por diseño: hay quien contrata el
     * registro externo SÓLO para el espejo contable. La consola preguntaba por
     * la cartera y nada más, así que una empresa así salía como «sólo ERP»
     * —teniendo inquilino asignado y publicando pólizas— y su lista decía «No
     * aplica: opera sólo con el ERP» en el mismo renglón donde la fila enseñaba
     * su inquilino. Dos afirmaciones contrarias a la vez.
     *
     * No hace falta un cliente raro para llegar ahí: basta con que una empresa
     * ERP+core baje su cartera a APAGADO mientras concilia.
     */
    function conConfig(cfg: Cualquiera, tenant: Cualquiera | null = null) {
      const s = Object.create(AltaEmpresasService.prototype) as Cualquiera;
      s.empresas = {
        findOne: () => Promise.resolve({ id: 'e1', nombreComercial: 'X', rfc: null, activo: true }),
      };
      s.configs = { findOne: () => Promise.resolve(cfg) };
      s.reserva = {
        findOne: () => Promise.resolve(tenant),
        count: () => Promise.resolve(0),
      };
      s.productos = { find: () => Promise.resolve([{ id: 'p1' }]) };
      s.usuarios = { find: () => Promise.resolve([]) };
      return s as unknown as AltaEmpresasService;
    }

    const leer = async (s: AltaEmpresasService) =>
      (await s.estado('e1')) as unknown as {
        servicios: { fineract: boolean };
        puntos: Array<{ clave: string; listo: boolean; detalle: string; accion: string | null }>;
      };

    it('se reconoce como empresa del core aunque su cartera esté apagada', async () => {
      const r = await leer(
        conConfig(
          { modo: ModoCartera.APAGADO, modoContabilidad: ModoContabilidad.ESPEJO },
          { identificador: 't001' },
        ),
      );
      expect(r.servicios.fineract).toBe(true);
      const inquilino = r.puntos.find((p) => p.clave === 'tenant')!;
      // Y su inquilino cuenta, en vez de darse por «no aplica».
      expect(inquilino.detalle).toMatch(/t001/);
      expect(inquilino.listo).toBe(true);
    });

    it('y no se le ordena subir una cartera que no contrató', async () => {
      const r = await leer(
        conConfig({ modo: ModoCartera.APAGADO, modoContabilidad: ModoContabilidad.ESPEJO }),
      );
      const conciliacion = r.puntos.find((p) => p.clave === 'conciliacion')!;
      expect(conciliacion.listo).toBe(true);
      expect(conciliacion.accion).toBeNull();
      expect(conciliacion.detalle).toMatch(/espeja contabilidad y NO cartera/i);
    });

    it('con los dos ejes apagados sigue siendo una empresa de sólo ERP', async () => {
      const r = await leer(
        conConfig({ modo: ModoCartera.APAGADO, modoContabilidad: ModoContabilidad.APAGADO }),
      );
      expect(r.servicios.fineract).toBe(false);
      expect(r.puntos.find((p) => p.clave === 'tenant')!.detalle).toMatch(/sólo con el ERP/);
    });
  });

  describe('un consejo que no tenía puerta', () => {
    /*
     * «Reponer la reserva en la próxima ventana de mantenimiento y asignar
     * uno», decía la lista de pendientes de una empresa que contrató el core y
     * no tiene inquilino. Reponer la reserva sí se podía; ASIGNAR UNO no: la
     * reserva sólo entregaba dentro del alta, y esta instalación tiene una
     * empresa —SUMA Local, en SOMBRA y sin inquilino— que no podía salir de ese
     * estado salvo escribiendo en la base a mano.
     */
    function servicio(opciones: {
      modo: ModoCartera;
      yaTiene?: Cualquiera | null;
      hayLibre?: boolean;
    }) {
      const guardado: Cualquiera[] = [];
      /*
       * A QUIÉN SE LE AVISA. Este doble se quedó corto en cuanto
       * `asignarInquilino` empezó a invalidar el caché del contexto, y se puso
       * rojo con «Cannot read properties of undefined» — que es la forma BUENA
       * de que un doble se quede atrás: ruidosa. Se anota la llamada en vez de
       * ignorarla, porque es justo lo que hay que comprobar.
       */
      const invalidados: Array<string | undefined> = [];
      const s = Object.create(AltaEmpresasService.prototype) as Cualquiera;
      s.inquilinos = { invalidar: (id?: string) => invalidados.push(id) };
      s.empresas = {
        findOne: () => Promise.resolve({ id: 'e1', nombreComercial: 'SUMA Local' }),
      };
      s.configs = { findOne: () => Promise.resolve({ modo: opciones.modo }) };
      s.reserva = { findOne: () => Promise.resolve(opciones.yaTiene ?? null) };
      s.auditoria = { registrar: () => Promise.resolve(undefined) };
      s.ds = {
        transaction: (cuerpo: (em: Cualquiera) => Promise<unknown>) =>
          cuerpo({
            query: () => Promise.resolve(opciones.hayLibre === false ? [] : [{ id: 'res-1' }]),
            findOne: (entidad: { name: string }) =>
              Promise.resolve(
                entidad?.name === 'TenantReserva'
                  ? { id: 'res-1', identificador: 't007' }
                  : { empresaId: 'e1', parametrosProveedor: { otro: 1 } },
              ),
            save: (datos: Cualquiera) => {
              guardado.push(datos);
              return Promise.resolve(datos);
            },
          }),
      };
      return { s: s as unknown as AltaEmpresasService, guardado, invalidados };
    }

    it('entrega el inquilino y lo escribe TAMBIÉN en la configuración', async () => {
      const { s, guardado } = servicio({ modo: ModoCartera.SOMBRA });
      const r = (await s.asignarInquilino('e1', 'abel@suma.mx')) as unknown as {
        tenant: string;
      };
      expect(r.tenant).toBe('t007');

      const inquilino = guardado.find((g) => g.identificador === 't007') as Cualquiera;
      expect(inquilino.estado).toBe(EstadoTenantReserva.ASIGNADO);
      expect(inquilino.empresaId).toBe('e1');

      /*
       * Lo que de verdad importa: el despachador lee el inquilino de la
       * CONFIGURACIÓN, no de la reserva. Anotar sólo la reserva dejaría a la
       * empresa publicando sin inquilino, que es el estado del que venimos.
       */
      const cfg = guardado.find((g) => g.parametrosProveedor !== undefined) as Cualquiera;
      expect(cfg.parametrosProveedor).toEqual({ otro: 1, tenant: 't007' });
    });

    it('y avisa al contexto, para que no siga creyendo que no tiene', async () => {
      /*
       * EL CACHÉ NO SE ENTERA SOLO. `ContextoInquilinoService` guarda por un
       * minuto el inquilino de cada empresa y el reparto de empresas por
       * inquilino. Sin este aviso, la empresa que acaba de estrenar inquilino
       * sigue pareciendo durante ese minuto una empresa sin él.
       *
       * Antes eso significaba escribir en el inquilino global —el libro de
       * otra—. Ahora, con el control de mezcla, significa además que el ERP
       * puede negarse a operar justo después de que alguien arreglara la
       * configuración desde la consola: el peor momento posible para dar un
       * error que ya no es cierto.
       */
      const { s, invalidados } = servicio({ modo: ModoCartera.SOMBRA });
      await s.asignarInquilino('e1', 'abel@suma.mx');
      expect(invalidados).toEqual(['e1']);
    });

    it('no le da inquilino a quien no contrató el core', async () => {
      const { s, guardado } = servicio({ modo: ModoCartera.APAGADO });
      await expect(s.asignarInquilino('e1', 'abel@suma.mx')).rejects.toThrow(
        /no tiene contratado/i,
      );
      expect(guardado).toHaveLength(0);
    });

    it('no cambia el inquilino de quien ya tiene uno', async () => {
      const { s, guardado } = servicio({
        modo: ModoCartera.SOMBRA,
        yaTiene: { identificador: 't001' },
      });
      await expect(s.asignarInquilino('e1', 'abel@suma.mx')).rejects.toThrow(/t001/);
      expect(guardado).toHaveLength(0);
    });

    it('con la reserva vacía dice lo que hay que hacer, que no es pulsar otra vez', async () => {
      const { s } = servicio({ modo: ModoCartera.SOMBRA, hayLibre: false });
      await expect(s.asignarInquilino('e1', 'abel@suma.mx')).rejects.toThrow(
        /ventana de mantenimiento/i,
      );
    });
  });

  describe('no hay alta de «sólo el core»', () => {
    it('toda empresa dada de alta aquí usa el ERP', async () => {
      const s = Object.create(AltaEmpresasService.prototype) as Cualquiera;
      s.empresas = {
        findOne: () => Promise.resolve({ id: 'e1', nombreComercial: 'X', rfc: null, activo: true }),
      };
      s.configs = { findOne: () => Promise.resolve({ modo: ModoCartera.SOMBRA }) };
      s.reserva = { findOne: () => Promise.resolve(null), count: () => Promise.resolve(0) };
      s.productos = { find: () => Promise.resolve([]) };
      s.usuarios = { find: () => Promise.resolve([]) };
      const r = (await (s as unknown as AltaEmpresasService).estado('e1')) as unknown as {
        servicios: { erp: boolean };
      };
      /*
       * No es una constante por pereza: es la afirmación de que esta consola da
       * de alta CLIENTES DEL ERP. Una institución que sólo quiere el core se
       * aprovisiona en el core y no pasa por aquí. Si algún día `erp` puede ser
       * falso, esta prueba obliga a pensar qué significa una empresa del ERP
       * sin ERP antes de escribirlo.
       */
      expect(r.servicios.erp).toBe(true);
    });
  });
});
