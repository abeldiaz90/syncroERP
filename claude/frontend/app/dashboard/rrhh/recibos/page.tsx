"use client";
/**
 * ============================================================================
 * SyncroERP · Nómina — recibos
 * ----------------------------------------------------------------------------
 * Dos vistas en una: la lista de dispersión (lo que se manda al banco) y el
 * recibo individual con sus partidas. El detalle se abre en modal y es
 * imprimible: la clase `no-imprimir` deja fuera todo lo que no va en el papel.
 * ============================================================================
 */

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, Printer, Receipt } from 'lucide-react';

import { api } from '@/lib/api';
import { dinero, fecha } from '@/lib/format';
import { useDatos } from '@/hooks/use-datos';
import {
  Boton, Cargando, Distintivo, EncabezadoPantalla, ErrorPantalla,
  Modal, Panel, Seleccion, SinDatos,
} from '@/components/ui';

interface Partida {
  id: string;
  clave: string;
  concepto: string;
  naturaleza: 'PERCEPCION' | 'DEDUCCION' | 'OTRO_PAGO';
  cantidad: number;
  importeGravado: number;
  importeExento: number;
  importe: number;
}

interface Recibo {
  id: string;
  nombreEmpleado: string;
  diasPagados: number;
  salarioDiario: number;
  totalPercepciones: number;
  totalDeducciones: number;
  neto: number;
  baseGravable: number;
  isrRetenido: number;
  imssRetenido: number;
  timbrado: boolean;
  partidas?: Partida[];
  periodo?: { numero: number; ejercicio: number; fechaInicio: string; fechaFin: string; fechaPago: string };
}

interface Periodo {
  id: string; numero: number; ejercicio: number; estado: string;
}

export default function RecibosPage() {
  return (
    <Suspense fallback={<div className="p-6"><Cargando /></div>}>
      <ContenidoRecibos />
    </Suspense>
  );
}

