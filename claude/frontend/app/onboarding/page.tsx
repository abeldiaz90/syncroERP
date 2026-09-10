// app/onboarding/page.tsx
"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, MapPin, Package, CreditCard,
  Check, ChevronRight, Loader2, Sparkles, X, Landmark
} from 'lucide-react';

// ── Pasos del wizard ──────────────────────────────────────────────────────────
const PASOS = [
  { num: 1, icon: Building2,  titulo: 'Tu empresa', sub: 'Datos fiscales'   },
  { num: 2, icon: MapPin,     titulo: 'Dirección',  sub: 'Domicilio fiscal' },
  { num: 3, icon: Package,    titulo: 'Almacén',    sub: 'Primer almacén'   },
  { num: 4, icon: CreditCard, titulo: 'Plan',       sub: 'Elige tu plan'    },
  { num: 5, icon: Sparkles,   titulo: '¡Listo!',    sub: 'A trabajar'       },
];

const REGIMENES = [
  { clave: '601', nombre: 'General de Ley Personas Morales' },
  { clave: '603', nombre: 'Personas Morales con Fines no Lucrativos' },
  { clave: '606', nombre: 'Arrendamiento' },
  { clave: '612', nombre: 'Personas Físicas con Actividades Empresariales y Profesionales' },
  { clave: '621', nombre: 'Incorporación Fiscal' },
  { clave: '625', nombre: 'Plataformas Tecnológicas' },
  { clave: '626', nombre: 'Régimen Simplificado de Confianza' },
];

const GIROS = [
  'Comercio al por menor', 'Comercio al por mayor', 'Manufactura / Producción',
  'Servicios profesionales', 'Restaurante / Alimentos', 'Construcción',
  'Transporte', 'Tecnología', 'Salud', 'Educación', 'Otro',
];

const TAMANOS = [
  { val: 'micro',   label: 'Micro',   sub: '1-10 empleados'   },
  { val: 'pequena', label: 'Pequeña', sub: '11-50 empleados'  },
  { val: 'mediana', label: 'Mediana', sub: '51-250 empleados' },
  { val: 'grande',  label: 'Grande',  sub: '250+ empleados'   },
];

const PLANES = [
  {
    val: 'starter', label: 'Starter', precio: '$299/mes',
    color: '#4f46e5', bg: '#eef2ff',
    features: ['1 usuario', '1 almacén', 'Ventas + Inventario', 'Soporte por email'],
  },
  {
    val: 'business', label: 'Business', precio: '$799/mes',
    color: '#059669', bg: '#ecfdf5',
    features: ['5 usuarios', '3 almacenes', 'Módulo completo', 'Contabilidad + RPA', 'Soporte prioritario'],
    recomendado: true,
  },
  {
    val: 'enterprise', label: 'Enterprise', precio: 'A la medida',
    color: '#0f172a', bg: '#f8fafc',
    features: ['Usuarios ilimitados', 'Almacenes ilimitados', 'CFDI + Nómina', 'Integración SAT', 'Gerente de cuenta'],
  },
];

const inputCls = 'w-full px-4 py-3 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all bg-white';
const labelCls = 'block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5';

