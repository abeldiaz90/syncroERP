import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ActiveUser } from '../iam/decorators/active-user.decorator';
import { SkipPermisos } from '../iam/decorators/skip-permisos.decorator';
import { DocumentacionService } from './documentacion.service';

/**
 * ============================================================================
 * La documentación del sistema, dentro del sistema
 * ----------------------------------------------------------------------------
 * `@SkipPermisos()`, igual que los catálogos de referencia: es material de
 * consulta que cualquier sesión válida puede leer, y no hay permiso que
 * conceder ni quitar. Lo que separa a un lector de otro NO es la tabla de
 * permisos sino el contenido: los cuatro documentos técnicos son del
 * administrador, y eso lo decide el servicio, documento por documento.
 *
 * La alternativa era dos endpoints, uno con `@Roles('administrador')`. Se
 * descartó porque entonces el índice de la pantalla tendría que pedir a los dos
 * y unirlos, y quien no fuera administrador recibiría un 403 en cada carga de
 * la página — un error en la consola del navegador que no es un error.
 *
 * `@SkipPermisos()` además hace que la pantalla aparezca en el menú de todos:
 * `mis-rutas` la recoge por su entrada en `endpoints-navegables.ts`. Sin eso el
 * permiso existiría y la pantalla estaría negada, que es el defecto que este
 * proyecto ya persiguió tres veces.
 * ============================================================================
 */
@ApiTags('Documentación')
@Controller('documentacion')
export class DocumentacionController {
  constructor(private readonly documentacion: DocumentacionService) {}

  @Get()
  @SkipPermisos()
  listar(@ActiveUser('rol') rol: string) {
    return this.documentacion.listar(rol);
  }

  @Get(':id')
  @SkipPermisos()
  leer(@Param('id') id: string, @ActiveUser('rol') rol: string) {
    return this.documentacion.leer(id, rol);
  }

  @Get(':id/pdf')
  @SkipPermisos()
  async pdf(
    @Param('id') id: string,
    @ActiveUser('rol') rol: string,
    @Res() res: Response,
  ) {
    const archivo = await this.documentacion.pdf(id, rol);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="syncroerp-${id}.pdf"`,
    );
    res.setHeader('Content-Length', String(archivo.length));
    res.end(archivo);
  }
}
