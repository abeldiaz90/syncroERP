import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModulesContainer } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Controlador } from '../entities/controlador.entity';
import { Endpoint } from '../entities/endpoint.entity';
import { RolEndpointPermiso } from '../entities/rol-endpoint-permiso.entity';

const METHOD_MAP: Record<number, string> = {
  0: 'GET', 1: 'POST', 2: 'PUT', 3: 'PATCH',
  4: 'DELETE', 5: 'ALL', 6: 'OPTIONS', 7: 'HEAD',
};

const ROLES_CON_BYPASS = new Set(['admin', 'SUPER_ADMIN']);
const PREFIJOS_SISTEMA = new Set(['api', 'iam', '', 'app']);

interface ModuloMeta {
  titulo: string;
  icono: string;
  seccion: string;
  orden: number;
  rutaFrontendBase: string;
}

const MODULOS_META: Record<string, ModuloMeta> = {
  'ventas':           { titulo: 'Ventas',           icono: 'ShoppingBag',      seccion: 'Operaciones',    orden: 1,  rutaFrontendBase: '/dashboard/ventas' },
  'pos':              { titulo: 'Punto de Venta',    icono: 'ShoppingBag',      seccion: 'Operaciones',    orden: 2,  rutaFrontendBase: '/dashboard/ventas/pos' },
  'requisiciones':    { titulo: 'Compras',           icono: 'ShoppingCart',     seccion: 'Operaciones',    orden: 3,  rutaFrontendBase: '/dashboard/compras' },
  'cotizaciones':     { titulo: 'Compras',           icono: 'ShoppingCart',     seccion: 'Operaciones',    orden: 4,  rutaFrontendBase: '/dashboard/compras' },
  'ordenes':          { titulo: 'Compras',           icono: 'ShoppingCart',     seccion: 'Operaciones',    orden: 5,  rutaFrontendBase: '/dashboard/compras' },
  'aprobaciones':     { titulo: 'Compras',           icono: 'ShoppingCart',     seccion: 'Operaciones',    orden: 6,  rutaFrontendBase: '/dashboard/compras' },
  'clientes':         { titulo: 'Clientes',          icono: 'Users',            seccion: 'Catálogos Core', orden: 10, rutaFrontendBase: '/dashboard/clientes' },
  'proveedores':      { titulo: 'Proveedores',       icono: 'Truck',            seccion: 'Catálogos Core', orden: 11, rutaFrontendBase: '/dashboard/proveedores' },
  'productos':        { titulo: 'Inventario',        icono: 'Package',          seccion: 'Catálogos Core', orden: 20, rutaFrontendBase: '/dashboard/productos' },
  'catalogo':         { titulo: 'Inventario',        icono: 'Package',          seccion: 'Catálogos Core', orden: 20, rutaFrontendBase: '/dashboard/productos' },
  'categorias':       { titulo: 'Inventario',        icono: 'Package',          seccion: 'Catálogos Core', orden: 21, rutaFrontendBase: '/dashboard/categorias' },
  'marcas':           { titulo: 'Inventario',        icono: 'Package',          seccion: 'Catálogos Core', orden: 22, rutaFrontendBase: '/dashboard/marcas' },
  'almacenes':        { titulo: 'Inventario',        icono: 'Package',          seccion: 'Catálogos Core', orden: 23, rutaFrontendBase: '/dashboard/almacenes' },
  'inventario':       { titulo: 'Inventario',        icono: 'Package',          seccion: 'Catálogos Core', orden: 24, rutaFrontendBase: '/dashboard/inventario' },
  'recepciones':      { titulo: 'Inventario',        icono: 'Package',          seccion: 'Catálogos Core', orden: 25, rutaFrontendBase: '/dashboard/inventario/recepciones' },
  'impuestos':        { titulo: 'Finanzas & Loc.',   icono: 'CircleDollarSign', seccion: 'Sistema',        orden: 30, rutaFrontendBase: '/dashboard/impuestos' },
  'bancos':           { titulo: 'Finanzas & Loc.',   icono: 'CircleDollarSign', seccion: 'Sistema',        orden: 31, rutaFrontendBase: '/dashboard/catalogos/bancos' },
  'catalogos':        { titulo: 'Finanzas & Loc.',   icono: 'CircleDollarSign', seccion: 'Sistema',        orden: 32, rutaFrontendBase: '/dashboard/catalogos' },
  'listas-precio':    { titulo: 'Finanzas & Loc.',   icono: 'CircleDollarSign', seccion: 'Sistema',        orden: 33, rutaFrontendBase: '/dashboard/listas-precio' },
  'usuarios':         { titulo: 'Administración',    icono: 'Settings',         seccion: 'Sistema',        orden: 40, rutaFrontendBase: '/dashboard/usuarios' },
  'departamentos':    { titulo: 'Administración',    icono: 'Settings',         seccion: 'Sistema',        orden: 41, rutaFrontendBase: '/dashboard/departamentos' },
  'permisos':         { titulo: 'Administración',    icono: 'Settings',         seccion: 'Sistema',        orden: 42, rutaFrontendBase: '/dashboard/permisos' },
  'admin':            { titulo: 'Administración',    icono: 'Settings',         seccion: 'Sistema',        orden: 43, rutaFrontendBase: '/dashboard/permisos' },
  'configuraciones-aprobacion': { titulo: 'Administración', icono: 'Settings',  seccion: 'Sistema',        orden: 44, rutaFrontendBase: '/dashboard/configuraciones-aprobacion' },
};

