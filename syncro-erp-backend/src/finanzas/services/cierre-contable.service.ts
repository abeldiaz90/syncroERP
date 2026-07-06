import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CierreContable } from '../entities/cierre-contable.entity';
import { Poliza } from '../entities/poliza.entity';

@Injectable()
export class CierreContableService {
  constructor(
    @InjectRepository(CierreContable)
    private readonly cierreRepo: Repository<CierreContable>,
    @InjectRepository(Poliza)
    private readonly polizaRepo: Repository<Poliza>,
    private readonly dataSource: DataSource,
  ) {}

  // ──────────────────────────────────────────────────────────────
  // VERIFICAR SI UN PERÍODO ESTÁ CERRADO
  // Usado por el motor contable antes de crear cualquier póliza
  // ──────────────────────────────────────────────────────────────
  async isPeriodoCerrado(empresaId: string, mes: number, anio: number): Promise<boolean> {
    const cierre = await this.cierreRepo.findOne({
      where: { empresaId, mes, anio },
    });
    return !!cierre;
  }

  // ──────────────────────────────────────────────────────────────
  // CERRAR PERÍODO
  // ──────────────────────────────────────────────────────────────
  async cerrarPeriodo(dto: {
    empresaId: string;
    mes:       number;
    anio:      number;
    usuarioId: string;
    notas?:    string;
  }) {
    // Validar que el período no esté ya cerrado
    const existente = await this.cierreRepo.findOne({
      where: { empresaId: dto.empresaId, mes: dto.mes, anio: dto.anio },
    });
    if (existente) {
      throw new BadRequestException(
        `El período ${dto.mes}/${dto.anio} ya está cerrado desde ${existente.fechaCierre.toLocaleDateString('es-MX')}.`
      );
    }

    // Contar pólizas del período
    const totalPolizas = await this.polizaRepo.count({
      where: { empresaId: dto.empresaId, mes: dto.mes, anio: dto.anio },
    });

    // Marcar todas las pólizas del período como cerradas
    await this.polizaRepo
      .createQueryBuilder()
      .update(Poliza)
      .set({ periodoCerrado: true })
      .where('empresaId = :e AND mes = :m AND anio = :a', {
        e: dto.empresaId, m: dto.mes, a: dto.anio,
      })
      .execute();

    // Registrar el cierre
    const cierre = this.cierreRepo.create({
      empresaId: dto.empresaId,
      mes:       dto.mes,
      anio:      dto.anio,
      usuarioId: dto.usuarioId,
      notas:     dto.notas ?? null,
    });
    const guardado = await this.cierreRepo.save(cierre);

    return {
      cierre:       guardado,
      totalPolizas,
      mensaje:      `Período ${dto.mes}/${dto.anio} cerrado exitosamente. ${totalPolizas} pólizas bloqueadas.`,
    };
  }

  // ──────────────────────────────────────────────────────────────
  // REABRIR PERÍODO (solo admin, casos excepcionales)
  // ──────────────────────────────────────────────────────────────
  async reabrirPeriodo(dto: {
    empresaId: string;
    mes:       number;
    anio:      number;
    usuarioId: string;
    justificacion: string;
  }) {
    if (!dto.justificacion?.trim()) {
      throw new BadRequestException('Se requiere justificación para reabrir un período cerrado.');
    }

    const cierre = await this.cierreRepo.findOne({
      where: { empresaId: dto.empresaId, mes: dto.mes, anio: dto.anio },
    });
    if (!cierre) {
      throw new NotFoundException(`El período ${dto.mes}/${dto.anio} no está cerrado.`);
    }

    // Desbloquear pólizas
    await this.polizaRepo
      .createQueryBuilder()
      .update(Poliza)
      .set({ periodoCerrado: false })
      .where('empresaId = :e AND mes = :m AND anio = :a', {
        e: dto.empresaId, m: dto.mes, a: dto.anio,
      })
      .execute();

    // Eliminar el registro de cierre
    await this.cierreRepo.delete(cierre.id);

    return {
      mensaje: `Período ${dto.mes}/${dto.anio} reabierto. Justificación: ${dto.justificacion}`,
    };
  }

  // ──────────────────────────────────────────────────────────────
  // OBTENER ESTADO DE TODOS LOS PERÍODOS
  // ──────────────────────────────────────────────────────────────
  async obtenerEstadoPeriodos(empresaId: string) {
    const anioActual = new Date().getFullYear();
    const anios      = [anioActual - 1, anioActual];
    const cierres    = await this.cierreRepo.find({ where: { empresaId } });
    const cierreMap  = new Map(cierres.map(c => [`${c.mes}-${c.anio}`, c]));

    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    const resultado = [];
    for (const anio of anios) {
      for (let mes = 1; mes <= 12; mes++) {
        const cierre   = cierreMap.get(`${mes}-${anio}`);
        const polizas  = await this.polizaRepo.count({
          where: { empresaId, mes, anio },
        });
        resultado.push({
          mes, anio,
          nombreMes:    meses[mes - 1],
          cerrado:      !!cierre,
          fechaCierre:  cierre?.fechaCierre ?? null,
          totalPolizas: polizas,
        });
      }
    }
    return resultado;
  }

  // ──────────────────────────────────────────────────────────────
  // RESUMEN DEL PERÍODO (para mostrar antes de cerrar)
  // ──────────────────────────────────────────────────────────────
  async resumenPeriodo(empresaId: string, mes: number, anio: number) {
    const polizas = await this.polizaRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.partidas', 'pp')
      .where('p.empresaId = :e AND p.mes = :m AND p.anio = :a', {
        e: empresaId, m: mes, a: anio,
      })
      .getMany();

    const totalDebe  = polizas.flatMap(p => p.partidas).reduce((s, pp) => s + Number(pp.cargo),  0);
    const totalHaber = polizas.flatMap(p => p.partidas).reduce((s, pp) => s + Number(pp.abono),  0);
    const cuadrada   = Math.abs(totalDebe - totalHaber) < 0.01;

    return {
      mes, anio,
      totalPolizas:  polizas.length,
      totalPartidas: polizas.flatMap(p => p.partidas).length,
      totalDebe:     Math.round(totalDebe  * 100) / 100,
      totalHaber:    Math.round(totalHaber * 100) / 100,
      cuadrada,
      advertencia:   !cuadrada
        ? `⚠️ La balanza NO está cuadrada. Diferencia: $${Math.abs(totalDebe - totalHaber).toFixed(2)}`
        : null,
    };
  }
}