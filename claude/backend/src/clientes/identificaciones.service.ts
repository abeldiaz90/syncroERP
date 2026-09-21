import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ClienteIdentificacion,
  TipoIdentificacion,
} from './entities/cliente-identificacion.entity';
import { Cliente } from './entities/cliente.entity';
import { GuardarIdentificacionDto } from './identificaciones.dto';
import { CarteraPublicadorService } from '../integracion/services/cartera-publicador.service';

/**
 * ============================================================================
 * Identificaciones del expediente
 * ----------------------------------------------------------------------------
 * Todo se acota por empresa además de por cliente. El id del cliente es un
 * UUID y adivinarlo es impracticable, pero «impracticable» no es «imposible» y
 * el filtro cuesta una condición: un expediente de otro inquilino no se abre ni
 * por accidente ni a propósito.
 *
 * Cada cambio publica la corrección del cliente al registro externo. Podría
 * publicarse sólo la identificación tocada, pero el despachador ya sabe llevar
 * el expediente completo y reconciliarlo es idempotente: mandar de más aquí
 * cuesta una llamada, y mandar de menos deja los dos sistemas distintos.
 * ============================================================================
 */
@Injectable()
export class IdentificacionesService {
  constructor(
    @InjectRepository(ClienteIdentificacion)
    private readonly repo: Repository<ClienteIdentificacion>,
    @InjectRepository(Cliente)
    private readonly clientes: Repository<Cliente>,
    private readonly publicador: CarteraPublicadorService,
  ) {}

  private async exigirCliente(empresaId: string, clienteId: string) {
    const cliente = await this.clientes.findOne({
      where: { id: clienteId, empresaId },
    });
    if (!cliente) throw new NotFoundException('Cliente no encontrado.');
    return cliente;
  }

  async listar(empresaId: string, clienteId: string) {
    await this.exigirCliente(empresaId, clienteId);
    const filas = await this.repo.find({
      where: { empresaId, clienteId },
      order: { activo: 'DESC', tipo: 'ASC' },
    });
    const hoy = new Date().toISOString().slice(0, 10);
    return filas.map((fila) => ({
      ...fila,
      /*
       * La vigencia se calcula al leer y no se guarda: un campo «vencida» en la
       * base nace correcto y se vuelve mentira al día siguiente sin que nadie
       * toque la fila.
       */
      vencida: Boolean(
        fila.vigenciaHasta && String(fila.vigenciaHasta).slice(0, 10) < hoy,
      ),
    }));
  }

  async guardar(
    empresaId: string,
    clienteId: string,
    dto: GuardarIdentificacionDto,
  ) {
    const cliente = await this.exigirCliente(empresaId, clienteId);

    if (
      dto.vigenciaDesde &&
      dto.vigenciaHasta &&
      dto.vigenciaHasta < dto.vigenciaDesde
    ) {
      throw new BadRequestException(
        'La vigencia no puede terminar antes de empezar.',
      );
    }

    const yaExiste = await this.repo.findOne({
      where: { empresaId, clienteId, tipo: dto.tipo, folio: dto.folio },
    });

    const fila = this.repo.create({
      ...(yaExiste ?? {}),
      empresaId,
      clienteId,
      tipo: dto.tipo,
      folio: dto.folio,
      vigenciaDesde: dto.vigenciaDesde ?? null,
      vigenciaHasta: dto.vigenciaHasta ?? null,
      emisor: dto.emisor ?? null,
      notas: dto.notas ?? null,
      activo: dto.activo ?? true,
    });
    const guardada = await this.repo.save(fila);

    await this.publicador.clienteActualizado(
      empresaId,
      cliente.id,
      String(Date.now()),
    );
    return guardada;
  }

  async eliminar(empresaId: string, clienteId: string, id: string) {
    const cliente = await this.exigirCliente(empresaId, clienteId);
    const fila = await this.repo.findOne({ where: { id, empresaId, clienteId } });
    if (!fila) throw new NotFoundException('Identificación no encontrada.');

    /*
     * Se desactiva, no se borra. Una identificación que estuvo en el expediente
     * cuando se autorizó un crédito es parte de por qué se autorizó, y borrarla
     * deja la decisión sin su sustento.
     */
    fila.activo = false;
    await this.repo.save(fila);
    await this.publicador.clienteActualizado(
      empresaId,
      cliente.id,
      String(Date.now()),
    );
    return { id: fila.id, activo: false };
  }

  /** Lo que el despachador manda al registro externo. */
  async paraReplicar(empresaId: string, clienteId: string) {
    const filas = await this.repo.find({
      where: { empresaId, clienteId, activo: true },
    });
    return filas.map((f) => ({
      tipo: f.tipo as TipoIdentificacion,
      folio: f.folio,
    }));
  }
}