function ContenidoRecibos() {
  const parametros = useSearchParams();
  const [periodoId, setPeriodoId] = useState(parametros.get('periodoId') ?? '');
  const [abierto, setAbierto] = useState<string | null>(null);

  const periodos = useDatos<Periodo[]>(() => api.get('/rrhh/nomina/periodos'), []);
  const recibos = useDatos<Recibo[]>(
    () => (periodoId
      ? api.get('/rrhh/nomina/recibos', { query: { periodoId } })
      : Promise.resolve([])),
    [periodoId],
  );

  const totales = (recibos.datos ?? []).reduce(
    (acc, r) => ({
      percepciones: acc.percepciones + Number(r.totalPercepciones),
      deducciones: acc.deducciones + Number(r.totalDeducciones),
      neto: acc.neto + Number(r.neto),
      isr: acc.isr + Number(r.isrRetenido),
      imss: acc.imss + Number(r.imssRetenido),
    }),
    { percepciones: 0, deducciones: 0, neto: 0, isr: 0, imss: 0 },
  );

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <EncabezadoPantalla
        titulo="Recibos de nómina"
        descripcion="Detalle por empleado del periodo seleccionado"
        acciones={
          (recibos.datos?.length ?? 0) > 0 ? (
            <Boton
              variante="neutro"
              icono={<Printer className="w-3.5 h-3.5" />}
              onClick={() => window.print()}
            >
              Imprimir lista
            </Boton>
          ) : undefined
        }
      />

      <Panel sinRelleno>
        <div className="panel-cabecera no-imprimir">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-slate-500">Periodo</span>
            <Seleccion
              value={periodoId}
              onChange={(e) => setPeriodoId(e.target.value)}
              className="w-64"
            >
              <option value="">Elige un periodo…</option>
              {(periodos.datos ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.numero} · {p.ejercicio} · {p.estado.toLowerCase()}
                </option>
              ))}
            </Seleccion>
          </div>
          {(recibos.datos?.length ?? 0) > 0 && (
            <p className="text-[12px] text-slate-500 cifra">
              {recibos.datos!.length} recibos ·{' '}
              <span className="font-semibold text-slate-900">{dinero(totales.neto)}</span> a dispersar
            </p>
          )}
        </div>

        {!periodoId ? (
          <SinDatos
            titulo="Elige un periodo"
            descripcion="Los recibos aparecen una vez que el periodo se ha calculado."
            icono={<Receipt className="w-5 h-5" />}
          />
        ) : recibos.cargando ? (
          <Cargando />
        ) : recibos.error ? (
          <ErrorPantalla mensaje={recibos.error} onReintentar={recibos.recargar} />
        ) : (recibos.datos?.length ?? 0) === 0 ? (
          <SinDatos
            titulo="Este periodo aún no tiene recibos"
            descripcion="Vuelve a Periodos de nómina y ejecuta el cálculo."
            icono={<Receipt className="w-5 h-5" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th className="text-right">Días</th>
                  <th className="text-right">Salario diario</th>
                  <th className="text-right">Percepciones</th>
                  <th className="text-right">ISR</th>
                  <th className="text-right">IMSS</th>
                  <th className="text-right">Neto</th>
                  <th className="no-imprimir" />
                </tr>
              </thead>
              <tbody>
                {recibos.datos!.map((r) => (
                  <tr key={r.id}>
                    <td className="text-slate-900">{r.nombreEmpleado}</td>
                    <td className="text-right cifra text-slate-600">{Number(r.diasPagados)}</td>
                    <td className="text-right cifra text-slate-600">{dinero(r.salarioDiario)}</td>
                    <td className="text-right cifra text-emerald-700">{dinero(r.totalPercepciones)}</td>
                    <td className="text-right cifra text-rose-600">{dinero(r.isrRetenido)}</td>
                    <td className="text-right cifra text-rose-600">{dinero(r.imssRetenido)}</td>
                    <td className="text-right cifra font-semibold text-slate-900">{dinero(r.neto)}</td>
                    <td className="no-imprimir">
                      <button
                        onClick={() => setAbierto(r.id)}
                        className="btn btn-fantasma btn-sm btn-icono"
                        title="Ver recibo"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Totales del periodo</td>
                  <td className="text-right cifra">{dinero(totales.percepciones)}</td>
                  <td className="text-right cifra">{dinero(totales.isr)}</td>
                  <td className="text-right cifra">{dinero(totales.imss)}</td>
                  <td className="text-right cifra">{dinero(totales.neto)}</td>
                  <td className="no-imprimir" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>

      {abierto && (
        <DetalleRecibo reciboId={abierto} onCerrar={() => setAbierto(null)} />
      )}
    </div>
  );
}

/* ── Detalle ──────────────────────────────────────────────────────────────── */

function DetalleRecibo({ reciboId, onCerrar }: { reciboId: string; onCerrar: () => void }) {
  const recibo = useDatos<Recibo>(() => api.get(`/rrhh/nomina/recibos/${reciboId}`), [reciboId]);

  const percepciones = (recibo.datos?.partidas ?? []).filter((p) => p.naturaleza === 'PERCEPCION');
  const deducciones = (recibo.datos?.partidas ?? []).filter((p) => p.naturaleza === 'DEDUCCION');
  const otros = (recibo.datos?.partidas ?? []).filter((p) => p.naturaleza === 'OTRO_PAGO');

  return (
    <Modal
      abierto
      onCerrar={onCerrar}
      titulo={recibo.datos?.nombreEmpleado ?? 'Recibo'}
      descripcion={
        recibo.datos?.periodo
          ? `Periodo ${recibo.datos.periodo.numero} · ${fecha(recibo.datos.periodo.fechaInicio)} al ${fecha(recibo.datos.periodo.fechaFin)}`
          : undefined
      }
      ancho={600}
      pie={
        <>
          <Boton
            variante="neutro"
            icono={<Printer className="w-3.5 h-3.5" />}
            onClick={() => window.print()}
          >
            Imprimir
          </Boton>
          <Boton variante="primario" onClick={onCerrar}>Cerrar</Boton>
        </>
      }
    >
      {recibo.cargando ? (
        <Cargando filas={5} />
      ) : recibo.error ? (
        <ErrorPantalla mensaje={recibo.error} onReintentar={recibo.recargar} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-[12px] text-slate-500">
            <span>
              {Number(recibo.datos!.diasPagados)} días · {dinero(recibo.datos!.salarioDiario)} diarios
            </span>
            <Distintivo tono={recibo.datos!.timbrado ? 'exito' : 'neutro'}>
              {recibo.datos!.timbrado ? 'Timbrado' : 'Sin timbrar'}
            </Distintivo>
          </div>

          <BloquePartidas titulo="Percepciones" partidas={percepciones} tono="#059669" />
          {otros.length > 0 && (
            <BloquePartidas titulo="Otros pagos" partidas={otros} tono="#0284c7" />
          )}
          <BloquePartidas titulo="Deducciones" partidas={deducciones} tono="#e11d48" />

          <div className="border-t border-slate-200 pt-3 space-y-1.5">
            <Renglon etiqueta="Total de percepciones" valor={recibo.datos!.totalPercepciones} />
            <Renglon etiqueta="Total de deducciones" valor={recibo.datos!.totalDeducciones} />
            <Renglon etiqueta="Base gravable" valor={recibo.datos!.baseGravable} tenue />
            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="text-[13px] font-bold text-slate-900">Neto a pagar</span>
              <span className="text-[18px] font-bold text-slate-900 cifra">
                {dinero(recibo.datos!.neto)}
              </span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function BloquePartidas({
  titulo, partidas, tono,
}: {
  titulo: string; partidas: Partida[]; tono: string;
}) {
  if (!partidas.length) return null;

  return (
    <div>
      <p className="eyebrow mb-1.5" style={{ color: tono }}>{titulo}</p>
      <table className="w-full">
        <tbody>
          {partidas.map((p) => (
            <tr key={p.id} className="border-b border-slate-50 last:border-0">
              <td className="py-1.5 text-[12.5px] text-slate-700">
                <span className="text-slate-400 text-[11px] mr-1.5 cifra">{p.clave}</span>
                {p.concepto}
              </td>
              <td className="py-1.5 text-right text-[12.5px] text-slate-400 cifra w-16">
                {Number(p.cantidad) !== 1 ? Number(p.cantidad) : ''}
              </td>
              <td className="py-1.5 text-right text-[12.5px] font-medium text-slate-900 cifra w-28">
                {dinero(p.importe)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Renglon({ etiqueta, valor, tenue }: { etiqueta: string; valor: number; tenue?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-[12.5px] ${tenue ? 'text-slate-400' : 'text-slate-600'}`}>{etiqueta}</span>
      <span className={`text-[12.5px] cifra ${tenue ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>
        {dinero(valor)}
      </span>
    </div>
  );
}
