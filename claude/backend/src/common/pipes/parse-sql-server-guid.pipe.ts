import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { SQL_SERVER_GUID_REGEX } from '../validators/sql-server-guid.validator';

@Injectable()
export class ParseSqlServerGuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const normalized = String(value ?? '').trim();
    if (!SQL_SERVER_GUID_REGEX.test(normalized)) {
      throw new BadRequestException('El identificador debe ser un GUID válido de SQL Server.');
    }
    return normalized;
  }
}
