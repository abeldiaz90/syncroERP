"use client";

import { useEffect, useMemo, useState } from "react";
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { usePermiso } from "@/hooks/use-permisos";
import {
  Boton,
  Campo,
  Cargando,
  Distintivo,
  EncabezadoPantalla,
  Panel,
  Seleccion,
  useAvisos,
} from "@/components/ui";

type Proceso = {
  clave: string;
  nombre: string;
  modulo: string;
  estadoIntegracion: "OPERATIVO" | "PREPARADO";
};
type Departamento = { id: string; nombre: string; activo?: boolean };
type Usuario = {
  id: string;
  nombreCompleto: string;
  rol?: string;
  activo?: boolean;
};
/*
 * El veredicto que el backend adjunta a cada nivel guardado: cuanta gente
 * activa puede firmarlo de verdad. Nace de una matriz de CREDITO_CLIENTE que
 * se veia impecable en esta misma pantalla y no dejo levantar una sola
 * solicitud, porque el unico rol que podia originarla era tambien el unico que
 * podia firmar el nivel 1. Ver `salud-matriz.util.ts` en el backend.
 */
type SaludNivel = {
  orden: number;
  firmantesActivos: number;
  estado: "SIN_FIRMANTE" | "FIRMANTE_UNICO" | "CORRECTO";
  mensaje: string | null;
};

type Nivel = {
  id: string;
  salud?: SaludNivel | null;
  usuarioId?: string;
  rolAprobador?: string;
  orden: number;
  montoDesde?: string;
  montoHasta?: string;
  tiempoLimiteHoras: string;
  obligatorio: boolean;
  permiteAutoaprobacion: boolean;
};
type ConfigGuardada = Nivel & {
  proceso: string;
  departamentoId?: string;
  usuario?: Usuario;
  departamento?: Departamento;
};

const PROCESOS_FINANCIEROS = new Set(["CREDITO_CLIENTE", "HOTEL_CONVENIO"]);

/*
 * AQUÍ HABÍA UNA LISTA FIJA DE DIEZ ROLES. Se eliminó el 21-sep-2026.
 *
 * Era la cuarta lista de roles del sistema y no coincidía con ninguna. Se
 * ampliaba sola con los roles que YA tuviera algún usuario, lo que dejaba
 * fuera justo el caso que hay que poder configurar: un rol recién creado, al
 * que todavía no pertenece nadie, no se podía elegir como aprobador. Le pasó
 * a `gobierno` el día que nació. Y `almacenista`, `contador` y `empleado`
 * salían en crudo, sin etiqueta, porque entraban por esa puerta de atrás.
 *
 * La lista buena es la de las plantillas de permisos, y la sirve el backend en
 * `/configuraciones-aprobacion/catalogo/roles`.
 */
type RolAsignable = { clave: string; etiqueta: string };

const nuevoNivel = (orden: number): Nivel => ({
  id: crypto.randomUUID(),
  orden,
  rolAprobador: "",
  usuarioId: "",
  montoDesde: "",
  montoHasta: "",
  tiempoLimiteHoras: "24",
  obligatorio: true,
  permiteAutoaprobacion: false,
});

