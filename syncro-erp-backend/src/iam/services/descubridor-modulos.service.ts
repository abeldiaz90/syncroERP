import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';

@Injectable()
export class DescubridorModulosService implements OnApplicationBootstrap {
  private modulos: string[] = [];

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap() {
    const controllers = this.discoveryService.getControllers();
    const modulosSet = new Set<string>();

    for (const wrapper of controllers) {
      const { metatype } = wrapper;
      if (!metatype) continue;

      const path = this.reflector.get<string>('path', metatype);
      if (!path) continue;

      const modulo = this.extraerModulo(path);
      if (modulo) modulosSet.add(modulo);
    }

    this.modulos = Array.from(modulosSet).sort();
  }

  obtenerModulos(): string[] {
    return this.modulos;
  }

  private extraerModulo(path: string): string | null {
    const partes = path.replace(/^\/+|\/+$/g, '').split('/');
    const prefijosNoModulo = ['api', 'catalogo', 'catalogos', 'compras', 'ventas', 'iam', 'permisos', 'auth'];

    for (let i = partes.length - 1; i >= 0; i--) {
      const parte = partes[i];
      if (parte.startsWith(':')) continue;
      if (prefijosNoModulo.includes(parte)) continue;
      return parte;
    }

    return partes[partes.length - 1] || null;
  }
}