interface EndpointNavMeta {
  rutaFrontend: string;
  titulo: string;
  ordenMenu: number;
}

const ENDPOINTS_NAVEGABLES: Record<string, EndpointNavMeta> = {
  'GET /ventas/historial':                              { rutaFrontend: '/dashboard/ventas/historial',           titulo: 'Historial de Ventas',    ordenMenu: 1  },
  'POST /ventas/pos':                                   { rutaFrontend: '/dashboard/ventas/pos',                 titulo: 'Punto de Venta (POS)',    ordenMenu: 2  },
  'GET /compras/requisiciones':                         { rutaFrontend: '/dashboard/compras/requisiciones',      titulo: 'Requisiciones',          ordenMenu: 3  },
  'GET /compras/cotizaciones':                          { rutaFrontend: '/dashboard/compras/cotizaciones',       titulo: 'Cotizaciones',           ordenMenu: 4  },
  'GET /compras/ordenes':                               { rutaFrontend: '/dashboard/compras/ordenes',            titulo: 'Ordenes de Compra',      ordenMenu: 5  },
  'GET /compras/requisiciones/aprobaciones/pendientes': { rutaFrontend: '/dashboard/compras/aprobaciones',       titulo: 'Aprobaciones',           ordenMenu: 6  },
  'GET /clientes':                                      { rutaFrontend: '/dashboard/clientes',                   titulo: 'Clientes',               ordenMenu: 10 },
  'GET /proveedores':                                   { rutaFrontend: '/dashboard/proveedores',                titulo: 'Proveedores',            ordenMenu: 11 },
  'GET /catalogo/productos':                            { rutaFrontend: '/dashboard/productos',                  titulo: 'Productos',              ordenMenu: 20 },
  'GET /catalogo/categorias':                           { rutaFrontend: '/dashboard/categorias',                 titulo: 'Categorias',             ordenMenu: 21 },
  'GET /catalogo/marcas':                               { rutaFrontend: '/dashboard/marcas',                     titulo: 'Marcas',                 ordenMenu: 22 },
  'GET /catalogo/almacenes':                            { rutaFrontend: '/dashboard/almacenes',                  titulo: 'Almacenes',              ordenMenu: 23 },
  'GET /compras/ordenes/:id':                           { rutaFrontend: '/dashboard/inventario/recepciones',     titulo: 'Recepciones',            ordenMenu: 24 },
  'POST /catalogo/inventario/productos/transferir':     { rutaFrontend: '/dashboard/inventario/transferencias',  titulo: 'Transferencias',         ordenMenu: 25 },
  'POST /catalogo/inventario/productos/ajuste':         { rutaFrontend: '/dashboard/inventario/ajustes',         titulo: 'Ajustes de Stock',       ordenMenu: 26 },
  'GET /catalogo/impuestos':                            { rutaFrontend: '/dashboard/impuestos',                  titulo: 'Impuestos',              ordenMenu: 30 },
  'GET /catalogos/bancos':                              { rutaFrontend: '/dashboard/catalogos/bancos',           titulo: 'Bancos',                 ordenMenu: 31 },
  'GET /catalogos/formas-pago':                         { rutaFrontend: '/dashboard/catalogos/formas-pago',      titulo: 'Formas de Pago',         ordenMenu: 32 },
  'GET /catalogos/paises':                              { rutaFrontend: '/dashboard/catalogos/paises',           titulo: 'Paises',                 ordenMenu: 33 },
  'GET /catalogos/estados':                             { rutaFrontend: '/dashboard/catalogos/estados',          titulo: 'Estados',                ordenMenu: 34 },
  'GET /usuarios':                                      { rutaFrontend: '/dashboard/usuarios',                   titulo: 'Usuarios',               ordenMenu: 40 },
  'GET /departamentos':                                 { rutaFrontend: '/dashboard/departamentos',              titulo: 'Departamentos',          ordenMenu: 41 },
  'GET /admin/permisos/arbol':                          { rutaFrontend: '/dashboard/permisos',                   titulo: 'Roles y Permisos',       ordenMenu: 42 },
  'GET /configuraciones-aprobacion/:id':                { rutaFrontend: '/dashboard/configuraciones-aprobacion', titulo: 'Flujos de Aprobacion',   ordenMenu: 43 },
  'GET /catalogo/listas-precio':                        { rutaFrontend: '/dashboard/listas-precio',              titulo: 'Listas de Precio',       ordenMenu: 44 },
};

