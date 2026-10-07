"use client";
/**
 * ============================================================================
 * SyncroERP · Finanzas — espejo contable con el mayor externo
 * ----------------------------------------------------------------------------
 * La correspondencia de cuentas era una configuración indispensable y sin
 * pantalla: existía en la API y en ningún otro sitio. El síntoma aparecía
 * lejos de la causa —cuatro pólizas del ciclo de compras quedaban en FALLIDO
 * con «Falta mapear al mayor externo la(s) cuenta(s): 118.01, 119.01, 201.01»,
 * y el administrador no tenía dónde arreglarlo—. La contabilidad fiscal del
 * ERP seguía intacta, pero el mayor externo mostraba una empresa a medias, y
 * nadie se enteraba hasta que alguien miraba un balance que no cuadraba.
 *
 * Esta pantalla junta las tres cosas que hacen falta para cerrar el círculo:
 * qué cuentas faltan, cómo darlas de alta o hacerlas corresponder, y qué
 * pólizas quedaron esperando por ello.
 * ============================================================================
 */

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Link2,
  RefreshCw,
  Send,
  ShieldAlert,
} from "lucide-react";

import { api } from "@/lib/api";
import { fechaHora } from "@/lib/format";
import { useAccion, useDatos } from "@/hooks/use-datos";
import { usePermiso } from "@/hooks/use-permisos";
import {
  Boton,
  Cargando,
  Distintivo,
  EncabezadoPantalla,
  ErrorPantalla,
  Indicador,
  Panel,
  Seleccion,
  SinDatos,
  useAvisos,
} from "@/components/ui";

interface Estado {
  contabilidad: {
    modoEfectivo: string;
    oficinaContableExterna?: string | null;
    cuentasSinMapear: number;
    cuentasPorMapear: number;
  };
  enlace: {
    proveedor: string;
    configurado: boolean;
    disponible: boolean;
    /*
     * A QUÉ INSTITUCIÓN DEL CORE VAN LAS PÓLIZAS DE ESTA EMPRESA.
     *
     * `proveedor` es «fineract»: el nombre del programa, no la institución.
     * Esta pantalla afirma que las dos contabilidades dicen lo mismo, y hasta
     * ahora no decía con cuál de las instituciones del core coincide.
     *
     * `efectivo` es el que de verdad recibe los asientos: el de la empresa si
     * tiene una asignada, la compartida por omisión si no.
     * `propioDeLaEmpresa` distingue los dos casos, que es la diferencia entre
     * una institución que es sólo suya y una que comparte con quien no tenga
     * asignada la suya.
     */
    inquilino?: { efectivo: string | null; propioDeLaEmpresa: boolean };
  };
  outbox: Record<string, number>;
}

interface CuentaPendiente {
  id: string;
  numeroCuenta: string;
  nombre: string;
  usos?: number;
  motivo?: string;
}

interface CuentaExterna {
  id: string;
  codigo: string;
  nombre: string;
  clase: string;
  admiteAsientoManual: boolean;
}

interface Mapeo {
  id: string;
  cuentaContableId: string;
  codigoCuenta: string;
  idExterno: string;
  codigoExterno?: string | null;
  activo: boolean;
}

interface EventoOutbox {
  id: string;
  tipo: string;
  entidadId: string;
  estado: string;
  intentos: number;
  ultimoError?: string | null;
  fechaCreacion: string;
}

interface Hallazgo {
  polizaId: string;
  folio: string;
  asientoId: string | null;
  codigo: string;
  detalle: string;
}

interface Conciliacion {
  fecha: string;
  alcance: string;
  revisados: number;
  discrepancias: number;
  hallazgos: Hallazgo[];
  /*
   * Una corrida que se cortó a la tercera póliza y no encontró nada no dice
   * lo mismo que una que recorrió las ciento diez. Viaja en el resultado
   * porque no se puede deducir de los hallazgos.
   */
  completa?: boolean;
  interrumpida?: string | null;
  pendientesDeComparar?: number;
  /*
   * Las que todavía no han salido, con el motivo que escribió la cola. No son
   * una diferencia entre los dos libros: vuelven solas. Viajan aparte para que
   * esta pantalla no las pinte del mismo color que un «no coincide», que es lo
   * único que pide a alguien ahora mismo.
   */
  enCamino?: Hallazgo[];
}

