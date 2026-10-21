import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { DecisionCreditoService } from './decision-credito.service';
import { ConfiguracionIntegracionEmpresa } from '../entities/configuracion-integracion-empresa.entity';
import {
  PuertoValidacionIdentidad,
  ResultadoIdentidad,
  VeredictoIdentidad,
} from '../ports/validacion-identidad.port';
import { PuertoBuroCredito, ReporteBuro } from '../ports/buro-credito.port';
import { PuertoCarteraExterna } from '../ports/cartera-externa.port';

/**
 * ============================================================================
 * Una consulta que se paga no se hace sin haberla contratado
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * `POST /integracion/evaluar-credito` llamaba al puerto de identidad y al de
 * buró sin preguntar si esta empresa contrató validación. Hoy los dos puertos
 * son `ValidacionIdentidadNoConfigurada` y `BuroNoConfigurado` —no sale ni un
 * paquete— y por eso llevaba tiempo así sin que nadie lo notara.
 *
 * El día que se conecte un proveedor de verdad, una empresa que sólo contrató
 * el ERP estaría gastando consultas de identidad y de buró, que se pagan por
 * consulta, porque alguien llamó a la ruta. Y el consumo aparecería en la
 * factura de SUMA, no en la de nadie más.
 *
 * MEDIDO el 21-oct-2026 recorriendo los catorce sitios que inyectan un puerto
 * de integración y comprobando cuáles preguntan por el modo antes de llamar.
 * Éste era uno de los dos que no.
 *
 * LA REGLA
 *
 * La comprobación vive en el SERVICIO, no en la ruta. Estuvo en el controlador
 * un rato y se mudó: una regla que protege un contador de consumo no puede
 * depender de por dónde entró la petición, que es exactamente lo que ya está
 * escrito en `establecerModoCartera`.
 *
 * Y entiende la AUSENCIA del campo como «nadie ha declarado nada, no
 * restrinjo», igual que la pantalla: un campo, un significado. Lo que corta es
 * la lista VACÍA, que es lo que la consola escribe cuando no se contrató nada.
 * ============================================================================
 */

const identidadQueGrita: PuertoValidacionIdentidad = {
  async validar(): Promise<VeredictoIdentidad> {
    throw new Error('NO SE DEBIÓ CONSULTAR la identidad: se paga por consulta.');
  },
  async consultar(): Promise<VeredictoIdentidad | null> {
    throw new Error('NO SE DEBIÓ CONSULTAR la identidad: se paga por consulta.');
  },
};

const buroQueGrita: PuertoBuroCredito = {
  async consultar(): Promise<ReporteBuro> {
    throw new Error('NO SE DEBIÓ CONSULTAR el buró: se paga por consulta.');
  },
};

const carteraInerte = {
  configurado: () => false,
  disponible: () => false,
} as unknown as PuertoCarteraExterna;

/** Un repositorio que sólo sabe contestar lo que la empresa contrató. */
const configCon = (capacidadesValidacion: unknown) =>
  ({
    async findOne() {
      return capacidadesValidacion === undefined
        ? { parametrosProveedor: {} }
        : { parametrosProveedor: { capacidadesValidacion } };
    },
  }) as unknown as Repository<ConfiguracionIntegracionEmpresa>;

const entrada = {
  empresaId: 'e1',
  clienteId: 'c1',
  nombre: 'Prueba',
  limiteSolicitado: 50_000,
  topeAutomatico: 100_000,
};

describe('una consulta que se paga no se hace sin haberla contratada', () => {
  it('con la lista de capacidades VACÍA, no toca ni identidad ni buró', async () => {
    const servicio = new DecisionCreditoService(
      identidadQueGrita,
      buroQueGrita,
      carteraInerte,
      configCon([]),
    );

    await expect(servicio.evaluar(entrada)).rejects.toThrow(ForbiddenException);
  });

  it('y lo dice con palabras, no con un 403 pelado', async () => {
    const servicio = new DecisionCreditoService(
      identidadQueGrita,
      buroQueGrita,
      carteraInerte,
      configCon([]),
    );

    await expect(servicio.evaluar(entrada)).rejects.toThrow(
      /no tiene contratada la validación de identidad/i,
    );
  });

  it('sin el campo declarado NO restringe: ausencia no es negativa', async () => {
    /*
     * Es la mitad que más importa. Ninguna consola escribe todavía esa lista,
     * así que el campo está ausente en TODAS las instalaciones: si la ausencia
     * se leyera como «no contratado», esta compuerta apagaría la evaluación de
     * crédito en todas las empresas del mundo de golpe. Es el mismo error que
     * dejó invisible la pantalla de verificación en el menú de todas.
     */
    const servicio = new DecisionCreditoService(
      identidadQueGrita,
      buroQueGrita,
      carteraInerte,
      configCon(undefined),
    );

    /* Pasa la compuerta y muere en el puerto, que es lo que se quiere probar. */
    await expect(servicio.evaluar(entrada)).rejects.toThrow(
      /NO SE DEBIÓ CONSULTAR/,
    );
  });

  it('con capacidades declaradas, deja pasar', async () => {
    const servicio = new DecisionCreditoService(
      identidadQueGrita,
      buroQueGrita,
      carteraInerte,
      configCon(['IDENTIDAD']),
    );

    await expect(servicio.evaluar(entrada)).rejects.toThrow(
      /NO SE DEBIÓ CONSULTAR/,
    );
  });

  it('LA PRUEBA DE LA PRUEBA: los puertos falsos gritan de verdad', async () => {
    /*
     * Si los dobles devolvieran algo en vez de lanzar, las dos pruebas de
     * «deja pasar» pasarían sin haber comprobado que se llegó al puerto, y
     * esta prueba no distinguiría la compuerta cerrada de la abierta.
     */
    await expect(identidadQueGrita.consultar('e1', 'c1')).rejects.toThrow(
      /NO SE DEBIÓ CONSULTAR/,
    );
    await expect(
      buroQueGrita.consultar({} as never),
    ).rejects.toThrow(/NO SE DEBIÓ CONSULTAR/);
  });
});
