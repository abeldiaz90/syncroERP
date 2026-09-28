/**
 * ============================================================================
 * Una ficha que no se podía corregir
 * ----------------------------------------------------------------------------
 * QUÉ FALTABA
 *
 * El módulo de activos fijos sabía dar de alta un activo y darlo de baja, y
 * NADA en medio. No había forma de corregir un número de serie mal capturado,
 * un responsable que cambió de puesto o una ubicación que ya no es ésa.
 *
 * La única salida era dar de baja el activo —que escribe una póliza, calcula
 * utilidad o pérdida y lo saca del inventario— y volverlo a crear con un código
 * nuevo. El código va pegado en una etiqueta física, así que un dedazo costaba
 * una póliza falsa y un viaje al almacén a despegar etiquetas.
 *
 * QUÉ SE PUEDE TOCAR, Y POR QUÉ NO TODO
 *
 * La ficha descriptiva no cambia ningún número ya asentado: se corrige siempre.
 *
 * La base de cálculo —costo, residual, método, tasa, vida útil, fecha de inicio,
 * categoría— sí lo cambia. Tocarla con depreciaciones ya corridas dejaría los
 * meses viejos calculados con una base y los nuevos con otra, y la
 * `depreciacionAcumulada` sería la suma de dos cosas distintas: ni el balance ni
 * la cédula del ejercicio se podrían reconstruir. Se niega, y se nombra el
 * camino que SÍ existe —revertir las corridas, corregir, volver a correrlas—,
 * que es una función que el propio módulo ya tiene.
 *
 * Y se pregunta por las corridas VIGENTES, no por el contador `mesesDepreciados`:
 * revertir deja el contador en cero y las filas canceladas, y en ese estado la
 * corrección tiene que poder hacerse. Si no, el remedio que recomienda la
 * negativa no llevaría a ninguna parte — que es justo la avería que este
 * proyecto lleva toda la semana persiguiendo.
 * ============================================================================
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EstadoActivo, MetodoDepreciacion } from './entities/activo-fijo.entity';
import { ActivosService } from './services/activos.service';

describe('una ficha que no se podía corregir', () => {
  function servicio(
    activo: Record<string, unknown> | null,
    corridasVigentes = 0,
    categoriaExiste = true,
  ) {
    const guardados: Record<string, unknown>[] = [];
    const s = Object.create(ActivosService.prototype) as Record<string, unknown>;
    s.activos = {
      findOne: () => Promise.resolve(activo),
      save: (x: Record<string, unknown>) => {
        guardados.push({ ...x });
        return Promise.resolve(x);
      },
    };
    s.depreciaciones = { count: () => Promise.resolve(corridasVigentes) };
    s.categorias = {
      findOne: () => Promise.resolve(categoriaExiste ? { id: 'cat-2' } : null),
    };
    s.logger = { log: () => undefined };
    return { s: s as unknown as ActivosService, guardados };
  }

  const activo = (extra: Record<string, unknown> = {}) => ({
    id: 'a1',
    empresaId: 'e1',
    codigo: 'AF-000007',
    nombre: 'Laptop de dirección',
    numeroSerie: 'XXX-MAL',
    categoriaId: 'cat-1',
    costoAdquisicion: 30000,
    valorResidual: 0,
    metodo: MetodoDepreciacion.LINEA_RECTA,
    tasaAnual: 30,
    vidaUtilMeses: 40,
    estado: EstadoActivo.ACTIVO,
    ...extra,
  });

  it('corrige la ficha descriptiva aunque el activo ya se esté depreciando', async () => {
    const { s, guardados } = servicio(activo(), 6);
    await s.actualizar(
      'a1',
      { numeroSerie: 'SN-9F3K21', ubicacion: 'Dirección · piso 3' },
      'e1',
    );
    expect(guardados).toHaveLength(1);
    expect(guardados[0].numeroSerie).toBe('SN-9F3K21');
    expect(guardados[0].ubicacion).toBe('Dirección · piso 3');
    // Y no tocó nada más.
    expect(guardados[0].costoAdquisicion).toBe(30000);
  });

  it('sólo escribe lo que se manda: lo que no viene, no se borra', async () => {
    /*
     * Un `undefined` que llega al `save` borra el campo. Es la diferencia entre
     * corregir la ubicación y dejar al activo sin marca, sin modelo y sin
     * responsable de paso.
     */
    const { s, guardados } = servicio(activo({ marca: 'Dell', modelo: 'XPS' }));
    await s.actualizar('a1', { ubicacion: 'Almacén' }, 'e1');
    expect(guardados[0].marca).toBe('Dell');
    expect(guardados[0].modelo).toBe('XPS');
    expect(guardados[0].nombre).toBe('Laptop de dirección');
  });

  it('no deja cambiar la base de cálculo con depreciaciones corridas', async () => {
    const { s, guardados } = servicio(activo(), 6);
    await expect(
      s.actualizar('a1', { costoAdquisicion: 25000 }, 'e1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(guardados).toHaveLength(0);
  });

  it('y la negativa nombra el camino que sí existe', async () => {
    const { s } = servicio(activo(), 6);
    await expect(s.actualizar('a1', { vidaUtilMeses: 60 }, 'e1')).rejects.toThrow(
      /Revierte esas corridas/i,
    );
    // Dice QUÉ campo no se puede tocar, no un genérico.
    await expect(s.actualizar('a1', { vidaUtilMeses: 60 }, 'e1')).rejects.toThrow(
      /la vida útil/i,
    );
  });

  it('con las corridas revertidas, la base sí se corrige', async () => {
    /*
     * El remedio que recomienda la negativa tiene que llevar a alguna parte.
     * Revertir cancela las filas y deja el contador en cero: aquí se mide que
     * la pregunta es por las corridas vigentes y no por `mesesDepreciados`.
     */
    const { s, guardados } = servicio(activo({ mesesDepreciados: 0 }), 0);
    await s.actualizar('a1', { costoAdquisicion: 25000, vidaUtilMeses: 60 }, 'e1');
    expect(guardados[0].costoAdquisicion).toBe(25000);
    expect(guardados[0].vidaUtilMeses).toBe(60);
  });

  it('un activo dado de baja no se edita, y VENDIDO es dado de baja', async () => {
    /*
     * `darDeBaja` escribe VENDIDO cuando el motivo es venta y BAJA en los demás
     * casos: son la misma cosa vista de dos maneras, y su propia guarda
     * pregunta por los dos. La primera versión de `actualizar` sólo preguntaba
     * por BAJA, con lo que un activo ya vendido seguía siendo editable —incluido
     * su costo, que es parte de la utilidad o pérdida ya asentada—. En esta
     * instalación, dos de los tres activos están en VENDIDO.
     */
    for (const estado of [EstadoActivo.BAJA, EstadoActivo.VENDIDO]) {
      const { s, guardados } = servicio(activo({ estado }));
      await expect(s.actualizar('a1', { nombre: 'Otro nombre' }, 'e1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(guardados).toHaveLength(0);
    }
  });

  it('el residual no puede superar al costo, ni con la mezcla de lo viejo y lo nuevo', async () => {
    /*
     * Se comprueba contra lo que VA A QUEDAR. Mandar sólo el residual, mayor
     * que el costo que ya estaba, es el caso que se escapa si se compara contra
     * el cuerpo de la petición.
     */
    const { s } = servicio(activo(), 0);
    await expect(s.actualizar('a1', { valorResidual: 40000 }, 'e1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('una categoría que no existe se dice, en vez de guardarse', async () => {
    const { s, guardados } = servicio(activo(), 0, false);
    await expect(s.actualizar('a1', { categoriaId: 'cat-2' }, 'e1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(guardados).toHaveLength(0);
  });

  it('un activo que no existe se dice como tal', async () => {
    const { s } = servicio(null);
    await expect(s.actualizar('a1', { nombre: 'X' }, 'e1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('el código no se puede cambiar: está pegado en una etiqueta', () => {
    const fuente = require('fs').readFileSync(
      require('path').join(__dirname, 'dto', 'activos.dto.ts'),
      'utf8',
    ) as string;
    const clase = fuente.slice(fuente.indexOf('export class ActualizarActivoDto'));
    expect(clase).not.toMatch(/\bcodigo\??\s*:/);
  });
});
