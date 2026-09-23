"use client";
/**
 * ============================================================================
 * SyncroERP · Recetas — control de costos
 * ----------------------------------------------------------------------------
 * La pantalla que sostiene el control de costos en alimentos y bebidas.
 *
 * Compara lo que DEBISTE consumir según lo vendido, contra lo que salió de
 * verdad del almacén. La diferencia es merma no registrada, porciones mal
 * servidas o robo — y en un restaurante suele ser el margen completo.
 *
 * Por eso la desviación va arriba y en grande, y los insumos peores primero:
 * por ahí empieza la investigación.
 * ============================================================================
 */

import { useState } from 'react';
import { AlertTriangle, ChefHat, RefreshCw, TrendingUp } from 'lucide-react';

import { api } from '@/lib/api';
import { dinero, isoCorto, numero, porcentaje } from '@/lib/format';
import { useAccion, useDatos } from '@/hooks/use-datos';
import {
  Boton, Cargando, Campo, Distintivo, Entrada, EncabezadoPantalla,
  ErrorPantalla, Indicador, Panel, Seleccion, SinDatos, useAvisos,
} from '@/components/ui';

interface Fila {
  productoId: string;
  consumoTeorico: number;
  costoTeorico: number;
  salidasAdicionales: number;
  costoAdicional: number;
  costoReal: number;
  desviacion: number;
  porcentajeDesviacion: number;
}

interface Comparativo {
  periodo: { desde: string; hasta: string };
  costoTeorico: number;
  costoReal: number;
  desviacion: number;
  porcentajeDesviacion: number;
  filas: Fila[];
}

interface Producto { id: string; nombre: string }

interface Recalculo {
  revisadas: number;
  actualizadas: number;
  cambios: Array<{ producto: string; antes: number; ahora: number }>;
}

/** Umbral a partir del cual una desviación merece investigarse. */
const UMBRAL_ALERTA = 5;

