"use client";
/**
 * ============================================================================
 * SyncroERP · Tesorería — flujo de efectivo
 * ----------------------------------------------------------------------------
 * La pregunta que responde esta pantalla es "¿me alcanza?". Por eso el
 * acumulado es la serie protagonista y las barras de entradas y salidas van
 * detrás: la tendencia importa más que el detalle de un día.
 *
 * Los traspasos entre cuentas propias se excluyen del total: mover dinero de
 * una cuenta a otra no es flujo, y contarlo infla ambos lados.
 * ============================================================================
 */

import { useState } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ArrowDownLeft, ArrowUpRight, TrendingUp, Waves } from 'lucide-react';

import { api } from '@/lib/api';
import { dinero, dineroCorto, isoCorto } from '@/lib/format';
import { useDatos } from '@/hooks/use-datos';
import {
  Campo, Cargando, Entrada, EncabezadoPantalla, ErrorPantalla,
  Indicador, Panel, Seleccion, SinDatos,
} from '@/components/ui';

interface Cuenta { id: string; nombre: string }

interface Flujo {
  totalEntradas: number;
  totalSalidas: number;
  flujoNeto: number;
  serie: Array<{ fecha: string; entradas: number; salidas: number; neto: number; acumulado: number }>;
  porOrigen: Array<{ origen: string; entradas: number; salidas: number; neto: number }>;
}

const ETIQUETA_ORIGEN: Record<string, string> = {
  MANUAL: 'Captura manual',
  VENTA: 'Ventas',
  COBRANZA: 'Cobranza',
  PAGO_PROVEEDOR: 'Pago a proveedores',
  NOMINA: 'Nómina',
  TRASPASO: 'Traspasos',
  COMISION_BANCARIA: 'Comisiones bancarias',
  IMPUESTO: 'Impuestos',
};

export default function FlujoEfectivoPage() {
  const [desde, setDesde] = useState(isoCorto(new Date(Date.now() - 89 * 86_400_000)));
  const [hasta, setHasta] = useState(isoCorto());
  const [cuentaId, setCuentaId] = useState('');

  const cuentas = useDatos<Cuenta[]>(() => api.get('/tesoreria/saldos'), []);
  const flujo = useDatos<Flujo>(
    () => api.get('/tesoreria/flujo-efectivo', {
      query: { desde, hasta, cuentaBancariaId: cuentaId },
    }),
    [desde, hasta, cuentaId],
  );

  const serie = (flujo.datos?.serie ?? []).map((d) => ({
    ...d,
    etiqueta: new Date(d.fecha + 'T00:00:00').toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short',
    }),
  }));

  const diasNegativos = serie.filter((d) => d.acumulado < 0).length;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <EncabezadoPantalla
        titulo="Flujo de efectivo"
        descripcion="Entradas, salidas y saldo acumulado del periodo"
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
            <Campo etiqueta="Cuenta" ayuda={cuentaId ? 'Incluye traspasos' : 'Todas, sin traspasos internos'}>
              <Seleccion value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
                <option value="">Todas las cuentas</option>
                {(cuentas.datos ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </Seleccion>
            </Campo>
          </div>
        </div>
      </Panel>

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Indicador
          etiqueta="Entradas" color="#059669" cargando={flujo.cargando}
          icono={<ArrowDownLeft className="w-4 h-4" />}
          valor={dinero(flujo.datos?.totalEntradas)}
        />
        <Indicador
          etiqueta="Salidas" color="#e11d48" cargando={flujo.cargando}
          icono={<ArrowUpRight className="w-4 h-4" />}
          valor={dinero(flujo.datos?.totalSalidas)}
        />
        <Indicador
          etiqueta="Flujo neto"
          color={(flujo.datos?.flujoNeto ?? 0) >= 0 ? '#0891b2' : '#e11d48'}
          cargando={flujo.cargando}
          icono={<TrendingUp className="w-4 h-4" />}
          valor={dinero(flujo.datos?.flujoNeto)}
          detalle={(flujo.datos?.flujoNeto ?? 0) >= 0 ? 'entró más de lo que salió' : 'salió más de lo que entró'}
        />
        <Indicador
          etiqueta="Días en negativo"
          color={diasNegativos > 0 ? '#d97706' : '#64748b'}
          cargando={flujo.cargando}
          valor={diasNegativos}
          detalle={diasNegativos > 0 ? 'el acumulado bajó de cero' : 'el acumulado nunca bajó de cero'}
        />
      </div>

      {/* Gráfica */}
      <Panel titulo="Movimiento diario y acumulado" className="mb-4">
        {flujo.cargando ? (
          <div className="esqueleto h-[320px] rounded-lg" />
        ) : flujo.error ? (
          <ErrorPantalla mensaje={flujo.error} onReintentar={flujo.recargar} />
        ) : serie.length === 0 ? (
          <SinDatos
            titulo="Sin movimientos en este rango"
            descripcion="Amplía las fechas o registra movimientos en Tesorería."
            icono={<Waves className="w-5 h-5" />}
          />
        ) : (
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="#e6e9ee" vertical={false} />
                <XAxis
                  dataKey="etiqueta"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={{ stroke: '#e6e9ee' }}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => dineroCorto(v)}
                  width={70}
                />
                <Tooltip
                  formatter={(v, n) => [dinero(Number(v ?? 0)), String(n)]}
                  contentStyle={{
                    fontSize: 12, borderRadius: 8,
                    border: '1px solid #e6e9ee', boxShadow: '0 8px 28px rgb(15 23 42 / 0.12)',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11.5 }} />
                <Bar dataKey="entradas" name="Entradas" fill="#a7f3d0" radius={[3, 3, 0, 0]} />
                <Bar dataKey="salidas" name="Salidas" fill="#fecdd3" radius={[3, 3, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="acumulado"
                  name="Acumulado"
                  stroke="#0891b2"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      {/* Desglose por origen */}
      <Panel sinRelleno titulo="De dónde viene y a dónde va">
        {flujo.cargando ? (
          <Cargando filas={4} />
        ) : (flujo.datos?.porOrigen?.length ?? 0) === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] text-slate-400">
            Sin movimientos que desglosar.
          </p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Origen</th>
                <th className="text-right">Entradas</th>
                <th className="text-right">Salidas</th>
                <th className="text-right">Neto</th>
              </tr>
            </thead>
            <tbody>
              {flujo.datos!.porOrigen
                .slice()
                .sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto))
                .map((o) => (
                  <tr key={o.origen}>
                    <td className="text-slate-800">{ETIQUETA_ORIGEN[o.origen] ?? o.origen}</td>
                    <td className="text-right cifra text-emerald-700">
                      {o.entradas > 0 ? dinero(o.entradas) : '—'}
                    </td>
                    <td className="text-right cifra text-rose-600">
                      {o.salidas > 0 ? dinero(o.salidas) : '—'}
                    </td>
                    <td
                      className="text-right cifra font-semibold"
                      style={{ color: o.neto >= 0 ? '#047857' : '#be123c' }}
                    >
                      {dinero(o.neto)}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="text-right cifra">{dinero(flujo.datos!.totalEntradas)}</td>
                <td className="text-right cifra">{dinero(flujo.datos!.totalSalidas)}</td>
                <td className="text-right cifra">{dinero(flujo.datos!.flujoNeto)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </Panel>
    </div>
  );
}
