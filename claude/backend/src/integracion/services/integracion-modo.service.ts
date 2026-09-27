import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModoCartera, ModoContabilidad } from '../integracion.constants';
import {
  combinarContabilidad as combinarContabilidadPura,
  modoContabilidadGlobal as modoContabilidadGlobalPuro,
} from '../utils/modo-contabilidad.util';
import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';
import { ContextoPeticionAlmacen } from '../../common/contexto/contexto-peticion';

/**
 * ============================================================================
 * Por qué AUTORIDAD está retirada, y no «pendiente»
 * ----------------------------------------------------------------------------
 * Primero se midió: ningún camino distingue SOMBRA de AUTORIDAD en nada que
 * toque dinero. Un solo servicio lo hacía —`DisponibilidadCreditoService`— y su
 * endpoint no lo llama ninguna pantalla; la decisión de vender a crédito, en
 * venta, City Ledger, créditos y aprobaciones, va siempre a
 * `PoliticaCreditoService`, que lee las tablas del ERP. Ver
 * `un-modo-que-no-cambia-nada.spec.ts`.
 *
 * La primera reacción fue tratarlo como cableado pendiente. Es un error, y la
 * razón es de diseño, no de calendario:
 *
 *  · Lo que hoy impide vender DOS VECES el último disponible es un candado de
 *    base de datos que `PoliticaCreditoService` toma dentro de la transacción,
 *    compartido entre la venta y el check-out. Si quien decide es una llamada
 *    HTTP a otro sistema, esa garantía desaparece: dos ventas simultáneas
 *    preguntan, las dos oyen «sí», y las dos pasan. Fineract no ofrece reservas
 *    ni apartados de línea con los que sustituir el candado.
 *
 *  · Y una autoridad que se degrada no era una autoridad. El propio código lo
 *    anticipaba: si el externo no responde, se resuelve con caché degradado y,
 *    si no hay caché, con el saldo del ERP. Correcto para no detener la caja —y
 *    la prueba de que el ERP es el que manda de verdad—.
 *
 * La práctica de los ERP que conviven con un core financiero es justamente
 * ésta: el core es la fuente de verdad del REGISTRO, y la decisión dentro de la
 * transacción se toma localmente contra un límite sincronizado, con conciliación
 * continua de las diferencias. Eso es, exactamente, SOMBRA.
 *
 * Un cliente que quiera que el core sea el dueño del crédito no quiere un grado
 * más de este eje: quiere el despliegue dirigido por el core, donde la solicitud
 * nace allá y el ERP no reserva líneas. Ése es otro producto, no un selector.
 *
 * Así que el eje tiene DOS grados que significan algo, y el tercero se retira.
 * No se borra el valor —puede estar escrito en la base de alguna empresa y el
 * techo global puede nombrarlo— pero no se escribe nunca más.
 * ============================================================================
 */
