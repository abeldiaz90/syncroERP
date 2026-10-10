import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ListaPrecio } from '../entities/lista-precio.entity';

@Injectable()
export class ListasPrecioService {
  constructor(
    @InjectRepository(ListaPrecio)
    private readonly listaPrecioRepository: Repository<ListaPrecio>,
    private readonly dataSource: DataSource,
  ) {}

  async obtenerListas(empresaId: string) {
    return this.listaPrecioRepository.find({
      where: { empresaId },
      order: { esPorDefecto: 'DESC', nombre: 'ASC' },
    });
  }

  /** Lo que una lista puede declarar además de su nombre. */
  private reglaDe(dto: {
    modo?: 'MANUAL' | 'MARGEN';
    margenPorcentaje?: number;
    redondeo?: number;
  }) {
    const regla: Record<string, unknown> = {};
    if (dto.modo !== undefined) regla.modo = dto.modo;
    if (dto.margenPorcentaje !== undefined)
      regla.margenPorcentaje = Number(dto.margenPorcentaje);
    if (dto.redondeo !== undefined) regla.redondeo = Number(dto.redondeo);
    /*
     * Una lista en MARGEN con margen cero vendería exactamente al costo. Casi
     * siempre es que alguien cambió el modo y se le olvidó el margen, y el
     * resultado no se nota hasta cerrar el mes sin utilidad.
     */
    if (
      regla.modo === 'MARGEN' &&
      !(Number(regla.margenPorcentaje ?? 0) > 0)
    ) {
      throw new BadRequestException(
        'Una lista que calcula el precio desde el costo necesita un margen mayor que cero: ' +
          'con margen cero venderías exactamente a lo que te costó.',
      );
    }
    return regla;
  }

