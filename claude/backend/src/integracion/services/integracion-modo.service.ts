import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModoCartera, ModoContabilidad } from '../integracion.constants';
import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';

const JERARQUIA = [
  ModoCartera.APAGADO,
  ModoCartera.SOMBRA,
  ModoCartera.AUTORIDAD,
];

/**
 * Resuelve el perfil de integración de cada empresa: cuánta autoridad tiene el
 * registro externo sobre la cartera, y si se espeja la contabilidad.
 *
 * Los dos ejes son independientes; ambos tienen techo global y ambos están
 * apagados por omisión, que es lo que hace que una empresa sin el módulo
 * contratado no note absolutamente nada.
 *
 * `CARTERA_MODO` (con `FINERACT_MODO` como alias heredado) fija el techo
 * global: una empresa puede bajar su modo, nunca subirlo por encima del global.
 * Es la protección contra encender por accidente a todos los inquilinos.
 */
@Injectable()
export class IntegracionModoService {
  private readonly cache = new Map<
    string,
    {
      valor: { cartera: ModoCartera; contabilidad: ModoContabilidad };
      expira: number;
    }
  >();

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(ConfiguracionIntegracionEmpresa)
    private readonly repo: Repository<ConfiguracionIntegracionEmpresa>,
  ) {}

  get modoGlobal(): ModoCartera {
    const bruto = (
      this.config.get<string>('CARTERA_MODO') ??
      this.config.get<string>('FINERACT_MODO') ??
      ModoCartera.APAGADO
    )
      .trim()
      .toUpperCase();
    return JERARQUIA.includes(bruto as ModoCartera)
      ? (bruto as ModoCartera)
      : ModoCartera.APAGADO;
  }

  /**
   * Combina el techo global con lo que pidió la empresa.
   *
   * Una empresa SIN decisión explícita queda APAGADA, nunca hereda el techo
   * global. La primera versión devolvía el modo global cuando la empresa no
   * tenía fila, con lo que encender el techo arrastraba a todos los inquilinos
   * que jamás contrataron el módulo. El global es un techo, no un valor por
   * omisión: sólo puede bajar lo que una empresa pidió, nunca encender lo que
   * nadie pidió.
   */
  combinar(modoEmpresa?: ModoCartera | null): ModoCartera {
    if (!modoEmpresa) return ModoCartera.APAGADO;
    const empresa = JERARQUIA.indexOf(modoEmpresa);
    if (empresa <= 0) return ModoCartera.APAGADO;
    return JERARQUIA[Math.min(JERARQUIA.indexOf(this.modoGlobal), empresa)];
  }

  /** Techo global del espejo contable. */
  get modoContabilidadGlobal(): ModoContabilidad {
    const bruto = (
      this.config.get<string>('CONTABILIDAD_EXTERNA_MODO') ??
      ModoContabilidad.APAGADO
    )
      .trim()
      .toUpperCase();
    return bruto === ModoContabilidad.ESPEJO
      ? ModoContabilidad.ESPEJO
      : ModoContabilidad.APAGADO;
  }

  combinarContabilidad(modoEmpresa?: ModoContabilidad | null): ModoContabilidad {
    if (this.modoContabilidadGlobal === ModoContabilidad.APAGADO) {
      return ModoContabilidad.APAGADO;
    }
    return modoEmpresa === ModoContabilidad.ESPEJO
      ? ModoContabilidad.ESPEJO
      : ModoContabilidad.APAGADO;
  }

  async modoDe(empresaId: string): Promise<ModoCartera> {
    return (await this.perfilDe(empresaId)).cartera;
  }

  async modoContabilidadDe(empresaId: string): Promise<ModoContabilidad> {
    return (await this.perfilDe(empresaId)).contabilidad;
  }

  async perfilDe(
    empresaId: string,
  ): Promise<{ cartera: ModoCartera; contabilidad: ModoContabilidad }> {
    const enCache = this.cache.get(empresaId);
    if (enCache && enCache.expira > Date.now()) return enCache.valor;

    const fila = await this.repo.findOne({ where: { empresaId } });
    const valor = {
      cartera: this.combinar(fila?.modo ?? null),
      contabilidad: this.combinarContabilidad(fila?.modoContabilidad ?? null),
    };
    this.cache.set(empresaId, { valor, expira: Date.now() + 60_000 });
    return valor;
  }

  /** Se llama al cambiar la configuración para que el cambio surta de inmediato. */
  invalidar(empresaId: string): void {
    this.cache.delete(empresaId);
  }

  /** Empresas con algún eje encendido. Las demás no se tocan nunca. */
  /**
   * Cambia el modo de cartera de una empresa aplicando la regla que gobierna el
   * paso a AUTORIDAD.
   *
   * La comprobación vive AQUÍ y no en el controlador. Estaba en el controlador,
   * y eso significa que la regla se cumplía sólo si el cambio entraba por esa
   * ruta: un script, una tarea programada o un endpoint nuevo podían subir a
   * AUTORIDAD sin comprobar nada, y nadie se enteraría hasta que la cartera
   * estuviera mal. Una regla que protege un sistema de registro no puede
   * depender de por dónde entró la petición.
   *
   * `contarDiscrepanciasAbiertas` se recibe como función para no atar este
   * servicio al de conciliación —que ya depende de éste— y evitar el ciclo.
   */
  async establecerModoCartera(
    empresaId: string,
    modo: ModoCartera,
    contarDiscrepanciasAbiertas: (empresaId: string) => Promise<number>,
  ): Promise<{ aplicado: boolean; motivo?: string }> {
    if (modo === ModoCartera.AUTORIDAD) {
      const abiertas = await contarDiscrepanciasAbiertas(empresaId);
      if (abiertas > 0) {
        return {
          aplicado: false,
          motivo: `Hay ${abiertas} discrepancia(s) de conciliación sin resolver.`,
        };
      }
    }

    const fila =
      (await this.repo.findOne({ where: { empresaId } })) ??
      this.repo.create({ empresaId, parametrosProveedor: {} });
    fila.modo = modo;
    await this.repo.save(fila);
    this.cache.delete(empresaId);
    return { aplicado: true };
  }

  async empresasActivas(): Promise<ConfiguracionIntegracionEmpresa[]> {
    const filas = await this.repo.find();
    return filas.filter(
      (f) =>
        this.combinar(f.modo) !== ModoCartera.APAGADO ||
        this.combinarContabilidad(f.modoContabilidad) !==
          ModoContabilidad.APAGADO,
    );
  }
}
