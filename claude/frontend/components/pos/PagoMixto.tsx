"use client";
/**
 * ============================================================================
 * SyncroERP · Pago mixto
 * ----------------------------------------------------------------------------
 * El punto de venta actual acepta UN método de pago por venta. En un mostrador
 * real la mitad de los tickets grandes se pagan repartidos: mil en efectivo y
 * el resto con tarjeta, o una parte con vale y otra con transferencia.
 *
 * Hoy el cajero resuelve eso partiendo la venta en dos tickets, lo que rompe
 * el corte de caja, duplica folios y deja al cliente con dos comprobantes de
 * una sola compra.
 *
 * ── DECISIONES ─────────────────────────────────────────────────────────────
 *
 * Solo el efectivo genera cambio. Si alguien "paga de más" con tarjeta, es un
 * error de captura, no un cambio a devolver: el componente lo bloquea.
 *
 * Los importes se manejan en centavos enteros. Con tres o cuatro renglones de
 * pago, el redondeo en coma flotante deja diferencias de un centavo que hacen
 * que el botón de cobrar nunca se habilite.
 * ============================================================================
 */

import { useMemo, useState } from 'react';
import { Banknote, CreditCard, Plus, Smartphone, Trash2, X } from 'lucide-react';

import { dinero } from '@/lib/format';
import { Boton, Campo, Entrada, Modal, Seleccion } from '@/components/ui';

const aCent = (v: number | string) => Math.round(Number(v || 0) * 100);
const aPesos = (c: number) => Math.round(c) / 100;

export type MetodoPago =
  | 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'VALE' | 'MONEDERO' | 'CHEQUE';

export interface RenglonPago {
  id: string;
  metodo: MetodoPago;
  importe: number;
  referencia?: string;
  cuentaBancariaId?: string;
}

const METODOS: Array<{ valor: MetodoPago; etiqueta: string; Icono: typeof Banknote; pideReferencia: boolean }> = [
  { valor: 'EFECTIVO',      etiqueta: 'Efectivo',      Icono: Banknote,   pideReferencia: false },
  { valor: 'TARJETA',       etiqueta: 'Tarjeta',       Icono: CreditCard, pideReferencia: true },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia', Icono: Smartphone, pideReferencia: true },
  { valor: 'VALE',          etiqueta: 'Vale',          Icono: Banknote,   pideReferencia: true },
  { valor: 'MONEDERO',      etiqueta: 'Monedero',      Icono: CreditCard, pideReferencia: false },
  { valor: 'CHEQUE',        etiqueta: 'Cheque',        Icono: Banknote,   pideReferencia: true },
];

