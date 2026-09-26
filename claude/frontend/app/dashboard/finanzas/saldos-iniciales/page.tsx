"use client";
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Database, Save, CheckCircle2, AlertCircle, Info, RefreshCw, Search, Lock,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { fechaNumerica } from '@/lib/fechas';
import { useAvisos } from '@/components/ui';

/**
 * ============================================================================
 * Saldos iniciales — lo que esta pantalla hacía mal
 * ----------------------------------------------------------------------------
 * Medido el 26-sep-2026 contra la instalación. La pantalla pintaba las 1 083
 * cuentas del catálogo SAT con una casilla de importe cada una, y de ahí salían
 * cinco defectos, todos de los que un contador ve en el primer minuto:
 *
 * 1. OFRECÍA INGRESOS, COSTOS Y GASTOS. Una apertura es un BALANCE: activo,
 *    pasivo y capital. Capturar «401.01 Ventas gravadas» como saldo inicial
 *    inventa un estado de resultados de la nada. Peor: el cuadre sumaba esa
 *    «utilidad» al pasivo más capital, así que un balance imposible salía
 *    marcado como cuadrado.
 *
 * 2. PONÍA LAS CONTRA-CUENTAS DEL LADO CONTRARIO. Decidía cargo o abono por el
 *    TIPO de la cuenta —activo al debe— y no por su NATURALEZA. Las 52 cuentas
 *    de activo con naturaleza acreedora —depreciación acumulada, estimación de
 *    incobrables, deterioro— se cargaban en lugar de abonarse: la depreciación
 *    acumulada entraba invertida y el activo salía inflado al doble de ella.
 *
 * 3. OFRECÍA 153 CUENTAS DE MAYOR. No reciben movimientos: el servidor las
 *    rechaza con «Son cuentas de mayor». Casillas que sólo podían dar 400.
 *
 * 4. OFRECÍA LAS DIEZ CUENTAS DE AUXILIAR —Caja, Bancos, Clientes, Inventario,
 *    Proveedores, los IVA— que `permiteMovimientoManual: false` bloquea, y que
 *    son precisamente de lo que se compone una apertura. Cualquier captura
 *    realista terminaba en 400. La pantalla de saldos iniciales no podía
 *    cargar los saldos iniciales.
 *
 *    Esas se cargan desde su módulo, y cada módulo ya contabiliza contra la
 *    cuenta puente 399-01 «Carga de saldos iniciales» —el inventario inicial lo
 *    hace así desde siempre—. Aquí se muestran bloqueadas, con el enlace a
 *    donde sí se cargan, en vez de invitar a un error.
 *
 * 5. CUADRABA SOLA CONTRA CAPITAL SOCIAL, EN SILENCIO. Si no cuadraba, metía la
 *    diferencia en la primera cuenta que empezara por «301» —que es la cuenta
 *    de mayor, no la subcuenta— y guardaba. Un ERP no inventa capital para que
 *    el balance del contador cuadre. Ahora la contrapartida es 399-01, se
 *    enseña con su nombre y su importe ANTES de guardar, y no hay nada
 *    silencioso.
 *
 * Y la carga se leía con `fetch` a pelo, fuera de `lib/api`: sin renovación de
 * sesión, así que una captura larga —que es lo que es una apertura— se perdía
 * al caducar el token.
 * ============================================================================
 */

interface ICuenta {
  id: string; numeroCuenta: string; nombre: string;
  tipo: string; naturaleza: string;
  esAfectable: boolean; activo: boolean; permiteMovimientoManual: boolean;
  rolSistema?: string | null;
}

const GRUPOS = ['ACTIVO', 'PASIVO', 'CAPITAL'] as const;
const CUENTA_PUENTE = '399-01';

