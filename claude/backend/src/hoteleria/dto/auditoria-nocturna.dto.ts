import { IsSqlServerGuid } from '../../common/validators/sql-server-guid.validator';
export class EjecutarAuditoriaNocturnaDto { @IsSqlServerGuid() hotelId!: string; }
