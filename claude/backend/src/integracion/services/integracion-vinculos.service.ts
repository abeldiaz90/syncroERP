import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { VinculoIntegracion, referenciaDe } from '../entities/vinculo-integracion.entity';
import { TipoVinculo } from '../integracion.constants';

/**
 * Tabla de traducción entre identidades del ERP y del registro externo.
 * El id externo es una cadena opaca: aquí se guarda y se devuelve, nunca se
 * interpreta.
 */
@Injectable()
export class IntegracionVinculosService {
  constructor(
    @InjectRepository(VinculoIntegracion)
    private readonly repo: Repository<VinculoIntegracion>,
  ) {}

  private acceso(em?: EntityManager) {
    return em ? em.getRepository(VinculoIntegracion) : this.repo;
  }

  referencia = referenciaDe;

  async buscar(
    empresaId: string,
    tipo: TipoVinculo,
    entidadId: string,
    em?: EntityManager,
  ): Promise<VinculoIntegracion | null> {
    return this.acceso(em).findOne({ where: { empresaId, tipo, entidadId } });
  }

  /** Id externo, o null si la entidad aún no se ha replicado. */
  async idExterno(
    empresaId: string,
    tipo: TipoVinculo,
    entidadId: string,
    em?: EntityManager,
  ): Promise<string | null> {
    const vinculo = await this.buscar(empresaId, tipo, entidadId, em);
    return vinculo?.idExterno ?? null;
  }

  /** Registra o actualiza la correspondencia. Idempotente. */
  async vincular(
    datos: {
      empresaId: string;
      tipo: TipoVinculo;
      entidadId: string;
      idExterno: string | null;
      proveedor?: string | null;
      estadoRemoto?: string | null;
    },
    em?: EntityManager,
  ): Promise<VinculoIntegracion> {
    const repo = this.acceso(em);

    const existente = await repo.findOne({
      where: {
        empresaId: datos.empresaId,
        tipo: datos.tipo,
        entidadId: datos.entidadId,
      },
    });

    if (existente) {
      if (datos.idExterno) existente.idExterno = datos.idExterno;
      if (datos.proveedor !== undefined) existente.proveedor = datos.proveedor;
      if (datos.estadoRemoto !== undefined) {
        existente.estadoRemoto = datos.estadoRemoto;
      }
      return repo.save(existente);
    }

    return repo.save(
      repo.create({
        empresaId: datos.empresaId,
        tipo: datos.tipo,
        entidadId: datos.entidadId,
        referenciaIdempotencia: referenciaDe(datos.tipo, datos.entidadId),
        idExterno: datos.idExterno,
        proveedor: datos.proveedor ?? null,
        estadoRemoto: datos.estadoRemoto ?? null,
      }),
    );
  }

  /** Todos los clientes replicados de una empresa. Lo usa la conciliación. */
  async clientesVinculados(empresaId: string): Promise<VinculoIntegracion[]> {
    return this.repo.find({
      where: { empresaId, tipo: TipoVinculo.CLIENTE },
    });
  }
}