export function PagoMixto({
  abierto, total, cuentasBancarias, procesando, onCerrar, onCobrar,
}: {
  abierto: boolean;
  total: number;
  cuentasBancarias?: Array<{ id: string; nombre: string; tipo: string }>;
  procesando?: boolean;
  onCerrar: () => void;
  onCobrar: (pagos: RenglonPago[], cambio: number) => void;
}) {
  const [pagos, setPagos] = useState<RenglonPago[]>([]);
  const [metodo, setMetodo] = useState<MetodoPago>('EFECTIVO');
  const [importe, setImporte] = useState('');
  const [referencia, setReferencia] = useState('');
  const [cuentaId, setCuentaId] = useState('');

  const totalCent = aCent(total);

  const calculo = useMemo(() => {
    const pagadoCent = pagos.reduce((s, p) => s + aCent(p.importe), 0);
    const efectivoCent = pagos
      .filter((p) => p.metodo === 'EFECTIVO')
      .reduce((s, p) => s + aCent(p.importe), 0);

    const faltanteCent = Math.max(0, totalCent - pagadoCent);
    const excedenteCent = Math.max(0, pagadoCent - totalCent);

    return {
      pagado: aPesos(pagadoCent),
      faltante: aPesos(faltanteCent),
      // Solo el efectivo da cambio. Un excedente en tarjeta es error de captura.
      cambio: aPesos(Math.min(excedenteCent, efectivoCent)),
      excedenteNoEfectivo: aPesos(Math.max(0, excedenteCent - efectivoCent)),
      completo: pagadoCent >= totalCent,
    };
  }, [pagos, totalCent]);

  const metodoActual = METODOS.find((m) => m.valor === metodo)!;
  const requiereCuenta = metodo === 'TARJETA' || metodo === 'TRANSFERENCIA';

  const agregar = () => {
    const monto = parseFloat(importe);
    if (!monto || monto <= 0) return;
    if (metodoActual.pideReferencia && !referencia.trim()) return;
    if (requiereCuenta && cuentasBancarias?.length && !cuentaId) return;

    setPagos((p) => [...p, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      metodo,
      importe: monto,
      referencia: referencia.trim() || undefined,
      cuentaBancariaId: cuentaId || undefined,
    }]);

    setImporte('');
    setReferencia('');
  };

  /** Rellena con lo que falta: el caso más común de un segundo renglón. */
  const completarFaltante = () => setImporte(calculo.faltante.toFixed(2));

  const cerrarYLimpiar = () => {
    setPagos([]);
    setImporte('');
    setReferencia('');
    onCerrar();
  };

  return (
    <Modal
      abierto={abierto}
      onCerrar={cerrarYLimpiar}
      titulo="Cobrar"
      descripcion={`Total ${dinero(total)}`}
      ancho={560}
      pie={
        <>
          <Boton variante="neutro" onClick={cerrarYLimpiar} disabled={procesando}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            disabled={!calculo.completo || calculo.excedenteNoEfectivo > 0}
            cargando={procesando}
            onClick={() => onCobrar(pagos, calculo.cambio)}
          >
            {calculo.cambio > 0 ? `Cobrar · cambio ${dinero(calculo.cambio)}` : 'Cobrar'}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        {/* Estado del cobro: lo primero que mira el cajero */}
        <div
          className="rounded-lg px-4 py-3"
          style={{
            background: calculo.completo ? '#ecfdf5' : '#f8fafc',
            border: `1px solid ${calculo.completo ? '#a7f3d0' : '#e2e8f0'}`,
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] text-slate-600">Pagado</span>
            <span className="text-[15px] font-bold text-slate-900 cifra">
              {dinero(calculo.pagado)}
            </span>
          </div>

          {calculo.faltante > 0 ? (
            <div className="flex items-center justify-between mt-1">
              <span className="text-[12.5px] font-semibold text-amber-700">Falta</span>
              <span className="text-[15px] font-bold text-amber-700 cifra">
                {dinero(calculo.faltante)}
              </span>
            </div>
          ) : calculo.cambio > 0 && (
            <div className="flex items-center justify-between mt-1">
              <span className="text-[12.5px] font-semibold text-emerald-700">Cambio</span>
              <span className="text-[18px] font-bold text-emerald-700 cifra">
                {dinero(calculo.cambio)}
              </span>
            </div>
          )}

          {calculo.excedenteNoEfectivo > 0 && (
            <p className="text-[12px] text-rose-600 mt-2 font-medium">
              Hay {dinero(calculo.excedenteNoEfectivo)} de más en un método que no da
              cambio. Corrige el importe.
            </p>
          )}
        </div>

        {/* Renglones capturados */}
        {pagos.length > 0 && (
          <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
            {pagos.map((p) => {
              const m = METODOS.find((x) => x.valor === p.metodo)!;
              const Icono = m.Icono;
              return (
                <div key={p.id} className="flex items-center gap-2.5 px-3 py-2">
                  <Icono className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-[12.5px] text-slate-800">{m.etiqueta}</span>
                  {p.referencia && (
                    <span className="text-[11px] text-slate-400">{p.referencia}</span>
                  )}
                  <span className="ml-auto text-[13px] font-semibold text-slate-900 cifra">
                    {dinero(p.importe)}
                  </span>
                  <button
                    onClick={() => setPagos((x) => x.filter((y) => y.id !== p.id))}
                    className="text-slate-300 hover:text-rose-500 shrink-0"
                    aria-label="Quitar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Captura */}
        {!calculo.completo && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-1.5">
              {METODOS.map((m) => {
                const Icono = m.Icono;
                const activo = metodo === m.valor;
                return (
                  <button
                    key={m.valor}
                    onClick={() => setMetodo(m.valor)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[11.5px] transition-colors ${
                      activo
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <Icono className="w-4 h-4" />
                    {m.etiqueta}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Importe" requerido>
                <div className="flex gap-1.5">
                  <Entrada
                    type="number" step="0.01" min="0"
                    value={importe}
                    onChange={(e) => setImporte(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }}
                    placeholder="0.00"
                    autoFocus
                  />
                  <button
                    onClick={completarFaltante}
                    className="btn btn-neutro btn-sm shrink-0"
                    title="Poner el importe faltante"
                  >
                    Todo
                  </button>
                </div>
              </Campo>

              {metodoActual.pideReferencia ? (
                <Campo etiqueta="Referencia" requerido>
                  <Entrada
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }}
                    placeholder="Últimos 4 dígitos, folio…"
                  />
                </Campo>
              ) : requiereCuenta && cuentasBancarias?.length ? (
                <Campo etiqueta="Cuenta" requerido>
                  <Seleccion value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
                    <option value="">Elige…</option>
                    {cuentasBancarias.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </Seleccion>
                </Campo>
              ) : <div />}
            </div>

            <Boton
              variante="neutro"
              icono={<Plus className="w-3.5 h-3.5" />}
              onClick={agregar}
              className="w-full"
            >
              Agregar pago
            </Boton>
          </div>
        )}
      </div>
    </Modal>
  );
}
