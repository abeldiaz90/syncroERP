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
  enlace: { proveedor: string; configurado: boolean; disponible: boolean };
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

interface Simulacion {
  simulacion?: boolean;
  creadas: { codigo: string; nombre: string; clase: string; accion?: string }[];
  reutilizadas: { codigo: string; nombre?: string }[];
  problemas: { codigo: string; error?: string }[];
  pendientesDespues: number;
}

export default function EspejoContablePage() {
  const { avisar } = useAvisos();
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
  const fallidos = useDatos<EventoOutbox[]>(
    () => api.get("/integracion/outbox", { query: { estado: "FALLIDO" } }),
    [],
  );

  const recargarTodo = () => {
    void estado.recargar();
    void pendientes.recargar();
    void previstas.recargar();
    void mapeos.recargar();
    void fallidos.recargar();
  };

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
    void fallidos.recargar();
  });

  const despachar = useAccion(async () => {
    await api.post("/integracion/outbox/despachar");
    avisar("Cola despachada.", "info");
    recargarTodo();
  });

  const espejoActivo = estado.datos?.contabilidad.modoEfectivo === "ESPEJO";
  const sinMapear = estado.datos?.contabilidad.cuentasSinMapear ?? 0;
  const enVuelo = estado.datos?.enlace.disponible === true;

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
        <Indicador
          etiqueta="Pólizas sin espejar"
          color={(fallidos.datos?.length ?? 0) > 0 ? "#e11d48" : "#059669"}
          cargando={fallidos.cargando}
          valor={fallidos.datos?.length ?? 0}
          detalle="esperan la corrección"
        />
        <Indicador
          etiqueta="Enlace"
          color={enVuelo ? "#059669" : "#e11d48"}
          cargando={estado.cargando}
          valor={enVuelo ? "En línea" : "Sin enlace"}
          detalle={estado.datos?.enlace.proveedor ?? "—"}
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
          <Boton
            variante="neutro"
            icono={<Send className="w-3.5 h-3.5" />}
            cargando={despachar.ejecutando}
            onClick={() => void despachar.ejecutar()}
          >
            Despachar la cola
          </Boton>
        </div>

        {fallidos.cargando ? (
          <Cargando />
        ) : (fallidos.datos?.length ?? 0) === 0 ? (
          <SinDatos
            titulo="Nada detenido"
            descripcion="Todas las pólizas encontraron su reflejo en el mayor externo."
            icono={<CheckCircle2 className="w-5 h-5" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Motivo por el que se detuvo</th>
                  <th className="text-right">Intentos</th>
                  <th>Registrada</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fallidos.datos!.map((e) => (
                  <tr key={e.id} className="bg-rose-50/40">
                    <td className="text-slate-900">{e.tipo}</td>
                    <td className="text-[12.5px] text-rose-700">
                      {e.ultimoError ?? "sin detalle"}
                    </td>
                    <td className="text-right cifra text-slate-600">{e.intentos}</td>
                    <td className="text-[12.5px] text-slate-500">
                      {fechaHora(e.fechaCreacion)}
                    </td>
                    <td className="text-right">
                      <Boton
                        variante="neutro"
                        onClick={() => void reencolar.ejecutar(e.id)}
                      >
                        Reintentar
                      </Boton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
