import {
  BadRequestException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import {
  NAVEGABLE_KEY,
  NavegableMeta,
} from '../decorators/navegable.decorator';
import { Controlador } from '../entities/controlador.entity';
import { Endpoint } from '../entities/endpoint.entity';
import { RolEndpointPermiso } from '../entities/rol-endpoint-permiso.entity';
import { PLANTILLAS_PERMISOS } from '../data/plantillas-permisos';
import { ROLES_ASIGNABLES } from '../utils/roles-catalogo';
import {
  AccesoModulo,
  MODULOS_NEGOCIO,
  MODULOS_POR_ID,
  MODULO_OTROS,
  moduloDeRuta,
} from '../data/modulos-catalogo';
import { ENDPOINTS_NAVEGABLES } from '../data/endpoints-navegables';
import { esRolAdministrador, normalizarRol } from '../utils/roles.util';
import { SKIP_PERMISOS_KEY } from '../decorators/skip-permisos.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * El enum `RequestMethod` de NestJS, tal cual. Estaba mal: tenia 3 como PATCH
 * y 4 como DELETE, y en NestJS es al reves (DELETE=3, PATCH=4).
 *
 * No era un detalle cosmetico. Cada handler `@Patch` quedaba registrado como
 * DELETE y cada `@Delete` como PATCH, y `verificarPermiso()` busca el endpoint
 * por metodo + ruta y NIEGA cuando no lo encuentra. Resultado: ninguna ruta
 * PATCH o DELETE del ERP era ejecutable por un rol que no fuera admin, por
 * mucho que se le concediera el permiso en pantalla -- aprobar una cotizacion,
 * recibir una orden de compra, cambiar el estado de una requisicion. Nadie lo
 * noto porque el unico usuario real es admin, y admin salta la tabla entera.
 *
 * Al corregirlo, la sincronizacion descubre las filas correctas y desactiva
 * las equivocadas; `migrarPermisosDeMetodosIntercambiados()` se lleva los
 * permisos de unas a otras para que nadie pierda accesos ya configurados.
 */
const METHOD_MAP: Record<number, string> = {
  0: 'GET',
  1: 'POST',
  2: 'PUT',
  3: 'DELETE',
  4: 'PATCH',
  5: 'ALL',
  6: 'OPTIONS',
  7: 'HEAD',
};

const PREFIJOS_SISTEMA = new Set(['api', 'iam', '', 'app']);

interface ModuloMeta {
  titulo: string;
  icono: string;
  seccion: string;
  orden: number;
  rutaFrontendBase: string;
}

// Estos diccionarios actúan SOLO como valores por defecto iniciales
const MODULOS_META: Record<string, ModuloMeta> = {
  ventas: {
    titulo: 'Ventas',
    icono: 'ShoppingBag',
    seccion: 'Operaciones',
    orden: 1,
    rutaFrontendBase: '/dashboard/ventas',
  },
  pos: {
    titulo: 'Punto de Venta',
    icono: 'ShoppingBag',
    seccion: 'Operaciones',
    orden: 2,
    rutaFrontendBase: '/dashboard/ventas/pos',
  },
  requisiciones: {
    titulo: 'Compras',
    icono: 'ShoppingCart',
    seccion: 'Operaciones',
    orden: 3,
    rutaFrontendBase: '/dashboard/compras',
  },
  cotizaciones: {
    titulo: 'Compras',
    icono: 'ShoppingCart',
    seccion: 'Operaciones',
    orden: 4,
    rutaFrontendBase: '/dashboard/compras',
  },
  ordenes: {
    titulo: 'Compras',
    icono: 'ShoppingCart',
    seccion: 'Operaciones',
    orden: 5,
    rutaFrontendBase: '/dashboard/compras',
  },
  aprobaciones: {
    titulo: 'Aprobaciones',
    icono: 'ShieldCheck',
    seccion: 'Operaciones',
    orden: 6,
    rutaFrontendBase: '/dashboard/aprobaciones',
  },
  clientes: {
    titulo: 'Clientes',
    icono: 'Users',
    seccion: 'Catálogos Core',
    orden: 10,
    rutaFrontendBase: '/dashboard/clientes',
  },
  proveedores: {
    titulo: 'Proveedores',
    icono: 'Truck',
    seccion: 'Catálogos Core',
    orden: 11,
    rutaFrontendBase: '/dashboard/proveedores',
  },
  productos: {
    titulo: 'Inventario',
    icono: 'Package',
    seccion: 'Catálogos Core',
    orden: 20,
    rutaFrontendBase: '/dashboard/productos',
  },
  catalogo: {
    titulo: 'Inventario',
    icono: 'Package',
    seccion: 'Catálogos Core',
    orden: 20,
    rutaFrontendBase: '/dashboard/productos',
  },
  categorias: {
    titulo: 'Inventario',
    icono: 'Package',
    seccion: 'Catálogos Core',
    orden: 21,
    rutaFrontendBase: '/dashboard/categorias',
  },
  marcas: {
    titulo: 'Inventario',
    icono: 'Package',
    seccion: 'Catálogos Core',
    orden: 22,
    rutaFrontendBase: '/dashboard/marcas',
  },
  almacenes: {
    titulo: 'Inventario',
    icono: 'Package',
    seccion: 'Catálogos Core',
    orden: 23,
    rutaFrontendBase: '/dashboard/almacenes',
  },
  inventario: {
    titulo: 'Inventario',
    icono: 'Package',
    seccion: 'Catálogos Core',
    orden: 24,
    rutaFrontendBase: '/dashboard/inventario',
  },
  recepciones: {
    titulo: 'Inventario',
    icono: 'Package',
    seccion: 'Catálogos Core',
    orden: 25,
    rutaFrontendBase: '/dashboard/inventario/recepciones',
  },
  impuestos: {
    titulo: 'Finanzas & Loc.',
    icono: 'CircleDollarSign',
    seccion: 'Sistema',
    orden: 30,
    rutaFrontendBase: '/dashboard/impuestos',
  },
  bancos: {
    titulo: 'Finanzas & Loc.',
    icono: 'CircleDollarSign',
    seccion: 'Sistema',
    orden: 31,
    rutaFrontendBase: '/dashboard/catalogos/bancos',
  },
  catalogos: {
    titulo: 'Finanzas & Loc.',
    icono: 'CircleDollarSign',
    seccion: 'Sistema',
    orden: 32,
    rutaFrontendBase: '/dashboard/catalogos',
  },
  'listas-precio': {
    titulo: 'Finanzas & Loc.',
    icono: 'CircleDollarSign',
    seccion: 'Sistema',
    orden: 33,
    rutaFrontendBase: '/dashboard/listas-precio',
  },
  usuarios: {
    titulo: 'Administración',
    icono: 'Settings',
    seccion: 'Sistema',
    orden: 40,
    rutaFrontendBase: '/dashboard/usuarios',
  },
  departamentos: {
    titulo: 'Administración',
    icono: 'Settings',
    seccion: 'Sistema',
    orden: 41,
    rutaFrontendBase: '/dashboard/departamentos',
  },
  permisos: {
    titulo: 'Administración',
    icono: 'Settings',
    seccion: 'Sistema',
    orden: 42,
    rutaFrontendBase: '/dashboard/permisos',
  },
  admin: {
    titulo: 'Administración',
    icono: 'Settings',
    seccion: 'Sistema',
    orden: 43,
    rutaFrontendBase: '/dashboard/permisos',
  },
  'configuraciones-aprobacion': {
    titulo: 'Administración',
    icono: 'Settings',
    seccion: 'Sistema',
    orden: 44,
    rutaFrontendBase: '/dashboard/configuraciones-aprobacion',
  },
};

interface EndpointNavMeta {
  rutaFrontend: string;
  titulo: string;
  ordenMenu: number;
}



@Injectable()
export class PermisosDinamicosService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermisosDinamicosService.name);
  private readonly cacheTtlMs = 30_000;
  private readonly cacheMaxEntradas = 5_000;
  private cache = new Map<string, { permitido: boolean; expiraEn: number }>();

  constructor(
    @InjectRepository(Controlador)
    private controladorRepo: Repository<Controlador>,
    @InjectRepository(Endpoint) private endpointRepo: Repository<Endpoint>,
    @InjectRepository(RolEndpointPermiso)
    private permisoRepo: Repository<RolEndpointPermiso>,
    private readonly modulesContainer: ModulesContainer,
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  async onApplicationBootstrap() {
    await this.sincronizarControladoresYEndpoints();
  }

  async sincronizarControladoresYEndpoints() {
    this.logger.log('Sincronizando controladores y endpoints...');
    await this.limpiarMetodosNumericos();

    const descubiertos = new Map<
      string,
      {
        nombreModulo: string;
        endpoints: Array<{
          metodo: string;
          ruta: string;
          nombre: string;
          navDecorador?: NavegableMeta;
        }>;
      }
    >();

    // 1. DESCUBRIMIENTO DE RUTAS...
    for (const [, modulo] of this.modulesContainer.entries()) {
      for (const [, wrapper] of (modulo as any).controllers) {
        const instance = wrapper.instance;
        if (!instance) continue;

        const metatype = wrapper.metatype;
        const controladorPath: string =
          Reflect.getMetadata(PATH_METADATA, metatype) || '';
        const rutaBase =
          ('/' + controladorPath).replace(/\/+/g, '/').replace(/\/$/, '') ||
          '/';

        const partes = rutaBase.replace(/^\//, '').split('/');
        const nombreModulo =
          partes.find((p) => !PREFIJOS_SISTEMA.has(p) && !p.startsWith(':')) ||
          'general';

        if (!descubiertos.has(rutaBase)) {
          descubiertos.set(rutaBase, { nombreModulo, endpoints: [] });
        }

        const entrada = descubiertos.get(rutaBase);
        const prototype = Object.getPrototypeOf(instance);

        for (const key of Object.getOwnPropertyNames(prototype)) {
          if (key === 'constructor') continue;
          const metodoNum: number = Reflect.getMetadata(
            METHOD_METADATA,
            prototype[key],
          );
          const rutaHandler: string =
            Reflect.getMetadata(PATH_METADATA, prototype[key]) || '';
          if (metodoNum === undefined || metodoNum === null) continue;

          const esPublico = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [prototype[key], metatype],
          );
          const omitePermisos = this.reflector.getAllAndOverride<boolean>(
            SKIP_PERMISOS_KEY,
            [prototype[key], metatype],
          );
          if (esPublico || omitePermisos) continue;

          const metodoStr = METHOD_MAP[metodoNum];
          if (!metodoStr || metodoStr === 'ALL') continue;

          const rutaCompleta =
            (rutaBase + '/' + rutaHandler)
              .replace(/\/+/g, '/')
              .replace(/\/$/, '') || '/';
          const rutaNormalizada = rutaCompleta.replace(/\/:\w+/g, '/:id');

          const yaExiste = entrada.endpoints.some(
            (e) => e.metodo === metodoStr && e.ruta === rutaNormalizada,
          );
          if (!yaExiste) {
            const navDecorador = this.reflector.get<NavegableMeta>(
              NAVEGABLE_KEY,
              prototype[key],
            );
            entrada.endpoints.push({
              metodo: metodoStr,
              ruta: rutaNormalizada,
              nombre: this.humanizar(key),
              navDecorador,
            });
          }
        }
      }
    }

    // 2. AGRUPACIÓN POR MÓDULOS...
    const porModulo = new Map<
      string,
      {
        meta: ModuloMeta;
        endpoints: Array<{
          metodo: string;
          ruta: string;
          nombre: string;
          navDecorador?: NavegableMeta;
        }>;
      }
    >();

    for (const [, entrada] of descubiertos.entries()) {
      const { nombreModulo, endpoints } = entrada;
      if (endpoints.length === 0) continue;

      if (!porModulo.has(nombreModulo)) {
        const meta = MODULOS_META[nombreModulo] ?? {
          titulo: this.humanizar(nombreModulo),
          icono: 'Folder',
          seccion: 'General',
          orden: 99,
          rutaFrontendBase: `/dashboard/${nombreModulo}`,
        };
        porModulo.set(nombreModulo, { meta, endpoints: [] });
      }

      const mod = porModulo.get(nombreModulo);
      for (const ep of endpoints) {
        const yaExiste = mod.endpoints.some(
          (e) => e.metodo === ep.metodo && e.ruta === ep.ruta,
        );
        if (!yaExiste) mod.endpoints.push(ep);
      }
    }

    const clavesDescubiertas = new Set<string>();

    // 3. GUARDADO Y AUTO-SANADO EN BASE DE DATOS
    for (const [nombreModulo, { meta, endpoints }] of porModulo.entries()) {
      if (endpoints.length === 0) continue;

      let ctrl = await this.controladorRepo.findOne({
        where: { nombre: nombreModulo },
      });

      if (!ctrl) {
        ctrl = await this.controladorRepo.save(
          this.controladorRepo.create({
            nombre: nombreModulo,
            titulo: meta.titulo,
            categoria: meta.seccion,
            icono: meta.icono,
            seccion: meta.seccion,
            orden: meta.orden,
            activo: true,
          }),
        );
      } else {
        // AUTO-SANADOR DE MÓDULOS: Si tienen el ícono/sección genérica por defecto, les inyectamos los correctos del diccionario.
        // PERO si tú ya los cambiaste manualmente en la BD, no los tocará.
        let actualizado = false;
        if (ctrl.icono === 'Folder' && meta.icono !== 'Folder') {
          ctrl.icono = meta.icono;
          actualizado = true;
        }
        if (ctrl.seccion === 'General' && meta.seccion !== 'General') {
          ctrl.seccion = meta.seccion;
          actualizado = true;
        }
        if (actualizado) await this.controladorRepo.save(ctrl);
      }

      for (const ep of endpoints) {
        const claveNav = `${ep.metodo} ${ep.ruta}`;
        clavesDescubiertas.add(claveNav);
        // @Navegable del handler tiene prioridad; diccionario como respaldo garantizado
        const navMeta = ep.navDecorador ?? ENDPOINTS_NAVEGABLES[claveNav];

        /*
         * ELIMINADA la inferencia `/dashboard${ep.ruta}`. Generaba 139 rutas
         * que no existen en Next (`/dashboard/catalogo/almacenes`,
         * `/dashboard/caja/turnos`, `/dashboard/auth/verificar-email`, incluso
         * `/dashboard/`). El permiso se concedía a una URL fantasma mientras la
         * pantalla real quedaba bloqueada, y como `puedeVerEnlace()` compara en
         * ambos sentidos, esas rutas basura abrían enlaces del menú que el
         * usuario no debía ver.
         *
         * Una pantalla es navegable si y sólo si está declarada: con el
         * decorador @Navegable en el handler o en `endpoints-navegables.ts`.
         */

        const existente = await this.endpointRepo.findOne({
          where: { metodo: ep.metodo, ruta: ep.ruta },
        });

        if (!existente) {
          await this.endpointRepo.save(
            this.endpointRepo.create({
              controladorId: ctrl.id,
              metodo: ep.metodo,
              ruta: ep.ruta,
              nombre: navMeta?.titulo ?? ep.nombre,
              descripcion: `${ep.metodo} ${ep.ruta}`,
              rutaFrontend: navMeta?.rutaFrontend ?? null,
              esNavegable: !!navMeta,
              ordenMenu: navMeta?.ordenMenu ?? 0,
              activo: true,
            }),
          );
        } else {
          let actualizado = false;
          if (!existente.activo) {
            existente.activo = true;
            actualizado = true;
          }

          // 🛠️ AUTO-SANADOR DE ENDPOINTS: Si están NULL en la BD, los reparamos automáticamente para que aparezcan en el menú.
          if (
            navMeta?.rutaFrontend &&
            existente.rutaFrontend !== navMeta.rutaFrontend
          ) {
            existente.rutaFrontend = navMeta.rutaFrontend;
            existente.esNavegable = true;
            actualizado = true;
          }

          /*
           * Saneamiento de instalaciones existentes: si la fila quedó marcada
           * como navegable por la inferencia anterior y hoy no está declarada,
           * se retira. Si no se hace, las rutas fantasma sobreviven en la base
           * aunque el código ya no las genere.
           */
          if (!navMeta && existente.esNavegable && existente.rutaFrontend) {
            existente.rutaFrontend = null;
            existente.esNavegable = false;
            actualizado = true;
          }
          if (navMeta && existente.ordenMenu !== (navMeta.ordenMenu ?? 0)) {
            existente.ordenMenu = navMeta.ordenMenu ?? 0;
            actualizado = true;
          }

          // Reparación de títulos (Solo si el nombre actual es el nombre técnico de código)
          if (
            navMeta &&
            existente.nombre === ep.nombre &&
            navMeta.titulo !== ep.nombre
          ) {
            existente.nombre = navMeta.titulo;
            actualizado = true;
          }

          /*
           * Y si nadie le declaró un título, el nombre es el del handler que
           * atiende la ruta. Esto rescata los pares que quedaron cruzados por
           * el defecto de PATCH/DELETE: la fila `PATCH /…/definiciones/:id`
           * existía con el nombre «Eliminar Definición» porque la creó el
           * handler equivocado. Al corregir el mapa, la fila se reutiliza para
           * el handler bueno y hay que devolverle su nombre, o la pantalla
           * enseña «Eliminar» donde en realidad se actualiza.
           */
          if (!navMeta && existente.nombre !== ep.nombre) {
            existente.nombre = ep.nombre;
            actualizado = true;
          }

          if (existente.controladorId !== ctrl.id) {
            existente.controladorId = ctrl.id;
            actualizado = true;
          }

          if (actualizado) await this.endpointRepo.save(existente);
        }
      }
    }

    const endpointsRegistrados = await this.endpointRepo.find();
    let obsoletos = 0;
    for (const endpoint of endpointsRegistrados) {
      const clave = `${endpoint.metodo} ${endpoint.ruta}`;
      if (endpoint.activo && !clavesDescubiertas.has(clave)) {
        endpoint.activo = false;
        await this.endpointRepo.save(endpoint);
        obsoletos += 1;
      }
    }

    await this.sincronizarPermisoHistorialAprobaciones();
    await this.aplicarContratoDeRoles();
    await this.reconciliarModulosRecienSeparados();
    await this.migrarPermisosDeMetodosIntercambiados();
    this.cache.clear();
    this.logger.log(
      `Sincronizacion completada: ${clavesDescubiertas.size} endpoints activos, ${obsoletos} obsoletos desactivados`,
    );
  }

  /**
   * Rescata los permisos que quedaron colgando de las filas con el metodo
   * equivocado, cuando PATCH y DELETE estaban cruzados en `METHOD_MAP`.
   *
   * Tras corregir el mapa, la sincronizacion crea la fila buena y desactiva la
   * mala. Si alguien ya habia configurado permisos sobre la mala, se perderian
   * en silencio. Aqui se mueven: fila inactiva con metodo cruzado -> fila
   * activa con la misma ruta y el metodo contrario.
   *
   * Es idempotente y no pisa nada: solo copia los permisos concedidos que no
   * existan ya en el destino. Cuando no hay filas cruzadas no hace nada y no
   * escribe una linea de log.
   */
  private async migrarPermisosDeMetodosIntercambiados() {
    const CRUZADOS: Record<string, string> = { PATCH: 'DELETE', DELETE: 'PATCH' };
    const inactivos = await this.endpointRepo.find({ where: { activo: false } });
    const candidatos = inactivos.filter((ep) => CRUZADOS[ep.metodo]);
    if (candidatos.length === 0) return;

    let movidos = 0;
    for (const viejo of candidatos) {
      const destino = await this.endpointRepo.findOne({
        where: { metodo: CRUZADOS[viejo.metodo], ruta: viejo.ruta, activo: true },
      });
      if (!destino) continue;

      const permisos = await this.permisoRepo.find({
        where: { endpointId: viejo.id, permitido: true },
      });
      for (const permiso of permisos) {
        const yaEsta = await this.permisoRepo.findOne({
          where: {
            empresaId: permiso.empresaId,
            rol: permiso.rol,
            endpointId: destino.id,
          },
        });
        if (yaEsta) {
          if (!yaEsta.permitido) {
            yaEsta.permitido = true;
            await this.permisoRepo.save(yaEsta);
            movidos += 1;
          }
          continue;
        }
        await this.permisoRepo.save(
          this.permisoRepo.create({
            empresaId: permiso.empresaId,
            rol: permiso.rol,
            endpointId: destino.id,
            permitido: true,
          }),
        );
        movidos += 1;
      }
    }

    if (movidos > 0) {
      this.logger.log(
        `Metodos intercambiados: ${movidos} permisos movidos a la fila con el verbo correcto.`,
      );
    }
  }

  /**
   * ==========================================================================
   * El contrato de cada rol, reconciliado en cada arranque
   * --------------------------------------------------------------------------
   * Las plantillas declaran módulos, y eso basta el día que se siembra una
   * empresa. No basta después: un endpoint cambia de módulo, alguien afina la
   * matriz a mano, o una empresa se sembró con una versión anterior del
   * catálogo. El permiso queda apagado y nadie se entera hasta que el trabajo
   * se detiene —la recepción de mercancía estuvo así, con el camión en la
   * puerta y un 403 al firmar.
   *
   * Por eso las acciones que DEFINEN un puesto, y las que un puesto no puede
   * tener nunca, se declaran por ruta en la plantilla y se reponen aquí en
   * cada arranque, para todas las empresas. Implementación nueva o instalación
   * de hace un año: al desplegar, quedan igual.
   * ==========================================================================
   */
  private async aplicarContratoDeRoles() {
    const conContrato = PLANTILLAS_PERMISOS;
    if (!conContrato.length) return;

    const rutas = new Set<string>();
    for (const p of conContrato) {
      for (const a of p.accionesIrrenunciables ?? []) rutas.add(a);
      for (const a of p.accionesVedadas ?? []) rutas.add(a);
    }

    const endpoints = await this.endpointRepo.find({ where: { activo: true } });
    const porClave = new Map(endpoints.map((ep) => [`${ep.metodo} ${ep.ruta}`, ep]));

    const faltantes = [...rutas].filter((r) => !porClave.has(r));
    if (faltantes.length) {
      this.logger.warn(
        `El contrato de roles menciona rutas que no existen en el catálogo: ${faltantes.join(', ')}.`,
      );
    }

    const empresas = await this.permisoRepo
      .createQueryBuilder('p')
      .select('DISTINCT p.empresaId', 'empresaId')
      .getRawMany<{ empresaId: string }>();

    let repuestas = 0;
    let retiradas = 0;
    for (const { empresaId } of empresas) {
      for (const plantilla of conContrato) {
        const rol = normalizarRol(plantilla.rol);

        /*
         * ────────────────────────────────────────────────────────────────────
         * El piso completo, no sólo las rutas que el contrato nombra
         * --------------------------------------------------------------------
         * Antes aquí sólo se reponían las acciones listadas una por una en
         * `accionesIrrenunciables`. Eso dejaba fuera el caso más común y el más
         * silencioso: una acción NUEVA dentro de un módulo que el rol ya tiene.
         * El endpoint nace, la sincronización lo da de alta, y nadie crea la
         * fila de permiso; en las empresas ya sembradas queda apagado para
         * todos menos para el administrador. La función estrena apagada y nadie
         * lo sabe hasta que alguien la necesita.
         *
         * Pasó en cuanto se separaron las cuentas contables de la categoría:
         * `PATCH /catalogo/categorias/:id/cuentas` nació dentro de Contabilidad
         * y ni el contador ni finanzas podían usarla, aunque el módulo entero
         * es suyo.
         *
         * Así que el piso se reconcilia entero: todo lo de sus módulos, y los
         * GET de los que sólo consulta. Sólo enciende —nunca apaga— porque un
         * rol se amplía a mano y esa ampliación debe sobrevivir al reinicio.
         * Lo que sí debe apagarse se declara en `accionesVedadas`, que se
         * aplica después y gana.
         * ────────────────────────────────────────────────────────────────────
         */
        const piso = await this.pisoDeAccionesDeRol(plantilla.rol);
        for (const id of await this.techoDeModulosVedados(plantilla.rol)) piso.delete(id);
        if (piso.size) {
          const yaTiene = new Map(
            (
              await this.permisoRepo.find({
                where: { empresaId, rol },
                select: ['id', 'endpointId', 'permitido'],
              })
            ).map((f) => [f.endpointId, f]),
          );
          const nuevas: RolEndpointPermiso[] = [];
          for (const endpointId of piso) {
            const fila = yaTiene.get(endpointId);
            if (!fila) {
              nuevas.push(
                this.permisoRepo.create({ empresaId, rol, endpointId, permitido: true }),
              );
              repuestas += 1;
            } else if (!fila.permitido) {
              fila.permitido = true;
              await this.permisoRepo.save(fila);
              repuestas += 1;
            }
          }
          // De golpe: son cientos de filas la primera vez y ninguna después.
          if (nuevas.length) await this.permisoRepo.save(nuevas, { chunk: 200 });
        }

        /*
         * El techo: módulos que el contrato le veda al rol. Va después del
         * piso —que sólo enciende— porque retirar es lo que el piso no puede
         * hacer, y antes de las acciones sueltas no cambiaría nada: ninguna
         * acción irrenunciable vive en un módulo vedado, y si alguna viviera,
         * sería un error del contrato que la prueba de coherencia detiene.
         */
        const techo = await this.techoDeModulosVedados(plantilla.rol);
        if (techo.size) {
          const filas = await this.permisoRepo.find({
            where: { empresaId, rol },
            select: ['id', 'endpointId', 'permitido'],
          });
          for (const fila of filas) {
            if (fila.permitido && techo.has(fila.endpointId)) {
              fila.permitido = false;
              await this.permisoRepo.save(fila);
              retiradas += 1;
            }
          }
        }

        for (const [acciones, permitido] of [
          [plantilla.accionesIrrenunciables ?? [], true] as const,
          [plantilla.accionesVedadas ?? [], false] as const,
        ]) {
          for (const accion of acciones) {
            const ep = porClave.get(accion);
            if (!ep) continue;
            const existente = await this.permisoRepo.findOne({
              where: { empresaId, rol, endpointId: ep.id },
            });
            if (existente) {
              if (existente.permitido === permitido) continue;
              existente.permitido = permitido;
              await this.permisoRepo.save(existente);
            } else {
              await this.permisoRepo.save(
                this.permisoRepo.create({ empresaId, rol, endpointId: ep.id, permitido }),
              );
            }
            if (permitido) repuestas += 1;
            else retiradas += 1;
          }
        }
      }
    }

    if (repuestas || retiradas) {
      this.logger.log(
        `Contrato de roles aplicado: ${repuestas} acción(es) repuesta(s) y ${retiradas} retirada(s).`,
      );
    }
  }

  /**
   * Conserva el acceso de los roles que ya atendían la bandeja central.
   * El historial es parte de la misma pantalla y no debe exigir volver a
   * configurar todas las matrices al desplegar esta versión.
   */
  private async sincronizarPermisoHistorialAprobaciones() {
    const [pendientes, historial] = await Promise.all([
      this.endpointRepo.findOne({
        where: {
          metodo: 'GET',
          ruta: '/aprobaciones/pendientes',
          activo: true,
        },
      }),
      this.endpointRepo.findOne({
        where: {
          metodo: 'GET',
          ruta: '/aprobaciones/historial',
          activo: true,
        },
      }),
    ]);
    if (!pendientes || !historial) return;

    const permisosBase = await this.permisoRepo.find({
      where: { endpointId: pendientes.id, permitido: true },
    });
    for (const permiso of permisosBase) {
      const existente = await this.permisoRepo.findOne({
        where: {
          empresaId: permiso.empresaId,
          rol: permiso.rol,
          endpointId: historial.id,
        },
      });
      if (existente) {
        if (!existente.permitido) {
          existente.permitido = true;
          await this.permisoRepo.save(existente);
        }
        continue;
      }
      await this.permisoRepo.save(
        this.permisoRepo.create({
          empresaId: permiso.empresaId,
          rol: permiso.rol,
          endpointId: historial.id,
          permitido: true,
        }),
      );
    }
  }

  async obtenerArbolPermisos() {
    const controladores = await this.controladorRepo.find({
      where: { activo: true },
      order: { orden: 'ASC' },
    });
    const endpoints = await this.endpointRepo.find({
      where: { activo: true },
      relations: ['controlador'],
    });
    return controladores
      .map((ctrl) => ({
        ...ctrl,
        endpoints: endpoints
          .filter((ep) => ep.controladorId === ctrl.id)
          .sort(
            (a, b) =>
              (a.rutaFrontend ?? '').localeCompare(b.rutaFrontend ?? '') ||
              a.ruta.localeCompare(b.ruta) ||
              a.metodo.localeCompare(b.metodo),
          ),
      }))
      .filter((ctrl) => ctrl.endpoints.length > 0);
  }

  async obtenerMenuParaRol(rol: string, empresaId: string) {
    const esAdmin = esRolAdministrador(rol);

    const endpointsNavegables = await this.endpointRepo.find({
      where: { activo: true, esNavegable: true },
      relations: ['controlador'],
      order: { ordenMenu: 'ASC' },
    });

    if (esAdmin) return this.agruparEndpointsPorSeccion(endpointsNavegables);

    const permisosBD = await this.permisoRepo
      .createQueryBuilder('p')
      .where('p.empresaId = :empresaId', { empresaId })
      .andWhere('p.permitido = :permitido', { permitido: true })
      .andWhere(this.consultaRolNormalizado('p'), {
        rolNormalizado: normalizarRol(rol),
      })
      .getMany();
    const idsPermitidos = new Set(permisosBD.map((p) => p.endpointId));
    return this.agruparEndpointsPorSeccion(
      endpointsNavegables.filter((ep) => idsPermitidos.has(ep.id)),
    );
  }

  private agruparEndpointsPorSeccion(endpoints: Endpoint[]) {
    const secciones = new Map<
      string,
      {
        seccion: string;
        modulos: Map<
          string,
          {
            titulo: string;
            icono: string;
            orden: number;
            items: Array<{
              titulo: string;
              rutaFrontend: string;
              ordenMenu: number;
            }>;
          }
        >;
      }
    >();

    for (const ep of endpoints) {
      if (!ep.rutaFrontend || !ep.controlador) continue;
      const seccion = ep.controlador.seccion || 'General';
      const moduloTitulo = ep.controlador.titulo;
      const moduloIcono = ep.controlador.icono || 'Folder';
      const moduloOrden = ep.controlador.orden ?? 99;

      if (!secciones.has(seccion))
        secciones.set(seccion, { seccion, modulos: new Map() });
      const sec = secciones.get(seccion);

      if (!sec.modulos.has(moduloTitulo))
        sec.modulos.set(moduloTitulo, {
          titulo: moduloTitulo,
          icono: moduloIcono,
          orden: moduloOrden,
          items: [],
        });
      const mod = sec.modulos.get(moduloTitulo);

      if (!mod.items.some((i) => i.rutaFrontend === ep.rutaFrontend)) {
        mod.items.push({
          titulo: ep.nombre,
          rutaFrontend: ep.rutaFrontend,
          ordenMenu: ep.ordenMenu,
        });
      }
    }

    return Array.from(secciones.values()).map((sec) => ({
      seccion: sec.seccion,
      modulos: Array.from(sec.modulos.values())
        .sort((a, b) => a.orden - b.orden)
        .map((mod) => ({
          ...mod,
          items: mod.items.sort((a, b) => a.ordenMenu - b.ordenMenu),
        })),
    }));
  }

  private guardarCache(
    clave: string,
    valor: { permitido: boolean; expiraEn: number },
  ): void {
    // Map conserva orden de inserción: al tocar una entrada la promovemos y,
    // al rebasar el límite, expulsamos la menos reciente. Evita crecimiento
    // sin cota aun cuando existan miles de empresas/roles/rutas.
    this.cache.delete(clave);
    this.cache.set(clave, valor);
    while (this.cache.size > this.cacheMaxEntradas) {
      const masAntigua = this.cache.keys().next().value as string | undefined;
      if (!masAntigua) break;
      this.cache.delete(masAntigua);
    }
  }

  private consultaRolNormalizado(alias = 'p'): string {
    return `UPPER(REPLACE(REPLACE(LTRIM(RTRIM(${alias}.rol)), '-', '_'), ' ', '_')) = :rolNormalizado`;
  }

  // ─────────────────────────────────────────────────────────────────
  // VALIDACION PRINCIPAL — con fix del prefijo /api
  // ─────────────────────────────────────────────────────────────────
  async verificarPermiso(
    empresaId: string,
    rol: string,
    metodo: string,
    ruta: string,
  ): Promise<boolean> {
    if (esRolAdministrador(rol)) return true;

    const metodoLimpio = metodo.toUpperCase();
    const rolNormalizado = normalizarRol(rol);

    // FIX: NestJS expone la ruta con el prefijo global /api
    // pero en BD esta guardada sin ese prefijo.
    const rutaSinPrefijo = ruta.startsWith('/api') ? ruta.slice(4) : ruta;

    const rutaLimpia = rutaSinPrefijo
      .replace(/\/+$/, '')
      .replace(/\/[0-9a-fA-F-]{36}/g, '/:id')
      .replace(/\/:\w+/g, '/:id');

    const cacheKey = `${empresaId}:${rolNormalizado}:${metodoLimpio}:${rutaLimpia}`;
    const cacheado = this.cache.get(cacheKey);
    if (cacheado && cacheado.expiraEn > Date.now()) return cacheado.permitido;
    if (cacheado) this.cache.delete(cacheKey);

    const endpoint = await this.endpointRepo.findOne({
      where: { metodo: metodoLimpio, ruta: rutaLimpia },
    });
    if (!endpoint) {
      this.guardarCache(cacheKey, {
        permitido: false,
        expiraEn: Date.now() + this.cacheTtlMs,
      });
      return false;
    }

    const permiso = await this.permisoRepo
      .createQueryBuilder('p')
      .where('p.empresaId = :empresaId', { empresaId })
      .andWhere('p.endpointId = :endpointId', { endpointId: endpoint.id })
      .andWhere('p.permitido = :permitido', { permitido: true })
      .andWhere(this.consultaRolNormalizado('p'), { rolNormalizado })
      .getOne();

    const tieneAcceso = !!permiso;
    this.guardarCache(cacheKey, {
      permitido: tieneAcceso,
      expiraEn: Date.now() + this.cacheTtlMs,
    });
    return tieneAcceso;
  }

  invalidarCacheRoles(empresaId: string, roles: string[]) {
    const normalizados = new Set(roles.map((rol) => normalizarRol(rol)));
    for (const key of this.cache.keys()) {
      const [, rolCache] = key.split(':', 3);
      if (key.startsWith(`${empresaId}:`) && normalizados.has(rolCache)) {
        this.cache.delete(key);
      }
    }
  }

  async obtenerPermisosPorRolParaFrontend(
    rol: string,
    empresaId: string,
  ): Promise<Record<string, boolean>> {
    if (esRolAdministrador(rol)) return { '*': true };
    const todosEndpoints = await this.endpointRepo.find({
      where: { activo: true },
    });
    const permisosBD = await this.permisoRepo
      .createQueryBuilder('p')
      .where('p.empresaId = :empresaId', { empresaId })
      .andWhere(this.consultaRolNormalizado('p'), {
        rolNormalizado: normalizarRol(rol),
      })
      .getMany();
    const permisosPorEndpointId = new Map(
      permisosBD.map((p) => [p.endpointId, p.permitido]),
    );
    const resultado: Record<string, boolean> = {};
    for (const ep of todosEndpoints) {
      resultado[`${ep.metodo} ${ep.ruta}`] =
        permisosPorEndpointId.get(ep.id) ?? false;
    }
    return resultado;
  }

  async obtenerPermisosPorRol(
    rol: string,
    empresaId: string,
  ): Promise<Record<string, boolean>> {
    const todosEndpoints = await this.endpointRepo.find({
      where: { activo: true },
    });
    if (esRolAdministrador(rol)) {
      const resultado: Record<string, boolean> = {};
      for (const ep of todosEndpoints) resultado[ep.id] = true;
      return resultado;
    }
    const permisosBD = await this.permisoRepo
      .createQueryBuilder('p')
      .where('p.empresaId = :empresaId', { empresaId })
      .andWhere(this.consultaRolNormalizado('p'), {
        rolNormalizado: normalizarRol(rol),
      })
      .getMany();
    const permisosPorEndpointId = new Map(
      permisosBD.map((p) => [p.endpointId, p.permitido]),
    );
    const resultado: Record<string, boolean> = {};
    for (const ep of todosEndpoints) {
      resultado[ep.id] = permisosPorEndpointId.get(ep.id) ?? false;
    }
    return resultado;
  }

  async actualizarPermisos(
    rol: string,
    permisos: Record<string, boolean>,
    empresaId: string,
  ) {
    if (esRolAdministrador(rol)) return;

    /*
     * ────────────────────────────────────────────────────────────────────────
     * El piso también se respeta afinando acción por acción
     * ------------------------------------------------------------------------
     * La pantalla de módulos ya no deja dejar a un rol sin su propio trabajo,
     * pero esta puerta —el ajuste fino, casilla por casilla— llegaba directo a
     * la tabla. Sin esto, el candado se saltaría desmarcando a mano las mismas
     * acciones, que es exactamente como se rompen los candados que sólo viven
     * en una pantalla.
     *
     * Se protege la CONSULTA de los módulos propios del rol: quitar la
     * escritura sigue permitido, apagar el acceso a su propio módulo no.
     * ────────────────────────────────────────────────────────────────────────
     */
    const protegidos = await this.pisoDeAccionesDeRol(rol);
    for (const id of await this.techoDeModulosVedados(rol)) protegidos.delete(id);
    if (protegidos.size) {
      let repuestos = 0;
      for (const id of Object.keys(permisos)) {
        if (permisos[id] === false && protegidos.has(id)) {
          permisos[id] = true;
          repuestos += 1;
        }
      }
      if (repuestos) {
        this.logger.warn(
          `Se intentó quitar ${repuestos} acción(es) con las que opera el rol "${rol}"; se repusieron. Un rol se amplía, no se recorta por debajo de su trabajo.`,
        );
      }
    }

    /*
     * ────────────────────────────────────────────────────────────────────────
     * Piso y techo declarados por acción
     * ------------------------------------------------------------------------
     * El bloque anterior protege la CONSULTA de los módulos del rol. Falta lo
     * que no se puede expresar en módulos:
     *
     *  · Lo IRRENUNCIABLE: acciones que definen el puesto y viven en el módulo
     *    de otro. Dar entrada a la mercancía cuelga de `/compras`, y al
     *    almacenista se le concede compras solo en consulta. Se repone siempre.
     *
     *  · Lo VEDADO: acciones que el módulo entrega de más y que rompen la
     *    separación de funciones. Al comprador, el módulo «Compras» completo
     *    le daba pagar al proveedor y resolver aprobaciones de requisición.
     *
     * Va aquí, en la única puerta de escritura de la tabla, y no en la
     * plantilla: una regla que solo se aplica al sembrar es una regla que dura
     * hasta el primer ajuste a mano.
     * ────────────────────────────────────────────────────────────────────────
     */
    const contrato = this.plantillaDe(rol);
    if (contrato?.accionesIrrenunciables?.length || contrato?.accionesVedadas?.length) {
      const todos = await this.endpointRepo.find({ where: { activo: true } });
      const clave = (ep: Endpoint) => `${ep.metodo} ${ep.ruta}`;
      const porClave = new Map(todos.map((ep) => [clave(ep), ep]));

      let repuestas = 0;
      for (const accion of contrato.accionesIrrenunciables ?? []) {
        const ep = porClave.get(accion);
        if (!ep) continue;
        if (permisos[ep.id] !== true) {
          permisos[ep.id] = true;
          repuestas += 1;
        }
      }
      let vedadas = 0;
      for (const accion of contrato.accionesVedadas ?? []) {
        const ep = porClave.get(accion);
        if (!ep) continue;
        if (permisos[ep.id] !== false) {
          permisos[ep.id] = false;
          vedadas += 1;
        }
      }
      // Y los módulos vedados enteros, para que no haga falta nombrar cada
      // acción ni acordarse de las que nazcan después.
      for (const id of await this.techoDeModulosVedados(rol)) {
        if (permisos[id] !== false) {
          permisos[id] = false;
          vedadas += 1;
        }
      }
      if (repuestas) {
        this.logger.warn(
          `Se repusieron ${repuestas} acción(es) irrenunciables del rol "${rol}".`,
        );
      }
      if (vedadas) {
        this.logger.warn(
          `Se retiraron ${vedadas} acción(es) vedadas al rol "${rol}" por separación de funciones.`,
        );
      }
    }

    rol = normalizarRol(rol);
    const entradas = Object.entries(permisos);
    const ids = entradas.map(([endpointId]) => endpointId);
    if (ids.length === 0) return;
    await this.dataSource.transaction(async (manager) => {
      const endpointRepo = manager.getRepository(Endpoint);
      const permisoRepo = manager.getRepository(RolEndpointPermiso);
      const endpoints = await endpointRepo
        .createQueryBuilder('e')
        .where('e.id IN (:...ids)', { ids })
        .andWhere('e.activo=true')
        .getMany();
      const validos = new Set(endpoints.map((e) => e.id));
      const invalidos = ids.filter((id) => !validos.has(id));
      if (invalidos.length) {
        throw new BadRequestException(
          `Hay ${invalidos.length} endpoints inexistentes o inactivos en la actualización de permisos.`,
        );
      }
      const existentes = await permisoRepo
        .createQueryBuilder('p')
        .where('p.empresaId = :empresaId', { empresaId })
        .andWhere(this.consultaRolNormalizado('p'), {
          rolNormalizado: normalizarRol(rol),
        })
        .getMany();
      for (const existente of existentes) existente.rol = rol;
      const mapa = new Map(existentes.map((e) => [e.endpointId, e]));
      const guardar: RolEndpointPermiso[] = [];
      for (const [endpointId, permitido] of entradas) {
        const actual = mapa.get(endpointId);
        if (actual) {
          if (actual.permitido !== permitido) {
            actual.permitido = permitido;
            guardar.push(actual);
          }
        } else {
          guardar.push(
            permisoRepo.create({ empresaId, rol, endpointId, permitido }),
          );
        }
      }
      if (guardar.length) await permisoRepo.save(guardar, { chunk: 250 });
    });
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${empresaId}:${normalizarRol(rol)}:`)) {
        this.cache.delete(key);
      }
    }
  }

  async obtenerRolesDisponibles(empresaId: string): Promise<string[]> {
    const [rolesPermisos, rolesUsuarios] = await Promise.all([
      this.permisoRepo
        .createQueryBuilder('p')
        .select('DISTINCT p.rol', 'rol')
        .where('p.empresaId = :empresaId', { empresaId })
        .getRawMany(),
      this.dataSource
        .query(
          'SELECT DISTINCT rol FROM usuarios WHERE empresaId = $1 AND rol IS NOT NULL',
          [empresaId],
        )
        .catch((error) => {
          this.logger.error('No se pudieron consultar los roles de usuarios.', error?.stack);
          return [];
        }),
    ]);
    // El catalogo unico manda. Antes aqui habia cinco roles escritos a mano y
    // por eso la pantalla de permisos solo ofrecia cuatro perfiles aunque
    // hubiera trece plantillas sembrando permisos de verdad.
    //
    // Se deduplica por rol NORMALIZADO, no por la cadena tal cual: la tabla de
    // permisos guarda el rol en mayusculas y la lista de usuarios como se
    // escribio, asi que un Set de cadenas devolvia "almacenista" y
    // "ALMACENISTA" como si fueran dos roles distintos. Gana la grafia del
    // catalogo, que es la que se asigna a los usuarios.
    const porNombre = new Map<string, string>();
    for (const valor of [
      ...ROLES_ASIGNABLES,
      ...rolesPermisos.map((r) => String(r.rol)),
      ...rolesUsuarios.map((r: { rol: string }) => String(r.rol)),
    ]) {
      if (!valor) continue;
      const clave = normalizarRol(valor);
      if (!clave || porNombre.has(clave)) continue;
      porNombre.set(clave, valor);
    }
    return Array.from(porNombre.values()).sort((a, b) => a.localeCompare(b));
  }

  private async limpiarMetodosNumericos() {
    const todos = await this.endpointRepo.find();
    const sucios = todos.filter((ep) => !isNaN(Number(ep.metodo)));
    if (sucios.length === 0) return;
    this.logger.warn(
      `Corrigiendo ${sucios.length} endpoints con metodo numerico...`,
    );
    for (const ep of sucios) {
      const metodoStr = METHOD_MAP[Number(ep.metodo)];
      if (!metodoStr) continue;
      const correcto = await this.endpointRepo.findOne({
        where: { metodo: metodoStr, ruta: ep.ruta },
      });
      if (correcto) {
        const permisosSucios = await this.permisoRepo.find({
          where: { endpointId: ep.id },
        });
        for (const permiso of permisosSucios) {
          const existeEnCorrecto = await this.permisoRepo.findOne({
            where: {
              empresaId: permiso.empresaId,
              rol: permiso.rol,
              endpointId: correcto.id,
            },
          });
          if (!existeEnCorrecto) {
            permiso.endpointId = correcto.id;
            await this.permisoRepo.save(permiso);
          } else {
            if (existeEnCorrecto.permitido !== permiso.permitido) {
              existeEnCorrecto.permitido = permiso.permitido;
              await this.permisoRepo.save(existeEnCorrecto);
            }
            await this.permisoRepo.delete(permiso.id);
          }
        }
        ep.metodo = metodoStr;
        ep.activo = false;
        await this.endpointRepo.save(ep);
      } else {
        ep.metodo = metodoStr;
        await this.endpointRepo.save(ep);
      }
    }
  }

  private humanizar(str: string): string {
    return str
      .replace(/([A-Z])/g, ' $1')
      .replace(/[-_]/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RUTAS PERMITIDAS — devuelve las rutaFrontend a las que tiene acceso el rol
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * ==========================================================================
   * Las rutas que este rol puede abrir — de aquí sale el menú
   * --------------------------------------------------------------------------
   * Esto estaba roto y no se veía, porque el administrador sale por la primera
   * línea con `['*']` y nunca llega al resto. Lo descubrió el primer usuario
   * real: un almacenista con 102 acciones concedidas entraba y veía «Todavía no
   * tienes módulos asignados» y un menú vacío, mientras la API le respondía 200
   * a productos, almacenes y categorías. Los permisos estaban bien; esta
   * consulta devolvía una lista vacía.
   *
   * Eran dos restos de SQL Server en consultas escritas a mano:
   *
   *  · `rep.empresaId` sin comillas. PostgreSQL pasa a minúsculas lo que no va
   *    entrecomillado, así que buscaba una columna `empresaid` que no existe
   *    —TypeORM la creó como `empresaId`— y la consulta reventaba.
   *  · `rep.permitido = 1`. Ahí `permitido` es booleano, y en PostgreSQL
   *    comparar un booleano con un entero es un error de tipo.
   *
   * Y los dos errores caían en un `.catch` que devolvía `[]`. El sistema no se
   * caía: se quedaba callado y dejaba a todo el mundo sin menú. Por eso ahora
   * va con el constructor de consultas, como el resto del servicio: los nombres
   * de columna y los tipos los pone el mismo mapeo que creó las tablas, en vez
   * de repetirlos a mano en una cadena.
   * ==========================================================================
   */
  async obtenerRutasPermitidas(
    rol: string,
    empresaId: string,
  ): Promise<string[]> {
    if (esRolAdministrador(rol)) return ['*'];

    const filas: Array<{
      rutaFrontend: string | null;
      metodo: string;
      ruta: string;
    }> = await this.permisoRepo
      .createQueryBuilder('p')
      .innerJoin(Endpoint, 'e', 'e.id = p.endpointId')
      .where('p.empresaId = :empresaId', { empresaId })
      .andWhere(this.consultaRolNormalizado('p'), {
        rolNormalizado: normalizarRol(rol),
      })
      .andWhere('p.permitido = :si', { si: true })
      .andWhere('e.activo = :activo', { activo: true })
      .select('e.rutaFrontend', 'rutaFrontend')
      .addSelect('e.metodo', 'metodo')
      .addSelect('e.ruta', 'ruta')
      .getRawMany();

    const rutas = new Set<string>();
    for (const f of filas) {
      if (f.rutaFrontend) rutas.add(f.rutaFrontend);
      // Los endpoints que no traen ruta en la base se completan con el
      // diccionario estático, que es el que sabe a qué pantalla llevan.
      const nav = ENDPOINTS_NAVEGABLES[`${f.metodo} ${f.ruta}`];
      if (nav?.rutaFrontend) rutas.add(nav.rutaFrontend);
      // Una misma acción puede habilitar más de una pantalla: la caja vive en
      // `/pos` y la dirección vieja sigue redirigiendo a ella.
      for (const extra of nav?.rutasAdicionales ?? []) rutas.add(extra);
    }
    return Array.from(rutas);
  }

  /**
   * Resumen por rol, para que la pantalla de administracion pueda hablar de
   * roles y no de endpoints.
   *
   * La tabla `rol_endpoint_permiso` sigue siendo el motor: esto no la sustituye
   * ni la simplifica por debajo. Lo unico que hace es contar, por rol, cuantas
   * acciones tiene encendidas y cuanta gente lo trae puesto, que es lo que un
   * administrador necesita ver antes de entrar al detalle.
   *
   * `admin` sale con `accionesActivas: null` a proposito: no tiene filas en la
   * tabla porque `esRolAdministrador()` la salta entera. Poner 0 seria mentira
   * y poner el total tambien, porque ese total cambia con cada endpoint nuevo.
   */
  async obtenerResumenRoles(empresaId: string) {
    // La clave va normalizada porque `normalizarRol` pasa a MAYUSCULAS y los
    // roles de las plantillas estan en minusculas: buscar por `p.rol` tal cual
    // no encontraba ninguna y todos los roles salian "sin plantilla".
    const plantillas = new Map(
      PLANTILLAS_PERMISOS.map((p) => [normalizarRol(p.rol), p]),
    );

    const [porRol, usuarios, disponibles] = await Promise.all([
      this.permisoRepo
        .createQueryBuilder('p')
        .select('p.rol', 'rol')
        .addSelect('COUNT(*)', 'total')
        .where('p.empresaId = :empresaId', { empresaId })
        .andWhere('p.permitido = true')
        .groupBy('p.rol')
        .getRawMany<{ rol: string; total: string }>()
        .catch((error) => {
          this.logger.error('No se pudo contar permisos por rol.', error?.stack);
          return [] as Array<{ rol: string; total: string }>;
        }),
      this.dataSource
        .query(
          'SELECT rol, COUNT(*)::int AS total FROM usuarios WHERE empresaId = $1 AND rol IS NOT NULL GROUP BY rol',
          [empresaId],
        )
        .catch((error) => {
          this.logger.error('No se pudo contar usuarios por rol.', error?.stack);
          return [] as Array<{ rol: string; total: number }>;
        }),
      this.obtenerRolesDisponibles(empresaId),
    ]);

    const acciones = new Map<string, number>();
    for (const fila of porRol) {
      acciones.set(normalizarRol(fila.rol), Number(fila.total));
    }
    const gente = new Map<string, number>();
    for (const fila of usuarios as Array<{ rol: string; total: number }>) {
      const clave = normalizarRol(fila.rol);
      gente.set(clave, (gente.get(clave) ?? 0) + Number(fila.total));
    }

    return disponibles.map((rol) => {
      const clave = normalizarRol(rol);
      const plantilla = plantillas.get(clave);
      const administrador = esRolAdministrador(rol);
      return {
        rol,
        // `admin` no tiene plantilla, asi que se le pone su nombre aqui: sin
        // esto la pantalla de usuarios enseñaba el identificador en crudo.
        etiqueta: administrador ? 'Administrador' : (plantilla?.etiqueta ?? rol),
        descripcion: administrador
          ? 'Acceso total. No pasa por la tabla de permisos.'
          : (plantilla?.descripcion ??
            'Rol sin plantilla: sus permisos se configuraron a mano.'),
        esAdministrador: administrador,
        tienePlantilla: !!plantilla,
        usuarios: gente.get(clave) ?? 0,
        accionesActivas: administrador ? null : (acciones.get(clave) ?? 0),
      };
    });
  }

  obtenerPlantillasDisponibles() {
    return PLANTILLAS_PERMISOS.map((p) => ({
      rol: p.rol,
      etiqueta: p.etiqueta,
      descripcion: p.descripcion,
    }));
  }

  /**
   * ==========================================================================
   * Sembrar la plantilla de un rol que todavía no tiene permisos
   * --------------------------------------------------------------------------
   * Las doce plantillas existían y **no se aplicaban solas**. Se comprobó dando
   * de alta usuarios de verdad: `credito` y `rrhh` quedaron con un usuario cada
   * uno y **cero acciones**. Como el guardia niega lo que no está concedido, esa
   * persona entra y no puede hacer nada: menú vacío y «esta sección no está en
   * tu perfil» en todas partes, hasta que un administrador entra a Roles y
   * permisos y pulsa «aplicar plantilla» — un paso que no está escrito en
   * ningún lado y que nadie adivina.
   *
   * No es sólo incómodo: es por empresa. Cada cliente nuevo de SUMA nace con
   * los trece roles vacíos, así que el sistema llega roto a cada alta.
   *
   * La regla para que sembrar sea seguro: **sólo si el rol no tiene NINGÚN
   * permiso en esa empresa**. Un rol que ya tiene algo lo tiene porque alguien
   * lo decidió —aunque haya sido quitarle casi todo— y volver a sembrarle la
   * plantilla desharía esa decisión sin avisar. Con esa condición es
   * idempotente y se puede llamar en cualquier alta sin pensarlo.
   * ==========================================================================
   */
  async sembrarPlantillaSiVacia(rol: string, empresaId: string) {
    if (!rol || !empresaId || esRolAdministrador(rol)) {
      return { sembrado: false, activados: 0 };
    }

    const yaTiene = await this.permisoRepo
      .createQueryBuilder('p')
      .where('p.empresaId = :empresaId', { empresaId })
      .andWhere(this.consultaRolNormalizado('p'), {
        rolNormalizado: normalizarRol(rol),
      })
      .getCount();
    if (yaTiene > 0) return { sembrado: false, activados: 0 };

    const resultado = await this.aplicarPlantillaRol(rol, empresaId, 'agregar');
    if (resultado.activados > 0) {
      this.logger.log(
        `Permisos sembrados para el rol "${rol}" de la empresa ${empresaId}: ${resultado.activados} acciones desde su plantilla.`,
      );
    }
    return { sembrado: resultado.activados > 0, activados: resultado.activados };
  }

  async aplicarPlantillaRol(
    rol: string,
    empresaId: string,
    modo: 'agregar' | 'reemplazar' = 'agregar',
  ) {
    if (esRolAdministrador(rol)) {
      return {
        ok: true,
        mensaje: 'El rol admin ya tiene acceso total.',
        activados: 0,
      };
    }

    const plantilla = this.plantillaDe(rol);
    if (!plantilla) {
      // Rol sin plantilla definida: no es error, simplemente no hay sugerencia
      return {
        ok: false,
        mensaje: `No hay accesos sugeridos para el rol "${rol}". Configúralo por módulo.`,
        activados: 0,
      };
    }

    // La plantilla ya no es una lista de prefijos: dice qué MODULOS atiende el
    // rol y cuáles solo consulta. Se traduce a accesos y se aplica por la misma
    // puerta que usa la pantalla, para que no haya dos caminos distintos de
    // escribir la tabla de permisos.
    const accesos: Record<string, AccesoModulo> = {};
    for (const moduloId of plantilla.modulosConsulta ?? []) {
      accesos[moduloId] = 'consulta';
    }
    for (const moduloId of plantilla.modulos) {
      accesos[moduloId] = 'completo';
    }

    const resultado = await this.asignarModulosARol(rol, empresaId, accesos, modo);

    return {
      ok: true,
      mensaje: `"${plantilla.etiqueta}": ${resultado.activados} acciones activas en ${
        plantilla.modulos.length
      } ${plantilla.modulos.length === 1 ? 'módulo' : 'módulos'}${
        (plantilla.modulosConsulta?.length ?? 0) > 0
          ? ` y consulta en ${plantilla.modulosConsulta!.length} más`
          : ''
      }.`,
      activados: resultado.activados,
      rol,
    };
  }

  /** La plantilla del rol, tolerando mayúsculas y acentos en el nombre. */
  private plantillaDe(rol: string) {
    const clave = normalizarRol(rol);
    return PLANTILLAS_PERMISOS.find((p) => normalizarRol(p.rol) === clave);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMINISTRACION POR MODULO
  // --------------------------------------------------------------------------
  // La tabla `rol_endpoint_permiso` no cambia: sigue siendo endpoint por
  // endpoint, y el guard le sigue preguntando a ella. Lo que cambia es por
  // dónde se administra. Un módulo es un conjunto de rutas declarado en
  // `modulos-catalogo.ts`, y conceder un módulo es encender de golpe todos sus
  // endpoints activos.
  //
  // Tres estados, y no más, porque son los que un administrador sabe explicar:
  //   completo → ver, crear, modificar y eliminar dentro del módulo
  //   consulta → solo los GET
  //   ninguno  → nada
  // `parcial` existe como lectura, no como opción: es lo que se ve cuando
  // alguien afinó a mano por acción.
  // ══════════════════════════════════════════════════════════════════════════

  /** Endpoints activos agrupados por módulo de negocio. */
  private async endpointsPorModulo() {
    const endpoints = await this.endpointRepo.find({ where: { activo: true } });
    const porModulo = new Map<string, Endpoint[]>();
    for (const ep of endpoints) {
      const moduloId = moduloDeRuta(ep.ruta);
      const lista = porModulo.get(moduloId) ?? [];
      lista.push(ep);
      porModulo.set(moduloId, lista);
    }
    return porModulo;
  }

  private esConsulta(ep: Endpoint) {
    return ep.metodo === 'GET';
  }

  /**
   * Catálogo de módulos con lo que hay dentro de cada uno. El módulo "Otros"
   * solo se devuelve si de verdad recogió algo: si aparece, es que falta
   * declarar rutas en el catálogo.
   */
  async obtenerModulos() {
    const porModulo = await this.endpointsPorModulo();
    return MODULOS_NEGOCIO.filter(
      (m) => m.id !== MODULO_OTROS || (porModulo.get(m.id)?.length ?? 0) > 0,
    ).map((m) => {
      const eps = porModulo.get(m.id) ?? [];
      return {
        id: m.id,
        nombre: m.nombre,
        descripcion: m.descripcion,
        icono: m.icono,
        grupo: m.grupo,
        orden: m.orden,
        sensible: !!m.sensible,
        acciones: eps.length,
        accionesConsulta: eps.filter((ep) => this.esConsulta(ep)).length,
      };
    });
  }

  /** Qué tiene concedido un rol, módulo por módulo. */
  async obtenerModulosDeRol(rol: string, empresaId: string) {
    const catalogo = await this.obtenerModulos();
    const administrador = esRolAdministrador(rol);
    const piso = this.pisoDeRol(rol);
    const porModulo = await this.endpointsPorModulo();

    const concedidos = new Set<string>();
    if (!administrador) {
      const permisos = await this.permisoRepo
        .createQueryBuilder('p')
        .select('p.endpointId', 'endpointId')
        .where('p.empresaId = :empresaId', { empresaId })
        .andWhere('p.permitido = true')
        .andWhere(this.consultaRolNormalizado('p'), {
          rolNormalizado: normalizarRol(rol),
        })
        .getRawMany<{ endpointId: string }>();
      for (const fila of permisos) concedidos.add(fila.endpointId);
    }

    return catalogo.map((m) => {
      const eps = porModulo.get(m.id) ?? [];
      const activos = administrador
        ? eps.length
        : eps.filter((ep) => concedidos.has(ep.id)).length;
      const consulta = eps.filter((ep) => this.esConsulta(ep));
      const consultaActivos = administrador
        ? consulta.length
        : consulta.filter((ep) => concedidos.has(ep.id)).length;

      let estado: 'completo' | 'consulta' | 'parcial' | 'ninguno' = 'parcial';
      if (activos === 0) estado = 'ninguno';
      else if (activos === eps.length) estado = 'completo';
      else if (activos === consulta.length && consultaActivos === consulta.length)
        estado = 'consulta';

      /*
       * `minimo` viaja hasta la pantalla para que el candado se vea antes de
       * intentarlo. Un botón que se puede pulsar y luego se deshace solo es
       * peor que un botón que dice por qué no se puede.
       */
      return { ...m, activos, consultaActivos, estado, minimo: piso.has(m.id) };
    });
  }

  /**
   * El ajuste fino, cuando hace falta: las acciones de UN módulo agrupadas por
   * sección, con lo que el rol tiene concedido en cada una.
   *
   * Vive aquí y no en el frontend porque quien decide qué ruta pertenece a qué
   * módulo es el catálogo, y tener esa decisión en dos sitios es como se acaba
   * con una pantalla que concede un permiso distinto del que enseña.
   */
  async obtenerAccionesDeModulo(
    rol: string,
    empresaId: string,
    moduloId: string,
  ) {
    const porModulo = await this.endpointsPorModulo();
    const eps = porModulo.get(moduloId) ?? [];
    const administrador = esRolAdministrador(rol);

    const concedidos = new Set<string>();
    if (!administrador && eps.length > 0) {
      const permisos = await this.permisoRepo
        .createQueryBuilder('p')
        .select('p.endpointId', 'endpointId')
        .where('p.empresaId = :empresaId', { empresaId })
        .andWhere('p.permitido = true')
        .andWhere(this.consultaRolNormalizado('p'), {
          rolNormalizado: normalizarRol(rol),
        })
        .getRawMany<{ endpointId: string }>();
      for (const fila of permisos) concedidos.add(fila.endpointId);
    }

    const secciones = new Map<
      string,
      { clave: string; etiqueta: string; rutaFrontend: string | null; acciones: any[] }
    >();

    for (const ep of eps) {
      const partes = ep.ruta.split('/').filter(Boolean);
      // La seccion es el segundo segmento cuando existe y no es un parametro:
      // /catalogo/productos -> productos. Si no, el primero: /clientes.
      const segundo = partes[1] && !partes[1].startsWith(':') ? partes[1] : null;
      const clave = segundo ? `${partes[0]}/${segundo}` : (partes[0] ?? 'general');
      const etiqueta = this.humanizar(segundo ?? partes[0] ?? 'general');

      if (!secciones.has(clave)) {
        secciones.set(clave, {
          clave,
          etiqueta,
          rutaFrontend: null,
          acciones: [],
        });
      }
      const seccion = secciones.get(clave)!;
      if (!seccion.rutaFrontend && ep.rutaFrontend) {
        seccion.rutaFrontend = ep.rutaFrontend;
      }
      seccion.acciones.push({
        id: ep.id,
        metodo: ep.metodo,
        ruta: ep.ruta,
        nombre: ep.nombre,
        permitido: administrador || concedidos.has(ep.id),
      });
    }

    return Array.from(secciones.values())
      .map((seccion) => ({
        ...seccion,
        acciones: seccion.acciones.sort(
          (a, b) => a.ruta.localeCompare(b.ruta) || a.metodo.localeCompare(b.metodo),
        ),
      }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
  }

  /**
   * Escribe el acceso de un rol por módulos.
   *
   * Solo se tocan los módulos que vengan en `accesos`. Un módulo que no se
   * menciona se queda como estaba, y eso es deliberado: si alguien afinó a mano
   * una acción suelta en otro módulo, guardar aquí no se la borra.
   *
   * `modo: 'reemplazar'` (el de la pantalla) escribe el módulo tal cual: lo que
   * no corresponde al acceso elegido queda apagado dentro de ese módulo.
   * `'agregar'` solo enciende, y es el que usan las plantillas cuando alguien
   * quiere sumar un perfil sobre otro.
   */
  /*
   * ══════════════════════════════════════════════════════════════════════════
   * El piso: lo que a un rol no se le puede quitar
   * --------------------------------------------------------------------------
   * Un rol del catálogo existe porque alguien hace ese trabajo. Dejarlo sin sus
   * módulos no es «configurarlo restrictivo»: es dejar a esas personas sin poder
   * trabajar, y el efecto no se ve al guardar —se ve al día siguiente, cuando
   * el almacenista no puede recibir mercancía y nadie sabe por qué—.
   *
   * La regla, dicha en una línea: **de los módulos propios de un rol se puede
   * quitar la escritura, no la consulta.** Agregar módulos es libre; quitar por
   * debajo del piso se ajusta solo y se avisa de lo que se ajustó.
   *
   * Consulta y no acceso completo, a propósito: un administrador tiene motivos
   * legítimos para quitarle a un rol la capacidad de modificar —una empresa
   * donde el almacenista cuenta pero no corrige existencias es una empresa
   * razonable—. Lo que no tiene sentido es que no pueda ni ver su propio
   * almacén; eso no es una política, es un rol roto.
   *
   * El administrador no tiene piso porque no tiene tabla: `esRolAdministrador`
   * la salta entera.
   * ══════════════════════════════════════════════════════════════════════════
   */
  private pisoDeRol(rol: string): Set<string> {
    if (esRolAdministrador(rol)) return new Set();
    const plantilla = this.plantillaDe(rol);
    return new Set(plantilla?.modulos ?? []);
  }

  /**
   * ==========================================================================
   * El rol nace con lo suyo y eso ya no se le quita
   * --------------------------------------------------------------------------
   * Un rol se puede AMPLIAR cuanto se quiera. Lo que no se puede es recortarlo
   * por debajo de aquello con lo que opera: el almacenista sin recibir
   * mercancía, el cajero sin cobrar o el contador sin pólizas no son roles
   * restringidos, son roles rotos, y el que los rompe casi nunca es el mismo
   * que descubre el estropicio —lo descubre quien llega el lunes y no puede
   * trabajar, sin saber qué cambió ni cuándo.
   *
   * El piso es exactamente lo que la plantilla concede: los módulos que el rol
   * atiende por completo, y los GET de los que sólo consulta. Se devuelve como
   * ids de endpoint para poder compararlo con lo que se intenta escribir.
   * ==========================================================================
   */
  /**
   * Las acciones que este rol no puede tener, por pertenecer a un módulo que
   * su contrato le veda. Simétrico de `pisoDeAccionesDeRol`: aquél es el suelo
   * y éste el techo.
   */

  /*
   * ==========================================================================
   * MODULOS RECIEN SEPARADOS: una reconciliacion, una sola vez
   * --------------------------------------------------------------------------
   * El contrato de roles solo ENCIENDE. El piso repone lo que falta y el techo
   * apaga lo que esta vedado, pero nada retira un permiso que la plantilla
   * simplemente dejo de conceder. Y esta bien que asi sea: los permisos se
   * administran POR MODULO, de modo que un rol con mas modulos de los que su
   * plantilla exige puede ser una decision deliberada del administrador
   * —ampliar si, recortar por debajo de su trabajo no— y el arranque no tiene
   * por que deshacerla cada lunes.
   *
   * Eso deja un hueco cuando lo que cambia no es la plantilla sino la FRONTERA
   * entre modulos. El 21-sep-2026 «almacenes» se separo de «inventario»:
   * hasta ese dia `/catalogo/wms/*` y `/catalogo/almacenes` caian en
   * inventario, y cualquier rol con inventario en consulta —el comprador, el
   * vendedor, hoteleria— tenia el almacen COMPLETO en lectura: conteos
   * fisicos, ubicaciones, reubicaciones, transferencias e integridad de
   * posiciones. Al separarlo, esas filas quedaron huerfanas: encendidas, y
   * pertenecientes a un modulo que ninguna plantilla concede.
   *
   * Aqui se corrigen, y la correccion es segura de demostrar: un modulo que no
   * existia hasta hoy no pudo ser concedido por nadie, asi que toda fila suya
   * viene del reparto viejo y ninguna expresa intencion de un administrador.
   *
   * Es idempotente: en cuanto las filas se apagan, las vueltas siguientes no
   * encuentran nada. Un modulo se quita de esta lista cuando ya no haya bases
   * anteriores a su separacion.
   */
  private static readonly MODULOS_RECIEN_SEPARADOS = ['almacenes'];

  private async reconciliarModulosRecienSeparados(): Promise<number> {
    const porModulo = await this.endpointsPorModulo();
    const empresas = await this.permisoRepo
      .createQueryBuilder('p')
      .select('DISTINCT p.empresaId', 'empresaId')
      .getRawMany<{ empresaId: string }>();

    let apagadas = 0;
    for (const moduloId of PermisosDinamicosService.MODULOS_RECIEN_SEPARADOS) {
      const endpoints = porModulo.get(moduloId) ?? [];
      if (!endpoints.length) continue;
      const idsDelModulo = new Set(endpoints.map((ep) => ep.id));

      for (const plantilla of PLANTILLAS_PERMISOS) {
        const rol = normalizarRol(plantilla.rol);
        if (esRolAdministrador(rol)) continue;

        const concedido =
          (plantilla.modulos ?? []).includes(moduloId) ||
          (plantilla.modulosConsulta ?? []).includes(moduloId);
        if (concedido) continue;

        // Lo que el contrato concede por ACCION se respeta aunque su modulo no
        // este concedido: para eso existe «irrenunciable».
        const salvadas = new Set<string>();
        for (const accion of plantilla.accionesIrrenunciables ?? []) {
          const ep = endpoints.find((e) => `${e.metodo} ${e.ruta}` === accion);
          if (ep) salvadas.add(ep.id);
        }

        for (const { empresaId } of empresas) {
          const filas = await this.permisoRepo.find({
            where: { empresaId, rol },
            select: ['id', 'endpointId', 'permitido'],
          });
          for (const fila of filas) {
            if (!fila.permitido) continue;
            if (!idsDelModulo.has(fila.endpointId)) continue;
            if (salvadas.has(fila.endpointId)) continue;
            fila.permitido = false;
            await this.permisoRepo.save(fila);
            apagadas += 1;
          }
        }
      }
    }
    if (apagadas) {
      this.logger.warn(
        `Modulos recien separados: ${apagadas} permiso(s) retirado(s) de roles que ya no los tienen en su contrato.`,
      );
    }
    return apagadas;
  }

  private async techoDeModulosVedados(rol: string): Promise<Set<string>> {
    const vedados = new Set<string>();
    if (esRolAdministrador(rol)) return vedados;

    const plantilla = this.plantillaDe(rol);
    if (!plantilla?.modulosVedados?.length) return vedados;

    const porModulo = await this.endpointsPorModulo();
    for (const moduloId of plantilla.modulosVedados) {
      for (const ep of porModulo.get(moduloId) ?? []) vedados.add(ep.id);
    }
    return vedados;
  }

  private async pisoDeAccionesDeRol(rol: string): Promise<Set<string>> {
    const protegidos = new Set<string>();
    if (esRolAdministrador(rol)) return protegidos;

    const plantilla = this.plantillaDe(rol);
    if (!plantilla) return protegidos;

    const porModulo = await this.endpointsPorModulo();
    for (const moduloId of plantilla.modulos) {
      for (const ep of porModulo.get(moduloId) ?? []) protegidos.add(ep.id);
    }
    for (const moduloId of plantilla.modulosConsulta ?? []) {
      for (const ep of porModulo.get(moduloId) ?? []) {
        if (this.esConsulta(ep)) protegidos.add(ep.id);
      }
    }
    return protegidos;
  }

  /** Los módulos propios de un rol, para que la pantalla pueda marcarlos. */
  modulosMinimosDeRol(rol: string): string[] {
    return Array.from(this.pisoDeRol(rol));
  }

  async asignarModulosARol(
    rol: string,
    empresaId: string,
    accesos: Record<string, AccesoModulo>,
    modo: 'agregar' | 'reemplazar' = 'reemplazar',
  ) {
    if (esRolAdministrador(rol)) {
      return {
        ok: true,
        mensaje: 'El rol administrador no pasa por la tabla de permisos.',
        activados: 0,
      };
    }

    const porModulo = await this.endpointsPorModulo();
    const permisos: Record<string, boolean> = {};
    let activados = 0;

    /*
     * Se sube a `consulta` lo que se pidió dejar en `ninguno` dentro del piso
     * del rol, y se anota para poder decirlo. En modo `reemplazar` hay que
     * añadir además los módulos del piso que ni siquiera vinieron mencionados:
     * si no, se apagarían por omisión.
     */
    const plantilla = this.plantillaDe(rol);
    const piso = this.pisoDeRol(rol);
    const pisoConsulta = new Set(plantilla?.modulosConsulta ?? []);
    const ajustados: string[] = [];
    const efectivos: Record<string, AccesoModulo> = { ...accesos };

    /*
     * Los módulos que el rol atiende por completo se quedan completos. Antes
     * se degradaban a consulta, que es tanto como decirle al almacenista que
     * puede mirar el almacén: el rol dejaba de poder trabajar y nadie se
     * enteraba hasta el lunes. Ampliar sí, recortar por debajo de su trabajo
     * no.
     */
    for (const moduloId of piso) {
      if (efectivos[moduloId] !== 'completo') {
        if (efectivos[moduloId] || modo === 'reemplazar') ajustados.push(moduloId);
        efectivos[moduloId] = 'completo';
      }
    }
    // Y los de sólo consulta conservan al menos la consulta.
    for (const moduloId of pisoConsulta) {
      const pedido = efectivos[moduloId];
      if (pedido === 'ninguno' || (modo === 'reemplazar' && !pedido)) {
        if (pedido === 'ninguno') ajustados.push(moduloId);
        efectivos[moduloId] = 'consulta';
      }
    }
    /*
     * El techo va al final y gana sobre todo lo anterior: un módulo vedado no
     * se concede aunque venga pedido en la pantalla. `actualizarPermisos`
     * vuelve a aplicarlo acción por acción —es la única puerta de escritura—,
     * pero dejarlo también aquí evita que la pantalla de roles muestre por un
     * instante un módulo encendido que el servidor va a apagar.
     */
    for (const moduloId of plantilla?.modulosVedados ?? []) {
      if (efectivos[moduloId] && efectivos[moduloId] !== 'ninguno') {
        ajustados.push(moduloId);
      }
      efectivos[moduloId] = 'ninguno';
    }

    for (const [moduloId, eps] of porModulo.entries()) {
      if (!MODULOS_POR_ID.has(moduloId) && moduloId !== MODULO_OTROS) continue;
      const acceso = efectivos[moduloId];
      if (!acceso) continue; // módulo no mencionado: se queda como está

      for (const ep of eps) {
        const conceder =
          acceso === 'completo' || (acceso === 'consulta' && this.esConsulta(ep));
        if (conceder) {
          permisos[ep.id] = true;
          activados += 1;
        } else if (modo === 'reemplazar') {
          permisos[ep.id] = false;
        }
      }
    }

    await this.actualizarPermisos(rol, permisos, empresaId);
    if (ajustados.length) {
      this.logger.warn(
        `Se intentó recortar al rol "${rol}" en ${ajustados.join(', ')}; se conservó su mínimo operativo.`,
      );
    }
    return {
      ok: true,
      activados,
      ajustados,
      aviso: ajustados.length
        ? `Estos módulos son el trabajo propio del rol y se conservaron: ${ajustados
            .map((m) => MODULOS_POR_ID.get(m)?.nombre ?? m)
            .join(', ')}. A un rol se le puede dar más, no menos de aquello con lo que opera.`
        : null,
    };
  }
}
