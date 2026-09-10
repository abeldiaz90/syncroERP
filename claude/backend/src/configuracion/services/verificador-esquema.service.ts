import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type EstadoVerificacion = 'OK' | 'ERROR' | 'ADVERTENCIA';
export interface HallazgoEsquema {
  estado: EstadoVerificacion;
  objeto: string;
  mensaje: string;
  esperado?: string;
  actual?: string;
}

interface TablaEsperada {
  tabla: string;
  columnas: string[];
  indicesUnicos?: Array<{ nombre: string; columnas: string[] }>;
}

@Injectable()
export class VerificadorEsquemaService {
  constructor(private readonly ds: DataSource) {}

  private readonly esperado: TablaEsperada[] = [
    { tabla: 'Empresas', columnas: ['id', 'nombreComercial', 'rfc', 'regimenFiscal', 'codigoPostal', 'onboardingCompletado'] },
    { tabla: 'productos', columnas: ['id', 'empresaId', 'sku', 'activo'] },
    { tabla: 'almacenes', columnas: ['id', 'empresaId', 'nombre', 'activo'] },
    { tabla: 'stock_por_almacen', columnas: ['id', 'empresaId', 'productoId', 'almacenId', 'cantidad', 'reservado', 'comprometido', 'bloqueado', 'enTransito'] },
    { tabla: 'requisiciones', columnas: ['id', 'empresaId', 'estado'] },
    { tabla: 'cotizaciones', columnas: ['id', 'empresaId', 'requisicionId', 'proveedorId', 'estado'] },
    { tabla: 'ordenes_compra', columnas: ['id', 'empresaId', 'cotizacionId', 'estado'] },
    { tabla: 'transferencias_inventario', columnas: ['id', 'empresaId', 'folio', 'estado', 'almacenOrigenId', 'almacenDestinoId'] },
    { tabla: 'transferencias_inventario_detalle', columnas: ['id', 'transferenciaId', 'productoId', 'cantidad'] },
    { tabla: 'conteos_inventario', columnas: ['id', 'empresaId', 'almacenId', 'estado'] },
    { tabla: 'ubicaciones_almacen', columnas: ['id', 'empresaId', 'almacenId', 'codigo'] },
  ];

  async verificar() {
    const hallazgos: HallazgoEsquema[] = [];
    const tablas = await this.ds.query(`SELECT TABLE_NAME nombre FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'`);
    const tablaSet = new Set<string>(tablas.map((x: any) => String(x.nombre).toLowerCase()));

    for (const esperado of this.esperado) {
      if (!tablaSet.has(esperado.tabla.toLowerCase())) {
        hallazgos.push({ estado: 'ERROR', objeto: esperado.tabla, mensaje: 'La tabla requerida no existe.' });
        continue;
      }
      const columnas = await this.ds.query(
        `SELECT COLUMN_NAME nombre, DATA_TYPE tipo, IS_NULLABLE nullable FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME=$1`,
        [esperado.tabla],
      );
      const columnasSet = new Set<string>(columnas.map((x: any) => String(x.nombre).toLowerCase()));
      for (const columna of esperado.columnas) {
        if (!columnasSet.has(columna.toLowerCase())) {
          hallazgos.push({ estado: 'ERROR', objeto: `${esperado.tabla}.${columna}`, mensaje: 'La columna requerida no existe.' });
        }
      }
    }

    const migraciones = tablaSet.has('migrations')
      ? await this.ds.query(`SELECT id, timestamp, name FROM migrations ORDER BY timestamp DESC LIMIT 20`)
      : [];
    const errores = hallazgos.filter(h => h.estado === 'ERROR').length;
    return {
      valido: errores === 0,
      fecha: new Date().toISOString(),
      resumen: { errores, advertencias: hallazgos.filter(h => h.estado === 'ADVERTENCIA').length, tablasRevisadas: this.esperado.length },
      migraciones,
      hallazgos,
    };
  }
}
