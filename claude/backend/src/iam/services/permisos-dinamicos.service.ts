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
import { ENDPOINTS_NAVEGABLES } from '../data/endpoints-navegables';
import { esRolAdministrador, normalizarRol } from '../utils/roles.util';
import { SKIP_PERMISOS_KEY } from '../decorators/skip-permisos.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

const METHOD_MAP: Record<number, string> = {
  0: 'GET',
  1: 'POST',
  2: 'PUT',
  3: 'PATCH',
  4: 'DELETE',
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
    this.cache.clear();
    this.logger.log(
      `Sincronizacion completada: ${clavesDescubiertas.size} endpoints activos, ${obsoletos} obsoletos desactivados`,
    );
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
    return Array.from(
      new Set(
        [
          'admin',
          'empleado',
          'comprador',
          'almacenista',
          'finanzas',
          ...rolesPermisos.map((r) => String(r.rol)),
          ...rolesUsuarios.map((r: { rol: string }) => String(r.rol)),
        ].filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
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
  async obtenerRutasPermitidas(
    rol: string,
    empresaId: string,
  ): Promise<string[]> {
    if (esRolAdministrador(rol)) return ['*'];

    // SQL directo con nombres reales de columnas (snake_case en BD)
    const SQL_RUTAS = `
      SELECT DISTINCT e.ruta_frontend
        FROM rol_endpoint_permisos rep
        JOIN endpoints e ON e.id = rep.endpoint_id
       WHERE UPPER(REPLACE(REPLACE(LTRIM(RTRIM(rep.rol)), '-', '_'), ' ', '_')) = $1
         AND rep.empresaId = $2
         AND rep.permitido = 1
         AND e.ruta_frontend IS NOT NULL
         AND e.activo=true`;

    const SQL_EPS = `
      SELECT DISTINCT e.metodo, e.ruta
        FROM rol_endpoint_permisos rep
        JOIN endpoints e ON e.id = rep.endpoint_id
       WHERE UPPER(REPLACE(REPLACE(LTRIM(RTRIM(rep.rol)), '-', '_'), ' ', '_')) = $1
         AND rep.empresaId = $2
         AND rep.permitido = 1`;

    const rolConsulta = normalizarRol(rol);
    const [rows, endpointsConPermiso] = await Promise.all([
      this.dataSource.query(SQL_RUTAS, [rolConsulta, empresaId]).catch((error) => {
        this.logger.error('No se pudieron consultar las rutas permitidas.', error?.stack);
        return [];
      }),
      this.dataSource.query(SQL_EPS, [rolConsulta, empresaId]).catch((error) => {
        this.logger.error('No se pudieron consultar los endpoints permitidos.', error?.stack);
        return [];
      }),
    ]);

    const rutasSet = new Set<string>(
      (rows as Array<{ ruta_frontend: string }>)
        .map((r) => r.ruta_frontend)
        .filter(Boolean),
    );

    // Completar con diccionario estático para endpoints sin ruta_frontend en BD
    for (const ep of endpointsConPermiso as Array<{
      metodo: string;
      ruta: string;
    }>) {
      const clave = ep.metodo + ' ' + ep.ruta;
      const nav = ENDPOINTS_NAVEGABLES[clave];
      if (nav?.rutaFrontend) rutasSet.add(nav.rutaFrontend);
    }

    return Array.from(rutasSet);
  }

  obtenerPlantillasDisponibles() {
    return PLANTILLAS_PERMISOS.map((p) => ({
      rol: p.rol,
      etiqueta: p.etiqueta,
      descripcion: p.descripcion,
    }));
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

    const plantilla = PLANTILLAS_PERMISOS.find((p) => p.rol === rol);
    if (!plantilla) {
      // Rol sin plantilla definida: no es error, simplemente no hay sugerencia
      return {
        ok: false,
        mensaje: `No hay permisos sugeridos para el rol "${rol}". Configúralo manualmente.`,
        activados: 0,
      };
    }

    const todosEndpoints = await this.endpointRepo.find({
      where: { activo: true },
    });

    // Un endpoint aplica si su ruta empieza por alguno de los prefijos del rol
    const aplica = (ruta: string) =>
      plantilla.prefijos.some((pref) => ruta === pref || ruta.startsWith(pref));

    const permisos: Record<string, boolean> = {};
    let activados = 0;

    for (const ep of todosEndpoints) {
      const debeActivar = aplica(ep.ruta);
      if (debeActivar) {
        permisos[ep.id] = true;
        activados++;
      } else if (modo === 'reemplazar') {
        permisos[ep.id] = false;
      }
      // en modo 'agregar' no tocamos los que no aplican
    }

    await this.actualizarPermisos(rol, permisos, empresaId);

    return {
      ok: true,
      mensaje: `Se activaron ${activados} permisos sugeridos para "${plantilla.etiqueta}".`,
      activados,
      rol,
    };
  }
}