  async crearLista(
    dto: {
      nombre: string;
      esPorDefecto: boolean;
      modo?: 'MANUAL' | 'MARGEN';
      margenPorcentaje?: number;
      redondeo?: number;
    },
    empresaId: string,
  ) {
    const nombre = dto.nombre?.trim();
    if (!nombre) throw new BadRequestException('El nombre es obligatorio.');
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(ListaPrecio);
      const duplicada = await repo
        .createQueryBuilder('lista')
        .where('lista.empresaId = :empresaId', { empresaId })
        .andWhere('UPPER(lista.nombre) = UPPER(:nombre)', { nombre })
        .getOne();
      if (duplicada) {
        throw new ConflictException('Ya existe una lista con ese nombre.');
      }
      const total = await repo.count({ where: { empresaId } });
      const esPorDefecto = total === 0 || dto.esPorDefecto === true;
      if (esPorDefecto) {
        await repo.update({ empresaId }, { esPorDefecto: false });
      }
      return repo.save(
        repo.create({ nombre, empresaId, esPorDefecto, ...this.reglaDe(dto) }),
      );
    });
  }

  async actualizarLista(
    id: string,
    dto: {
      nombre?: string;
      esPorDefecto?: boolean;
      modo?: 'MANUAL' | 'MARGEN';
      margenPorcentaje?: number;
      redondeo?: number;
    },
    empresaId: string,
  ) {
    const lista = await this.listaPrecioRepository.findOne({
      where: { id, empresaId },
    });
    if (!lista) throw new NotFoundException('Lista no encontrada');

    if (dto.esPorDefecto === false && lista.esPorDefecto) {
      throw new BadRequestException(
        'No puedes dejar la empresa sin lista predeterminada. Marca primero otra lista como predeterminada.',
      );
    }
    if (dto.nombre !== undefined) {
      const nombre = dto.nombre.trim();
      if (!nombre) throw new BadRequestException('El nombre es obligatorio.');
      const duplicada = await this.listaPrecioRepository
        .createQueryBuilder('otra')
        .where('otra.empresaId = :empresaId', { empresaId })
        .andWhere('otra.id <> :id', { id })
        .andWhere('UPPER(otra.nombre) = UPPER(:nombre)', { nombre })
        .getOne();
      if (duplicada) {
        throw new ConflictException('Ya existe una lista con ese nombre.');
      }
      lista.nombre = nombre;
    }
    if (dto.esPorDefecto) {
      await this.listaPrecioRepository.update(
        { empresaId },
        { esPorDefecto: false },
      );
      lista.esPorDefecto = true;
    }
    /*
     * La regla se aplica sobre la entidad ya cargada para que la validación de
     * «MARGEN sin margen» vea también lo que la lista ya tenía: cambiar sólo el
     * modo, sin tocar el margen, tiene que seguir siendo válido si el margen ya
     * estaba puesto.
     */
    Object.assign(
      lista,
      this.reglaDe({
        modo: dto.modo ?? lista.modo,
        margenPorcentaje: dto.margenPorcentaje ?? lista.margenPorcentaje,
        redondeo: dto.redondeo ?? lista.redondeo,
      }),
    );

    return this.listaPrecioRepository.save(lista);
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * BORRAR UNA LISTA BORRABA MILES DE PRECIOS, EN SILENCIO
   * --------------------------------------------------------------------------
   * `ProductoPrecio.listaPrecio` está declarado `onDelete: 'CASCADE'`. Así que
   * este `remove` de una fila arrastraba con ella TODOS los precios de la
   * lista: en una instalación con catálogo completo, varios miles de renglones
   * capturados a mano durante meses. Sin confirmación, sin contarlos y sin
   * avisar, desde un botón de papelera en un renglón de una tabla. Y no hay
   * reversa: los precios no están en ningún otro sitio.
   *
   * Además la lista la pueden estar apuntando cosas que sí importan: una venta
   * guarda `listaPrecioId` —y una venta vieja que se queda sin su lista deja de
   * poder explicar a qué precio se vendió— y una caja la tiene configurada como
   * la lista con la que cobra.
   *
   * Tres reglas, de la más dura a la más blanda:
   *
   *   · Si hay VENTAS que la apuntan, no se borra nunca. Es un documento
   *     fiscal: su referencia no se puede dejar colgando por limpiar el
   *     catálogo.
   *   · Si hay CAJAS que cobran con ella, no se borra hasta que se les asigne
   *     otra. Borrarla deja la caja sin precios y nadie se entera hasta que el
   *     primer cliente está en el mostrador.
   *   · Si sólo tiene precios, se puede borrar, pero diciendo cuántos se van y
   *     exigiendo que quien lo pide lo confirme. Un número delante cambia la
   *     decisión: «se van a borrar 4,312 precios» no se pulsa por accidente.
   * ══════════════════════════════════════════════════════════════════════════
   */
  async eliminarLista(id: string, empresaId: string, confirmar = false) {
    const lista = await this.listaPrecioRepository.findOne({
      where: { id, empresaId },
    });
    if (!lista) throw new NotFoundException('Lista no encontrada');

    const [[{ total: enVentas }], [{ total: enCajas }], [{ total: precios }]] =
      await Promise.all([
        this.dataSource.query(
          'SELECT COUNT(*)::int AS total FROM ventas WHERE empresaId = $1 AND listaPrecioId = $2',
          [empresaId, id],
        ),
        this.dataSource.query(
          'SELECT COUNT(*)::int AS total FROM cuentas_bancarias WHERE empresaId = $1 AND listaPrecioId = $2',
          [empresaId, id],
        ),
        this.dataSource.query(
          'SELECT COUNT(*)::int AS total FROM productos_precios WHERE listaPrecioId = $1',
          [id],
        ),
      ]);

    if (Number(enVentas) > 0) {
      throw new ConflictException(
        `No se puede borrar «${lista.nombre}»: ${enVentas} venta(s) registrada(s) la tienen como lista de precios. ` +
          'Borrarla dejaría esos documentos sin poder explicar a qué precio se vendió.',
      );
    }
    if (Number(enCajas) > 0) {
      throw new ConflictException(
        `No se puede borrar «${lista.nombre}»: ${enCajas} caja(s) cobran con ella. ` +
          'Asígnales otra lista en Finanzas → Cuentas bancarias y vuelve a intentarlo.',
      );
    }
    if (Number(precios) > 0 && !confirmar) {
      throw new ConflictException(
        `«${lista.nombre}» tiene ${precios} precio(s) capturados y borrarla los borra todos, sin reversa. ` +
          'Vuelve a enviar la petición con confirmar=true si es lo que quieres.',
      );
    }

    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(ListaPrecio);
      await repo.remove(lista);
      if (lista.esPorDefecto) {
        const siguiente = await repo.findOne({
          where: { empresaId },
          order: { nombre: 'ASC' },
        });
        if (siguiente) {
          siguiente.esPorDefecto = true;
          await repo.save(siguiente);
        }
      }
    });
    return {
      mensaje: `Lista «${lista.nombre}» eliminada` + (Number(precios) > 0 ? ` junto con sus ${precios} precio(s)` : ''),
      preciosBorrados: Number(precios),
    };
  }
}