interface ResultadoDespacho {
  procesados: number;
  fallidos: number;
  motivo?: "SIN_ENLACE" | "YA_EN_CURSO" | "NADA_PENDIENTE" | "SOLO_DETENIDOS";
  detenidos?: number;
  /**
   * A los que sólo les falta que llegue su fecha. No son error y no piden nada
   * de nadie: vuelven solos. Se dicen aparte para que no parezcan un pendiente
   * —era un rojo permanente que nadie podía apagar— ni desaparezcan sin más.
   */
  aplazados?: number;
}

interface Simulacion {
  simulacion?: boolean;
  creadas: { codigo: string; nombre: string; clase: string; accion?: string }[];
  reutilizadas: { codigo: string; nombre?: string }[];
  problemas: { codigo: string; error?: string }[];
  pendientesDespues: number;
}

interface PolizasSinEspejo {
  total: number;
  polizas: { id: string; folio: string; fecha: string; concepto: string }[];
}

export default function EspejoContablePage() {
  const { avisar } = useAvisos();
  const { tienePermiso } = usePermiso();
  /*
   * Despachar y reencolar no son el mismo permiso que corresponder cuentas, y
   * hubo un tiempo en que esta pantalla daba por hecho que sí: el contador
   * creaba la correspondencia de las diez cuentas de la nómina, pulsaba
   * «Despachar la cola» y recibía un 403 sin más explicación que un aviso que
   * se desvanecía. Se pregunta antes de pintar el botón.
   */
  const puedeDespachar = tienePermiso("POST", "/integracion/outbox/despachar");
  const puedeReencolar = tienePermiso(
    "POST",
    "/integracion/outbox/:id/reencolar",
  );
  const puedeEncolarFaltantes = tienePermiso(
    "POST",
    "/integracion/contabilidad/encolar-faltantes",
  );
  const [simulacion, setSimulacion] = useState<Simulacion | null>(null);
  const [eleccion, setEleccion] = useState<Record<string, string>>({});
  /*
   * Por omisión sólo se atienden las cuentas que YA detuvieron una póliza.
   * Con esto se atienden también las previstas: las que tienen un rol de
   * sistema asignado y fallarán la primera vez que se usen —bancos, IVA
   * trasladado, hospedaje—. Esperar a que fallen significa descubrirlo el día
   * del cobro, con el asiento fuera del mayor externo y nadie mirando.
   */
  const [incluirPrevistas, setIncluirPrevistas] = useState(false);

  const estado = useDatos<Estado>(() => api.get("/integracion/estado"), []);
  const pendientes = useDatos<CuentaPendiente[]>(
    () => api.get("/integracion/cuentas/pendientes"),
    [],
  );
  const previstas = useDatos<CuentaPendiente[]>(
    () => api.get("/integracion/cuentas/previstas"),
    [],
  );
  const externas = useDatos<CuentaExterna[]>(
    () => api.get("/integracion/cuentas/externas"),
    [],
  );
  const mapeos = useDatos<Mapeo[]>(() => api.get("/integracion/cuentas/mapeo"), []);
  /*
   * ══════════════════════════════════════════════════════════════════════════
   * «No llegaron» es más que «fallaron»
   * ──────────────────────────────────────────────────────────────────────────
   * Esta tabla se titula «pólizas que no llegaron al mayor externo» y pedía
   * `estado=FALLIDO`. Un evento PENDIENTE tampoco ha llegado, y REINTENTABLE
   * tampoco. Se vio en vivo el 30-sep-2026: al encolar ocho pólizas que nunca
   * se habían encolado, pasaron a PENDIENTE y la pantalla se quedó diciendo
   * «nada detenido» con las ocho esperando — y el indicador, en cero.
   *
   * Son los tres mismos estados que cuenta el control del cierre mensual, y no
   * es casualidad: es la misma pregunta.
   * ══════════════════════════════════════════════════════════════════════════
   */
  const sinEntregar = useDatos<EventoOutbox[]>(
    () =>
      api.get("/integracion/outbox", {
        query: { estado: "FALLIDO,REINTENTABLE,PENDIENTE" },
      }),
    [],
  );
  /*
   * ══════════════════════════════════════════════════════════════════════════
   * La otra mitad: la póliza que NADIE intentó mandar
   * ──────────────────────────────────────────────────────────────────────────
   * La bandeja de abajo enseña lo que se intentó y no salió. Esto enseña lo
   * contrario: pólizas vigentes sin un solo evento de espejo. No están
   * detenidas —no están en ninguna parte—, así que no salían en esta pantalla
   * ni las veía el cierre del mes.
   *
   * Medido el 30-sep-2026 contra la instalación: ocho, de los días 13 al 15 de
   * septiembre. Nacieron antes del suscriptor o con el espejo apagado.
   * ══════════════════════════════════════════════════════════════════════════
   */
  const sinEncolar = useDatos<PolizasSinEspejo>(
    () => api.get("/integracion/contabilidad/polizas-sin-espejo"),
    [],
  );
  /*
   * Mientras no se sabe, es cero: cero no afirma nada —no dibuja el panel ni
   * suma al indicador— mientras que inventar un número sí. El segundo
   * argumento de `useDatos` son las dependencias, no un valor por omisión.
   */
  const totalSinEncolar = sinEncolar.datos?.total ?? 0;

  const recargarTodo = () => {
    void estado.recargar();
    void pendientes.recargar();
    void previstas.recargar();
    void mapeos.recargar();
    void sinEntregar.recargar();
    void sinEncolar.recargar();
  };

  /*
   * Encola. NO despacha: reconocer que faltaban y mandarlas al mayor externo
   * no son la misma decisión, y despachar tiene su propio botón y su propio
   * permiso. Repetirlo no duplica nada —la clave del outbox es `poliza:<id>`—.
   */
  const encolarFaltantes = useAccion(async () => {
    const r = await api.post<{ encoladas: number; folios: string[] }>(
      "/integracion/contabilidad/encolar-faltantes",
      {},
    );
    avisar(
      r.encoladas === 0
        ? "No quedaba ninguna por encolar."
        : `${r.encoladas} póliza(s) encolada(s): ${r.folios.join(", ")}. ` +
          "Todavía no han salido: despacha la cola.",
      r.encoladas === 0 ? "info" : "exito",
    );
    recargarTodo();
    return r;
  });

  const simular = useAccion(async () => {
    const r = await api.post<Simulacion>(
      `/integracion/cuentas/aprovisionar?simular=1&alcance=${incluirPrevistas ? "previstas" : "usadas"}`,
    );
    setSimulacion(r);
    avisar(
      r.creadas.length
        ? `Se crearían ${r.creadas.length} cuenta(s) en el mayor externo.`
        : "No hace falta crear ninguna cuenta.",
      "info",
    );
    return r;
  });

  const aprovisionar = useAccion(async () => {
    const r = await api.post<Simulacion>(
      `/integracion/cuentas/aprovisionar?alcance=${incluirPrevistas ? "previstas" : "usadas"}`,
    );
    setSimulacion(null);
    avisar(
      `${r.creadas.length} creada(s), ${r.reutilizadas.length} reutilizada(s)` +
        (r.problemas.length ? `, ${r.problemas.length} con problema` : "") +
        ".",
      r.problemas.length ? "error" : "exito",
    );
    recargarTodo();
    return r;
  });

  const mapearAMano = useAccion(async (cuenta: CuentaPendiente) => {
    const idExterno = eleccion[cuenta.id];
    if (!idExterno) {
      avisar("Elige primero la cuenta del mayor externo.", "error");
      return;
    }
    const externa = externas.datos?.find((c) => c.id === idExterno);
    await api.post("/integracion/cuentas/mapeo", {
      cuentaContableId: cuenta.id,
      idExterno,
      codigoExterno: externa?.codigo ?? null,
    });
    avisar(`${cuenta.numeroCuenta} quedó correspondida.`, "exito");
    recargarTodo();
  });

  const reencolar = useAccion(async (id: string) => {
    await api.post(`/integracion/outbox/${id}/reencolar`);
    avisar("Evento reencolado; se despachará en el siguiente ciclo.", "info");
    void sinEntregar.recargar();
  });

  /*
   * El aviso repite lo que el servidor dice que pasó, y no lo que se le pidió
   * que hiciera. «Cola despachada» era verdad sólo en uno de los cinco
   * desenlaces posibles.
   */
  const despachar = useAccion(async () => {
    const r = await api.post<ResultadoDespacho>(
      "/integracion/outbox/despachar",
    );
    const aplazadas = r.aplazados
      ? ` ${r.aplazados} espera(n) a que llegue su fecha; se envían solas.`
      : "";
    if (r.procesados > 0) {
      avisar(
        `${r.procesados} póliza(s) enviada(s) al mayor externo` +
          (r.fallidos > 0 ? `; ${r.fallidos} con error.` : ".") +
          aplazadas,
        r.fallidos > 0 ? "alerta" : "exito",
      );
    } else if (r.fallidos > 0) {
      avisar(
        `Ninguna pasó: ${r.fallidos} evento(s) con error. El motivo de cada uno está en la tabla.` +
          aplazadas,
        "error",
      );
    } else if (r.aplazados) {
      avisar(
        `Nada por enviar todavía: ${r.aplazados} póliza(s) llevan fecha posterior a hoy y el mayor externo no puede asentarlas aún. Se envían solas cuando llegue esa fecha; no hay nada que corregir.`,
        "info",
      );
    } else if (r.motivo === "SIN_ENLACE") {
      avisar(
        "No hay enlace con el mayor externo ahora mismo. La cola no se movió; se despachará sola en cuanto vuelva.",
        "error",
      );
    } else if (r.motivo === "YA_EN_CURSO") {
      avisar("Ya hay un despacho en curso. Vuelve a intentar en un momento.", "info");
    } else if (r.motivo === "SOLO_DETENIDOS") {
      avisar(
        `No se movió nada: ${r.detenidos} evento(s) están detenidos y no vuelven solos a la cola. Pulsa «Reintentar» en cada uno.`,
        "alerta",
      );
    } else {
      avisar("No había nada pendiente por despachar.", "info");
    }
    recargarTodo();
  });

  /*
   * Contrastar los dos mayores. Vive detrás de un botón y no de una carga
   * automática porque recorre póliza por póliza contra el sistema externo:
   * abrir la pantalla no tiene por qué costar eso.
   */
  const puedeConciliar = tienePermiso(
    "POST",
    "/integracion/contabilidad/conciliacion/ejecutar",
  );
  const [conciliacion, setConciliacion] = useState<Conciliacion | null>(null);
  const conciliar = useAccion(async () => {
    const r = await api.post<Conciliacion>(
      "/integracion/contabilidad/conciliacion/ejecutar",
    );
    setConciliacion(r);
    /*
     * El aviso repite lo que pasó, no lo que se pidió. «Coinciden» con el
     * enlace caído a mitad de corrida sería la peor frase de esta pantalla.
     */
    if (r.completa === false) {
      avisar(
        r.interrumpida ??
          "La comparación se interrumpió; lo que no se miró no se sabe.",
        "alerta",
      );
    } else {
      avisar(
        r.discrepancias === 0
          ? `Los dos mayores coinciden en las ${r.revisados} póliza(s) espejadas.`
          : `${r.discrepancias} diferencia(s) entre el ERP y el mayor externo.`,
        r.discrepancias === 0 ? "exito" : "alerta",
      );
    }
    /* Si el enlace se cayó, el indicador de arriba ya no dice la verdad. */
    void estado.recargar();
  });

  const espejoActivo = estado.datos?.contabilidad.modoEfectivo === "ESPEJO";
  const sinMapear = estado.datos?.contabilidad.cuentasSinMapear ?? 0;
  const enVuelo = estado.datos?.enlace.disponible === true;

  /*
   * ══════════════════════════════════════════════════════════════════════════
   * CON QUÉ INSTITUCIÓN DEL CORE COINCIDE
   * --------------------------------------------------------------------------
   * La casilla del enlace decía «En línea · fineract». `fineract` es el nombre
   * del programa; la institución a la que llegan los asientos es el inquilino,
   * y era justo el dato que faltaba en la pantalla que afirma que las dos
   * contabilidades dicen lo mismo.
   *
   * «Institución» es la misma palabra que usa el portal de Fineract desde la
   * pasada de terminología: quien mira las dos pantallas no debería tener que
   * aprender que «inquilino», «tenant» y «libro» son lo mismo.
   *
   * Se dice además si es sólo de esta empresa o la compartida por omisión. No
   * es un adorno: una institución compartida es segura mientras sea una sola
   * empresa la que cae en ella, y quien administra tiene que poder verlo sin
   * abrir un archivo de configuración.
   *
   * Si el backend es anterior a este cambio, `inquilino` no viene y la casilla
   * se queda como estaba, sin inventar una institución.
   * ══════════════════════════════════════════════════════════════════════════
   */
  const institucionDelCore = (() => {
    const enlace = estado.datos?.enlace;
    if (!enlace) return "—";
    const nombre = enlace.inquilino?.efectivo;
    if (!nombre) return enlace.proveedor;
    return enlace.inquilino?.propioDeLaEmpresa
      ? `${enlace.proveedor} · institución «${nombre}»`
      : `${enlace.proveedor} · institución «${nombre}», compartida`;
  })();

  return (
    <div className="p-6 max-w-[1300px] mx-auto">
      <EncabezadoPantalla
        titulo="Espejo contable"
        descripcion="Correspondencia de cuentas con el mayor externo y pólizas que esperan por ella"
        acciones={
          <Boton
            variante="neutro"
            icono={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={recargarTodo}
          >
            Actualizar
          </Boton>
        }
      />

      {!espejoActivo && (
        <div className="panel p-4 mb-4 border-l-[3px] border-l-slate-400">
          <p className="text-[13px] font-semibold text-slate-900">
            Esta empresa no espeja su contabilidad
          </p>
          <p className="text-[12.5px] text-slate-500 mt-0.5">
            Las pólizas se registran sólo en el ERP. La correspondencia de
            cuentas no se usa mientras el espejo esté apagado.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Indicador
          etiqueta="Cuentas sin corresponder"
          color={sinMapear > 0 ? "#e11d48" : "#059669"}
          cargando={estado.cargando}
          icono={<AlertTriangle className="w-4 h-4" />}
          valor={sinMapear}
          detalle="ya usadas por una póliza"
        />
        <Indicador
          etiqueta="Previstas por configuración"
          color={(estado.datos?.contabilidad.cuentasPorMapear ?? 0) > 0 ? "#d97706" : "#64748b"}
          cargando={estado.cargando}
          valor={estado.datos?.contabilidad.cuentasPorMapear ?? 0}
          detalle="fallarían en su primer uso"
        />
        {/*
          El indicador contaba sólo lo detenido, y «sin espejar» es más que
          eso: una póliza que nunca se encoló tampoco está espejada, y no
          aparecía por ninguna parte. La etiqueta prometía el total; ahora lo
          cuenta.
        */}
        <Indicador
          etiqueta="Pólizas sin espejar"
          color={
            (sinEntregar.datos?.length ?? 0) + totalSinEncolar > 0
              ? "#e11d48"
              : "#059669"
          }
          cargando={sinEntregar.cargando || sinEncolar.cargando}
          valor={(sinEntregar.datos?.length ?? 0) + totalSinEncolar}
          detalle={
            totalSinEncolar > 0
              ? `${sinEntregar.datos?.length ?? 0} en la bandeja, ${totalSinEncolar} sin encolar`
              : "esperan salir"
          }
        />
        {/*
          «Sin enlace» en rojo era una avería inventada para quien no espeja.
          Una empresa que sólo usa el ERP no tiene enlace porque no contrató
          ninguno, y el rojo la mandaba a buscar una caída que no existe. Rojo
          es para el que espeja y perdió el enlace; para el que no espeja, la
          casilla dice lo que pasa y no alarma.
        */}
        <Indicador
          etiqueta="Enlace"
          color={enVuelo ? "#059669" : espejoActivo ? "#e11d48" : "#64748b"}
          cargando={estado.cargando}
          valor={
            enVuelo ? "En línea" : espejoActivo ? "Sin enlace" : "No se usa"
          }
          detalle={
            enVuelo || espejoActivo ? institucionDelCore : "el espejo está apagado"
          }
        />
      </div>

      {/* ── Cuentas por corresponder ─────────────────────────────────── */}
      <Panel sinRelleno className="mb-5">
        <div className="panel-cabecera">
          <div>
            <p className="text-[13px] font-semibold text-slate-900">
              Cuentas por corresponder
            </p>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Mientras una cuenta no tenga equivalencia, su póliza no se manda:
              un asiento a medias en el mayor externo es peor que ninguno.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600 select-none">
              <input
                type="checkbox"
                checked={incluirPrevistas}
                onChange={(e) => setIncluirPrevistas(e.target.checked)}
              />
              Incluir las previstas
            </label>
            <Boton
              variante="neutro"
              cargando={simular.ejecutando}
              onClick={() => void simular.ejecutar()}
            >
              Ver qué haría
            </Boton>
            <Boton
              variante="primario"
              icono={<Link2 className="w-3.5 h-3.5" />}
              cargando={aprovisionar.ejecutando}
              disabled={!espejoActivo || !enVuelo}
              onClick={() => void aprovisionar.ejecutar()}
            >
              Crear y corresponder
            </Boton>
          </div>
        </div>

        {simulacion && (
          <div className="px-4 py-3 bg-amber-50/60 border-b border-amber-100">
            <p className="text-[12.5px] font-semibold text-amber-900">
              Simulación — no se ha creado nada todavía
            </p>
            <ul className="mt-1 space-y-0.5">
              {simulacion.creadas.map((c) => (
                <li key={c.codigo} className="text-[12.5px] text-amber-800 cifra">
                  {c.codigo} · {c.nombre} — se crearía como {c.clase}
                </li>
              ))}
              {simulacion.reutilizadas.map((c) => (
                <li key={c.codigo} className="text-[12.5px] text-slate-600 cifra">
                  {c.codigo} — ya existe allá, se reutilizaría
                </li>
              ))}
              {simulacion.problemas.map((c) => (
                <li key={c.codigo} className="text-[12.5px] text-rose-700 cifra">
                  {c.codigo} — {c.error ?? "no se pudo resolver"}
                </li>
              ))}
            </ul>
          </div>
        )}

        {pendientes.cargando ? (
          <Cargando />
        ) : pendientes.error ? (
          <ErrorPantalla mensaje={pendientes.error} onReintentar={pendientes.recargar} />
        ) : (pendientes.datos?.length ?? 0) === 0 &&
          (previstas.datos?.length ?? 0) === 0 ? (
          <SinDatos
            titulo="Todas las cuentas tienen equivalencia"
            descripcion="Ninguna póliza se quedará sin espejar por falta de correspondencia."
            icono={<CheckCircle2 className="w-5 h-5" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Cuenta del ERP</th>
                  <th>Nombre</th>
                  <th>Situación</th>
                  <th>Corresponder a mano</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[
                  ...(pendientes.datos ?? []).map((c) => ({ ...c, urgente: true })),
                  ...(previstas.datos ?? [])
                    .filter(
                      (p) => !(pendientes.datos ?? []).some((c) => c.id === p.id),
                    )
                    .map((c) => ({ ...c, urgente: false })),
                ].map((c) => (
                  <tr key={c.id} className={c.urgente ? "bg-rose-50/40" : ""}>
                    <td className="cifra text-slate-900">{c.numeroCuenta}</td>
                    <td className="text-slate-700">{c.nombre}</td>
                    <td>
                      {c.urgente ? (
                        <Distintivo tono="peligro">
                          {c.usos ?? 0} póliza(s) detenida(s)
                        </Distintivo>
                      ) : (
                        <Distintivo tono="alerta">
                          {c.motivo ?? "prevista por configuración"}
                        </Distintivo>
                      )}
                    </td>
                    <td>
                      <Seleccion
                        value={eleccion[c.id] ?? ""}
                        onChange={(e) =>
                          setEleccion((p) => ({ ...p, [c.id]: e.target.value }))
                        }
                        className="w-64"
                      >
                        <option value="">Elegir en el mayor externo…</option>
                        {(externas.datos ?? [])
                          .filter((x) => x.admiteAsientoManual)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.codigo} · {x.nombre}
                            </option>
                          ))}
                      </Seleccion>
                    </td>
                    <td className="text-right">
                      <Boton
                        variante="neutro"
                        disabled={!eleccion[c.id]}
                        onClick={() => void mapearAMano.ejecutar(c)}
                      >
                        Corresponder
                      </Boton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ── Pólizas que nunca se encolaron ───────────────────────────── */}
      {totalSinEncolar > 0 && (
        <Panel sinRelleno className="mb-5">
          <div className="panel-cabecera">
            <div>
              <p className="text-[13px] font-semibold text-slate-900">
                {totalSinEncolar} póliza(s) que nunca se encolaron
              </p>
              <p className="text-[12px] text-slate-500 mt-0.5">
                No están detenidas: no llegaron a entrar en la bandeja. Nacieron
                antes de que el espejo existiera, o con el espejo apagado. El
                cierre del mes no puede certificarse mientras sigan así.
              </p>
            </div>
            {puedeEncolarFaltantes ? (
              <Boton
                variante="neutro"
                icono={<RefreshCw className="w-3.5 h-3.5" />}
                cargando={encolarFaltantes.ejecutando}
                onClick={() => void encolarFaltantes.ejecutar()}
              >
                Encolarlas
              </Boton>
            ) : (
              <p className="text-[12px] text-slate-500 max-w-[220px] text-right">
                Encolarlas es de Administración.
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th>Concepto</th>
                </tr>
              </thead>
              <tbody>
                {(sinEncolar.datos?.polizas ?? []).map((p) => (
                  <tr key={p.id} className="bg-amber-50/40">
                    <td className="text-slate-900">{p.folio}</td>
                    <td className="text-[12.5px] text-slate-500">
                      {String(p.fecha).slice(0, 10)}
                    </td>
                    <td className="text-[12.5px] text-slate-600">{p.concepto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-[12px] text-slate-500 border-t border-slate-100">
            Encolarlas no las manda: quedan en la bandeja de abajo, y de ahí
            salen con «Despachar la cola».
          </p>
        </Panel>
      )}

      {/* ── Pólizas que no llegaron ──────────────────────────────────── */}
      <Panel sinRelleno className="mb-5">
        <div className="panel-cabecera">
          <div>
            <p className="text-[13px] font-semibold text-slate-900">
              Pólizas que no llegaron al mayor externo
            </p>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Están registradas y son válidas en el ERP. Lo único que falta es
              su reflejo afuera.
            </p>
          </div>
          {puedeDespachar ? (
            <Boton
              variante="neutro"
              icono={<Send className="w-3.5 h-3.5" />}
              cargando={despachar.ejecutando}
              onClick={() => void despachar.ejecutar()}
            >
              Despachar la cola
            </Boton>
          ) : (
            <p className="text-[12px] text-slate-500 max-w-[220px] text-right">
              El reenvío al mayor externo lo hace Administración.
            </p>
          )}
        </div>

        {sinEntregar.cargando ? (
          <Cargando />
        ) : (sinEntregar.datos?.length ?? 0) === 0 ? (
          /*
           * Decía «todas las pólizas encontraron su reflejo», y sólo sabía que
           * nada estaba detenido. Con ocho pólizas que nunca se encolaron, esa
           * frase era falsa y salía en verde. Ahora afirma lo que mide.
           */
          <SinDatos
            titulo="Nada pendiente de salir"
            descripcion={
              totalSinEncolar > 0
                ? `Ninguna póliza se detuvo por error. Pero ${totalSinEncolar} nunca se encolaron: están arriba.`
                : "Ninguna póliza quedó detenida, y no hay ninguna sin encolar."
            }
            icono={<CheckCircle2 className="w-5 h-5" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Motivo por el que no ha salido</th>
                  <th className="text-right">Intentos</th>
                  <th>Registrada</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sinEntregar.datos!.map((e) => (
                  <tr
                    key={e.id}
                    className={
                      e.estado === "FALLIDO" ? "bg-rose-50/40" : "bg-amber-50/30"
                    }
                  >
                    <td className="text-slate-900">{e.tipo}</td>
                    <td className="text-[12.5px] text-slate-600">{e.estado}</td>
                    <td className="text-[12.5px] text-rose-700">
                      {/*
                        Un PENDIENTE no tiene motivo porque no ha fallado: está
                        esperando su turno. «Sin detalle» ahí sonaba a avería.
                      */}
                      {e.ultimoError ??
                        (e.estado === "PENDIENTE"
                          ? "Todavía no se ha intentado; sale en el siguiente despacho."
                          : "sin detalle")}
                    </td>
                    <td className="text-right cifra text-slate-600">{e.intentos}</td>
                    <td className="text-[12.5px] text-slate-500">
                      {fechaHora(e.fechaCreacion)}
                    </td>
                    <td className="text-right">
                      {puedeReencolar && (
                        <Boton
                          variante="neutro"
                          onClick={() => void reencolar.ejecutar(e.id)}
                        >
                          Reintentar
                        </Boton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ── ¿Dicen lo mismo los dos mayores? ─────────────────────────── */}
      <Panel sinRelleno>
        <div className="panel-cabecera flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-semibold text-slate-900">
              ¿Las dos contabilidades dicen lo mismo?
            </p>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Que la póliza saliera no quiere decir que del otro lado aterrizara
              lo mismo. Esto compara, póliza por póliza, la que se registró aquí
              contra el asiento del mayor externo.
            </p>
          </div>
          {puedeConciliar && (
            <Boton
              variante="neutro"
              icono={<ShieldAlert className="w-3.5 h-3.5" />}
              cargando={conciliar.ejecutando}
              onClick={() => void conciliar.ejecutar()}
            >
              Comparar ahora
            </Boton>
          )}
        </div>

        {conciliacion === null ? (
          <SinDatos
            titulo="Sin comparar en esta sesión"
            descripcion="La comparación también corre sola cada diez minutos; aquí se puede pedir en el momento."
            icono={<Link2 className="w-5 h-5" />}
          />
        ) : conciliacion.completa === false ? (
          <div className="p-4">
            <p className="text-[13px] font-semibold text-amber-800">
              La comparación se interrumpió
            </p>
            <p className="text-[12px] text-slate-600 mt-1 max-w-3xl">
              {conciliacion.interrumpida}
            </p>
            <p className="text-[12px] text-slate-500 mt-1">
              Se revisaron {conciliacion.revisados}; quedaron{" "}
              {conciliacion.pendientesDeComparar ?? 0} sin comparar. Vuelve a
              pedirla cuando el enlace responda.
            </p>
          </div>
        ) : conciliacion.discrepancias === 0 ? (
          <div className="p-4">
            <p className="text-[13px] font-semibold text-emerald-700">
              Coinciden en las {conciliacion.revisados} póliza(s) espejadas
            </p>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Comparación del {fechaHora(conciliacion.fecha)} · alcance{" "}
              {conciliacion.alcance}
            </p>
            {/*
              Sin esto, «coinciden» se leería como «ya está todo», y hay pólizas
              que ni han salido. No coincidir y no haber salido son dos cosas, y
              la segunda también hay que decirla.
            */}
            {(conciliacion.enCamino?.length ?? 0) > 0 && (
              <p className="text-[12px] text-slate-600 mt-2">
                Faltan {conciliacion.enCamino!.length} por salir; no son una
                diferencia y no hay nada que hacer con ellas. El detalle está
                abajo.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Póliza</th>
                  <th>Asiento externo</th>
                  <th>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {conciliacion.hallazgos.map((h) => (
                  <tr key={`${h.polizaId}-${h.codigo}`} className="bg-amber-50/50">
                    <td className="text-slate-900">{h.folio}</td>
                    <td className="text-[12.5px] text-slate-500">
                      {h.asientoId ?? "no llegó"}
                    </td>
                    <td className="text-[12.5px] text-amber-800">
                      <span className="font-semibold">{h.codigo}</span> · {h.detalle}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/*
          En gris y con su motivo, no en ámbar.
          ------------------------------------------------------------------
          Medido el 7-oct: dos pólizas de una devolución salían como
          «VINCULO_INCOMPLETO · reintenta desde el espejo contable» cuando lo
          que pasaba era que el core no llega todavía a su fecha y el
          despachador las reintenta solo. El consejo era imposible de seguir y
          el rojo era permanente. Un control que casi siempre está encendido
          por lo que se arregla sin nadie se acaba mirando por encima.
        */}
        {(conciliacion?.enCamino?.length ?? 0) > 0 && (
          <div className="border-t border-slate-200">
            <div className="px-4 py-2.5 bg-slate-50/60">
              <p className="text-[12.5px] font-semibold text-slate-700">
                Todavía no han salido ({conciliacion!.enCamino!.length})
              </p>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Están en la cola con su motivo escrito y vuelven solas. No
                cuentan como diferencia.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Póliza</th>
                    <th>Por qué no ha salido</th>
                  </tr>
                </thead>
                <tbody>
                  {conciliacion!.enCamino!.map((h) => (
                    <tr key={`camino-${h.polizaId}`}>
                      <td className="text-slate-900">{h.folio}</td>
                      <td className="text-[12.5px] text-slate-600">
                        {h.detalle}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>

      {/* ── Correspondencia vigente ──────────────────────────────────── */}
      <Panel sinRelleno>
        <div className="panel-cabecera">
          <p className="text-[13px] font-semibold text-slate-900">
            Correspondencia vigente
          </p>
          <p className="text-[12px] text-slate-500 cifra">
            {mapeos.datos?.length ?? 0} cuentas
          </p>
        </div>
        {mapeos.cargando ? (
          <Cargando />
        ) : (mapeos.datos?.length ?? 0) === 0 ? (
          <SinDatos
            titulo="Todavía no hay correspondencias"
            descripcion="Ninguna cuenta del ERP tiene equivalente en el mayor externo."
            icono={<ShieldAlert className="w-5 h-5" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Cuenta del ERP</th>
                  <th>Equivale a</th>
                  <th>Identificador externo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {mapeos.datos!.map((m) => (
                  <tr key={m.id}>
                    <td className="cifra text-slate-900">{m.codigoCuenta}</td>
                    <td className="cifra text-slate-700">
                      {m.codigoExterno ?? "—"}
                    </td>
                    <td className="cifra text-slate-500">{m.idExterno}</td>
                    <td>
                      <Distintivo tono={m.activo ? "exito" : "neutro"}>
                        {m.activo ? "Vigente" : "Inactiva"}
                      </Distintivo>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
