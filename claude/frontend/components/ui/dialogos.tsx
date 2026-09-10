"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, MessageSquareText, ShieldQuestion } from "lucide-react";
import { Boton, Modal } from "@/components/ui";

type Peticion = {
  tipo: "confirmar" | "texto" | "mensaje";
  titulo: string;
  mensaje: string;
  peligroso?: boolean;
  obligatorio?: boolean;
  resolver: (valor: boolean | string | null) => void;
};

const EVENTO = "syncro:dialogo";
function solicitar(datos: Omit<Peticion, "resolver">) {
  return new Promise<boolean | string | null>((resolver) =>
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: { ...datos, resolver } })),
  );
}

export async function confirmarElegante(mensaje: string, opciones?: { titulo?: string; peligroso?: boolean }) {
  return Boolean(await solicitar({ tipo: "confirmar", titulo: opciones?.titulo ?? "Confirmar acción", mensaje, peligroso: opciones?.peligroso }));
}

export async function solicitarTexto(mensaje: string, opciones?: { titulo?: string; obligatorio?: boolean }) {
  const valor = await solicitar({ tipo: "texto", titulo: opciones?.titulo ?? "Agregar comentario", mensaje, obligatorio: opciones?.obligatorio });
  return typeof valor === "string" ? valor : null;
}
export async function mensajeElegante(mensaje: string, titulo = "Información") {
  await solicitar({ tipo: "mensaje", titulo, mensaje });
}

export function ProveedorDialogos({ children }: { children: React.ReactNode }) {
  const [peticion, setPeticion] = useState<Peticion | null>(null);
  const [texto, setTexto] = useState("");
  useEffect(() => {
    const escuchar = (e: Event) => { setTexto(""); setPeticion((e as CustomEvent<Peticion>).detail); };
    window.addEventListener(EVENTO, escuchar);
    return () => window.removeEventListener(EVENTO, escuchar);
  }, []);
  const cerrar = (valor: boolean | string | null) => {
    peticion?.resolver(valor); setPeticion(null); setTexto("");
  };
  return <>
    {children}
    <Modal abierto={Boolean(peticion)} onCerrar={() => cerrar(peticion?.tipo === "confirmar" ? false : null)} titulo={peticion?.titulo ?? "Confirmar"} ancho={460}
      pie={<>{peticion?.tipo !== "mensaje" && <Boton onClick={() => cerrar(peticion?.tipo === "confirmar" ? false : null)}>Cancelar</Boton>}<Boton variante={peticion?.peligroso ? "peligro" : "primario"} disabled={peticion?.tipo === "texto" && peticion.obligatorio && !texto.trim()} onClick={() => cerrar(peticion?.tipo === "texto" ? texto.trim() : true)}>{peticion?.tipo === "texto" ? "Continuar" : peticion?.tipo === "mensaje" ? "Entendido" : "Confirmar"}</Boton></>}>
      <div className="flex gap-3"><div className={`mt-0.5 rounded-xl p-2 ${peticion?.peligroso ? "bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-600"}`}>{peticion?.peligroso ? <AlertTriangle className="h-5 w-5"/> : peticion?.tipo === "texto" ? <MessageSquareText className="h-5 w-5"/> : <ShieldQuestion className="h-5 w-5"/>}</div><div className="min-w-0 flex-1"><p className="text-sm leading-6 text-slate-600">{peticion?.mensaje}</p>{peticion?.tipo === "texto" && <textarea autoFocus className="campo mt-3 min-h-24 w-full py-2" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} placeholder={peticion.obligatorio ? "Escribe el motivo…" : "Comentario opcional…"}/>}</div></div>
    </Modal>
  </>;
}
