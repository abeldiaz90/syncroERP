"use client";
/**
 * ============================================================================
 * SyncroERP · Ver el ERP como otra persona
 * ----------------------------------------------------------------------------
 * Trece roles no se comprueban con una sola sesión. Casi todo lo que hay que
 * verificar —que el almacenista no ve los impuestos del producto, que el
 * cajero no autoriza su propia devolución, que quien captura un conteo no
 * puede cerrarlo— sólo ocurre cuando quien pulsa el botón NO es el
 * administrador, porque el administrador atraviesa los tres controles de
 * autorización por diseño.
 *
 * Aquí no se inicia ninguna sesión y no se pide ninguna contraseña. La sesión
 * sigue siendo la del administrador; lo único que cambia es el alcance con el
 * que el servidor la atiende. Y todo lo que se escriba así queda en la
 * bitácora a nombre de quien lo hizo de verdad.
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import { Eye, EyeOff, ShieldAlert } from 'lucide-react';

import { api } from '@/lib/api';
import { useDatos } from '@/hooks/use-datos';
import {
  Cargando,
  EncabezadoPantalla,
  ErrorPantalla,
  Panel,
  SinDatos,
} from '@/components/ui';
import {
  establecerVerComo,
  verComoActual,
  type VerComo,
} from '@/lib/ver-como';

interface Candidato {
  id: string;
  nombreCompleto: string;
  email: string;
  rol: string;
}

interface Estado {
  habilitada: boolean;
  puedeSuplantar: boolean;
  suplantando: { comoEmail: string; comoRol: string } | null;
}

export default function VerComoPage() {
  const estado = useDatos<Estado>(() => api.get<Estado>('/iam/suplantacion'), []);
  const [actual, setActual] = useState<VerComo | null>(null);

  useEffect(() => {
    setActual(verComoActual());
  }, []);

  const habilitada = estado.datos?.habilitada === true;

  const lista = useDatos<Candidato[]>(
    () =>
      habilitada
        ? api.get<Candidato[]>('/iam/suplantacion/usuarios')
        : Promise.resolve([]),
    [habilitada],
  );

  function ver(c: Candidato) {
    establecerVerComo({ id: c.id, nombre: c.nombreCompleto || c.email, rol: c.rol });
    // Recarga completa: los permisos, el menú y las pantallas ya montadas se
    // resolvieron con el rol anterior. Media recarga sería media verdad.
    window.location.assign('/dashboard');
  }

  function salir() {
    establecerVerComo(null);
    window.location.assign('/dashboard/admin/ver-como');
  }

  if (estado.cargando) return <Cargando />;
  if (estado.error)
    return <ErrorPantalla mensaje={estado.error} onReintentar={estado.recargar} />;

  const porRol = new Map<string, Candidato[]>();
  for (const c of lista.datos ?? []) {
    const clave = c.rol || 'SIN ROL';
    porRol.set(clave, [...(porRol.get(clave) ?? []), c]);
  }

  return (
    <div className="max-w-4xl">
      <EncabezadoPantalla
        titulo="Ver el ERP como otra persona"
        descripcion="Para comprobar qué ve y qué puede hacer cada rol sin tener que entrar trece veces."
      />

      {!habilitada && (
        <Panel>
          <div className="flex gap-3 p-4">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-[13px] text-slate-600 leading-relaxed">
              <p className="font-semibold text-slate-800 mb-1">
                Está desactivado en esta instalación.
              </p>
              <p>
                Se enciende con <code>SUPLANTACION_HABILITADA=true</code> y sólo
                fuera de producción. Son dos candados y hacen falta los dos: en
                una instalación productiva no se enciende aunque se ponga la
                variable.
              </p>
            </div>
          </div>
        </Panel>
      )}

      {actual && (
        <Panel>
          <div className="flex items-center justify-between gap-4 p-4">
            <div className="text-[13px] text-slate-700">
              Estás viendo el ERP como{' '}
              <b className="text-slate-900">{actual.nombre}</b>{' '}
              <span className="text-slate-500">({actual.rol})</span>. Lo que
              guardes queda registrado a tu nombre.
            </div>
            <button
              onClick={salir}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <EyeOff className="w-3.5 h-3.5" />
              Volver a ser yo
            </button>
          </div>
        </Panel>
      )}

      {habilitada && lista.cargando && <Cargando />}
      {habilitada && lista.error && (
        <ErrorPantalla mensaje={lista.error} onReintentar={lista.recargar} />
      )}

      {habilitada && !lista.cargando && !lista.error && porRol.size === 0 && (
        <SinDatos titulo="No hay otras personas dadas de alta en esta empresa." />
      )}

      {[...porRol.entries()].map(([rol, gente]) => (
        <Panel key={rol}>
          <div className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {rol}
          </div>
          <ul className="divide-y divide-slate-100">
            {gente.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-4 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-800 truncate">
                    {c.nombreCompleto || c.email}
                  </div>
                  <div className="text-[12px] text-slate-500 truncate">
                    {c.email}
                  </div>
                </div>
                <button
                  onClick={() => ver(c)}
                  disabled={actual?.id === c.id}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {actual?.id === c.id ? 'Lo estás viendo' : 'Ver como'}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
