// app/components/BotonPermisosSugeridos.tsx
"use client";
import { useState } from 'react';
import { confirmarElegante } from '@/components/ui/dialogos';
import { Wand2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { esRolAdministrador } from '@/lib/roles';

interface Props {
  /** El rol actualmente seleccionado en la pantalla de permisos */
  rol: string;
  /** Se llama tras aplicar, para que la pantalla recargue los toggles */
  onAplicado?: () => void;
}

export default function BotonPermisosSugeridos({ rol, onAplicado }: Props) {
  const api = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:4000/api');
  const tok = () => (typeof window !== 'undefined' ? localStorage.getItem('syncro_token') ?? '' : '');

  const [cargando, setCargando] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const aplicar = async () => {
    if (esRolAdministrador(rol)) {
      setToast({ msg: 'El administrador ya tiene acceso total.', ok: true });
      setTimeout(() => setToast(null), 3500);
      return;
    }
    if (!await confirmarElegante(`Se cargarán los permisos sugeridos para el rol "${rol}". Podrás ajustarlos después. ¿Continuar?`)) return;

    setCargando(true);
    try {
      const res = await fetch(`${api}/admin/permisos/rol/${encodeURIComponent(rol)}/aplicar-plantilla`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ modo: 'agregar' }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.ok) {
        setToast({ msg: d.mensaje || 'Permisos aplicados.', ok: true });
        onAplicado?.();
      } else {
        setToast({ msg: d?.mensaje || 'No hay permisos sugeridos para este rol.', ok: false });
      }
    } catch {
      setToast({ msg: 'Error de conexión.', ok: false });
    }
    setCargando(false);
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <>
      {toast && (
        <div className={`fixed top-6 right-6 z-[60] flex items-center gap-2 px-5 py-3 rounded-xl shadow-2xl font-medium text-white ${toast.ok ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.ok ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}
      <button
        onClick={aplicar}
        disabled={cargando || !rol}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-bold rounded-xl hover:opacity-95 shadow-md transition-all disabled:opacity-50"
        title="Cargar los permisos típicos de este rol"
      >
        {cargando
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Aplicando…</>
          : <><Wand2 className="w-4 h-4" /> Cargar permisos sugeridos</>}
      </button>
    </>
  );
}
