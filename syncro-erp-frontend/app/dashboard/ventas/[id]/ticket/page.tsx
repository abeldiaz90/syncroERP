"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Printer, Loader2, FileWarning, CheckCircle2, XCircle,
  Banknote, CreditCard, ArrowLeftRight, Calendar, Calculator,
  Building2, Clock, AlertCircle
} from 'lucide-react';

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface IDetalleVenta {
  id: string;
  producto?: { nombre: string; sku?: string };
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  subtotal: number;
  impuestoPorcentaje?: number;
  impuestoMonto?: number;
}

interface ICliente {
  nombre: string; rfc?: string; email?: string; telefono?: string;
}

interface ICuota {
  numeroCuota: number; fechaVencimiento: string;
  montoCuota: number; montoCapital: number; montoInteres: number;
}

interface ICreditoCliente {
  id: string; folio: string; tipoCredito: string;
  montoTotal: number; numeroCuotas: number;
  tasaInteresMensual: number; sinInteres: boolean;
  enganche: number; fechaInicio: string;
  cuotas: ICuota[];
}

interface IVenta {
  id: string; folio: number; fechaVenta: string; estado: string;
  metodoPago: string; montoRecibido?: number;
  cliente?: ICliente;
  subtotal: number; descuento: number; impuestoTotal: number; total: number;
  notas?: string;
  detalles: IDetalleVenta[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);

const fmtFecha = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

const METODO_INFO: Record<string, { label: string; icon: any; color: string }> = {
  EFECTIVO:      { label: 'Efectivo',           icon: Banknote,       color: '#059669' },
  TARJETA:       { label: 'Tarjeta',            icon: CreditCard,     color: '#3B82F6' },
  TRANSFERENCIA: { label: 'Transferencia SPEI', icon: ArrowLeftRight, color: '#8B5CF6' },
  MSI_BANCO:     { label: 'MSI Banco',          icon: Building2,      color: '#6366F1' },
  CREDITO_30D:   { label: 'Crédito 30 días',    icon: Calendar,       color: '#F59E0B' },
  CREDITO_60D:   { label: 'Crédito 60 días',    icon: Calendar,       color: '#F59E0B' },
  CREDITO_90D:   { label: 'Crédito 90 días',    icon: Calendar,       color: '#F59E0B' },
  MENSUALIDADES: { label: 'Pago en plazos',     icon: Calculator,     color: '#EC4899' },
};

const CREDITOS = new Set(['CREDITO_30D','CREDITO_60D','CREDITO_90D','MENSUALIDADES']);

const diasCredito: Record<string, number> = {
  CREDITO_30D: 30, CREDITO_60D: 60, CREDITO_90D: 90
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function TicketVentaPage() {
  const params  = useParams();
  const id      = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [venta, setVenta]     = useState<IVenta | null>(null);
  const [credito, setCredito] = useState<ICreditoCliente | null>(null);
  const [cargando, setCargando] = useState(true);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

  useEffect(() => {
    if (!id) return;
    (async () => {
      const token = localStorage.getItem('syncro_token');
      const h = { Authorization: `Bearer ${token}` };
      try {
        const [rV] = await Promise.all([
          fetch(`${apiUrl}/ventas/${id}`, { headers: h }),
        ]);
        if (!rV.ok) return;
        const v: IVenta = await rV.json();
        setVenta(v);
        // Si es venta a crédito, buscar el crédito vinculado
        if (CREDITOS.has(v.metodoPago)) {
          const rC = await fetch(`${apiUrl}/credito/creditos?ventaId=${id}`, { headers: h });
          if (rC.ok) {
            const lista = await rC.json();
            if (lista.length > 0) setCredito(lista[0]);
          }
        }
      } catch (err) {
        console.error('Error ticket:', err);
      } finally {
        setCargando(false);
      }
    })();
  }, [id, apiUrl]);

  if (cargando) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4"/>
      <p className="text-slate-500 font-medium">Generando ticket...</p>
    </div>
  );

  if (!venta) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <FileWarning className="w-12 h-12 text-rose-400 mb-4"/>
      <p className="text-xl font-bold text-slate-800">Venta no encontrada</p>
    </div>
  );

