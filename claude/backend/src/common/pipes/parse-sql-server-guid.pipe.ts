import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { SQL_SERVER_GUID_REGEX } from '../validators/sql-server-guid.validator';

@Injectable()
export class ParseSqlServerGuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const normalized = String(value ?? '').trim();
    if (!SQL_SERVER_GUID_REGEX.test(normalized)) {
      /*
       * El mensaje decía «un GUID válido de SQL Server». Este sistema corre
       * sobre PostgreSQL desde la mudanza, así que además de no significar nada
       * para quien lo lee —un contador— era falso. El nombre interno del
       * validador se conserva: renombrarlo tocaría decenas de archivos sin
       * cambiar una sola conducta.
       */
      throw new BadRequestException(
        `El identificador «${normalized.slice(0, 60)}» no tiene la forma de un ` +
          'identificador del sistema. Vuelve a abrir el registro desde su lista.',
      );
    }
    return normalized;
  }
}
