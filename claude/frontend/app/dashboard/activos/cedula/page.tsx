"use client";
/**
 * ============================================================================
 * SyncroERP · Activos fijos — cédula de depreciación
 * ----------------------------------------------------------------------------
 * Es un documento antes que una pantalla: el anexo que el contador adjunta a
 * la declaración anual. Por eso el diseño prioriza la impresión y la columna
 * de totales, y deja fuera cualquier adorno que no vaya en el papel.
 * ============================================================================
 */

import { useState } from 'react';
import { FileSpreadsheet, Printer, Table2 } from 'lucide-react';

import { api } from '@/lib/api';
import { dinero, fecha, porcentaje } from '@/lib/format';
import { useDatos } from '@/hooks/use-datos';
import {
  Boton, Cargando, Campo, EncabezadoPantalla, ErrorPantalla,
  Panel, Seleccion, SinDatos,
} from '@/components/ui';

interface FilaCedula {
  codigo: string;
  nombre: string;
  categoria: string;
  fechaAdquisicion: string;
  costoAdquisicion: number;
  tasaAnual: number;
  depreciacionAnterior: number;
  depreciacionEjercicio: number;
  depreciacionAcumulada: number;
  valorEnLibros: number;
  estado: string;
}

interface Cedula {
  ejercicio: number;
  filas: FilaCedula[];
  totales: {
    costoAdquisicion: number;
    depreciacionEjercicio: number;
    depreciacionAcumulada: number;
    valorEnLibros: number;
  };
}

/** Exporta a CSV con BOM para que Excel respete los acentos. */
function exportarCsv(cedula: Cedula) {
  const encabezados = [
    'Código', 'Activo', 'Categoría', 'Adquisición', 'Costo', 'Tasa %',
    'Depreciación anterior', 'Depreciación del ejercicio',
    'Depreciación acumulada', 'Valor en libros', 'Estado',
  ];

  const filas = cedula.filas.map((f) => [
    f.codigo, f.nombre, f.categoria,
    new Date(f.fechaAdquisicion).toISOString().slice(0, 10),
    f.costoAdquisicion, f.tasaAnual,
    f.depreciacionAnterior, f.depreciacionEjercicio,
    f.depreciacionAcumulada, f.valorEnLibros, f.estado,
  ]);

  const escapar = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csv = [encabezados, ...filas].map((r) => r.map(escapar).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cedula-depreciacion-${cedula.ejercicio}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function CedulaPage() {
  const anioActual = new Date().getFullYear();
  const [ejercicio, setEjercicio] = useState(anioActual);

  const cedula = useDatos<Cedula>(
    () => api.get('/activos/reportes/cedula', { query: { ejercicio } }),
    [ejercicio],
  );

  const anios = Array.from({ length: 6 }, (_, i) => anioActual - 4 + i);
  const conMovimiento = (cedula.datos?.filas ?? []).filter((f) => f.depreciacionEjercicio > 0);

  return (
    <div className="p-6 max-w-[1500px] mx-auto">
      <EncabezadoPantalla
        titulo="Cédula de depreciación"
        descripcion="Detalle por activo del ejercicio, para el cierre anual"
        acciones={
          (cedula.datos?.filas?.length ?? 0) > 0 ? (
            <>
              <Boton
                variante="neutro"
                icono={<FileSpreadsheet className="w-3.5 h-3.5" />}
                onClick={() => exportarCsv(cedula.datos!)}
              >
                Exportar
              </Boton>
              <Boton
                variante="neutro"
                icono={<Printer className="w-3.5 h-3.5" />}
                onClick={() => window.print()}
              >
                Imprimir
              </Boton>
            </>
          ) : undefined
        }
      />

      {/* Encabezado que sí sale en el papel */}
      <div className="print-header hidden">
        <h1>Cédula de depreciación · Ejercicio {ejercicio}</h1>
        <p>Generada el {fecha(new Date())}</p>
      </div>

      <Panel sinRelleno>
        <div className="panel-cabecera no-imprimir">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-slate-500">Ejercicio</span>
            <Seleccion
              value={ejercicio}
              onChange={(e) => setEjercicio(Number(e.target.value))}
              className="w-28"
            >
              {anios.map((a) => <option key={a} value={a}>{a}</option>)}
            </Seleccion>
          </div>
          {cedula.datos && (
            <p className="text-[12px] text-slate-500 cifra">
              {cedula.datos.filas.length} activos · {conMovimiento.length} con depreciación en el ejercicio
            </p>
          )}
        </div>

        {cedula.cargando ? (
          <Cargando filas={8} />
        ) : cedula.error ? (
          <ErrorPantalla mensaje={cedula.error} onReintentar={cedula.recargar} />
        ) : (cedula.datos?.filas?.length ?? 0) === 0 ? (
          <SinDatos
            titulo={`Sin activos registrados en ${ejercicio}`}
            descripcion="Registra activos y ejecuta la corrida de depreciación para que la cédula tenga contenido."
            icono={<Table2 className="w-5 h-5" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Activo</th>
                  <th>Categoría</th>
                  <th>Adquisición</th>
                  <th className="text-right">Costo</th>
                  <th className="text-right">Tasa</th>
                  <th className="text-right">Dep. anterior</th>
                  <th className="text-right">Dep. del ejercicio</th>
                  <th className="text-right">Dep. acumulada</th>
                  <th className="text-right">Valor en libros</th>
                </tr>
              </thead>
              <tbody>
                {cedula.datos!.filas.map((f) => (
                  <tr key={f.codigo}>
                    <td className="cifra font-semibold text-slate-900">{f.codigo}</td>
                    <td className="text-slate-800">{f.nombre}</td>
                    <td className="text-slate-500">{f.categoria}</td>
                    <td className="cifra text-slate-500">{fecha(f.fechaAdquisicion)}</td>
                    <td className="text-right cifra">{dinero(f.costoAdquisicion)}</td>
                    <td className="text-right cifra text-slate-500">{porcentaje(f.tasaAnual, 0)}</td>
                    <td className="text-right cifra text-slate-500">
                      {f.depreciacionAnterior > 0 ? dinero(f.depreciacionAnterior) : '—'}
                    </td>
                    <td className="text-right cifra text-amber-700 font-medium">
                      {f.depreciacionEjercicio > 0 ? dinero(f.depreciacionEjercicio) : '—'}
                    </td>
                    <td className="text-right cifra">{dinero(f.depreciacionAcumulada)}</td>
                    <td className="text-right cifra font-semibold text-slate-900">
                      {dinero(f.valorEnLibros)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Totales del ejercicio {cedula.datos!.ejercicio}</td>
                  <td className="text-right cifra">{dinero(cedula.datos!.totales.costoAdquisicion)}</td>
                  <td />
                  <td />
                  <td className="text-right cifra">{dinero(cedula.datos!.totales.depreciacionEjercicio)}</td>
                  <td className="text-right cifra">{dinero(cedula.datos!.totales.depreciacionAcumulada)}</td>
                  <td className="text-right cifra">{dinero(cedula.datos!.totales.valorEnLibros)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