export default function ControlCostosRecetasPage() {
  const { avisar } = useAvisos();
  const hoy = new Date();

  const [desde, setDesde] = useState(isoCorto(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
  const [hasta, setHasta] = useState(isoCorto());
  const [almacenId, setAlmacenId] = useState('');
  const [recalculo, setRecalculo] = useState<Recalculo | null>(null);

  const almacenes = useDatos<Array<{ id: string; nombre: string }>>(
    () => api.get('/catalogo/almacenes'), [],
  );
  const productos = useDatos<Producto[]>(() => api.get('/catalogo/productos'), []);
  const comparativo = useDatos<Comparativo>(
    () => api.get('/recetas/costos/teorico-vs-real', {
      query: { desde, hasta, almacenId },
    }),
    [desde, hasta, almacenId],
  );

  const recalcular = useAccion(async () => {
    const r = await api.post<Recalculo>('/recetas/costos/recalcular');
    setRecalculo(r);
    avisar(
      r.actualizadas > 0
        ? `${r.actualizadas} de ${r.revisadas} recetas tenían el costo desactualizado.`
        : 'Todas las recetas tenían el costo al día.',
      r.actualizadas > 0 ? 'alerta' : 'exito',
    );
    return r;
  });

  const nombreDe = (id: string) =>
    (productos.datos ?? []).find((p) => p.id === id)?.nombre ?? id.slice(0, 8);

  const desviacionAlta = (comparativo.datos?.porcentajeDesviacion ?? 0) > UMBRAL_ALERTA;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <EncabezadoPantalla
        titulo="Control de costos"
        descripcion="Consumo esperado según lo vendido, contra lo que salió del almacén"
        acciones={
          <Boton
            variante="neutro"
            icono={<RefreshCw className="w-3.5 h-3.5" />}
            cargando={recalcular.ejecutando}
            onClick={() => void recalcular.ejecutar()}
          >
            Recalcular costos de recetas
          </Boton>
        }
      />

      {/* Filtros */}
      <Panel className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Campo etiqueta="Desde">
              <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </Campo>
          </div>
          <div className="w-40">
            <Campo etiqueta="Hasta">
              <Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </Campo>
          </div>
          <div className="w-56">
            <Campo etiqueta="Almacén">
              <Seleccion value={almacenId} onChange={(e) => setAlmacenId(e.target.value)}>
                <option value="">Todos</option>
                {(almacenes.datos ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </Seleccion>
            </Campo>
          </div>
        </div>
      </Panel>

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Indicador
          etiqueta="Costo teórico" color="#0f172a" cargando={comparativo.cargando}
          icono={<ChefHat className="w-4 h-4" />}
          valor={dinero(comparativo.datos?.costoTeorico)}
          detalle="según lo vendido"
        />
        <Indicador
          etiqueta="Costo real" color="#0f172a" cargando={comparativo.cargando}
          valor={dinero(comparativo.datos?.costoReal)}
          detalle="lo que salió del almacén"
        />
        <Indicador
          etiqueta="Desviación"
          color={desviacionAlta ? '#e11d48' : '#059669'}
          cargando={comparativo.cargando}
          icono={<TrendingUp className="w-4 h-4" />}
          valor={dinero(comparativo.datos?.desviacion)}
        />
        <Indicador
          etiqueta="Sobre lo esperado"
          color={desviacionAlta ? '#e11d48' : '#059669'}
          cargando={comparativo.cargando}
          valor={porcentaje(comparativo.datos?.porcentajeDesviacion ?? 0)}
          detalle={desviacionAlta ? 'requiere revisión' : 'dentro de lo normal'}
        />
      </div>

      {/* Interpretación */}
      {!comparativo.cargando && comparativo.datos && desviacionAlta && (
        <div className="panel p-4 mb-4 border-l-[3px] border-l-rose-400">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-slate-900">
                Saliste {dinero(comparativo.datos.desviacion)} más de lo que las recetas explican
              </p>
              <p className="text-[12.5px] text-slate-600 mt-1 leading-relaxed">
                Ese importe salió del almacén sin corresponder a una venta. Las causas
                habituales son porciones más grandes que la receta, merma no registrada,
                platillos de cortesía sin capturar, o faltante real. Empieza por los
                insumos de arriba: concentran la mayor parte.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Resultado del recálculo */}
      {recalculo && recalculo.cambios.length > 0 && (
        <Panel
          sinRelleno
          className="mb-4"
          titulo={`${recalculo.actualizadas} recetas tenían el costo desactualizado`}
          accion={
            <button onClick={() => setRecalculo(null)} className="btn btn-fantasma btn-sm">
              Cerrar
            </button>
          }
        >
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="text-right">Costo guardado</th>
                <th className="text-right">Costo real</th>
                <th className="text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {recalculo.cambios.slice(0, 15).map((c) => {
                const dif = c.ahora - c.antes;
                return (
                  <tr key={c.producto}>
                    <td className="text-slate-800">{c.producto}</td>
                    <td className="text-right cifra text-slate-500">{dinero(c.antes)}</td>
                    <td className="text-right cifra font-semibold text-slate-900">{dinero(c.ahora)}</td>
                    <td
                      className="text-right cifra font-semibold"
                      style={{ color: dif > 0 ? '#be123c' : '#047857' }}
                    >
                      {dif > 0 ? '+' : ''}{dinero(dif)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {/* Desglose por insumo */}
      <Panel sinRelleno titulo="Desviación por insumo">
        {comparativo.cargando ? (
          <Cargando />
        ) : comparativo.error ? (
          <ErrorPantalla mensaje={comparativo.error} onReintentar={comparativo.recargar} />
        ) : (comparativo.datos?.filas?.length ?? 0) === 0 ? (
          <SinDatos
            titulo="Sin consumo de recetas en el periodo"
            descripcion="Aparecerá aquí en cuanto se vendan productos que tengan escandallo definido."
            icono={<ChefHat className="w-5 h-5" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th className="text-right">Consumo teórico</th>
                  <th className="text-right">Costo teórico</th>
                  <th className="text-right">Salidas adicionales</th>
                  <th className="text-right">Costo real</th>
                  <th className="text-right">Desviación</th>
                  <th className="text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {comparativo.datos!.filas.map((f) => {
                  const alta = f.porcentajeDesviacion > UMBRAL_ALERTA;
                  return (
                    <tr key={f.productoId}>
                      <td className="text-slate-900">{nombreDe(f.productoId)}</td>
                      <td className="text-right cifra text-slate-600">{numero(f.consumoTeorico)}</td>
                      <td className="text-right cifra text-slate-600">{dinero(f.costoTeorico)}</td>
                      <td className="text-right cifra text-slate-500">
                        {f.salidasAdicionales > 0 ? numero(f.salidasAdicionales) : '—'}
                      </td>
                      <td className="text-right cifra font-semibold text-slate-900">
                        {dinero(f.costoReal)}
                      </td>
                      <td
                        className="text-right cifra font-semibold"
                        style={{ color: f.desviacion > 0 ? '#be123c' : '#94a3b8' }}
                      >
                        {f.desviacion > 0 ? dinero(f.desviacion) : '—'}
                      </td>
                      <td className="text-right">
                        {f.porcentajeDesviacion > 0 ? (
                          <Distintivo tono={alta ? 'peligro' : 'neutro'}>
                            {porcentaje(f.porcentajeDesviacion)}
                          </Distintivo>
                        ) : (
                          <span className="text-slate-300 text-[12px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total del periodo</td>
                  <td />
                  <td className="text-right cifra">{dinero(comparativo.datos!.costoTeorico)}</td>
                  <td />
                  <td className="text-right cifra">{dinero(comparativo.datos!.costoReal)}</td>
                  <td className="text-right cifra">{dinero(comparativo.datos!.desviacion)}</td>
                  <td className="text-right cifra">
                    {porcentaje(comparativo.datos!.porcentajeDesviacion)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>

      <p className="text-[11.5px] text-slate-400 mt-3">
        «Salidas adicionales» son movimientos de esos insumos que no vinieron del consumo
        de una receta: ajustes, mermas registradas y transferencias.
      </p>
    </div>
  );
}
