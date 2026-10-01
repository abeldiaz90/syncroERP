"use client";
/**
 * ============================================================================
 * SyncroERP · Conciliación de cartera con el registro externo
 * ----------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTA PANTALLA
 *
 * La conciliación de cartera es el instrumento que decide si la integración
 * está lista: mientras tenga diferencias abiertas, la empresa no sube de
 * SOMBRA a AUTORIDAD. Corre sola cada noche y escribe sus hallazgos en una
 * tabla.
 *
 * **Y no tenía pantalla.** Los tres endpoints existían —consultar, ejecutar y
 * marcar resuelta— y ninguna pantalla del ERP los llamaba. La única forma de
 * ver qué había encontrado era pegarle al API a mano.
 *
 * Es el patrón que este proyecto lleva semanas corrigiendo, en su versión más
 * cara: no un control que miente, sino uno que acierta y que nadie puede leer.
 * Un tablero que nadie abre no es un control, es un registro.
 *
 * LO QUE SE PUEDE HACER AQUÍ
 *
 * Mirar las diferencias abiertas, volver a conciliar en el momento, y cerrar
 * una a mano cuando se resolvió por fuera —con nota obligatoria, porque una
 * diferencia cerrada sin explicación obliga a reconstruir después por qué se
 * cerró—.
 * ============================================================================
 */

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Scale,
  UserX,
} from "lucide-react";

import { api } from "@/lib/api";
import { fechaCorta } from "@/lib/fechas";
import { useAccion, useDatos } from "@/hooks/use-datos";
import {
  Boton,
  Cargando,
  Distintivo,
  EncabezadoPantalla,
  ErrorPantalla,
  Indicador,
  Panel,
  SinDatos,
  useAvisos,
} from "@/components/ui";
import { solicitarTexto } from "@/components/ui/dialogos";

interface Discrepancia {
  id: string;
  fechaCorte: string;
  concepto: string;
  entidadId: string | null;
  valorErp: number;
  valorExterno: number;
  detalle?: string | null;
  resuelta: boolean;
}

/*
 * Qué significa cada concepto y qué se hace con él. El servidor manda una
 * palabra en mayúsculas; sin esto la pantalla enseñaría «SOLO_EN_EXTERNO» y
 * dejaría a quien la lee adivinando si eso es grave y a quién le toca.
 */
const CONCEPTOS: Record<
  string,
  { titulo: string; tono: "alerta" | "peligro" | "info"; queHacer: string }
> = {
  SALDO_CLIENTE: {
    titulo: "El saldo del cliente no coincide",
    tono: "peligro",
    queHacer:
      "Revisa los cobros del cliente: lo más común es un pago aplicado de un solo lado.",
  },
  SALDO_CREDITO: {
    titulo: "El saldo del crédito no coincide",
    tono: "peligro",
    queHacer: "Compara los movimientos del crédito contra los del core.",
  },
  SIN_CONTRAPARTE: {
    titulo: "El crédito no llegó al core",
    tono: "peligro",
    queHacer:
      "Es una ausencia, no un descuadre: se arregla reenviando el evento desde la cola de integración, no ajustando un saldo.",
  },
  SOLO_EN_EXTERNO: {
    titulo: "Existe en el core y el ERP no lo conoce",
    tono: "alerta",
    queHacer:
      "La replicación va del ERP al core, nunca al revés. Dalo de alta en Clientes para que se replique, o retíralo del core si no debía estar.",
  },
  DESAPARECIDO: {
    titulo: "El core ya no conoce el crédito",
    tono: "peligro",
    queHacer: "El ERP lo tiene vivo. Hay que decidir cuál de los dos manda.",
  },
  MORA_DIVERGENTE: {
    titulo: "La mora no coincide",
    tono: "alerta",
    queHacer: "Revisa las fechas de vencimiento y los pagos aplicados.",
  },
  ESTADO_DIVERGENTE: {
    titulo: "El estado del crédito no coincide",
    tono: "alerta",
    queHacer: "Uno de los dos lo da por liquidado y el otro no.",
  },
  TRANSACCION_EXTERNA: {
    titulo: "Movimiento registrado sólo en el core",
    tono: "alerta",
    queHacer: "Se capturó directamente allá y no está reflejado en el ERP.",
  },
  TRANSACCION_REVERSADA_FUERA: {
    titulo: "Movimiento reversado en el core",
    tono: "peligro",
    queHacer:
      "Se reversó allá y el ERP lo sigue contando. Es de las peores: el saldo del ERP está de más.",
  },
  CONSULTA_FALLIDA: {
    titulo: "No se pudo consultar el core",
    tono: "info",
    queHacer:
      "No es un descuadre: es que la conciliación no pudo preguntar. Vuelve a ejecutarla cuando el core responda.",
  },
};

