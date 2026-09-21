"use client";

/**
 * La barra de la caja. Lo único que rodea a la terminal.
 *
 * Tiene cuatro cosas y ninguna más, porque cada elemento de más en una caja es
 * un sitio donde se puede tocar sin querer mientras hay gente esperando:
 * quién cobra y dónde, la hora (va en el ticket y en el corte), pantalla
 * completa, y cerrar. Las teclas van a la vista porque en una caja se trabaja
 * con el teclado y el lector, no con el ratón.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Maximize2, Minimize2, X, Store } from 'lucide-react';
import { leerSesion, type Sesion } from '@/lib/session';
import { api, intentar } from '@/lib/api';
import TerminalPos from './terminal';

const TECLAS = [
  { tecla: 'F2', que: 'Buscar' },
  { tecla: 'F4', que: 'Cobrar' },
  { tecla: 'F8', que: 'Cliente' },
  { tecla: 'Esc', que: 'Limpiar' },
];

export default function PosPage() {
  const router = useRouter();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [empresa, setEmpresa] = useState('');
  const [reloj, setReloj] = useState('');
  const [completa, setCompleta] = useState(false);

  useEffect(() => {
    const jwt = localStorage.getItem('syncro_token') ?? '';
    if (jwt) setSesion(leerSesion(jwt));

    // El nombre de la empresa se pregunta, igual que en el área de trabajo: es
    // lo que distingue una caja de otra cuando alguien atiende dos sucursales.
    let vivo = true;
    void intentar(api.get<{ nombre?: string }>('/configuracion/empresa'), {}).then((e) => {
      if (vivo && e?.nombre) setEmpresa(e.nombre);
    });

    const pintarHora = () =>
      setReloj(
        new Date().toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    pintarHora();
    const t = setInterval(pintarHora, 20_000);

    const alCambiar = () => setCompleta(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', alCambiar);
    return () => {
      vivo = false;
      clearInterval(t);
      document.removeEventListener('fullscreenchange', alCambiar);
    };
  }, []);

  const alternarPantallaCompleta = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  /**
   * Cerrar la caja. Si la ventana la abrió el ERP, se cierra de verdad; si
   * alguien entró tecleando la dirección, `window.close()` no hace nada —el
   * navegador solo deja cerrar lo que él mismo abrió— así que se vuelve al
   * área de trabajo en lugar de dejar una pantalla muerta.
   */
  const cerrar = () => {
    if (window.opener) {
      window.close();
      return;
    }
    router.push('/dashboard/ventas/historial');
  };

  const hoy = new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <>
      <header className="shrink-0 bg-slate-900 text-white px-4 h-14 flex items-center gap-4 select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white/10 grid place-items-center shrink-0">
            <Store className="w-4 h-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="text-[13px] font-bold tracking-tight">Caja</p>
            <p className="text-[11px] text-white/50 truncate">{empresa || 'SyncroERP'}</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-1.5 ml-2">
          {TECLAS.map((k) => (
            <span
              key={k.tecla}
              className="inline-flex items-center gap-1.5 text-[10.5px] text-white/45"
            >
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono font-bold text-white/70">
                {k.tecla}
              </kbd>
              {k.que}
            </span>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="text-right leading-tight hidden sm:block">
            <p className="text-[13px] font-bold tabular-nums">{reloj}</p>
            <p className="text-[10.5px] text-white/45 capitalize">{hoy}</p>
          </div>

          <div className="text-right leading-tight border-l border-white/10 pl-4">
            <p className="text-[12.5px] font-semibold truncate max-w-[180px]">
              {sesion?.nombreCompleto ?? sesion?.email ?? '—'}
            </p>
            <p className="text-[10.5px] text-white/45">Atiende</p>
          </div>

          <button
            onClick={alternarPantallaCompleta}
            title={completa ? 'Salir de pantalla completa' : 'Pantalla completa'}
            className="w-9 h-9 rounded-lg grid place-items-center hover:bg-white/10 transition-colors"
          >
            {completa ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={cerrar}
            title="Cerrar la caja"
            className="w-9 h-9 rounded-lg grid place-items-center hover:bg-rose-500/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      <TerminalPos />
    </>
  );
}
