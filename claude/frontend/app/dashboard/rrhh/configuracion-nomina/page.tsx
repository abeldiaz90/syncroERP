'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ArrowLeft, ArrowRight, BadgeCheck, Building2, Check, Landmark, ShieldCheck } from 'lucide-react';
import { BuscadorSeleccion } from '@/components/ui/BuscadorSeleccion';

type Cuenta = { id: string; codigo?: string; nombre?: string };
type Banco = { id: string; clave?: string; nombre: string; activo?: boolean };
type Config = {
  razonSocial: string; rfc: string; registroPatronal?: string; claseRiesgo?: string;
  primaRiesgo: number; estadoIsn?: string; tasaIsn: number; bancoDispersion?: string;
  cuentaDispersion?: string; proveedorPac?: string; permiteCierreSinTimbrar: boolean;
  observaciones?: string;
  cuentaNominaPorPagarId?: string; cuentaBancoNominaId?: string; cuentaIsrRetenidoId?: string;
  cuentaImssObreroId?: string; cuentaImssPatronalId?: string; cuentaInfonavitId?: string;
  cuentaFonacotId?: string; cuentaIsnId?: string; cuentaGastoImssPatronalId?: string;
  cuentaGastoInfonavitId?: string; cuentaGastoIsnId?: string; cuentaPrestamosEmpleadoId?: string;
  cuentaPensionId?: string; cuentaEmbargosId?: string; cuentaOtrasDeduccionesId?: string;
  cuentaSubsidioEmpleoId?: string;
};

const inicial: Config = {
  razonSocial: '', rfc: '', primaRiesgo: 0, tasaIsn: 0,
  permiteCierreSinTimbrar: false,
};
const camposCuenta: Array<[keyof Config, string, string]> = [
  ['cuentaNominaPorPagarId', 'Nómina por pagar', 'Pasivo del neto pendiente de pago'],
  ['cuentaBancoNominaId', 'Banco de nómina', 'Cuenta bancaria desde la que se dispersa'],
  ['cuentaIsrRetenidoId', 'ISR retenido', 'Pasivo fiscal de ISR de trabajadores'],
  ['cuentaImssObreroId', 'IMSS obrero', 'Retención obrera por enterar'],
  ['cuentaImssPatronalId', 'IMSS patronal por pagar', 'Pasivo patronal IMSS'],
  ['cuentaGastoImssPatronalId', 'Gasto IMSS patronal', 'Gasto por cuotas patronales'],
  ['cuentaInfonavitId', 'INFONAVIT por pagar', 'Retenciones y aportaciones por enterar'],
  ['cuentaGastoInfonavitId', 'Gasto INFONAVIT', 'Aportación patronal al INFONAVIT'],
  ['cuentaFonacotId', 'FONACOT por pagar', 'Retenciones FONACOT'],
  ['cuentaIsnId', 'ISN por pagar', 'Impuesto estatal sobre nóminas'],
  ['cuentaGastoIsnId', 'Gasto ISN', 'Gasto del impuesto estatal'],
  ['cuentaPrestamosEmpleadoId', 'Préstamos a empleados', 'Recuperación de préstamos internos'],
  ['cuentaPensionId', 'Pensiones alimenticias', 'Retenciones por pensión'],
  ['cuentaEmbargosId', 'Embargos', 'Retenciones judiciales'],
  ['cuentaOtrasDeduccionesId', 'Otras deducciones', 'Pasivo de descuentos no clasificados'],
  ['cuentaSubsidioEmpleoId', 'Subsidio al empleo', 'Cuenta de subsidio entregado'],
];

function lista<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const v = value as { data?: unknown };
    if (Array.isArray(v.data)) return v.data as T[];
  }
  return [];
}