export default function ConfiguracionAprobacionesPage() {
  /*
   * Esta pantalla la ven ahora dos públicos distintos.
   *
   * Quien gobierna la matriz la edita. Los siete roles que APRUEBAN
   * conservan la lectura —ver por qué un documento te llega no es gobernarlo—
   * pero no pueden escribirla: podrían borrar el renglón que exige su propia
   * firma. Hasta hoy la pantalla no preguntaba nada y pintaba los botones
   * para todos; el servidor contestaba 403 al pulsar.
   */
  const { tienePermiso } = usePermiso();
  const puedeGobernar = tienePermiso("POST", "/configuraciones-aprobacion");

  const { avisar } = useAvisos();
  const [cargando, setCargando] = useState(true);
  const [sinAcceso, setSinAcceso] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [procesos, setProcesos] = useState<Proceso[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [rolesApi, setRolesApi] = useState<RolAsignable[]>([]);
  const [matriz, setMatriz] = useState<ConfigGuardada[]>([]);
  const [proceso, setProceso] = useState("NOMINA");
  const [departamentoId, setDepartamentoId] = useState("");
  const [niveles, setNiveles] = useState<Nivel[]>([nuevoNivel(1)]);

  async function cargar() {
    setCargando(true);
    try {
      // Esta pantalla solo es utilizable por quien puede leer el padrón de
      // áreas y usuarios: sin esos dos catalogos no hay a quien asignar. Se
      // usa allSettled para distinguir "sin permiso" (403) de "fallo real" y
      // no disparar un toast de error por cada catálogo negado.
      const [procesosRes, rolesRes, departamentosRes, usuariosRes, matrizRes] =
        await Promise.allSettled([
          api.get<Proceso[]>("/configuraciones-aprobacion/catalogo/procesos"),
          api.get<RolAsignable[]>("/configuraciones-aprobacion/catalogo/roles"),
          api.get<Departamento[]>("/departamentos"),
          api.get<Usuario[]>("/usuarios"),
          api.get<ConfigGuardada[]>(
            "/configuraciones-aprobacion/matriz/todos",
          ),
        ]);

      const negado = (resultado: PromiseSettledResult<unknown>) =>
        resultado.status === "rejected" &&
        resultado.reason instanceof ApiError &&
        (resultado.reason.esNoAutorizado || resultado.reason.esSinPermisos);

      if (negado(departamentosRes) || negado(usuariosRes)) {
        setSinAcceso(true);
        return;
      }

      const fallo = [procesosRes, departamentosRes, usuariosRes, matrizRes].find(
        (resultado) => resultado.status === "rejected",
      );
      if (fallo && fallo.status === "rejected") {
        throw fallo.reason;
      }

      const valor = <T,>(resultado: PromiseSettledResult<T>): T | undefined =>
        resultado.status === "fulfilled" ? resultado.value : undefined;

      setSinAcceso(false);
      setProcesos(valor(procesosRes) ?? []);
      setRolesApi(valor(rolesRes) ?? []);
      setDepartamentos(
        (valor(departamentosRes) ?? []).filter((item) => item.activo !== false),
      );
      setUsuarios(
        (valor(usuariosRes) ?? []).filter((item) => item.activo !== false),
      );
      setMatriz(valor(matrizRes) ?? []);
    } catch (error) {
      avisar(
        error instanceof ApiError
          ? error.mensajeParaPantalla()
          : "No se pudo cargar la matriz.",
        "error",
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  const requiereArea = proceso === "REQUISICION";
  const esFinancieroCentral = PROCESOS_FINANCIEROS.has(proceso);
  const procesoActual = procesos.find((item) => item.clave === proceso);
  const procesoOperativo = procesoActual?.estadoIntegracion === "OPERATIVO";

  useEffect(() => {
    const existentes = matriz.filter(
      (item) =>
        item.proceso === proceso &&
        (item.departamentoId ?? "") ===
          (requiereArea ? departamentoId : ""),
    );
    setNiveles(
      existentes.length
        ? existentes.map((item, indice) => ({
            ...item,
            id: item.id || crypto.randomUUID(),
            orden: indice + 1,
            montoDesde:
              item.montoDesde == null ? "" : String(item.montoDesde),
            montoHasta:
              item.montoHasta == null ? "" : String(item.montoHasta),
            tiempoLimiteHoras: String(item.tiempoLimiteHoras || 24),
            obligatorio: esFinancieroCentral ? true : item.obligatorio,
            permiteAutoaprobacion: esFinancieroCentral
              ? false
              : item.permiteAutoaprobacion,
          }))
        : [nuevoNivel(1)],
    );
  }, [proceso, departamentoId, matriz, requiereArea, esFinancieroCentral]);

  const configurados = useMemo(
    () => new Set(matriz.map((item) => item.proceso)),
    [matriz],
  );
  const roles = useMemo(() => {
    const opciones = new Map<string, string>(
      rolesApi.map((rol) => [rol.clave, rol.etiqueta]),
    );
    /*
     * Un rol que ya está en uso se sigue ofreciendo aunque desaparezca del
     * contrato: si no, editar un nivel existente lo borraría sin avisar.
     */
    for (const usuario of usuarios) {
      const original = String(usuario.rol ?? "").trim();
      if (!original) continue;
      const clave = original.toLowerCase();
      if (!opciones.has(clave)) opciones.set(clave, original);
    }
    return [...opciones.entries()].sort((a, b) =>
      a[1].localeCompare(b[1], "es", { sensitivity: "base" }),
    );
  }, [rolesApi, usuarios]);

  function cambiar(id: string, datos: Partial<Nivel>) {
    setNiveles((actuales) =>
      actuales.map((item) =>
        item.id === id ? { ...item, ...datos } : item,
      ),
    );
  }

  function mover(indice: number, delta: number) {
    const destino = indice + delta;
    if (destino < 0 || destino >= niveles.length) return;
    const copia = [...niveles];
    [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
    setNiveles(copia.map((item, i) => ({ ...item, orden: i + 1 })));
  }

  function validarEscalaFinanciera() {
    let topeAnterior = -0.01;
    for (let indice = 0; indice < niveles.length; indice += 1) {
      const nivel = niveles[indice];
      const ultimo = indice === niveles.length - 1;
      if (ultimo && nivel.montoHasta !== "") {
        return "El último nivel debe quedar sin tope para cubrir cualquier importe.";
      }
      if (!ultimo && nivel.montoHasta === "") {
        return `Define el tope de autoridad del nivel ${indice + 1}.`;
      }
      if (nivel.montoHasta !== "") {
        const tope = Number(nivel.montoHasta);
        if (!Number.isFinite(tope) || tope < 0) {
          return `El tope del nivel ${indice + 1} no es válido.`;
        }
        if (tope <= topeAnterior) {
          return `El tope del nivel ${indice + 1} debe superar al nivel anterior.`;
        }
        topeAnterior = tope;
      }
    }
    return null;
  }

  async function guardar() {
    if (!procesoOperativo) {
      return avisar(
        "Este proceso todavía no está conectado a una operación real y no puede marcarse como configurado.",
        "error",
      );
    }
    if (requiereArea && !departamentoId) {
      return avisar("Selecciona el área solicitante.", "error");
    }
    if (
      niveles.some(
        (nivel) => Boolean(nivel.usuarioId) === Boolean(nivel.rolAprobador),
      )
    ) {
      return avisar(
        "Cada nivel debe tener un usuario o un rol, no ambos.",
        "error",
      );
    }
    if (["ALTA_AREA", "ALTA_PUESTO"].includes(proceso) && niveles.length !== 2) {
      return avisar("Este proceso requiere exactamente dos niveles.", "error");
    }
    if (esFinancieroCentral) {
      const errorEscala = validarEscalaFinanciera();
      if (errorEscala) return avisar(errorEscala, "error");
    }

    setGuardando(true);
    try {
      let desdeCalculado = 0;
      const aprobadores = niveles.map((nivel, indice) => {
        const montoHasta =
          nivel.montoHasta === "" ? undefined : Number(nivel.montoHasta);
        const montoDesde = esFinancieroCentral
          ? desdeCalculado
          : nivel.montoDesde === ""
            ? undefined
            : Number(nivel.montoDesde);
        if (esFinancieroCentral && montoHasta != null) {
          desdeCalculado = Math.round((montoHasta + 0.01) * 100) / 100;
        }
        return {
          usuarioId: nivel.usuarioId || undefined,
          rolAprobador: nivel.rolAprobador || undefined,
          orden: indice + 1,
          montoDesde,
          montoHasta,
          tiempoLimiteHoras: Number(nivel.tiempoLimiteHoras || 24),
          obligatorio: esFinancieroCentral ? true : nivel.obligatorio,
          permiteAutoaprobacion: esFinancieroCentral
            ? false
            : nivel.permiteAutoaprobacion,
        };
      });

      await api.post("/configuraciones-aprobacion", {
        proceso,
        departamentoId: requiereArea ? departamentoId : undefined,
        aprobadores,
      });
      avisar("Matriz de aprobación guardada.", "exito");
      await cargar();
    } catch (error) {
      avisar(
        error instanceof ApiError
          ? error.mensajeParaPantalla()
          : "No se pudo guardar.",
        "error",
      );
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <Cargando />;

  if (sinAcceso) {
    return (
      <div className="mx-auto max-w-[1450px] p-6">
        <EncabezadoPantalla
          titulo="Gobierno de aprobaciones"
          descripcion="Define quién autoriza cada proceso y en qué orden."
        />
        <Panel>
          <div className="py-10 text-center">
            <p className="text-base font-semibold text-slate-700">
              Tu perfil no administra los flujos de aprobación
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Para editar esta matriz se necesita acceso al padrón de áreas y
              de usuarios. Pide a un administrador que te lo otorgue, o revisa
              tus pendientes en la bandeja de aprobaciones.
            </p>
            <Link
              href="/dashboard/aprobaciones"
              className="mt-4 inline-block text-sm font-semibold text-indigo-600 underline"
            >
              Ir a la bandeja de aprobaciones
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1450px] p-6">
      <EncabezadoPantalla
        titulo="Gobierno de aprobaciones"
        descripcion="Crédito de clientes y convenios hoteleros utilizan una bandeja central y una escala acumulativa de autoridad. Los procesos preparados no se presentan como operativos."
        acciones={
          <Boton
            variante="primario"
            icono={<Save className="h-4 w-4" />}
            cargando={guardando}
            disabled={!procesoOperativo || !puedeGobernar}
            onClick={() => void guardar()}
          >
            Guardar flujo
          </Boton>
        }
      />

      {!puedeGobernar && (
        <div className="mb-5 flex gap-3 rounded-2xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
          <p>
            <strong className="font-bold">Esta pantalla es de consulta para tu rol.</strong>{" "}
            Puedes ver por qué un documento llega a tu bandeja y con qué plazo,
            pero la matriz la gobierna el rol «Gobierno de aprobaciones», que no
            firma ninguno de los documentos que enruta. Quien aprueba no escribe
            la regla que lo obliga a aprobar.
          </p>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[330px_1fr]">
        <Panel>
          <p className="eyebrow mb-3">Procesos controlados</p>
          <div className="space-y-2">
            {procesos.map((item) => (
              <button
                key={item.clave}
                onClick={() => {
                  setProceso(item.clave);
                  setDepartamentoId("");
                }}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  proceso === item.clave
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    {item.nombre}
                  </span>
                  {item.estadoIntegracion === "PREPARADO" ? (
                    <Distintivo tono="neutro">No conectado</Distintivo>
                  ) : configurados.has(item.clave) ? (
                    <Distintivo tono="exito">Operativo</Distintivo>
                  ) : (
                    <Distintivo tono="alerta">Falta configurar</Distintivo>
                  )}
                </div>
                <p className="mt-1 text-[10px] font-semibold text-slate-400">
                  {item.modulo}
                </p>
              </button>
            ))}
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <div className="flex flex-wrap items-start gap-4">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-white">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h2 className="font-black text-slate-950">
                  {procesoActual?.nombre}
                </h2>
                <p className="text-xs text-slate-500">
                  Cada decisión conserva solicitante, aprobador, versión del
                  documento, fecha, comentario y ciclo.
                </p>
                {esFinancieroCentral && (
                  <p className="mt-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800">
                    Escala acumulativa: un importe debe pasar por todos los
                    niveles anteriores hasta llegar al responsable con autoridad
                    suficiente. Todos los niveles son obligatorios y nadie puede
                    autoaprobarse.
                  </p>
                )}
                {!procesoOperativo && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    El proceso aún no bloquea ni dirige operaciones reales. Se
                    muestra para planeación, pero el backend impedirá guardar una
                    matriz que produzca una falsa sensación de control.
                  </p>
                )}
              </div>
              {requiereArea && (
                <div className="w-72">
                  <Campo etiqueta="Área solicitante" requerido>
                    <Seleccion
                      value={departamentoId}
                      onChange={(event) => setDepartamentoId(event.target.value)}
                    >
                      <option value="">Seleccionar…</option>
                      {departamentos.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nombre}
                        </option>
                      ))}
                    </Seleccion>
                  </Campo>
                  {/*
                    * Un desplegable vacío no explica nada. Sin áreas dadas de
                    * alta este proceso no se puede configurar, y sin él nadie
                    * puede levantar una requisición: conviene decir dónde se
                    * crean, no dejar a la persona mirando un «Seleccionar…»
                    * que nunca abre.
                    */}
                  {departamentos.length === 0 && (
                    <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      No hay áreas organizacionales dadas de alta. Se solicitan en{' '}
                      <Link href="/dashboard/departamentos" className="font-semibold underline">
                        Departamentos
                      </Link>{' '}
                      y las autorizan Gerencia y Finanzas. Sin un área, este proceso no se puede configurar.
                    </p>
                  )}
                </div>
              )}
            </div>
          </Panel>

          <div className="space-y-3">
            {niveles.map((nivel, indice) => {
              const ultimo = indice === niveles.length - 1;
              return (
                <Panel key={nivel.id}>
                  <div className="mb-4 flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-100 text-sm font-black text-indigo-700">
                      {indice + 1}
                    </span>
                    <div>
                      <p className="font-bold text-slate-900">
                        Nivel {indice + 1}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {esFinancieroCentral
                          ? ultimo
                            ? "Autoridad final sin tope"
                            : "Aprobación acumulativa hasta el importe indicado"
                          : "Responsable, rango y plazo de atención"}
                      </p>
                    </div>
                    <div className="ml-auto flex gap-1">
                      <button
                        disabled={!puedeGobernar}
                        onClick={() => mover(indice, -1)}
                        className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"
                        aria-label="Subir nivel"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        disabled={!puedeGobernar}
                        onClick={() => mover(indice, 1)}
                        className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"
                        aria-label="Bajar nivel"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        disabled={niveles.length === 1 || !puedeGobernar}
                        onClick={() =>
                          setNiveles(
                            niveles
                              .filter((item) => item.id !== nivel.id)
                              .map((item, i) => ({ ...item, orden: i + 1 })),
                          )
                        }
                        className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                        aria-label="Eliminar nivel"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {nivel.salud && nivel.salud.estado !== "CORRECTO" && (
                    <div
                      role="status"
                      className={`mb-4 rounded-xl border px-3 py-2 text-[12px] leading-relaxed ${
                        nivel.salud.estado === "SIN_FIRMANTE"
                          ? "border-rose-200 bg-rose-50 text-rose-800"
                          : "border-amber-200 bg-amber-50 text-amber-900"
                      }`}
                    >
                      <span className="font-bold">
                        {nivel.salud.estado === "SIN_FIRMANTE"
                          ? "Este nivel no tiene quien lo firme. "
                          : "Este nivel tiene un solo firmante. "}
                      </span>
                      {nivel.salud.mensaje}
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Campo etiqueta="Usuario específico">
                      <Seleccion
                        value={nivel.usuarioId || ""}
                        onChange={(event) =>
                          cambiar(nivel.id, {
                            usuarioId: event.target.value,
                            rolAprobador: "",
                          })
                        }
                      >
                        <option value="">No asignar por usuario</option>
                        {usuarios.map((usuario) => (
                          <option key={usuario.id} value={usuario.id}>
                            {usuario.nombreCompleto} · {usuario.rol}
                          </option>
                        ))}
                      </Seleccion>
                    </Campo>

                    <Campo etiqueta="O asignar por rol">
                      <Seleccion
                        value={nivel.rolAprobador || ""}
                        onChange={(event) =>
                          cambiar(nivel.id, {
                            rolAprobador: event.target.value,
                            usuarioId: "",
                          })
                        }
                      >
                        <option value="">No asignar por rol</option>
                        {roles.map(([valor, etiqueta]) => (
                          <option key={valor} value={valor}>
                            {etiqueta}
                          </option>
                        ))}
                      </Seleccion>
                    </Campo>

                    {esFinancieroCentral ? (
                      <Campo
                        etiqueta="Autoridad hasta"
                        ayuda={ultimo ? "Último nivel: sin límite" : undefined}
                      >
                        <input
                          className="campo"
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={ultimo}
                          value={ultimo ? "" : nivel.montoHasta}
                          placeholder={ultimo ? "Sin límite" : "Ej. 50000"}
                          onChange={(event) =>
                            cambiar(nivel.id, {
                              montoHasta: event.target.value,
                            })
                          }
                        />
                      </Campo>
                    ) : (
                      <>
                        {/*
                          Una requisición no trae precios: se pide cantidad, no
                          dinero. Se valúa con el costo de reposición de cada
                          producto —el que la recepción mantiene al día—, que es
                          lo que hace SAP B1 con su «Last Purchase Price» para
                          valuar una solicitud antes de cotizarla. Sin decirlo
                          aquí, nadie adivina contra qué se compara el umbral.
                        */}
                        {requiereArea && (
                          <p className="col-span-full text-[11px] leading-snug text-slate-500">
                            La requisición se valúa con el <strong>costo de reposición</strong> de
                            cada producto por la cantidad pedida. Un producto sin costo conocido
                            cuenta como cero, así que lo desconocido nunca escala solo.
                            Deja ambos campos vacíos para que el nivel aplique siempre.
                          </p>
                        )}
                        <Campo etiqueta="Aplica desde">
                          <input
                            className="campo"
                            type="number"
                            min="0"
                            value={nivel.montoDesde}
                            onChange={(event) =>
                              cambiar(nivel.id, {
                                montoDesde: event.target.value,
                              })
                            }
                          />
                        </Campo>
                        <Campo etiqueta="Aplica hasta">
                          <input
                            className="campo"
                            type="number"
                            min="0"
                            value={nivel.montoHasta}
                            onChange={(event) =>
                              cambiar(nivel.id, {
                                montoHasta: event.target.value,
                              })
                            }
                          />
                        </Campo>
                      </>
                    )}

                    <Campo etiqueta="SLA de atención (horas)">
                      <input
                        className="campo"
                        type="number"
                        min="1"
                        max="720"
                        value={nivel.tiempoLimiteHoras}
                        onChange={(event) =>
                          cambiar(nivel.id, {
                            tiempoLimiteHoras: event.target.value,
                          })
                        }
                      />
                    </Campo>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-5 border-t pt-4 text-xs font-semibold text-slate-600">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={esFinancieroCentral || nivel.obligatorio}
                        disabled={esFinancieroCentral}
                        onChange={(event) =>
                          cambiar(nivel.id, {
                            obligatorio: event.target.checked,
                          })
                        }
                      />
                      Nivel obligatorio
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={
                          esFinancieroCentral
                            ? false
                            : nivel.permiteAutoaprobacion
                        }
                        disabled={esFinancieroCentral}
                        onChange={(event) =>
                          cambiar(nivel.id, {
                            permiteAutoaprobacion: event.target.checked,
                          })
                        }
                      />
                      Permitir autoaprobación
                    </label>
                  </div>
                </Panel>
              );
            })}
          </div>

          <Boton
            icono={<Plus className="h-4 w-4" />}
            disabled={!procesoOperativo || !puedeGobernar}
            onClick={() =>
              setNiveles((actuales) => [
                ...actuales,
                nuevoNivel(actuales.length + 1),
              ])
            }
          >
            Agregar nivel
          </Boton>
        </div>
      </div>
    </div>
  );
}