  const metodoInfo  = METODO_INFO[venta.metodoPago] ?? { label: venta.metodoPago, icon: Banknote, color: '#64748b' };
  const MetodoIcon  = metodoInfo.icon;
  const esCredito   = CREDITOS.has(venta.metodoPago);
  const esEfectivo  = venta.metodoPago === 'EFECTIVO';
  const cambio      = esEfectivo && venta.montoRecibido ? venta.montoRecibido - venta.total : null;
  const isAnulada   = venta.estado === 'ANULADA';
  const fechaVenc   = venta.metodoPago in diasCredito
    ? new Date(new Date(venta.fechaVenta).getTime() + diasCredito[venta.metodoPago] * 86400000)
    : null;

  return (
    <div className="min-h-screen bg-slate-100 py-8 flex flex-col items-center print:bg-white print:py-0">

      {/* Acciones — solo pantalla */}
      <div className="flex gap-3 mb-6 print:hidden">
        <button onClick={() => window.print()}
          className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800 font-bold shadow-lg">
          <Printer className="w-5 h-5"/> Imprimir
        </button>
        <button onClick={() => window.close()}
          className="flex items-center gap-2 px-6 py-3 bg-white text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 font-bold">
          Cerrar
        </button>
      </div>

      {/* Ticket */}
      <div className="w-full max-w-[340px] bg-white shadow-2xl rounded-sm border border-slate-200 print:shadow-none print:border-none print:max-w-full mx-auto relative overflow-hidden">

        {/* Marca ANULADA */}
        {isAnulada && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <span className="text-5xl font-black text-red-600 -rotate-45 opacity-20 border-4 border-red-600 px-3 py-1 uppercase">
              Anulada
            </span>
          </div>
        )}