const describir = (concepto: string) =>
  CONCEPTOS[concepto] ?? {
    titulo: concepto.replace(/_/g, " ").toLowerCase(),
    tono: "info" as const,
    queHacer: "",
  };

const dinero = (n: number) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(Number(n) || 0);

export default function ConciliacionCarteraPage() {
  const { avisar } = useAvisos();
  const [filtro, setFiltro] = useState("");

  const abiertas = useDatos<Discrepancia[]>(
    () => api.get<Discrepancia[]>("/integracion/conciliacion"),
    [],
  );

  const conciliar = useAccion(
    () =>
      api.post<{ revisados: number; discrepancias: number }>(
        "/integracion/conciliacion/ejecutar",
        {},
      ),
    { errorVisible: true },
  );

  const resolver = useAccion(
    (id: string, nota: string) =>
      api.patch(`/integracion/conciliacion/${id}/resolver`, { nota }),
    { errorVisible: true },
  );

  const lista = (abiertas.datos ?? []).filter((d) => {
    const texto = filtro.trim().toLowerCase();
    if (!texto) return true;
    return (
      d.concepto.toLowerCase().includes(texto) ||
      describir(d.concepto).titulo.toLowerCase().includes(texto) ||
      String(d.detalle ?? "").toLowerCase().includes(texto)
    );
  });

  const soloEnExterno = (abiertas.datos ?? []).filter(
    (d) => d.concepto === "SOLO_EN_EXTERNO",
  ).length;

  const ejecutar = async () => {
    const r = await conciliar.ejecutar();
    if (!r) return;
    avisar(
      r.discrepancias === 0
        ? `Revisadas ${r.revisados} entidades. Ninguna diferencia.`
        : `Revisadas ${r.revisados} entidades. ${r.discrepancias} diferencia(s).`,
      r.discrepancias === 0 ? "exito" : "alerta",
    );
    await abiertas.recargar();
  };

  const cerrar = async (d: Discrepancia) => {
    /*
     * La nota es obligatoria a propósito. El servidor la exige y aquí se pide
     * antes de llamar: una diferencia cerrada sin explicación obliga a
     * reconstruir meses después por qué se cerró, y nadie se acuerda.
     */
    const nota = await solicitarTexto(
      "Di por qué se cierra. Queda escrito: es lo que alguien va a leer cuando pregunte por esta diferencia.",
      { titulo: "Cerrar la diferencia", obligatorio: true },
    );
    if (!nota || !nota.trim()) return;
    const r = await resolver.ejecutar(d.id, nota.trim());
    if (r === null) return;
    avisar("Diferencia cerrada.", "exito");
    await abiertas.recargar();
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <EncabezadoPantalla
        titulo="Conciliación de cartera"
        descripcion="Compara la cartera del ERP con la del registro externo. Mientras haya diferencias abiertas, la empresa no puede ejercer autoridad sobre el core."
        acciones={
          <Boton
            onClick={ejecutar}
            cargando={conciliar.ejecutando}
            icono={<RefreshCw className="w-4 h-4" />}
          >
            Conciliar ahora
          </Boton>
        }
      />

      {/*
        * El error de las dos acciones, pintado.
        *
        * Las dos piden `errorVisible: true`, que apaga el aviso emergente del
        * hook porque el motivo importa demasiado para que se desvanezca en tres
        * segundos: «el registro externo no está disponible» o «la nota es
        * obligatoria» son cosas que hay que poder volver a leer. Pedir que no
        * avise y no pintarlo dejaría la pantalla muda, que es peor que el aviso
        * que se va.
        */}
      {(conciliar.error || resolver.error) && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
          <p className="text-[13px] text-rose-700">
            {conciliar.error ?? resolver.error}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <Indicador
          etiqueta="Diferencias abiertas"
          valor={abiertas.datos?.length ?? 0}
          color={(abiertas.datos?.length ?? 0) > 0 ? "#dc2626" : "#059669"}
          cargando={abiertas.cargando}
          icono={<Scale className="w-4 h-4" />}
        />
        <Indicador
          etiqueta="Sólo en el core"
          valor={soloEnExterno}
          detalle="Clientes que el ERP no conoce"
          color={soloEnExterno > 0 ? "#d97706" : "#64748b"}
          cargando={abiertas.cargando}
          icono={<UserX className="w-4 h-4" />}
        />
        <Indicador
          etiqueta="Último corte"
          valor={
            abiertas.datos?.length
              ? fechaCorta(abiertas.datos[0].fechaCorte)
              : "—"
          }
          detalle="La conciliación corre sola cada noche"
          cargando={abiertas.cargando}
          icono={<CheckCircle2 className="w-4 h-4" />}
        />
      </div>

      <Panel
        titulo="Diferencias abiertas"
        accion={
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar…"
            className="px-3 py-1.5 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        }
        sinRelleno
      >
        {abiertas.cargando ? (
          <Cargando filas={4} />
        ) : abiertas.error ? (
          <ErrorPantalla
            mensaje={abiertas.error}
            onReintentar={() => void abiertas.recargar()}
          />
        ) : lista.length === 0 ? (
          <SinDatos
            titulo={
              filtro
                ? "Ninguna coincide con el filtro"
                : "No hay diferencias abiertas"
            }
            descripcion={
              filtro
                ? `Hay ${abiertas.datos?.length ?? 0} diferencias; ninguna dice «${filtro}».`
                : "La última conciliación no encontró diferencias entre la cartera del ERP y la del core. Corre sola cada noche."
            }
            icono={<CheckCircle2 className="w-8 h-8 text-emerald-500" />}
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {lista.map((d) => {
              const info = describir(d.concepto);
              return (
                <div key={d.id} className="p-4 flex gap-4 items-start">
                  <AlertTriangle
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      info.tono === "peligro"
                        ? "text-rose-500"
                        : info.tono === "alerta"
                          ? "text-amber-500"
                          : "text-slate-400"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13.5px] font-semibold text-slate-800">
                        {info.titulo}
                      </p>
                      <Distintivo tono={info.tono}>{d.concepto}</Distintivo>
                      <span className="text-[11.5px] text-slate-400">
                        {fechaCorta(d.fechaCorte)}
                      </span>
                    </div>
                    {d.detalle && (
                      <p className="text-[12.5px] text-slate-600 mt-1 leading-relaxed">
                        {d.detalle}
                      </p>
                    )}
                    {info.queHacer && (
                      <p className="text-[12px] text-slate-500 mt-1.5 italic">
                        {info.queHacer}
                      </p>
                    )}
                    {/*
                      * Los importes sólo cuando los hay. En un hallazgo como
                      * «existe en el core y el ERP no lo conoce» no hay dos
                      * saldos que comparar, y enseñar «$0.00 contra $1.00»
                      * convertiría una ausencia en un descuadre de un peso.
                      */}
                    {(Number(d.valorErp) !== 0 ||
                      Number(d.valorExterno) !== 0) &&
                      d.concepto !== "SOLO_EN_EXTERNO" && (
                        <p className="text-[12px] text-slate-500 mt-1.5 font-mono">
                          ERP {dinero(d.valorErp)} · core{" "}
                          {dinero(d.valorExterno)}
                        </p>
                      )}
                  </div>
                  <Boton
                    variante="neutro"
                    onClick={() => void cerrar(d)}
                    cargando={resolver.ejecutando}
                  >
                    Cerrar
                  </Boton>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
