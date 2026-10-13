"use client";

/**
 * ============================================================================
 * DIÁLOGOS DE UNA LÍNEA · confirmar, pedir un texto, avisar
 * ----------------------------------------------------------------------------
 * Reemplazan a `window.confirm` y `window.prompt`, que fallan de dos maneras
 * que no se ven: el navegador los puede SUPRIMIR —Chrome ofrece «evitar que
 * esta página cree más diálogos» y desde ahí devuelven `false`/`null` para
 * siempre, así que el botón deja de servir sin decirlo— y en una pestaña de
 * fondo no aparecen.
 *
 * ── QUÉ USAR, Y CUÁNDO NO ESTO ─────────────────────────────────────────────
 * Estos tres se resuelven y se CIERRAN. Sirven cuando lo que viene después
 * casi siempre funciona: activar un catálogo, aprobar, dejar un comentario.
 *
 * Cuando el servidor puede CONTESTAR QUE NO después del clic —cancelar una
 * factura con un pago aplicado, un pedido ya surtido— no sirven: la negativa
 * llega cuando el diálogo ya se cerró, se va a un aviso de esquina de 4.5
 * segundos y lo tecleado se pierde. Para eso están `Confirmacion` y
 * `ConfirmacionConMotivo` de `@/components/ui`, que pintan la negativa DENTRO
 * y dejan reintentar sin volver a escribir.
 * ============================================================================
 */

import { useEffect, useState } from "react";
import { AlertTriangle, MessageSquareText, ShieldQuestion } from "lucide-react";
import { Boton, Modal } from "@/components/ui";

type Peticion = {
  tipo: "confirmar" | "texto" | "mensaje";
  titulo: string;
  mensaje: string;
  peligroso?: boolean;
  obligatorio?: boolean;
  /** Mínimo de caracteres. El botón está apagado hasta alcanzarlo, y dice
      cuántos faltan: comprobarlo DESPUÉS de cerrar pierde lo escrito. */
  minimo?: number;
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

export async function solicitarTexto(mensaje: string, opciones?: { titulo?: string; obligatorio?: boolean; minimo?: number }) {
  const valor = await solicitar({ tipo: "texto", titulo: opciones?.titulo ?? "Agregar comentario", mensaje, obligatorio: opciones?.obligatorio, minimo: opciones?.minimo });
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
  /*
   * Cuántos caracteres faltan para poder continuar. Un texto opcional sin
   * mínimo no falta nada; uno obligatorio necesita al menos uno.
   */
  const minimo = peticion?.tipo === "texto"
    ? Math.max(peticion.minimo ?? 0, peticion.obligatorio ? 1 : 0)
    : 0;
  const faltan = Math.max(0, minimo - texto.trim().length);
  const cerrar = (valor: boolean | string | null) => {
    peticion?.resolver(valor); setPeticion(null); setTexto("");
  };
  return <>
    {children}
    <Modal abierto={Boolean(peticion)} onCerrar={() => cerrar(peticion?.tipo === "confirmar" ? false : null)} titulo={peticion?.titulo ?? "Confirmar"} ancho={460}
      pie={<>{peticion?.tipo !== "mensaje" && <Boton onClick={() => cerrar(peticion?.tipo === "confirmar" ? false : null)}>Cancelar</Boton>}<Boton variante={peticion?.peligroso ? "peligro" : "primario"} disabled={peticion?.tipo === "texto" && faltan > 0} onClick={() => cerrar(peticion?.tipo === "texto" ? texto.trim() : true)}>{peticion?.tipo === "texto" ? "Continuar" : peticion?.tipo === "mensaje" ? "Entendido" : "Confirmar"}</Boton></>}>
      <div className="flex gap-3"><div className={`mt-0.5 rounded-xl p-2 ${peticion?.peligroso ? "bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-600"}`}>{peticion?.peligroso ? <AlertTriangle className="h-5 w-5"/> : peticion?.tipo === "texto" ? <MessageSquareText className="h-5 w-5"/> : <ShieldQuestion className="h-5 w-5"/>}</div><div className="min-w-0 flex-1"><p className="text-sm leading-6 text-slate-600">{peticion?.mensaje}</p>{peticion?.tipo === "texto" && <textarea autoFocus className="campo mt-3 min-h-24 w-full py-2" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} placeholder={peticion.obligatorio ? "Escribe el motivo…" : "Comentario opcional…"}/>}{peticion?.tipo === "texto" && faltan > 0 && <p className="mt-1 text-[11px] font-medium text-slate-500">{faltan === 1 ? "Falta 1 carácter" : `Faltan ${faltan} caracteres`} para poder continuar.</p>}</div></div>
    </Modal>
  </>;
}