/** Dónde se carga de verdad cada cuenta que lleva auxiliar. */
const MODULO_DE: Record<string, { texto: string; href: string }> = {
  '101.01': { texto: 'Tesorería · arqueo y apertura de caja', href: '/dashboard/tesoreria/caja' },
  '102.01': { texto: 'Tesorería · cuentas bancarias', href: '/dashboard/tesoreria/cuentas' },
  '105.01': { texto: 'Ventas · facturas pendientes del cliente', href: '/dashboard/clientes' },
  '115.01': { texto: 'Inventario · carga de stock inicial', href: '/dashboard/inventario/stock-inicial' },
  '118.01': { texto: 'Compras · facturas de proveedor', href: '/dashboard/compras/facturas' },
  '119.01': { texto: 'Compras · facturas de proveedor', href: '/dashboard/compras/facturas' },
  '201.01': { texto: 'Compras · saldos de proveedor', href: '/dashboard/proveedores' },
  '206.01': { texto: 'Ventas · anticipos de cliente', href: '/dashboard/clientes' },
  '208.01': { texto: 'Ventas · cobranza', href: '/dashboard/credito/cobranza' },
  '209.01': { texto: 'Ventas · facturas por cobrar', href: '/dashboard/ventas/historial' },
};

const fmt$ = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n ?? 0);

