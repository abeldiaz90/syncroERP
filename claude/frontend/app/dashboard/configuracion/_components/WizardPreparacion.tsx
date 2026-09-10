"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

type Req = { codigo: string; completo: boolean };
type Mod = { requisitos: Req[] };
type Diag = { modulos: Record<string, Mod> };

export type PasoWizard = {
  codigo: string;
  titulo: string;
  descripcion: string;
  ruta: string;
  requisito?: string;
  opcional?: boolean;
};

type PasoEvaluado = PasoWizard & { completo: boolean; manual: boolean };

export default function WizardPreparacion({
  titulo,
  descripcion,
  modulo,
  pasos,
  operacionRuta,
}: {
  titulo: string;
  descripcion: string;
  modulo: string;
  pasos: PasoWizard[];
  operacionRuta: string;
}) {
  const router = useRouter();
  const claveManual = `syncroerp.wizard.${modulo}.${titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.revisados`;
  const [diagnostico, setDiagnostico] = useState<Diag | null>(null);
  const [revisados, setRevisados] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      setDiagnostico(await api.get<Diag>('/configuracion/diagnostico'));
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.mensajeParaPantalla()
          : 'No se pudo evaluar la configuración.',
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      const guardados = window.localStorage.getItem(claveManual);
      if (guardados) {
        try {
          const valores = JSON.parse(guardados);
          if (Array.isArray(valores)) setRevisados(valores.map(String));
        } catch {
          window.localStorage.removeItem(claveManual);
        }
      }
      void cargar();
    }, 0);
    return () => window.clearTimeout(temporizador);
  }, [cargar, claveManual]);

  useEffect(() => {
    const alRecuperarFoco = () => void cargar();
    window.addEventListener('focus', alRecuperarFoco);
    return () => window.removeEventListener('focus', alRecuperarFoco);
  }, [cargar]);

  const completos = useMemo(
    () => new Map((diagnostico?.modulos?.[modulo]?.requisitos ?? []).map((r) => [r.codigo, r.completo])),
    [diagnostico, modulo],
  );
  const estadoPasos: PasoEvaluado[] = pasos.map((p) => ({
    ...p,
    manual: !p.requisito,
    completo: p.requisito
      ? Boolean(completos.get(p.requisito))
      : revisados.includes(p.codigo),
  }));
  const obligatorios = estadoPasos.filter((p) => !p.opcional);
  const pendientesObligatorios = obligatorios.filter((p) => !p.completo);
  const siguiente = pendientesObligatorios[0] ?? estadoPasos.find((p) => !p.completo);
  const hechos = obligatorios.filter((p) => p.completo).length;
  const porcentaje = obligatorios.length
    ? Math.round((hechos / obligatorios.length) * 100)
    : 100;

  function alternarRevisado(codigo: string) {
    setRevisados((actual) => {
      const siguienteLista = actual.includes(codigo)
        ? actual.filter((item) => item !== codigo)
        : [...actual, codigo];
      window.localStorage.setItem(claveManual, JSON.stringify(siguienteLista));
      return siguienteLista;
    });
  }

  if (cargando && !diagnostico) {
    return <div className="p-8">Preparando el asistente…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <section className="rounded-3xl bg-slate-950 p-7 text-white">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="text-sm text-slate-300">Asistente guiado</p>
            <h1 className="text-3xl font-bold">{titulo}</h1>
            <p className="mt-2 max-w-2xl text-slate-300">{descripcion}</p>
          </div>
          <button onClick={() => void cargar()} className="flex h-fit items-center gap-2 rounded-xl bg-white/10 px-4 py-2">
            <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} />
            Validar
          </button>
        </div>
        <div className="mt-5 h-3 rounded-full bg-white/15">
          <div className="h-3 rounded-full bg-emerald-400 transition-all" style={{ width: `${porcentaje}%` }} />
        </div>
        <p className="mt-2 text-sm text-slate-300">
          {hechos} de {obligatorios.length} pasos obligatorios verificados
        </p>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          <ShieldAlert className="mr-2 inline" size={18} />{error}
        </div>
      )}

      <div className="space-y-3">
        {estadoPasos.map((p, i) => (
          <section key={p.codigo} className={`rounded-2xl border p-5 transition ${p.completo ? 'border-emerald-200 bg-emerald-50' : siguiente?.codigo === p.codigo ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-100' : 'bg-white'}`}>
            <div className="flex items-start gap-4">
              <div className="mt-0.5">{p.completo ? <CheckCircle2 className="text-emerald-600" /> : <Circle className={siguiente?.codigo === p.codigo ? 'text-indigo-600' : 'text-slate-300'} />}</div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">PASO {i + 1}</span>
                  {p.opcional && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">Opcional</span>}
                  {p.manual && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Confirmación manual</span>}
                  {siguiente?.codigo === p.codigo && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">Siguiente acción</span>}
                </div>
                <h2 className="mt-1 font-bold">{p.titulo}</h2>
                <p className="mt-1 text-sm text-slate-600">{p.descripcion}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => router.push(p.ruta)} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
                    Abrir paso <ArrowRight size={16} />
                  </button>
                  {p.manual && (
                    <button onClick={() => alternarRevisado(p.codigo)} className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                      <ClipboardCheck size={16} />{p.completo ? 'Marcar pendiente' : 'Ya realicé y revisé este paso'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={() => router.push('/dashboard/configuracion/centro')} className="rounded-xl border px-5 py-3 font-semibold">Volver al centro</button>
        <button disabled={pendientesObligatorios.length > 0} onClick={() => router.push(operacionRuta)} className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
          {pendientesObligatorios.length ? `Faltan ${pendientesObligatorios.length} pasos obligatorios` : 'Ir a operar'}
        </button>
      </div>
    </div>
  );
}