@Injectable()
export class PermisosDinamicosService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermisosDinamicosService.name);
  private cache = new Map<string, boolean>();

  constructor(
    @InjectRepository(Controlador) private controladorRepo: Repository<Controlador>,
    @InjectRepository(Endpoint)    private endpointRepo:    Repository<Endpoint>,
    @InjectRepository(RolEndpointPermiso) private permisoRepo: Repository<RolEndpointPermiso>,
    private readonly modulesContainer: ModulesContainer,
  ) {}

  async onApplicationBootstrap() {
    await this.sincronizarControladoresYEndpoints();
  }

  private async sincronizarControladoresYEndpoints() {
    this.logger.log('Sincronizando controladores y endpoints...');
    await this.limpiarMetodosNumericos();

    const descubiertos = new Map<string, {
      nombreModulo: string;
      endpoints: Array<{ metodo: string; ruta: string; nombre: string }>;
    }>();

    for (const [, modulo] of this.modulesContainer.entries()) {
      for (const [, wrapper] of (modulo as any).controllers) {
        const instance = wrapper.instance;
        if (!instance) continue;

        const metatype = wrapper.metatype;
        const controladorPath: string = Reflect.getMetadata(PATH_METADATA, metatype) || '';
        const rutaBase = ('/' + controladorPath).replace(/\/+/g, '/').replace(/\/$/, '') || '/';

        const partes = rutaBase.replace(/^\//, '').split('/');
        const nombreModulo = partes.find(p => !PREFIJOS_SISTEMA.has(p) && !p.startsWith(':')) || 'general';

        if (!descubiertos.has(rutaBase)) {
          descubiertos.set(rutaBase, { nombreModulo, endpoints: [] });
        }

        const entrada = descubiertos.get(rutaBase)!;
        const prototype = Object.getPrototypeOf(instance);

        for (const key of Object.getOwnPropertyNames(prototype)) {
          if (key === 'constructor') continue;
          const metodoNum: number = Reflect.getMetadata(METHOD_METADATA, prototype[key]);
          const rutaHandler: string = Reflect.getMetadata(PATH_METADATA, prototype[key]) || '';
          if (metodoNum === undefined || metodoNum === null) continue;

          const metodoStr = METHOD_MAP[metodoNum];
          if (!metodoStr || metodoStr === 'ALL') continue;

          const rutaCompleta = (rutaBase + '/' + rutaHandler).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
          const rutaNormalizada = rutaCompleta.replace(/\/:\w+/g, '/:id');

          const yaExiste = entrada.endpoints.some(e => e.metodo === metodoStr && e.ruta === rutaNormalizada);
          if (!yaExiste) {
            entrada.endpoints.push({ metodo: metodoStr, ruta: rutaNormalizada, nombre: this.humanizar(key) });
          }
        }
      }
    }

    const porModulo = new Map<string, {
      meta: ModuloMeta;
      endpoints: Array<{ metodo: string; ruta: string; nombre: string }>;
    }>();

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

      const mod = porModulo.get(nombreModulo)!;
      for (const ep of endpoints) {
        const yaExiste = mod.endpoints.some(e => e.metodo === ep.metodo && e.ruta === ep.ruta);
        if (!yaExiste) mod.endpoints.push(ep);
      }
    }

    for (const [nombreModulo, { meta, endpoints }] of porModulo.entries()) {
      if (endpoints.length === 0) continue;

      let ctrl = await this.controladorRepo.findOne({ where: { nombre: nombreModulo } });
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
          })
        );
      } else {
        let actualizado = false;
        if (ctrl.icono !== meta.icono)    { ctrl.icono    = meta.icono;    actualizado = true; }
        if (ctrl.seccion !== meta.seccion){ ctrl.seccion  = meta.seccion;  actualizado = true; }
        if (ctrl.titulo !== meta.titulo)  { ctrl.titulo   = meta.titulo;   actualizado = true; }
        if (actualizado) await this.controladorRepo.save(ctrl);
      }

      for (const ep of endpoints) {
        const claveNav = `${ep.metodo} ${ep.ruta}`;
        const navMeta = ENDPOINTS_NAVEGABLES[claveNav];

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
            })
          );
        } else {
          let actualizado = false;
          if (navMeta && existente.rutaFrontend !== navMeta.rutaFrontend) { existente.rutaFrontend = navMeta.rutaFrontend; actualizado = true; }
          if (navMeta && existente.esNavegable !== true)                  { existente.esNavegable  = true;                 actualizado = true; }
          if (navMeta && existente.nombre !== navMeta.titulo)             { existente.nombre       = navMeta.titulo;       actualizado = true; }
          if (existente.controladorId !== ctrl.id)                        { existente.controladorId = ctrl.id;             actualizado = true; }
          if (actualizado) await this.endpointRepo.save(existente);
        }
      }
    }

    this.logger.log('Sincronizacion completada');
  }

  async obtenerArbolPermisos() {
    const controladores = await this.controladorRepo.find({ where: { activo: true }, order: { orden: 'ASC' } });
    const endpoints = await this.endpointRepo.find({ where: { activo: true }, relations: ['controlador'] });
    return controladores
      .map(ctrl => ({ ...ctrl, endpoints: endpoints.filter(ep => ep.controladorId === ctrl.id) }))
      .filter(ctrl => ctrl.endpoints.length > 0);
  }

  async obtenerMenuParaRol(rol: string, empresaId: string) {
    const esAdmin = ROLES_CON_BYPASS.has(rol);

    const endpointsNavegables = await this.endpointRepo.find({
      where: { activo: true, esNavegable: true },
      relations: ['controlador'],
      order: { ordenMenu: 'ASC' },
    });

    if (esAdmin) return this.agruparEndpointsPorSeccion(endpointsNavegables);

    const permisosBD = await this.permisoRepo.find({ where: { rol, empresaId, permitido: true } });
    const idsPermitidos = new Set(permisosBD.map(p => p.endpointId));
    return this.agruparEndpointsPorSeccion(endpointsNavegables.filter(ep => idsPermitidos.has(ep.id)));
  }

  private agruparEndpointsPorSeccion(endpoints: Endpoint[]) {
    const secciones = new Map<string, {
      seccion: string;
      modulos: Map<string, { titulo: string; icono: string; orden: number; items: Array<{ titulo: string; rutaFrontend: string; ordenMenu: number }> }>;
    }>();

    for (const ep of endpoints) {
      if (!ep.rutaFrontend || !ep.controlador) continue;
      const seccion      = ep.controlador.seccion || 'General';
      const moduloTitulo = ep.controlador.titulo;
      const moduloIcono  = ep.controlador.icono || 'Folder';
      const moduloOrden  = ep.controlador.orden ?? 99;

      if (!secciones.has(seccion)) secciones.set(seccion, { seccion, modulos: new Map() });
      const sec = secciones.get(seccion)!;

      if (!sec.modulos.has(moduloTitulo)) sec.modulos.set(moduloTitulo, { titulo: moduloTitulo, icono: moduloIcono, orden: moduloOrden, items: [] });
      const mod = sec.modulos.get(moduloTitulo)!;

      if (!mod.items.some(i => i.rutaFrontend === ep.rutaFrontend)) {
        mod.items.push({ titulo: ep.nombre, rutaFrontend: ep.rutaFrontend, ordenMenu: ep.ordenMenu });
      }
    }

    return Array.from(secciones.values()).map(sec => ({
      seccion: sec.seccion,
      modulos: Array.from(sec.modulos.values())
        .sort((a, b) => a.orden - b.orden)
        .map(mod => ({ ...mod, items: mod.items.sort((a, b) => a.ordenMenu - b.ordenMenu) })),
    }));
  }

  // ─────────────────────────────────────────────────────────────────
  // VALIDACION PRINCIPAL — con fix del prefijo /api
  // ─────────────────────────────────────────────────────────────────
  async verificarPermiso(empresaId: string, rol: string, metodo: string, ruta: string): Promise<boolean> {
    if (ROLES_CON_BYPASS.has(rol)) return true;

    const metodoLimpio = metodo.toUpperCase();

    // FIX: NestJS expone la ruta con el prefijo global /api
    // pero en BD esta guardada sin ese prefijo.
    const rutaSinPrefijo = ruta.startsWith('/api') ? ruta.slice(4) : ruta;

    const rutaLimpia = rutaSinPrefijo
      .replace(/\/+$/, '')
      .replace(/\/[0-9a-fA-F-]{36}/g, '/:id')
      .replace(/\/:\w+/g, '/:id');

    const cacheKey = `${empresaId}:${rol}:${metodoLimpio}:${rutaLimpia}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;

    const endpoint = await this.endpointRepo.findOne({ where: { metodo: metodoLimpio, ruta: rutaLimpia } });
    if (!endpoint) { this.cache.set(cacheKey, false); return false; }

    const permiso = await this.permisoRepo.findOne({
      where: { empresaId, rol, endpointId: endpoint.id, permitido: true },
    });

    const tieneAcceso = !!permiso;
    this.cache.set(cacheKey, tieneAcceso);
    return tieneAcceso;
  }

  async obtenerPermisosPorRolParaFrontend(rol: string, empresaId: string): Promise<Record<string, boolean>> {
    if (ROLES_CON_BYPASS.has(rol)) return {};
    const todosEndpoints = await this.endpointRepo.find({ where: { activo: true } });
    const permisosBD     = await this.permisoRepo.find({ where: { rol, empresaId } });
    const permisosPorEndpointId = new Map(permisosBD.map(p => [p.endpointId, p.permitido]));
    const resultado: Record<string, boolean> = {};
    for (const ep of todosEndpoints) {
      resultado[`${ep.metodo} ${ep.ruta}`] = permisosPorEndpointId.get(ep.id) ?? false;
    }
    return resultado;
  }

  async obtenerPermisosPorRol(rol: string, empresaId: string): Promise<Record<string, boolean>> {
    const todosEndpoints = await this.endpointRepo.find({ where: { activo: true } });
    if (ROLES_CON_BYPASS.has(rol)) {
      const resultado: Record<string, boolean> = {};
      for (const ep of todosEndpoints) resultado[ep.id] = true;
      return resultado;
    }
    const permisosBD = await this.permisoRepo.find({ where: { rol, empresaId } });
    const permisosPorEndpointId = new Map(permisosBD.map(p => [p.endpointId, p.permitido]));
    const resultado: Record<string, boolean> = {};
    for (const ep of todosEndpoints) {
      resultado[ep.id] = permisosPorEndpointId.get(ep.id) ?? false;
    }
    return resultado;
  }

  async actualizarPermisos(rol: string, permisos: Record<string, boolean>, empresaId: string) {
    if (ROLES_CON_BYPASS.has(rol)) return;
    const existentes    = await this.permisoRepo.find({ where: { rol, empresaId } });
    const existentesMap = new Map(existentes.map(e => [e.endpointId, e]));
    for (const [endpointId, permitido] of Object.entries(permisos)) {
      const entity = existentesMap.get(endpointId);
      if (entity) {
        if (entity.permitido !== permitido) { entity.permitido = permitido; await this.permisoRepo.save(entity); }
      } else {
        await this.permisoRepo.save(this.permisoRepo.create({ empresaId, rol, endpointId, permitido }));
      }
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${empresaId}:${rol}:`)) this.cache.delete(key);
    }
  }

  async obtenerRolesDisponibles(empresaId: string): Promise<string[]> {
    const resultados = await this.permisoRepo
      .createQueryBuilder('p').select('DISTINCT p.rol', 'rol')
      .where('p.empresaId = :empresaId', { empresaId }).getRawMany();
    const rolesBd = resultados.map(r => r.rol as string);
    return Array.from(new Set(['admin', 'empleado', 'comprador', 'almacenista', 'finanzas', ...rolesBd]));
  }

  private async limpiarMetodosNumericos() {
    const todos  = await this.endpointRepo.find();
    const sucios = todos.filter(ep => !isNaN(Number(ep.metodo)));
    if (sucios.length === 0) return;
    this.logger.warn(`Corrigiendo ${sucios.length} endpoints con metodo numerico...`);
    for (const ep of sucios) {
      const metodoStr = METHOD_MAP[Number(ep.metodo)];
      if (!metodoStr) continue;
      const correcto = await this.endpointRepo.findOne({ where: { metodo: metodoStr, ruta: ep.ruta } });
      if (correcto) {
        const permisosSucios = await this.permisoRepo.find({ where: { endpointId: ep.id } });
        for (const permiso of permisosSucios) {
          const existeEnCorrecto = await this.permisoRepo.findOne({
            where: { empresaId: permiso.empresaId, rol: permiso.rol, endpointId: correcto.id },
          });
          if (!existeEnCorrecto) { permiso.endpointId = correcto.id; await this.permisoRepo.save(permiso); }
          else {
            if (existeEnCorrecto.permitido !== permiso.permitido) { existeEnCorrecto.permitido = permiso.permitido; await this.permisoRepo.save(existeEnCorrecto); }
            await this.permisoRepo.delete(permiso.id);
          }
        }
        ep.metodo = metodoStr; ep.activo = false; await this.endpointRepo.save(ep);
      } else {
        ep.metodo = metodoStr; await this.endpointRepo.save(ep);
      }
    }
  }

  private humanizar(str: string): string {
    return str.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
  }
}