export default function OnboardingWizard() {
  const router = useRouter();
  const [paso, setPaso]   = useState(1);
  const [guardando, setG] = useState(false);
  const [error, setError] = useState('');

  const [fiscal, setFiscal]   = useState({ rfc: '', regimenFiscal: '', giro: '', tamano: '' });
  const [dir, setDir]         = useState({ direccion: '', ciudad: '', estado: '', codigoPostal: '', pais: 'México' });
  const [almacen, setAlmacen] = useState({ nombre: 'Almacén Principal', direccion: '' });
  const [plan, setPlan]       = useState('business');

  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => localStorage.getItem('syncro_token') ?? '';
  const h   = () => ({ Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' });

  useEffect(() => {
    const cargarEstado = async () => {
      try {
        const r = await fetch(`${api}/auth/onboarding/estado`, { headers: h() });
        if (!r.ok) return;
        const d = await r.json();
        const datos = d?.datos || {};
        setFiscal({
          rfc: datos.rfc || '',
          regimenFiscal: datos.regimenFiscal || '',
          giro: datos.giro || '',
          tamano: datos.tamano || '',
        });
        setDir({
          direccion: datos.direccion || '',
          ciudad: datos.ciudad || '',
          estado: datos.estado || '',
          codigoPostal: datos.codigoPostal || '',
          pais: datos.pais || 'México',
        });
        if (datos.plan) setPlan(datos.plan);
        setPaso(Math.max(1, Math.min(5, Number(d?.siguientePaso || 1))));
      } catch {
        // El wizard sigue disponible aun si no puede recuperar el progreso.
      }
    };
    void cargarEstado();
  }, [api]);

  const validarPaso = (numPaso: number, datos: Record<string, string>) => {
    if (numPaso === 1) {
      if (!datos.rfc || !/^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/.test(datos.rfc)) return 'Captura un RFC válido.';
      if (!datos.regimenFiscal || !datos.giro || !datos.tamano) return 'Completa régimen fiscal, giro y tamaño.';
    }
    if (numPaso === 2) {
      if (!datos.direccion || !datos.ciudad || !datos.estado || !datos.pais) return 'Completa todo el domicilio fiscal.';
      if (!/^\d{5}$/.test(datos.codigoPostal || '')) return 'El código postal debe tener 5 dígitos.';
    }
    if (numPaso === 3 && !datos.nombre?.trim()) return 'El nombre del almacén es obligatorio.';
    if (numPaso === 4 && !datos.plan) return 'Selecciona un plan.';
    return '';
  };

  // ✅ Ya NO avanza si el guardado falla: muestra el error y se queda en el paso
  const guardarPaso = async (numPaso: number, datos: Record<string, string>) => {
    setError('');
    const errorValidacion = validarPaso(numPaso, datos);
    if (errorValidacion) { setError(errorValidacion); return; }
    setG(true);
    try {
      const r = await fetch(`${api}/auth/onboarding/paso/${numPaso}`, {
        method: 'POST', headers: h(), body: JSON.stringify(datos),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        const m = Array.isArray(d?.message) ? d.message.join(', ') : d?.message;
        if (r.status === 401) {
          throw new Error('Tu sesión expiró. Inicia sesión de nuevo para continuar.');
        }
        throw new Error(m || `Error al guardar (HTTP ${r.status})`);
      }
      setPaso(p => p + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión con el servidor');
    }
    setG(false);
  };

  const progreso = ((paso - 1) / (PASOS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-black text-xs">S</span>
          </div>
          <span className="font-bold text-slate-900">SyncroERP</span>
        </div>
        <span className="text-sm text-slate-400">Configuración inicial · Paso {paso} de {PASOS.length}</span>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-slate-200">
        <div className="h-full bg-indigo-600 transition-all duration-500" style={{ width: `${progreso}%` }}/>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row max-w-5xl mx-auto w-full p-6 gap-8">

        {/* Sidebar de pasos */}
        <div className="lg:w-56 shrink-0">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sticky top-6">
            {PASOS.map((p, i) => {
              const Icon       = p.icon;
              const completado = paso > p.num;
              const activo     = paso === p.num;
              return (
                <div key={p.num} className="flex items-center gap-3 py-2.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                    completado ? 'bg-emerald-500' : activo ? 'bg-indigo-600' : 'bg-slate-100'
                  }`}>
                    {completado
                      ? <Check className="w-4 h-4 text-white" strokeWidth={3}/>
                      : <Icon className={`w-4 h-4 ${activo ? 'text-white' : 'text-slate-400'}`}/>}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${activo ? 'text-indigo-700' : completado ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {p.titulo}
                    </p>
                    <p className="text-xs text-slate-400">{p.sub}</p>
                  </div>
                  {i < PASOS.length - 1 && (
                    <div className={`absolute left-[2.75rem] w-0.5 h-4 mt-8 ${completado ? 'bg-emerald-300' : 'bg-slate-200'}`}/>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Contenido del paso */}
        <div className="flex-1">

          {/* ✅ Banner de error — visible en cualquier paso */}
          {error && (
            <div className="mb-4 flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
              <X className="w-4 h-4 shrink-0"/> {error}
            </div>
          )}

          {/* ── PASO 1: Datos fiscales ─────────────────────────────────── */}
          {paso === 1 && (
            <WizardCard
              titulo="Cuéntanos sobre tu empresa"
              desc="Estos datos se usan para tu facturación y configuración fiscal."
              onNext={() => guardarPaso(1, fiscal)}
              guardando={guardando}
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelCls}>RFC <span className="text-rose-500">*</span></label>
                  <input value={fiscal.rfc} onChange={e => setFiscal(f=>({...f,rfc:e.target.value.toUpperCase()}))}
                    placeholder="ABCD000000AAA o ABC000000AA0" maxLength={13}
                    className={`${inputCls} uppercase font-mono tracking-wider`}/>
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Régimen Fiscal</label>
                  <select value={fiscal.regimenFiscal} onChange={e => setFiscal(f=>({...f,regimenFiscal:e.target.value}))}
                    className={inputCls}>
                    <option value="">Seleccionar…</option>
                    {REGIMENES.map(r => (
                      <option key={r.clave} value={r.clave}>
                        {r.clave} — {r.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Giro de negocio</label>
                  <select value={fiscal.giro} onChange={e => setFiscal(f=>({...f,giro:e.target.value}))}
                    className={inputCls}>
                    <option value="">Seleccionar…</option>
                    {GIROS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Tamaño de empresa</label>
                  <div className="grid grid-cols-2 gap-2">
                    {TAMANOS.map(t => (
                      <label key={t.val}
                        className={`flex flex-col p-3 rounded-xl border-2 cursor-pointer transition-all ${
                          fiscal.tamano === t.val ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
                        }`}>
                        <input type="radio" name="tamano" value={t.val} checked={fiscal.tamano===t.val}
                          onChange={()=>setFiscal(f=>({...f,tamano:t.val}))} className="sr-only"/>
                        <span className={`text-xs font-bold ${fiscal.tamano===t.val?'text-indigo-700':'text-slate-700'}`}>{t.label}</span>
                        <span className="text-xs text-slate-400">{t.sub}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </WizardCard>
          )}

          {/* ── PASO 2: Dirección ──────────────────────────────────────── */}
          {paso === 2 && (
            <WizardCard
              titulo="Domicilio fiscal"
              desc="Dirección que aparecerá en tus facturas y documentos oficiales."
              onNext={() => guardarPaso(2, dir)}
              guardando={guardando}
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelCls}>Calle y número</label>
                  <input value={dir.direccion} onChange={e => setDir(d=>({...d,direccion:e.target.value}))}
                    placeholder="Av. Juárez 123 Col. Centro" className={inputCls}/>
                </div>
                <div>
                  <label className={labelCls}>Ciudad / Municipio</label>
                  <input value={dir.ciudad} onChange={e => setDir(d=>({...d,ciudad:e.target.value}))}
                    placeholder="Ciudad de México" className={inputCls}/>
                </div>
                <div>
                  <label className={labelCls}>Estado</label>
                  <input value={dir.estado} onChange={e => setDir(d=>({...d,estado:e.target.value}))}
                    placeholder="CDMX, Jalisco, Veracruz…" className={inputCls}/>
                </div>
                <div>
                  <label className={labelCls}>Código Postal</label>
                  <input value={dir.codigoPostal} onChange={e => setDir(d=>({...d,codigoPostal:e.target.value}))}
                    placeholder="12345" maxLength={5} className={inputCls}/>
                </div>
                <div>
                  <label className={labelCls}>País</label>
                  <input value={dir.pais} onChange={e => setDir(d=>({...d,pais:e.target.value}))}
                    className={inputCls}/>
                </div>
              </div>
            </WizardCard>
          )}

          {/* ── PASO 3: Almacén ───────────────────────────────────────── */}
          {paso === 3 && (
            <WizardCard
              titulo="Tu primer almacén"
              desc="Puedes agregar más almacenes después desde el módulo de Inventario."
              onNext={() => guardarPaso(3, almacen)}
              guardando={guardando}
            >
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Nombre del almacén <span className="text-rose-500">*</span></label>
                  <input value={almacen.nombre} onChange={e => setAlmacen(a=>({...a,nombre:e.target.value}))}
                    placeholder="Ej. Almacén Principal, Bodega Norte…" className={inputCls}/>
                </div>
                <div>
                  <label className={labelCls}>Dirección del almacén</label>
                  <input value={almacen.direccion} onChange={e => setAlmacen(a=>({...a,direccion:e.target.value}))}
                    placeholder="Puedes dejarlo vacío si es el mismo domicilio fiscal"
                    className={inputCls}/>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
                  <p className="font-semibold mb-1">💡 ¿Por qué un almacén?</p>
                  <p>En SyncroERP todo el inventario se controla por almacén. Necesitas al menos uno para registrar productos y ventas.</p>
                </div>
              </div>
            </WizardCard>
          )}

          {/* ── PASO 4: Plan ──────────────────────────────────────────── */}
          {paso === 4 && (
            <WizardCard
              titulo="Elige tu plan"
              desc="Los primeros 14 días son gratis en cualquier plan. Sin tarjeta de crédito."
              onNext={() => guardarPaso(4, { plan })}
              guardando={guardando}
              labelBtn="Finalizar configuración"
            >
              <div className="grid grid-cols-3 gap-4">
                {PLANES.map(p => (
                  <div key={p.val}
                    onClick={() => setPlan(p.val)}
                    className={`relative rounded-2xl border-2 p-5 cursor-pointer transition-all ${
                      plan === p.val ? 'border-indigo-500 shadow-lg shadow-indigo-100' : 'border-slate-200 hover:border-slate-300'
                    }`}
                    style={{ background: plan === p.val ? p.bg : '#fff' }}>
                    {p.recomendado && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                        ⭐ Recomendado
                      </div>
                    )}
                    <p className="font-bold text-slate-900 text-sm">{p.label}</p>
                    <p className="font-black text-lg mt-1" style={{ color: p.color }}>{p.precio}</p>
                    <ul className="mt-3 space-y-1.5">
                      {p.features.map(f => (
                        <li key={f} className="flex items-start gap-1.5 text-xs text-slate-600">
                          <Check className="w-3 h-3 mt-0.5 text-emerald-500 shrink-0" strokeWidth={3}/>
                          {f}
                        </li>
                      ))}
                    </ul>
                    {plan === p.val && (
                      <div className="absolute top-3 right-3 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" strokeWidth={3}/>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-center text-xs text-slate-400 mt-4">
                Puedes cambiar de plan en cualquier momento desde la configuración de tu cuenta.
              </p>
            </WizardCard>
          )}

          {/* ── PASO 5: ¡Listo! ───────────────────────────────────────── */}
          {paso === 5 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-sm">
              <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Sparkles className="w-12 h-12 text-emerald-600"/>
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-3">¡Datos guardados! 🎉</h2>
              <p className="text-slate-500 mb-8 max-w-md mx-auto">
                Tu empresa quedó registrada. Solo falta un paso más: configurar tu contabilidad
                para que cada venta y compra se registre automáticamente.
              </p>

              {/* Tarjetas decorativas — muestran lo que viene, sin ser enlaces
                  para no saltarse la configuración contable */}
              <div className="grid grid-cols-3 gap-4 mb-8 max-w-lg mx-auto">
                {[
                  { emoji: '📦', label: 'Agrega productos'      },
                  { emoji: '👥', label: 'Registra clientes'     },
                  { emoji: '🛒', label: 'Haz tu primera venta'  },
                ].map(a => (
                  <div key={a.label}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-500">
                    <span className="text-2xl opacity-70">{a.emoji}</span>
                    {a.label}
                  </div>
                ))}
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-sm text-indigo-700 max-w-md mx-auto mb-6 flex items-start gap-2 text-left">
                <Landmark className="w-4 h-4 mt-0.5 shrink-0"/>
                <span>El siguiente asistente te pedirá cotejar tu Constancia de Situación Fiscal y preparará cuentas e impuestos con referencias del SAT.</span>
              </div>

              <button onClick={() => router.push('/configuracion-inicial')}
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-3 rounded-xl text-sm shadow-sm transition-all">
                Continuar con la configuración <ChevronRight className="w-4 h-4"/>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Componente card del wizard ────────────────────────────────────────────────
function WizardCard({ titulo, desc, onNext, guardando, labelBtn = 'Siguiente', children }: {
  titulo: string; desc: string; onNext: () => void;
  guardando: boolean; labelBtn?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-8 py-6 border-b border-slate-100">
        <h2 className="text-xl font-bold text-slate-900">{titulo}</h2>
        <p className="text-sm text-slate-500 mt-1">{desc}</p>
      </div>
      <div className="px-8 py-6">{children}</div>
      <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
        <button onClick={onNext} disabled={guardando}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-all disabled:opacity-60">
          {guardando
            ? <><Loader2 className="w-4 h-4 animate-spin"/> Guardando…</>
            : <>{labelBtn} <ChevronRight className="w-4 h-4"/></>}
        </button>
      </div>
    </div>
  );
}
