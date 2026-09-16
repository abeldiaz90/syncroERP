"use client";

/**
 * ============================================================================
 * Clientes → Expediente (pantalla propia)
 * ----------------------------------------------------------------------------
 * La misma ficha que se ve en el panel de la cartera, pero a pantalla completa
 * y con la historia entera. Sirve para compartir un enlace y para auditar: el
 * panel muestra las últimas corridas, aquí están todas.
 *
 * El contenido vive en `components/clientes/expediente-cliente.tsx`, para que
 * el panel y esta pantalla no puedan acabar diciendo cosas distintas.
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { api, intentar } from '@/lib/api';
import {
  ExpedienteCliente, EST, dinero, fechaLarga, useExpedienteVigente,
} from '@/components/clientes/expediente-cliente';

interface ICliente {
  id: string; nombre: string; rfc?: string | null; curp?: string | null;
  limiteCredito?: number | string | null; diasCredito?: number | null;
  versionCredito?: number | null; estadoCredito?: string | null;
  nivelRiesgo?: string | null;
}

export default function ExpedienteClientePage() {
  const params = useParams<{ id: string }>();
  const clienteId = params?.id;
  const [cliente, setCliente] = useState<ICliente | null>(null);
  const [cargando, setCargando] = useState(true);
  const vigente = useExpedienteVigente(clienteId);

  useEffect(() => {
    if (!clienteId) return;
    void (async () => {
      const c = await intentar<ICliente | null>(api.get<ICliente>(`/clientes/${clienteId}`), null);
      setCliente(c);
      setCargando(false);
    })();
  }, [clienteId]);

  const conLinea = Number(cliente?.limiteCredito ?? 0) > 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/dashboard/clientes"
        className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> Volver a la cartera de clientes
      </Link>

      {cargando ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden mb-5">
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Expediente único
              </p>
              <h1 className="text-xl font-semibold text-slate-900 mt-0.5">
                {cliente?.nombre ?? 'Cliente'}
              </h1>
              <p className="text-xs text-slate-500 mt-1 font-mono">
                {[cliente?.rfc, cliente?.curp].filter(Boolean).join(' · ') || 'sin RFC ni CURP'}
              </p>
            </div>
            <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
              <div className="px-5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Línea de crédito</p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5 tabular-nums">
                  {conLinea ? dinero(cliente?.limiteCredito) : 'Sin línea'}
                </p>
                {conLinea && (
                  <p className="text-xs text-slate-500">{cliente?.diasCredito} días · v{cliente?.versionCredito ?? 1}</p>
                )}
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Estado del crédito</p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5">
                  {(cliente?.estadoCredito ?? 'SIN_CREDITO').replace(/_/g, ' ').toLowerCase()}
                </p>
                <p className="text-xs text-slate-500">Riesgo {cliente?.nivelRiesgo ?? 'MEDIO'}</p>
              </div>
              <div className="px-5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Expediente vigente</p>
                {vigente ? (
                  <>
                    <span className={`inline-flex mt-0.5 items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${EST[vigente.estado]?.clase ?? EST.EN_PROCESO.clase}`}>
                      {EST[vigente.estado]?.nombre ?? vigente.estado}
                    </span>
                    <p className="text-xs text-slate-500 mt-1">
                      por {dinero(vigente.limiteSolicitado)} · {fechaLarga(vigente.fechaCreacion)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-400 mt-0.5">
                    {vigente === undefined ? '…' : 'Nunca verificado'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {clienteId && <ExpedienteCliente clienteId={clienteId} />}
        </>
      )}
    </div>
  );
}
