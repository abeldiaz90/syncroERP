import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';

export class CrearOrdenCompraDto {
  @IsSqlServerGuid()
  cotizacionId: string;
}