export const AUTORIDAD_RETIRADO =
  'AUTORIDAD está retirada. La decisión de vender a crédito se toma en el ERP ' +
  'dentro de la transacción que reserva la línea, con un candado que impide ' +
  'vender dos veces el último disponible; una consulta remota no puede ' +
  'sostener esa garantía, y la que se degrada cuando el otro sistema no ' +
  'responde no era una autoridad. SOMBRA es el modo integrado: publica, ' +
  'refleja y concilia, y el registro externo es la fuente de verdad del ' +
  'registro. Si lo que se busca es que el core sea el dueño del crédito, eso ' +
  'es el despliegue dirigido por el core —la solicitud nace allá—, no un grado ' +
  'de este eje.';

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
  private readonly logger = new Logger(IntegracionModoService.name);

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
    return modoContabilidadGlobalPuro(
      this.config.get<string>('CONTABILIDAD_EXTERNA_MODO'),
    );
  }

  combinarContabilidad(modoEmpresa?: ModoContabilidad | null): ModoContabilidad {
    // La regla vive en `utils/modo-contabilidad.util` porque el cierre contable
    // tambien la necesita y no puede inyectar este servicio. Una sola copia.
    return combinarContabilidadPura(this.modoContabilidadGlobal, modoEmpresa);
  }

  /**
   * ¿Esta empresa tiene contratado el registro financiero externo?
   *
   * Es LA pregunta, y por eso vive aquí y no repartida por ahí. Una empresa
   * que solo usa el ERP no debe ver la correspondencia de roles, ni el enlace
   * al core, ni poder aprovisionar operadores allá: no es que le falte
   * configurar algo, es que no lo contrató. Enseñarle la puerta de un módulo
   * que no compró es prometer lo que no hay.
   *
   * Basta con que uno de los dos ejes esté encendido —hay empresas que solo
   * espejan contabilidad y no mueven cartera— y ambos están apagados por
   * omisión, así que lo normal es responder que no.
   */
  async usaRegistroExterno(empresaId: string): Promise<boolean> {
    const perfil = await this.perfilDe(empresaId);
    return (
      perfil.cartera !== ModoCartera.APAGADO ||
      perfil.contabilidad !== ModoContabilidad.APAGADO
    );
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
   * Cambia el modo de cartera de una empresa aplicando las reglas que
   * gobiernan CADA dirección del cambio.
   *
   * Las comprobaciones viven AQUÍ y no en el controlador. Estaban en el
   * controlador, y eso significa que la regla se cumplía sólo si el cambio
   * entraba por esa ruta: un script, una tarea programada o un endpoint nuevo
   * podían cambiar el modo sin comprobar nada, y nadie se enteraría hasta que
   * la cartera estuviera mal. Una regla que protege un sistema de registro no
   * puede depender de por dónde entró la petición.
   *
   * ── Subir a AUTORIDAD ──────────────────────────────────────────────────
   * Exige conciliación limpia: darle al registro externo la última palabra
   * sobre la cartera cuando los dos sistemas no cuadran es declarar correcto
   * lo que todavía no se ha comprobado.
   *
   * ── Bajar a APAGADO ────────────────────────────────────────────────────
   * Exige lo mismo, y además que no quede nada en vuelo. Durante un tiempo
   * esta dirección no exigía nada, y era la peligrosa de las dos:
   *
   *  · Los eventos sin entregar del outbox quedan huérfanos. Nadie los va a
   *    despachar nunca —el despachador ignora a las empresas apagadas— y no
   *    hay aviso: la replicación simplemente deja de ocurrir.
   *  · Las discrepancias abiertas se vuelven irreconciliables. Al apagar ya no
   *    hay contra qué comparar, así que la diferencia deja de poder resolverse
   *    y pasa a ser un dato perdido.
   *
   * En ambos casos el daño es silencioso, que es lo que lo hace grave: un
   * error ruidoso se corrige el mismo día.
   *
   * Las sondas se reciben como funciones para no atar este servicio al de
   * conciliación ni al outbox —que ya dependen de éste— y evitar el ciclo.
   */
  async establecerModoCartera(
    empresaId: string,
    modo: ModoCartera,
    sondas: {
      discrepanciasAbiertas: (empresaId: string) => Promise<number>;
      eventosSinResolver: (empresaId: string) => Promise<number>;
    },
  ): Promise<{ aplicado: boolean; motivo?: string }> {
    const fila =
      (await this.repo.findOne({ where: { empresaId } })) ??
      this.repo.create({ empresaId, parametrosProveedor: {} });
    const anterior = fila.modo ?? ModoCartera.APAGADO;

    /*
     * Retirada, no pendiente: ver `AUTORIDAD_RETIRADO` arriba.
     *
     * Aquí vivía además la puerta de conciliación —no subir con diferencias
     * abiertas—. Se quitó porque era inalcanzable, y con ella se iba el único
     * motivo que obligaba a resolver esas diferencias. No se perdió: el
     * diagnóstico del cierre mensual las enseña ahora, que es donde alguien
     * mira todos los meses, en vez de en una promoción que nadie iba a pedir.
     */
    if (modo === ModoCartera.AUTORIDAD) {
      return { aplicado: false, motivo: AUTORIDAD_RETIRADO };
    }

    /*
     * Sólo se comprueba al APAGAR algo que estaba encendido. Volver a apagar
     * una empresa ya apagada no mueve nada y no tiene por qué fallar: una
     * regla que rechaza operaciones que no cambian nada acaba enseñando a la
     * gente a ignorar el mensaje.
     */
    if (modo === ModoCartera.APAGADO && anterior !== ModoCartera.APAGADO) {
      const enVuelo = await sondas.eventosSinResolver(empresaId);
      if (enVuelo > 0) {
        return {
          aplicado: false,
          motivo: `Hay ${enVuelo} evento(s) de integración sin entregar. Apagar ahora los deja sin despachar para siempre: resuélvelos o descártalos primero.`,
        };
      }
      const abiertas = await sondas.discrepanciasAbiertas(empresaId);
      if (abiertas > 0) {
        return {
          aplicado: false,
          motivo: `Hay ${abiertas} discrepancia(s) de conciliación sin resolver. Al apagar ya no habrá contra qué compararlas.`,
        };
      }
    }

    fila.modo = modo;
    await this.repo.save(fila);
    this.cache.delete(empresaId);

    /*
     * Quién lo pidió sale del contexto de la petición, no de un parámetro:
     * así queda asentado también cuando el cambio entra por un script o por
     * una ruta que todavía no existe. Sin contexto —tarea de fondo— se dice
     * eso mismo, en vez de atribuírselo a nadie.
     */
    if (anterior !== modo) {
      const quien = ContextoPeticionAlmacen.actual();
      this.logger.warn(
        `Modo de cartera de la empresa ${empresaId}: ${anterior} → ${modo}, ` +
          `por ${quien?.email ?? quien?.usuarioId ?? 'un proceso sin sesión'}.`,
      );
    }

    return { aplicado: true };
  }

  /**
   * ==========================================================================
   * Apagar el espejo contable tiene el mismo peligro, y no tenía la regla
   * --------------------------------------------------------------------------
   * `establecerModoCartera` razona con cuidado por qué apagar es la dirección
   * peligrosa: los eventos sin entregar quedan huérfanos —el despachador
   * ignora los ejes apagados y no avisa— y las discrepancias abiertas se
   * vuelven irreconciliables, porque ya no hay contra qué compararlas. En los
   * dos casos el daño es silencioso.
   *
   * Todo eso vale igual para la contabilidad, y este eje no comprobaba nada.
   * Se midió en vivo: con dos pólizas de nómina sin entregar y tres
   * diferencias abiertas entre los dos mayores, apagar la cartera se negó
   * —nombrando esas dos pólizas, que ni siquiera son suyas— y apagar el espejo
   * contable devolvió 200 sin un solo aviso. El eje dueño de esos eventos era
   * el único que los dejaba tirados.
   *
   * De paso cada eje mira SÓLO lo suyo. El outbox es uno y lleva dentro cosas
   * de dos dueños: negarle a la cartera un cambio por unos asientos que su
   * propio eje va a seguir despachando es señalar a quien no puede resolverlo.
   * ==========================================================================
   */
  async establecerModoContabilidad(
    empresaId: string,
    modo: ModoContabilidad,
    sondas: {
      discrepanciasAbiertas: (empresaId: string) => Promise<number>;
      eventosSinResolver: (empresaId: string) => Promise<number>;
    },
  ): Promise<{ aplicado: boolean; motivo?: string }> {
    const fila =
      (await this.repo.findOne({ where: { empresaId } })) ??
      this.repo.create({ empresaId, parametrosProveedor: {} });
    const anterior = fila.modoContabilidad ?? ModoContabilidad.APAGADO;

    if (modo === ModoContabilidad.APAGADO && anterior !== ModoContabilidad.APAGADO) {
      const enVuelo = await sondas.eventosSinResolver(empresaId);
      if (enVuelo > 0) {
        return {
          aplicado: false,
          motivo: `Hay ${enVuelo} asiento(s) sin llegar al mayor externo. Apagar ahora los deja sin despachar para siempre: resuélvelos o descártalos desde el espejo contable primero.`,
        };
      }
      const abiertas = await sondas.discrepanciasAbiertas(empresaId);
      if (abiertas > 0) {
        return {
          aplicado: false,
          motivo: `Hay ${abiertas} diferencia(s) entre las dos contabilidades sin resolver. Al apagar ya no habrá contra qué compararlas.`,
        };
      }
    }

    fila.modoContabilidad = modo;
    await this.repo.save(fila);
    this.cache.delete(empresaId);

    if (anterior !== modo) {
      const quien = ContextoPeticionAlmacen.actual();
      this.logger.warn(
        `Modo de contabilidad de la empresa ${empresaId}: ${anterior} → ${modo}, ` +
          `por ${quien?.email ?? quien?.usuarioId ?? 'un proceso sin sesión'}.`,
      );
    }

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
