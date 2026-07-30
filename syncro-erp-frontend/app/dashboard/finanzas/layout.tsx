"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";

export default function FinanzasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [permitido, setPermitido] = useState(false);

  useEffect(() => {
    let vigente = true;
    api
      .get<{ activa: boolean }>("/finanzas/activacion/acceso")
      .then((estado) => {
        if (!vigente) return;
        if (estado.activa) setPermitido(true);
        else router.replace("/configuracion-financiera");
      })
      .catch(() => {
        if (vigente) router.replace("/configuracion-financiera");
      });
    return () => {
      vigente = false;
    };
  }, [router]);

  if (!permitido) {
    return (
      <div className="grid min-h-[55vh] place-items-center">
        <div className="text-center text-sm text-slate-500">
          <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-violet-600" />
          Verificando la activación de Finanzas…
        </div>
      </div>
    );
  }
  return children;
}
