import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { createReadStream, existsSync, unlinkSync } from 'fs';
import { DataSource, In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { ImportacionInventario, EstadoImportacionInventario } from '../entities/importacion-inventario.entity';
import { ImportacionInventarioError } from '../entities/importacion-inventario-error.entity';
import { Producto } from '../entities/producto.entity';
import { Almacen } from '../entities/almacen.entity';
import { InventarioService } from './inventario.service';
import { AsientosPendientesService } from '../../finanzas/services/asientos-pendientes.service';
import { TipoAsiento } from '../../finanzas/entities/asiento-pendiente.entity';
import { ImportacionInventarioFilaAplicada } from '../entities/importacion-inventario-fila-aplicada.entity';

interface FilaCruda { fila:number; sku:string; almacen:string; cantidad:unknown; costoUnitario:unknown; lote?:unknown; caducidad?:unknown; }
interface FilaValida { fila:number; producto:Producto; almacen:Almacen; cantidad:number; costoUnitario:number; lote?:string; caducidad?:string; }

@Injectable()
export class ImportacionStockInicialMasivaService implements OnModuleInit {
  private readonly logger = new Logger(ImportacionStockInicialMasivaService.name);
  private ejecutando = false;
  private esquemaListo = false;
  private readonly lote = Math.max(100, Number(process.env.IMPORT_STOCK_BATCH_SIZE ?? 500));

  constructor(
    @InjectRepository(ImportacionInventario) private readonly jobs: Repository<ImportacionInventario>,
    @InjectRepository(ImportacionInventarioError) private readonly errores: Repository<ImportacionInventarioError>,
    @InjectRepository(Producto) private readonly productos: Repository<Producto>,
    @InjectRepository(Almacen) private readonly almacenes: Repository<Almacen>,
    @InjectRepository(ImportacionInventarioFilaAplicada)
    private readonly filasAplicadas: Repository<ImportacionInventarioFilaAplicada>,
    private readonly inventario: InventarioService,
    private readonly asientos: AsientosPendientesService,
    private readonly ds: DataSource,
  ) {}

  async onModuleInit() {
    try {
      this.esquemaListo = await this.verificarEsquemaImportacion();
      if (!this.esquemaListo) {
        this.logger.error(
          'El esquema de importación está incompleto. Falta ejecutar la migración ' +
            'RepararEsquemaImportacionInventario1787562000000. ' +
            'El resto del ERP continuará disponible, pero el worker de importación quedará deshabilitado.',
        );
        return;
      }

      await this.jobs
        .createQueryBuilder()
        .update()
        .set({
          estado: EstadoImportacionInventario.PENDIENTE,
          mensajeError: 'Reanudada después de reinicio del servicio.',
        })
        .where('estado IN (:...estados)', {
          estados: [
            EstadoImportacionInventario.VALIDANDO,
            EstadoImportacionInventario.PROCESANDO,
          ],
        })
        .execute();

      this.programarDrenado();
    } catch (error) {
      this.logger.error(
        'No fue posible inicializar el worker de importación. El API seguirá activo.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async verificarEsquemaImportacion(): Promise<boolean> {
    const resultado: Array<{ listo: number }> = await this.ds.query(`
      SELECT CASE
        WHEN to_regclass('importaciones_inventario') IS NOT NULL
         AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('importaciones_inventario') AND column_name=LOWER('asiento_pendiente_id'))
         AND to_regclass('importaciones_inventario_filas_aplicadas') IS NOT NULL
        THEN 1 ELSE 0 END AS listo;
    `);

    return Number(resultado?.[0]?.listo ?? 0) === 1;
  }

  private async asegurarEsquemaImportacion(): Promise<void> {
    if (!this.esquemaListo) {
      this.esquemaListo = await this.verificarEsquemaImportacion();
    }

    if (!this.esquemaListo) {
      throw new ServiceUnavailableException(
        'La base de datos aún no tiene aplicada la migración de importación de inventario. ' +
          'Ejecuta las migraciones incluidas en RC6 antes de utilizar esta función.',
      );
    }
  }

  private programarDrenado(): void {
    setImmediate(() => {
      void this.drenar().catch((error: unknown) => {
        this.logger.error(
          'El worker de importación encontró un error y fue detenido sin derribar el API.',
          error instanceof Error ? error.stack : String(error),
        );
      });
    });
  }

  async crear(args:{ruta:string; nombre:string; empresaId:string; usuarioId?:string; modo:'validar'|'aplicar'; idempotencia:string}) {
    await this.asegurarEsquemaImportacion();
    const idempotencia = String(args.idempotencia || '').trim().toLowerCase();
    if (idempotencia.length < 16) throw new BadRequestException('Idempotency-Key es obligatorio y debe tener al menos 16 caracteres.');
    const hash = await this.hash(args.ruta);
    const anteriorClave = await this.jobs.findOne({ where:{ empresaId:args.empresaId, claveIdempotencia:idempotencia } });
    if (anteriorClave) { this.borrar(args.ruta); return this.dto(anteriorClave); }
    const anteriorArchivo = await this.jobs.findOne({ where:{ empresaId:args.empresaId, tipo:'STOCK_INICIAL', hashArchivo:hash, modo:args.modo.toUpperCase() as any }, order:{ fechaCreacion:'DESC' } });
    if (anteriorArchivo) {
      const filasAplicadas =
        args.modo === 'aplicar'
          ? await this.filasAplicadas.count({
              where: { importacionId: anteriorArchivo.id },
            })
          : 0;
      const estaActivo = [
        EstadoImportacionInventario.PROCESANDO,
        EstadoImportacionInventario.PENDIENTE,
        EstadoImportacionInventario.VALIDANDO,
      ].includes(anteriorArchivo.estado);
      const fueAplicado = [
        EstadoImportacionInventario.COMPLETADO,
        EstadoImportacionInventario.COMPLETADO_CON_ERRORES,
      ].includes(anteriorArchivo.estado) && anteriorArchivo.filasProcesadas > 0;

      if (
        estaActivo ||
        fueAplicado ||
        (filasAplicadas > 0 &&
          [
            EstadoImportacionInventario.CANCELADO,
            EstadoImportacionInventario.FALLIDO,
          ].includes(anteriorArchivo.estado))
      ) {
        this.borrar(args.ruta);
        return {
          ...this.dto(anteriorArchivo),
          archivoDuplicado: true,
          requiereReanudacion: filasAplicadas > 0,
        };
      }

      if (
        [EstadoImportacionInventario.COMPLETADO, EstadoImportacionInventario.COMPLETADO_CON_ERRORES]
          .includes(anteriorArchivo.estado) && anteriorArchivo.filasProcesadas === 0
      ) {
        anteriorArchivo.estado = EstadoImportacionInventario.FALLIDO;
        anteriorArchivo.porcentaje = 0;
        anteriorArchivo.mensajeError = 'La importación anterior terminó sin leer filas y fue invalidada automáticamente.';
        anteriorArchivo.fechaFin = new Date();
        await this.jobs.save(anteriorArchivo);
      }
    }
    const job = await this.jobs.save(this.jobs.create({ empresaId:args.empresaId, usuarioId:args.usuarioId, nombreArchivo:args.nombre, rutaArchivo:args.ruta, hashArchivo:hash, claveIdempotencia:idempotencia, modo:args.modo.toUpperCase() as any, estado:EstadoImportacionInventario.PENDIENTE, tamanoLote:this.lote }));
    this.programarDrenado();
    return this.dto(job);
  }

  async obtener(id:string, empresaId:string) { await this.asegurarEsquemaImportacion(); const j=await this.jobs.findOne({where:{id,empresaId}}); if(!j) throw new NotFoundException('Importación no encontrada'); return this.dto(j); }
  async listar(empresaId:string) { await this.asegurarEsquemaImportacion(); return (await this.jobs.find({where:{empresaId},order:{fechaCreacion:'DESC'},take:30})).map(j=>this.dto(j)); }
  async listarErrores(id:string, empresaId:string) { await this.asegurarEsquemaImportacion(); await this.obtener(id,empresaId); return this.errores.find({where:{importacionId:id},order:{numeroFila:'ASC'},take:50000}); }
  async cancelar(id:string, empresaId:string) {
    await this.asegurarEsquemaImportacion();
    const j=await this.jobs.findOne({where:{id,empresaId}});
    if(!j) throw new NotFoundException('Importación no encontrada');
    if([EstadoImportacionInventario.COMPLETADO,EstadoImportacionInventario.COMPLETADO_CON_ERRORES].includes(j.estado)) {
      throw new BadRequestException('La importación ya terminó y no puede cancelarse.');
    }
    j.solicitudCancelacion=true;
    return this.dto(await this.jobs.save(j));
  }
  async reintentar(id:string, empresaId:string) {
    await this.asegurarEsquemaImportacion();
    const j=await this.jobs.findOne({where:{id,empresaId}});
    if(!j) throw new NotFoundException('Importación no encontrada');
    if(![EstadoImportacionInventario.FALLIDO,EstadoImportacionInventario.CANCELADO].includes(j.estado)) {
      throw new BadRequestException('Solo se pueden reanudar importaciones fallidas o canceladas.');
    }
    if(!existsSync(j.rutaArchivo)) throw new BadRequestException('El archivo temporal ya no existe. Selecciónalo nuevamente.');
    j.estado=EstadoImportacionInventario.PENDIENTE;
    j.solicitudCancelacion=false;
    j.porcentaje=0;
    j.mensajeError='La importación se reanudará sin duplicar las filas ya aplicadas.';
    j.fechaFin=undefined;
    await this.jobs.save(j);
    this.programarDrenado();
    return this.dto(j);
  }

  private async drenar() {
    await this.asegurarEsquemaImportacion();
    if(this.ejecutando) return; this.ejecutando=true;
    try {
      while(true) {
        const job=await this.jobs.findOne({where:{estado:EstadoImportacionInventario.PENDIENTE},order:{fechaCreacion:'ASC'}});
        if(!job) break;
        await this.procesar(job);
      }
    } finally { this.ejecutando=false; }
  }

  private async procesar(job: ImportacionInventario) {
    if (!existsSync(job.rutaArchivo)) {
      await this.fallar(
        job,
        'El archivo temporal ya no existe. Vuelve a cargarlo.',
      );
      return;
    }

    job.estado =
      job.modo === 'VALIDAR'
        ? EstadoImportacionInventario.VALIDANDO
        : EstadoImportacionInventario.PROCESANDO;
    job.fechaInicio = job.fechaInicio ?? new Date();
    job.mensajeError = undefined;
    await this.jobs.save(job);
    await this.errores.delete({ importacionId: job.id });

    const almacenes = await this.almacenes.find({
      where: { empresaId: job.empresaId, activo: true },
    });
    if (almacenes.length === 0) {
      throw new BadRequestException(
        'No hay almacenes activos. Crea uno antes de validar o aplicar el stock inicial.',
      );
    }
    const porAlmacen = new Map(
      almacenes.map((almacen) => [
        almacen.nombre.trim().toLowerCase(),
        almacen,
      ]),
    );
    const vistos = new Set<string>();
    let procesadas = 0;
    let correctas = 0;
    let conError = 0;
    let omitidas = 0;
    let loteN = 0;
    let batch: FilaCruda[] = [];

    try {
      for await (const fila of this.leer(job.rutaArchivo)) {
        const actual = await this.jobs.findOne({ where: { id: job.id } });
        if (actual?.solicitudCancelacion) {
          job.estado = EstadoImportacionInventario.CANCELADO;
          job.fechaFin = new Date();
          job.filasProcesadas = procesadas;
          job.filasCorrectas = correctas;
          job.filasConError = conError;
          job.filasOmitidas = omitidas;
          job.mensajeError =
            job.modo === 'APLICAR' && correctas > 0
              ? 'Carga pausada. Las filas ya aplicadas quedaron registradas y pueden reanudarse sin duplicar stock.'
              : 'Carga cancelada por el usuario.';
          await this.jobs.save(job);
          return;
        }

        batch.push(fila);
        if (batch.length >= this.lote) {
          loteN++;
          const resultado = await this.procesarLote(
            job,
            batch,
            porAlmacen,
            vistos,
          );
          procesadas += resultado.procesadas;
          correctas += resultado.correctas;
          conError += resultado.errores;
          omitidas += resultado.omitidas;
          batch = [];
          await this.avance(
            job,
            procesadas,
            correctas,
            conError,
            omitidas,
            loteN,
          );
        }
      }

      if (batch.length) {
        loteN++;
        const resultado = await this.procesarLote(
          job,
          batch,
          porAlmacen,
          vistos,
        );
        procesadas += resultado.procesadas;
        correctas += resultado.correctas;
        conError += resultado.errores;
        omitidas += resultado.omitidas;
        await this.avance(
          job,
          procesadas,
          correctas,
          conError,
          omitidas,
          loteN,
        );
      }

      if (procesadas === 0) {
        throw new BadRequestException(
          'El archivo no contiene filas procesables en la hoja StockInicial. Verifica los encabezados y que cantidad tenga valores.',
        );
      }

      job.totalFilas = procesadas;
      job.filasProcesadas = procesadas;
      job.filasCorrectas = correctas;
      job.filasConError = conError;
      job.filasOmitidas = omitidas;
      job.porcentaje = 100;
      job.estado = conError
        ? EstadoImportacionInventario.COMPLETADO_CON_ERRORES
        : EstadoImportacionInventario.COMPLETADO;
      job.fechaFin = new Date();

      let asientoPendienteId: string | undefined;
      if (job.modo === 'APLICAR') {
        await this.ds.transaction(async (manager) => {
          const aplicadas = await manager.find(
            ImportacionInventarioFilaAplicada,
            {
              where: {
                importacionId: job.id,
                empresaId: job.empresaId,
              },
            },
          );
          if (!aplicadas.length) {
            throw new BadRequestException(
              'La importación no tiene filas aplicadas para contabilizar.',
            );
          }

          const porProducto = new Map<
            string,
            { productoId: string; cantidad: number; costoUnitario: number }
          >();
          for (const fila of aplicadas) {
            const existente = porProducto.get(fila.productoId);
            if (existente) {
              const valorAnterior =
                existente.cantidad * existente.costoUnitario;
              const valorNuevo = Number(fila.cantidad) * Number(fila.costoUnitario);
              existente.cantidad += Number(fila.cantidad);
              existente.costoUnitario =
                (valorAnterior + valorNuevo) / existente.cantidad;
            } else {
              porProducto.set(fila.productoId, {
                productoId: fila.productoId,
                cantidad: Number(fila.cantidad),
                costoUnitario: Number(fila.costoUnitario),
              });
            }
          }

          const evento = await this.asientos.encolarEnTransaccion(
            manager,
            TipoAsiento.INVENTARIO_INICIAL,
            {
              empresaId: job.empresaId,
              fecha: job.fechaFin ?? new Date(),
              importacionId: job.id,
              detalles: [...porProducto.values()],
            },
            job.empresaId,
            `IMPORTACION-${job.id.slice(0, 8)}`,
            job.id,
          );
          asientoPendienteId = evento.id;
          job.asientoPendienteId = evento.id;
          job.estadoContable = 'PENDIENTE';
          await manager.save(ImportacionInventario, job);
        });

        if (asientoPendienteId) {
          const resultado = await this.asientos.reintentarAhora(
            asientoPendienteId,
            job.empresaId,
          );
          job.polizaId = resultado.polizaId;
          job.estadoContable = resultado.generado ? 'GENERADO' : 'PENDIENTE';
          if (!resultado.generado) {
            job.mensajeError =
              'El inventario fue aplicado; la póliza quedó en la cola durable de asientos pendientes.';
          }
        }
      }

      await this.jobs.save(job);
    } catch (error: unknown) {
      await this.fallar(
        job,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      if (
        [
          EstadoImportacionInventario.COMPLETADO,
          EstadoImportacionInventario.COMPLETADO_CON_ERRORES,
        ].includes(job.estado)
      ) {
        this.borrar(job.rutaArchivo);
      }
    }
  }

  private async procesarLote(
    job: ImportacionInventario,
    filas: FilaCruda[],
    porAlmacen: Map<string, Almacen>,
    vistos: Set<string>,
  ) {
    const skus = [
      ...new Set(filas.map((fila) => fila.sku.toLowerCase()).filter(Boolean)),
    ];
    const productos = skus.length
      ? await this.productos
          .createQueryBuilder('p')
          .leftJoinAndSelect('p.categoria', 'categoria')
          .where('p.empresaId=:empresaId', { empresaId: job.empresaId })
          .andWhere('LOWER(p.sku) IN (:...skus)', { skus })
          .getMany()
      : [];
    const porSku = new Map(
      productos.map((producto) => [producto.sku.toLowerCase(), producto]),
    );
    const aplicadasPrevias =
      job.modo === 'APLICAR'
        ? await this.filasAplicadas.find({
            where: {
              importacionId: job.id,
              numeroFila: In(filas.map((fila) => fila.fila)),
            },
          })
        : [];
    const filasYaAplicadas = new Set(
      aplicadasPrevias.map((fila) => fila.numeroFila),
    );
    const validas: FilaValida[] = [];
    const errores: ImportacionInventarioError[] = [];
    let omitidas = 0;

    for (const fila of filas) {
      if (fila.sku && String(fila.cantidad ?? '').trim() === '') {
        omitidas++;
        continue;
      }
      const producto = porSku.get(fila.sku.toLowerCase());
      const almacen = porAlmacen.get(fila.almacen.toLowerCase());
      const fail = (campo: string, mensaje: string, valor?: unknown) =>
        errores.push(
          this.errores.create({
            importacionId: job.id,
            numeroFila: fila.fila,
            sku: fila.sku,
            campo,
            valor:
              valor == null ? undefined : String(valor).slice(0, 500),
            mensaje,
          }),
        );

      if (!fila.sku) {
        fail('sku', 'SKU vacío');
        continue;
      }
      if (!producto) {
        fail('sku', `SKU '${fila.sku}' no existe`);
        continue;
      }
      if (!almacen) {
        fail('almacen', `Almacén '${fila.almacen}' no existe o está inactivo`);
        continue;
      }
      const cantidad = Number(fila.cantidad);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        fail(
          'cantidad',
          'La cantidad debe ser mayor a cero',
          fila.cantidad,
        );
        continue;
      }
      let costo = Number(fila.costoUnitario);
      if (!Number.isFinite(costo) || costo <= 0) {
        costo = Number(producto.precioCompra || 0);
      }
      if (costo <= 0) {
        fail(
          'costoUnitario',
          'No existe un costo unitario válido',
          fila.costoUnitario,
        );
        continue;
      }
      const categoria = producto.categoria as any;
      if (!categoria?.cuentaInventarioId) {
        fail(
          'categoria',
          `La categoría '${categoria?.nombre || 'sin categoría'}' no tiene cuenta de inventario`,
        );
        continue;
      }
      const clave = `${producto.id}|${almacen.id}`;
      if (vistos.has(clave)) {
        fail(
          'sku',
          `SKU duplicado para el almacén '${almacen.nombre}'`,
        );
        continue;
      }
      vistos.add(clave);
      const caducidad = this.caducidad(fila.caducidad);
      if (caducidad.error) {
        fail('caducidad', caducidad.error, fila.caducidad);
        continue;
      }
      validas.push({
        fila: fila.fila,
        producto,
        almacen,
        cantidad,
        costoUnitario: costo,
        lote: String(fila.lote ?? '').trim() || undefined,
        caducidad: caducidad.fecha,
      });
    }

    if (errores.length) {
      await this.errores.save(errores, { chunk: 500 });
    }

    if (job.modo === 'APLICAR' && validas.length) {
      await this.ds.transaction(async (manager) => {
        for (const fila of validas) {
          if (filasYaAplicadas.has(fila.fila)) continue;
          const existente = await manager.findOne(
            ImportacionInventarioFilaAplicada,
            {
              where: {
                importacionId: job.id,
                numeroFila: fila.fila,
              },
              lock: { mode: 'pessimistic_write' },
            },
          );
          if (existente) continue;

          await this.inventario.registrarCompra(
            fila.producto.id,
            fila.almacen.id,
            fila.cantidad,
            `Inventario inicial · importación ${job.id}`,
            job.empresaId,
            fila.lote,
            fila.caducidad,
            undefined,
            manager,
            fila.costoUnitario,
            { id: job.id, tipo: 'IMPORTACION_STOCK_INICIAL' },
          );
          await manager.save(
            ImportacionInventarioFilaAplicada,
            manager.create(ImportacionInventarioFilaAplicada, {
              empresaId: job.empresaId,
              importacionId: job.id,
              numeroFila: fila.fila,
              productoId: fila.producto.id,
              almacenId: fila.almacen.id,
              cantidad: fila.cantidad,
              costoUnitario: fila.costoUnitario,
              lote: fila.lote ?? null,
              caducidad: fila.caducidad ?? null,
            }),
          );
        }
      });
    }

    return {
      procesadas: filas.length,
      correctas: validas.length,
      errores: errores.length,
      omitidas,
    };
  }

  private async avance(j:ImportacionInventario,p:number,c:number,e:number,o:number,l:number){ j.filasProcesadas=p;j.filasCorrectas=c;j.filasConError=e;j.filasOmitidas=o;j.loteActual=l;j.totalFilas=Math.max(j.totalFilas,p);j.porcentaje=j.totalFilas?Math.min(99,Number(((p/j.totalFilas)*100).toFixed(2))):0;await this.jobs.save(j); }
  private async *leer(path:string):AsyncGenerator<FilaCruda>{
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(path, {
      entries: 'emit',
      sharedStrings: 'cache',
      hyperlinks: 'ignore',
      styles: 'ignore',
      worksheets: 'emit',
    } as any);

    let hojaCompatibleEncontrada = false;
    let filasEmitidas = 0;
    const hojasRevisadas: string[] = [];

    const textoCelda = (valor: any): string => {
      if (valor == null) return '';
      if (typeof valor === 'object') {
        if (typeof valor.text === 'string') return valor.text.trim();
        if (valor.result != null) return String(valor.result).trim();
        if (Array.isArray(valor.richText)) {
          return valor.richText.map((x: any) => x?.text ?? '').join('').trim();
        }
      }
      return String(valor).trim();
    };

    const normalizar = (valor: any): string => textoCelda(valor)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();

    const alias: Record<string, keyof Omit<FilaCruda, 'fila'>> = {
      sku: 'sku',
      almacen: 'almacen',
      bodega: 'almacen',
      cantidad: 'cantidad',
      existencia: 'cantidad',
      stock: 'cantidad',
      costounitario: 'costoUnitario',
      costo: 'costoUnitario',
      lote: 'lote',
      caducidad: 'caducidad',
      fechacaducidad: 'caducidad',
    };

    for await (const ws of reader as any) {
      const nombreVisible = textoCelda(ws?.name) || `hoja-${ws?.id ?? hojasRevisadas.length + 1}`;
      hojasRevisadas.push(nombreVisible);

      let mapaColumnas = new Map<number, keyof Omit<FilaCruda, 'fila'>>();
      let filaEncabezados = 0;
      let hojaCompatible = false;

      for await (const row of ws as any) {
        // Busca los encabezados en las primeras 20 filas. No depende del nombre de la hoja.
        if (!hojaCompatible && row.number <= 20) {
          const valores = (row.values as any[]).slice(1);
          const candidato = new Map<number, keyof Omit<FilaCruda, 'fila'>>();

          valores.forEach((valor, indice) => {
            const campo = alias[normalizar(valor)];
            if (campo) candidato.set(indice, campo);
          });

          const campos = new Set(candidato.values());
          if (campos.has('sku') && campos.has('almacen') && campos.has('cantidad')) {
            mapaColumnas = candidato;
            filaEncabezados = row.number;
            hojaCompatible = true;
            hojaCompatibleEncontrada = true;
            this.logger.log(
              `Importación de stock: hoja detectada por encabezados: ${nombreVisible}, fila ${filaEncabezados}.`,
            );
            continue;
          }

          continue;
        }

        if (!hojaCompatible || row.number <= filaEncabezados) continue;

        const valores = (row.values as any[]).slice(1);
        const obj: any = {};
        mapaColumnas.forEach((campo, indice) => {
          obj[campo] = valores[indice];
        });

        const sku = textoCelda(obj.sku);
        const almacen = textoCelda(obj.almacen);
        const cantidadTexto = textoCelda(obj.cantidad);

        // Las filas completamente vacías se omiten.
        if (!sku && !almacen && !cantidadTexto) continue;

        filasEmitidas++;
        yield {
          fila: row.number,
          sku,
          almacen,
          cantidad: obj.cantidad,
          costoUnitario: obj.costoUnitario,
          lote: obj.lote,
          caducidad: obj.caducidad,
        };
      }

      if (hojaCompatible) break;
    }

    if (!hojaCompatibleEncontrada) {
      throw new BadRequestException(
        `No se encontró una hoja con los encabezados obligatorios sku, almacen y cantidad. ` +
        `Hojas revisadas: ${hojasRevisadas.join(', ') || 'ninguna'}.`,
      );
    }

    if (filasEmitidas === 0) {
      throw new BadRequestException(
        'La hoja detectada no contiene filas de datos después de los encabezados. No se aplicó ningún movimiento.',
      );
    }
  }
  private caducidad(v:any):{fecha?:string;error?:string}{ if(v==null||String(v).trim()==='')return{}; let d:Date|null=null; if(v instanceof Date)d=v; else if(typeof v==='number')d=new Date(Math.round((v-25569)*86400000)); else {const s=String(v).trim(); const m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if(m)d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));} if(!d||isNaN(d.getTime()))return{error:`Caducidad inválida: '${v}'. Usa AAAA-MM-DD`}; return{fecha:d.toISOString().slice(0,10)}; }
  private async hash(path:string){return new Promise<string>((resolve,reject)=>{const h=createHash('sha256');createReadStream(path).on('data',d=>h.update(d)).on('end',()=>resolve(h.digest('hex'))).on('error',reject);});}
  private borrar(path:string){try{if(existsSync(path))unlinkSync(path);}catch{} }
  private async fallar(j:ImportacionInventario,m:string){j.estado=EstadoImportacionInventario.FALLIDO;j.mensajeError=String(m).slice(0,8000);j.fechaFin=new Date();await this.jobs.save(j);this.logger.error(`Importación ${j.id}: ${m}`);}
  private dto(j:ImportacionInventario){return{id:j.id,jobId:j.id,estado:j.estado,modo:j.modo,nombreArchivo:j.nombreArchivo,totalFilas:j.totalFilas,procesadas:j.filasProcesadas,correctas:j.filasCorrectas,conError:j.filasConError,omitidas:j.filasOmitidas,porcentaje:Number(j.porcentaje||0),loteActual:j.loteActual,tamanoLote:j.tamanoLote,mensajeError:j.mensajeError,estadoContable:j.estadoContable,asientoPendienteId:j.asientoPendienteId,polizaId:j.polizaId,fechaCreacion:j.fechaCreacion,fechaFin:j.fechaFin};}
}