export default function SaldosInicialesPage() {
  const { avisar } = useAvisos();
  const [cuentas, setCuentas] = useState<ICuenta[]>([]);
  const [saldos, setSaldos] = useState<Record<string, number>>({});
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [estado, setEstado] = useState<any>(null);

  const cargar = async () => {
    setCargando(true);
    try {
      /*
       * Dos módulos distintos en el mismo `Promise.all`: el estado de apertura
       * lleva su propia red. Que no se pueda leer el libro diario no puede
       * dejar sin catálogo a esta pantalla.
       */
      const [c, e] = await Promise.all([
        api.get<ICuenta[]>('/finanzas/cuentas-contables'),
        api.get<any>('/finanzas/polizas/saldos-iniciales').catch(() => null),
      ]);
      setCuentas(Array.isArray(c) ? c : []);
      setEstado(e);
      setErrorCarga('');
    } catch (e) {
      setCuentas([]);
      setErrorCarga(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : 'No se pudo cargar el catálogo de cuentas contables.',
      );
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, []);

  /* Una apertura es un balance: activo, pasivo y capital, y sólo cuentas de
     detalle. La cuenta puente no se captura: es la contrapartida. */
  const delBalance = useMemo(
    () => cuentas.filter(
      (c) => (GRUPOS as readonly string[]).includes(c.tipo)
        && c.activo && c.esAfectable && c.numeroCuenta !== CUENTA_PUENTE,
    ),
    [cuentas],
  );
  const puente = useMemo(
    () => cuentas.find((c) => c.numeroCuenta === CUENTA_PUENTE),
    [cuentas],
  );

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return delBalance;
    return delBalance.filter(
      (c) => c.numeroCuenta.toLowerCase().includes(q) || c.nombre.toLowerCase().includes(q),
    );
  }, [delBalance, busqueda]);

  const capturadas = delBalance
    .map((c) => ({ cuenta: c, importe: saldos[c.id] || 0 }))
    .filter((x) => x.importe > 0);

  /* Cargo o abono por NATURALEZA, no por tipo: es lo que pone la depreciación
     acumulada del lado que le toca. */
  const totalCargo = capturadas
    .filter((x) => x.cuenta.naturaleza === 'DEUDORA')
    .reduce((s, x) => s + x.importe, 0);
  const totalAbono = capturadas
    .filter((x) => x.cuenta.naturaleza !== 'DEUDORA')
    .reduce((s, x) => s + x.importe, 0);
  const diferencia = Math.round((totalCargo - totalAbono) * 100) / 100;
  const tieneSaldos = capturadas.length > 0;

  const guardar = async () => {
    if (!tieneSaldos) { avisar('Captura al menos un saldo de apertura.', 'alerta'); return; }
    if (!puente) {
      avisar(`No existe la cuenta ${CUENTA_PUENTE} «Carga de saldos iniciales», que es la contrapartida de la apertura.`, 'error');
      return;
    }
    const partidas = capturadas.map((x) => ({
      cuentaContableId: x.cuenta.id,
      cargo: x.cuenta.naturaleza === 'DEUDORA' ? x.importe : 0,
      abono: x.cuenta.naturaleza === 'DEUDORA' ? 0 : x.importe,
      referencia: 'SALDO INICIAL',
    }));
    if (Math.abs(diferencia) >= 0.01) {
      partidas.push({
        cuentaContableId: puente.id,
        cargo: diferencia < 0 ? Math.abs(diferencia) : 0,
        abono: diferencia > 0 ? diferencia : 0,
        referencia: 'SALDO INICIAL · contrapartida',
      });
    }
    setGuardando(true);
    try {
      const data = await api.post<any>('/finanzas/polizas/manual', {
        tipo: 'DIARIO',
        fecha,
        concepto: 'Saldos iniciales de apertura',
        partidas,
      });
      avisar(`Saldos iniciales registrados. Póliza ${data.folio}.`, 'exito');
      setSaldos({});
      await cargar();
    } catch (e) {
      avisar(e instanceof ApiError ? e.mensajeParaPantalla() : 'No se pudo registrar la apertura.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      {errorCarga && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{errorCarga}</div>
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">Finanzas</p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <Database className="w-8 h-8 text-indigo-500" /> Saldos iniciales
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            El balance de apertura: activo, pasivo y capital. La contrapartida va a {CUENTA_PUENTE} «Carga de saldos iniciales».
          </p>
        </div>
        <button onClick={cargar} className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 shadow-sm">
          <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {estado?.existe && (
        <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4 mb-4 text-sm text-rose-800">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold mb-1">Esta empresa ya tiene apertura</p>
            <p className="text-xs">
              Póliza <b>{estado.apertura?.folio}</b> del {fechaNumerica(estado.apertura?.fecha)} por {fmt$(estado.apertura?.total ?? 0)}.
              Cargarla otra vez duplica el balance entero, y no se nota hasta el primer cierre.
              Si hay que corregirla, cancela esa póliza desde el libro diario.
            </p>
          </div>
        </div>
      )}
      {!estado?.existe && estado?.hayMovimientos && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-800">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold mb-1">Ya hay {estado.totalPolizas} póliza(s) registradas</p>
            <p className="text-xs">Una apertura fechada antes de lo ya contabilizado desordena todo lo que vino después. Revisa la fecha con cuidado.</p>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 text-sm text-slate-700">
        <Info className="w-5 h-5 shrink-0 mt-0.5 text-slate-400" />
        <div className="text-xs space-y-1">
          <p><b>Qué va aquí:</b> los saldos del último balance general —activo, pasivo y capital—, cuenta de detalle por cuenta de detalle.</p>
          <p><b>Qué no va aquí:</b> ingresos, costos y gastos. Una apertura no tiene resultados; el ejercicio anterior entra en 304 «Resultado de ejercicios anteriores».</p>
          <p><b>Caja, bancos, clientes, proveedores e inventario</b> llevan auxiliar y se cargan desde su módulo, que contabiliza contra {CUENTA_PUENTE}. Aparecen abajo bloqueadas, con su enlace.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-5 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Fecha de apertura</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Buscar cuenta</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Número o nombre…"
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        {tieneSaldos && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold ${Math.abs(diferencia) < 0.01 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
            {Math.abs(diferencia) < 0.01
              ? <><CheckCircle2 className="w-4 h-4" /> Debe = Haber</>
              : <><Info className="w-4 h-4" /> A {CUENTA_PUENTE}: {fmt$(Math.abs(diferencia))}</>}
          </div>
        )}
      </div>

      {cargando ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Cargando catálogo…</p>
        </div>
      ) : (
        <div className="space-y-4">
          {GRUPOS.map((grupo) => {
            const delGrupo = visibles.filter((c) => c.tipo === grupo);
            if (!delGrupo.length) return null;
            const totalGrupo = delGrupo.reduce((s, c) => s + (saldos[c.id] || 0), 0);
            return (
              <div key={grupo} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 bg-slate-900 text-white">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{grupo} · {delGrupo.length} cuentas</p>
                  {totalGrupo > 0 && <span className="text-sm font-bold">{fmt$(totalGrupo)}</span>}
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {delGrupo.map((c) => {
                      const bloqueada = c.permiteMovimientoManual === false;
                      const modulo = MODULO_DE[c.numeroCuenta];
                      return (
                        <tr key={c.id} className={bloqueada ? 'bg-slate-50/70' : 'hover:bg-slate-50 transition-colors'}>
                          <td className="px-5 py-3 w-24 align-top">
                            <span className="font-mono font-bold text-indigo-600 text-xs">{c.numeroCuenta}</span>
                          </td>
                          <td className="px-5 py-3">
                            <p className="font-medium text-slate-800 text-sm">{c.nombre}</p>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-200 text-slate-500">
                              {c.naturaleza === 'DEUDORA' ? 'Deudora · al debe' : 'Acreedora · al haber'}
                            </span>
                            {bloqueada && (
                              <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                                <Lock className="w-3 h-3" />
                                Lleva auxiliar: se carga en {modulo
                                  ? <Link href={modulo.href} className="underline font-semibold">{modulo.texto}</Link>
                                  : 'su módulo'}, que contabiliza contra {CUENTA_PUENTE}.
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-3 w-48">
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">$</span>
                              <input
                                type="number" min="0" step="0.01" disabled={bloqueada}
                                value={saldos[c.id] || ''}
                                onChange={(e) => setSaldos((p) => ({ ...p, [c.id]: parseFloat(e.target.value) || 0 }))}
                                placeholder={bloqueada ? 'Desde su módulo' : '0.00'}
                                className={`w-full pl-7 pr-3 py-2 border rounded-xl text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:placeholder:text-slate-400 ${(saldos[c.id] || 0) > 0 ? 'border-indigo-300 bg-indigo-50 text-indigo-700 font-bold' : 'border-slate-200 bg-slate-50'}`}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
          {!visibles.length && (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-500">
              Ninguna cuenta de balance coincide con «{busqueda}».
            </div>
          )}
        </div>
      )}

      {tieneSaldos && (
        <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-slate-900 text-white">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">La póliza que se va a registrar</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Debe</p>
                <p className="text-xl font-black text-slate-800">{fmt$(totalCargo)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Haber</p>
                <p className="text-xl font-black text-slate-800">{fmt$(totalAbono)}</p>
              </div>
            </div>
            {Math.abs(diferencia) >= 0.01 && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-800">
                <b>Contrapartida:</b> se agregará una partida de {fmt$(Math.abs(diferencia))} {diferencia > 0 ? 'al haber' : 'al debe'} en
                <b> {CUENTA_PUENTE} Carga de saldos iniciales</b>. Es la cuenta puente de apertura, la misma contra la que
                contabilizan el inventario inicial y los demás módulos; queda en cero cuando toda la apertura está cargada.
              </div>
            )}
            <ul className="text-xs text-slate-600 space-y-1 max-h-56 overflow-auto">
              {capturadas.map((x) => (
                <li key={x.cuenta.id} className="flex justify-between gap-4 border-b border-slate-100 pb-1">
                  <span><span className="font-mono text-indigo-600">{x.cuenta.numeroCuenta}</span> {x.cuenta.nombre}</span>
                  <span className="font-mono">{x.cuenta.naturaleza === 'DEUDORA' ? 'debe' : 'haber'} {fmt$(x.importe)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <button onClick={guardar} disabled={guardando || !tieneSaldos || estado?.existe}
          className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md">
          {guardando
            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Guardando…</>
            : <><Save className="w-4 h-4" /> Registrar saldos iniciales</>}
        </button>
      </div>
    </div>
  );
}