export default function ConfiguracionNominaPage() {
  const [form, setForm] = useState<Config>(inicial);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [paso, setPaso] = useState(0);
  const [mensaje, setMensaje] = useState<{ texto: string; ok: boolean } | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Config | null>('/rrhh/nomina-avanzada/configuracion'),
      api.get<unknown>('/finanzas/cuentas-contables', { query: { soloAfectables: true } }),
      api.get<Banco[]>('/catalogos/bancos'),
    ]).then(([config, catalogo, catalogoBancos]) => {
      if (config) setForm({ ...inicial, ...config });
      setCuentas(lista<Cuenta>(catalogo));
      setBancos((catalogoBancos ?? []).filter((b) => b.activo !== false));
    }).catch((error) => {
      setMensaje({ texto: error instanceof Error ? error.message : 'No fue posible cargar la configuración.', ok: false });
    }).finally(() => setCargando(false));
  }, []);

  const faltantes = useMemo(() => camposCuenta.filter(([key]) => !form[key]).length, [form]);
  const cambiar = <K extends keyof Config>(key: K, value: Config[K]) => setForm((actual) => ({ ...actual, [key]: value }));

  function validarPaso(indice = paso): string {
    if (indice === 0) {
      if (!form.razonSocial.trim()) return 'Captura la razón social.';
      if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(form.rfc.trim().toUpperCase())) return 'Captura un RFC válido de 12 o 13 caracteres.';
      if (!form.registroPatronal?.trim()) return 'Captura el registro patronal IMSS.';
      if (form.estadoIsn && !/^[A-Z]{2}$/.test(form.estadoIsn)) return 'La entidad del ISN debe ser una abreviatura de dos letras.';
    }
    if (indice === 1 && faltantes > 0) return `Asigna las ${faltantes} cuentas contables pendientes antes de continuar.`;
    if (indice === 2) {
      if (!form.bancoDispersion?.trim()) return 'Captura el banco de dispersión.';
      if (!form.cuentaDispersion?.trim()) return 'Captura la cuenta origen de la dispersión.';
      if (!form.proveedorPac?.trim()) return 'Captura el proveedor PAC.';
    }
    return '';
  }

  function continuar() {
    const error = validarPaso();
    if (error) return setMensaje({ texto: error, ok: false });
    setMensaje(null);
    setPaso((p) => Math.min(p + 1, 2));
  }

  async function guardar() {
    const errorValidacion = [0, 1, 2].map(validarPaso).find(Boolean);
    if (errorValidacion) {
      setMensaje({ texto: errorValidacion, ok: false });
      return;
    }
    setGuardando(true); setMensaje(null);
    try {
      await api.post('/rrhh/nomina-avanzada/configuracion', form);
      setMensaje({ texto: 'Configuración patronal y contable guardada.', ok: true });
    } catch (error) {
      const texto = error instanceof ApiError ? error.mensajeParaPantalla() : error instanceof Error ? error.message : 'No se pudo guardar.';
      setMensaje({ texto, ok: false });
    } finally { setGuardando(false); }
  }

  if (cargando) return <div className="p-6 text-sm text-slate-500">Cargando configuración de nómina…</div>;

  const pasos = [
    { titulo: 'Identidad patronal', detalle: 'RFC, IMSS, riesgo e ISN', icono: <Building2 className="h-4 w-4" />, listo: Boolean(form.razonSocial && form.rfc && form.registroPatronal) },
    { titulo: 'Mapa contable', detalle: 'Cuentas de gasto y pasivos', icono: <Landmark className="h-4 w-4" />, listo: faltantes === 0 },
    { titulo: 'Control y revisión', detalle: 'PAC, dispersión y cierre', icono: <ShieldCheck className="h-4 w-4" />, listo: Boolean(form.proveedorPac && form.bancoDispersion) },
  ];

  return <div className="mx-auto max-w-7xl space-y-6 p-6">
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-r from-slate-950 to-indigo-950 px-6 py-6 text-white">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-indigo-200">Asistente de configuración</p><h1 className="mt-1 text-2xl font-bold">Preparar empresa para nómina</h1><p className="mt-1 text-sm text-slate-300">Completa la información patronal, fiscal, bancaria y contable en el orden correcto.</p></div><BadgeCheck className="h-9 w-9 text-indigo-300" /></div>
      </div>
      <div className="grid gap-px bg-slate-100 md:grid-cols-3">{pasos.map((p, i) => <button key={p.titulo} onClick={() => setPaso(i)} className={`flex items-center gap-3 p-4 text-left transition ${paso === i ? 'bg-indigo-50' : 'bg-white hover:bg-slate-50'}`}><span className={`flex h-9 w-9 items-center justify-center rounded-full ${p.listo ? 'bg-emerald-100 text-emerald-600' : paso === i ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{p.listo ? <Check className="h-4 w-4" /> : p.icono}</span><span><b className={`block text-xs ${paso === i ? 'text-indigo-800' : 'text-slate-900'}`}>{i + 1}. {p.titulo}</b><span className="text-[11px] text-slate-500">{p.detalle}</span></span></button>)}</div>
    </section>
    {mensaje && <div className={`rounded-lg border p-3 text-sm ${mensaje.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{mensaje.texto}</div>}
    <div className={`rounded-xl border p-4 ${faltantes ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
      <b>{faltantes ? `${faltantes} cuentas contables pendientes` : 'Configuración contable completa'}</b>
      <p className="text-sm">Los conceptos también deben tener cuenta propia cuando no correspondan a uno de estos pasivos.</p>
    </div>

    {paso === 0 && <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-semibold">Identificación patronal</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {[['razonSocial','Razón social'],['rfc','RFC'],['registroPatronal','Registro patronal IMSS'],['claseRiesgo','Clase de riesgo'],['estadoIsn','Entidad federativa ISN']].map(([key,label]) =>
          <label key={key} className="text-sm font-medium text-slate-700">{label}
            <input
              className="entrada mt-1 w-full"
              maxLength={key === 'rfc' ? 13 : key === 'estadoIsn' ? 2 : undefined}
              value={String(form[key as keyof Config] ?? '')}
              onChange={(e) => cambiar(key as keyof Config, (key === 'rfc' || key === 'estadoIsn' ? e.target.value.replace(/\s/g, '').toUpperCase() : e.target.value) as never)}
            />
          </label>)}
        <label className="text-sm font-medium">Prima de riesgo (%)<input className="entrada mt-1 w-full" type="number" step="0.000001" value={form.primaRiesgo} onChange={(e) => cambiar('primaRiesgo', Number(e.target.value))}/></label>
        <label className="text-sm font-medium">Tasa ISN (%)<input className="entrada mt-1 w-full" type="number" step="0.0001" value={form.tasaIsn} onChange={(e) => cambiar('tasaIsn', Number(e.target.value))}/></label>
      </div>
    </section>}

    {paso === 1 && <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="mb-1 font-semibold">Mapa contable de nómina</h2>
      <p className="mb-4 text-sm text-slate-500">Selecciona cuentas afectables. El cierre se bloqueará ante cualquier descuadre.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {camposCuenta.map(([key, label, ayuda]) => <label key={String(key)} className="text-sm font-medium text-slate-700">
          {label}<span className="ml-1 font-normal text-slate-400">— {ayuda}</span>
          <select className="entrada mt-1 w-full" value={String(form[key] ?? '')} onChange={(e) => cambiar(key, (e.target.value || undefined) as never)}>
            <option value="">Seleccionar cuenta…</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} · ` : ''}{c.nombre ?? c.id}</option>)}
          </select>
        </label>)}
      </div>
    </section>}

    {paso === 2 && <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">Banco de dispersión<BuscadorSeleccion className="mt-1" valor={bancos.find((b) => b.nombre === form.bancoDispersion)?.id ?? ''} opciones={bancos.map((b) => ({ valor: b.id, etiqueta: `${b.clave ?? '—'} · ${b.nombre}`, busqueda: b.clave }))} onChange={(id) => cambiar('bancoDispersion', bancos.find((b) => b.id === id)?.nombre ?? '')} placeholder="Buscar banco oficial…" /></label>
        <label className="text-sm font-medium text-slate-700">Cuenta origen<input className="entrada mt-1 w-full" value={form.cuentaDispersion ?? ''} onChange={(e) => cambiar('cuentaDispersion', e.target.value)} /></label>
        <label className="text-sm font-medium text-slate-700">Proveedor PAC<input className="entrada mt-1 w-full" value={form.proveedorPac ?? ''} onChange={(e) => cambiar('proveedorPac', e.target.value)} /></label>
      </div>
      <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
        <input type="checkbox" checked={form.permiteCierreSinTimbrar} onChange={(e) => cambiar('permiteCierreSinTimbrar', e.target.checked)} />
        <span><b>Permitir cierre sin timbrado</b><br/>Úsalo solo para ambientes de prueba. En producción deja esta opción desactivada.</span>
      </label>
      <label className="mt-4 block text-sm font-medium">Observaciones<textarea className="entrada mt-1 min-h-24 w-full" value={form.observaciones ?? ''} onChange={(e) => cambiar('observaciones', e.target.value)}/></label>
      <button className="btn btn-primario mt-4" disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar configuración'}</button>
    </section>}

    <div className="sticky bottom-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <button className="btn btn-neutro" disabled={paso === 0} onClick={() => setPaso((p) => p - 1)}><ArrowLeft className="h-4 w-4" />Anterior</button>
      <span className="text-[11px] text-slate-500">Paso {paso + 1} de {pasos.length}</span>
      {paso < pasos.length - 1 ? <button className="btn btn-primario" onClick={continuar}>Continuar<ArrowRight className="h-4 w-4" /></button> : <button className="btn btn-primario" disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar y finalizar'}</button>}
    </div>
  </div>;
}
