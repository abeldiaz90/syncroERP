import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import { CrearOportunidadDto } from '../../crm/dto/crm.dto';

/**
 * ============================================================================
 * Una fecha en blanco no es un error
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * Primera oportunidad del CRM creada desde la pantalla. El formulario tiene un
 * campo «Cierre estimado» sin asterisco —opcional, y así lo dice—. Se dejó en
 * blanco, se pulsó «Crear oportunidad», y no pasó nada: el recuadro seguía
 * abierto, los datos seguían ahí, y el botón no hacía nada por más que se
 * pulsara.
 *
 * El servidor contestaba 400. `@IsOptional()` omite la validación cuando el
 * valor es `undefined` o `null`, no cuando es una cadena vacía, y un
 * `<input type="date">` sin tocar vale `''`. El aviso de error era un mensaje
 * flotante de cuatro segundos; quien no lo vio, no supo nunca qué pasaba.
 *
 * No era sólo el CRM: nueve campos de fecha opcionales por todo el ERP estaban
 * igual —la fecha requerida de una requisición, la de pago de una orden de
 * compra, el inicio de un crédito, la fecha de una factura, el inicio contable
 * del asistente financiero—. Todos rechazaban el formulario que dejaba el
 * campo como el propio formulario permite dejarlo.
 *
 * QUÉ CUIDA ESTA PRUEBA
 *
 * Que una fecha opcional acepte la cadena vacía, y que ningún DTO vuelva a
 * combinar `@IsOptional()` con `@IsDateString()`, que es la pareja que causa
 * esto. Para eso existe `@IsFechaOpcional`.
 * ============================================================================
 */

const SRC = join(__dirname, '..', '..');

function dtos(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'dist') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) dtos(ruta, acumulado);
    else if (nombre.endsWith('.dto.ts')) acumulado.push(ruta);
  }
  return acumulado;
}

describe('Validación · una fecha en blanco no es un error', () => {
  it('la oportunidad se crea con la fecha de cierre vacía', async () => {
    const dto = plainToInstance(CrearOportunidadDto, {
      titulo: 'Suministro de mobiliario para sucursal norte',
      prospectoId: '285b99ac-369c-4ec8-a745-7b4586c45ddf',
      importe: 48500,
      etapaId: '',
      fechaCierreEstimada: '',
      descripcion: '',
    });

    const errores = await validate(dto);

    expect(errores.map((e) => e.property)).toEqual([]);
  });

  it('una fecha mal escrita sí se rechaza', async () => {
    const dto = plainToInstance(CrearOportunidadDto, {
      titulo: 'Oportunidad de prueba',
      prospectoId: '285b99ac-369c-4ec8-a745-7b4586c45ddf',
      importe: 1,
      fechaCierreEstimada: 'el mes que viene',
    });

    const errores = await validate(dto);

    expect(errores.map((e) => e.property)).toContain('fechaCierreEstimada');
  });

  it('ningún DTO combina @IsOptional con @IsDateString', () => {
    const culpables: string[] = [];
    for (const archivo of dtos(SRC)) {
      const texto = readFileSync(archivo, 'utf8');
      for (const m of texto.matchAll(
        /@IsOptional\(\)\s*\n\s*@IsDateString\([^)]*\)\s*\n\s*(\w+)\??:/g,
      )) {
        culpables.push(
          `${relative(SRC, archivo).split('\\').join('/')} → ${m[1]}`,
        );
      }
    }
    expect(culpables.sort()).toEqual([]);
  });
});