        {/* ── CABECERA ── */}
        <div className="bg-slate-900 text-white p-5 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Comprobante de venta</p>
          <h1 className="text-2xl font-black tracking-tight uppercase">Syncro ERP</h1>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="text-lg font-black tracking-widest">
              #{String(venta.folio).padStart(5, '0')}
            </span>
            {isAnulada && (
              <span className="flex items-center gap-1 text-[10px] font-bold bg-red-600 px-2 py-0.5 rounded-full">
                <XCircle className="w-3 h-3"/> ANULADA
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-1 font-mono">
            {new Date(venta.fechaVenta).toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' })}
            {' '}
            {new Date(venta.fechaVenta).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' })}
          </p>
        </div>

        {/* ── MÉTODO DE PAGO — banner de color ── */}
        <div className="px-5 py-2.5 flex items-center gap-2" style={{ backgroundColor: metodoInfo.color + '15', borderBottom: `2px solid ${metodoInfo.color}` }}>
          <MetodoIcon className="w-4 h-4" style={{ color: metodoInfo.color }}/>
          <span className="text-xs font-black uppercase" style={{ color: metodoInfo.color }}>
            {metodoInfo.label}
          </span>
          {esCredito && credito && (
            <span className="ml-auto text-[10px] font-bold" style={{ color: metodoInfo.color }}>
              {credito.folio}
            </span>
          )}
        </div>

        <div className="p-5">

          {/* ── CLIENTE ── */}
          {venta.cliente && (
            <div className="mb-4 pb-4 border-b border-dashed border-slate-200">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Cliente</p>
              <p className="font-bold text-slate-900 text-sm">{venta.cliente.nombre}</p>
              {venta.cliente.rfc && <p className="text-[11px] text-slate-500 font-mono">{venta.cliente.rfc}</p>}
              {venta.cliente.email && <p className="text-[11px] text-slate-400">{venta.cliente.email}</p>}
            </div>
          )}

          {/* ── PRODUCTOS ── */}
          <div className="mb-4 pb-4 border-b border-dashed border-slate-200">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Artículos</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[9px] uppercase text-slate-500">
                  <th className="pb-1 text-left font-bold">Cant</th>
                  <th className="pb-1 text-left font-bold px-1">Descripción</th>
                  <th className="pb-1 text-right font-bold">Importe</th>
                </tr>
              </thead>
              <tbody>
                {venta.detalles?.map(det => (
                  <tr key={det.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-1.5 font-bold text-slate-700 align-top">{det.cantidad}</td>
                    <td className="py-1.5 px-1 align-top">
                      <p className="font-medium text-slate-800 leading-tight">
                        {(det.producto?.nombre ?? '').substring(0, 22)}
                      </p>
                      {det.producto?.sku && (
                        <p className="text-[9px] font-mono text-slate-400">{det.producto.sku}</p>
                      )}
                      <p className="text-[9px] text-slate-400">
                        {fmt$(det.precioUnitario)} c/u
                        {(det.impuestoPorcentaje ?? 0) > 0 && ` + IVA ${det.impuestoPorcentaje}%`}
                      </p>
                      {det.descuento > 0 && (
                        <p className="text-[9px] text-rose-500">Desc: -{fmt$(det.descuento)}</p>
                      )}
                    </td>
                    <td className="py-1.5 text-right font-bold text-slate-900 font-mono align-top">
                      {fmt$(det.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── TOTALES ── */}
          <div className="mb-4 pb-4 border-b border-dashed border-slate-200 space-y-1">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Subtotal</span>
              <span className="font-mono">{fmt$(venta.subtotal)}</span>
            </div>
            {venta.descuento > 0 && (
              <div className="flex justify-between text-xs text-rose-500">
                <span>Descuento</span>
                <span className="font-mono">-{fmt$(venta.descuento)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-slate-500">
              <span>IVA</span>
              <span className="font-mono">{fmt$(venta.impuestoTotal)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-1.5 border-t border-slate-800 mt-1">
              <span className="font-black text-slate-900 uppercase text-sm">Total</span>
              <span className="font-black text-xl text-slate-900 font-mono">{fmt$(venta.total)}</span>
            </div>
          </div>

          {/* ── SECCIÓN ESPECÍFICA POR TIPO ── */}

          {/* EFECTIVO: cambio */}
          {esEfectivo && venta.montoRecibido && (
            <div className="mb-4 pb-4 border-b border-dashed border-slate-200">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Recibido</span>
                <span className="font-mono">{fmt$(venta.montoRecibido)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="font-black text-emerald-700 text-sm">Cambio</span>
                <span className="font-black text-emerald-700 text-lg font-mono">{fmt$(cambio ?? 0)}</span>
              </div>
            </div>
          )}

          {/* CRÉDITO SIMPLE (30/60/90 días) */}
          {['CREDITO_30D','CREDITO_60D','CREDITO_90D'].includes(venta.metodoPago) && (
            <div className="mb-4 pb-4 border-b border-dashed border-slate-200 bg-amber-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-amber-600"/>
                <p className="text-xs font-black text-amber-800 uppercase">Crédito a {diasCredito[venta.metodoPago]} días</p>
              </div>
              <div className="flex justify-between text-xs text-amber-700">
                <span>Fecha límite de pago:</span>
                <span className="font-bold font-mono">
                  {fechaVenc ? fmtFecha(fechaVenc.toISOString()) : '—'}
                </span>
              </div>
              <div className="flex justify-between text-xs text-amber-700 mt-1">
                <span>Monto total a pagar:</span>
                <span className="font-black">{fmt$(venta.total)}</span>
              </div>
              {credito && (
                <p className="text-[9px] text-amber-600 mt-2 font-mono">Ref. crédito: {credito.folio}</p>
              )}
            </div>
          )}

          {/* MENSUALIDADES */}
          {venta.metodoPago === 'MENSUALIDADES' && credito && (
            <div className="mb-4 pb-4 border-b border-dashed border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <Calculator className="w-4 h-4 text-pink-600"/>
                <p className="text-xs font-black text-pink-800 uppercase">Plan de pagos</p>
              </div>
              <div className="bg-pink-50 rounded-lg p-3 space-y-1 text-xs text-pink-800">
                {credito.enganche > 0 && (
                  <div className="flex justify-between">
                    <span>Enganche:</span>
                    <span className="font-bold">{fmt$(credito.enganche)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Capital financiado:</span>
                  <span className="font-bold">{fmt$(credito.montoTotal - credito.enganche)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Número de pagos:</span>
                  <span className="font-bold">{credito.numeroCuotas} meses</span>
                </div>
                {!credito.sinInteres && (
                  <div className="flex justify-between">
                    <span>Tasa mensual:</span>
                    <span className="font-bold">{credito.tasaInteresMensual}%</span>
                  </div>
                )}
                {credito.sinInteres && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Interés:</span>
                    <span className="font-bold">Sin interés</span>
                  </div>
                )}
                {credito.cuotas?.length > 0 && (
                  <div className="flex justify-between border-t border-pink-200 pt-1 mt-1">
                    <span className="font-black">Pago mensual:</span>
                    <span className="font-black text-base">{fmt$(credito.cuotas[0].montoCuota)}</span>
                  </div>
                )}
              </div>

              {/* Mini tabla de cuotas */}
              {credito.cuotas?.length > 0 && (
                <div className="mt-2 overflow-hidden rounded-lg border border-pink-100">
                  <table className="w-full text-[9px]">
                    <thead className="bg-pink-100">
                      <tr>
                        <th className="px-2 py-1 text-left text-pink-700 font-bold">#</th>
                        <th className="px-2 py-1 text-center text-pink-700 font-bold">Vence</th>
                        <th className="px-2 py-1 text-right text-pink-700 font-bold">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-pink-50">
                      {credito.cuotas.slice(0, 6).map(c => (
                        <tr key={c.numeroCuota} className="bg-white">
                          <td className="px-2 py-1 font-bold text-slate-600">{c.numeroCuota}</td>
                          <td className="px-2 py-1 text-center font-mono text-slate-500">
                            {fmtFecha(c.fechaVencimiento)}
                          </td>
                          <td className="px-2 py-1 text-right font-bold text-slate-800 font-mono">
                            {fmt$(c.montoCuota)}
                          </td>
                        </tr>
                      ))}
                      {credito.cuotas.length > 6 && (
                        <tr className="bg-pink-50">
                          <td colSpan={3} className="px-2 py-1 text-center text-pink-600 font-bold">
                            + {credito.cuotas.length - 6} pagos más
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[9px] text-pink-500 mt-1 font-mono text-center">Ref: {credito.folio}</p>
            </div>
          )}

          {/* TARJETA / MSI */}
          {['TARJETA','MSI_BANCO'].includes(venta.metodoPago) && (
            <div className="mb-4 pb-4 border-b border-dashed border-slate-200">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-500"/>
                <p className="text-xs font-bold text-blue-700">
                  {venta.metodoPago === 'MSI_BANCO' ? 'Cargo diferido a tarjeta' : 'Pago con tarjeta'}
                </p>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Conserve su estado de cuenta como comprobante adicional
              </p>
            </div>
          )}

          {/* TRANSFERENCIA */}
          {venta.metodoPago === 'TRANSFERENCIA' && (
            <div className="mb-4 pb-4 border-b border-dashed border-slate-200">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-purple-500"/>
                <p className="text-xs font-bold text-purple-700">Transferencia SPEI</p>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Pago verificado por transferencia electrónica
              </p>
            </div>
          )}

          {/* Notas */}
          {venta.notas && (
            <div className="mb-4 pb-4 border-b border-dashed border-slate-200">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Notas</p>
              <p className="text-xs text-slate-600 italic">{venta.notas}</p>
            </div>
          )}

          {/* ── FOOTER ── */}
          <div className="text-center">
            <p className="text-xs font-bold text-slate-700 mb-1">¡Gracias por su compra!</p>
            <p className="text-[9px] text-slate-400">
              Este documento es comprobante de su transacción.
            </p>
            {esCredito && (
              <div className="mt-2 flex items-center justify-center gap-1 text-[9px] text-amber-600 font-bold">
                <AlertCircle className="w-3 h-3"/>
                Sujeto a crédito — conserve este comprobante
              </div>
            )}
            <div className="font-mono tracking-[0.25em] text-slate-800 text-base opacity-60 mt-3">
              ||| |||| | ||||| |||| |||
            </div>
            <p className="text-[9px] font-mono text-slate-400 mt-1">
              {venta.id.replace(/-/g,'').substring(0,16).toUpperCase()}
            </p>
            <p className="text-[9px] text-slate-300 mt-2">Syncro ERP v1.0</p>
          </div>

        </div>
      </div>

      {/* CSS de impresión */}
      <style>{`
        @media print {
          @page { margin: 5mm; size: 80mm auto; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>

    </div>
  );
}
