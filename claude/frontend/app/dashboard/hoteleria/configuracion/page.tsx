// app/dashboard/hoteleria/configuracion/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import DotacionInsumos from "./DotacionInsumos";
import {
  Hotel,
  BedDouble,
  LayoutGrid,
  Plus,
  X,
  Loader2,
  CheckCircle2,
  Building2,
  Pencil,
  Layers,
  MapPin,
  Package,
} from "lucide-react";

interface IHotel {
  id: string;
  nombre: string;
  ciudad?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  almacenId?: string | null;
  horaCheckIn: string;
  horaCheckOut: string;
  zonaHoraria: string;
  moneda: string;
  tasaIva: number;
  tasaImpuestoHospedaje: number;
  preciosIncluyenImpuestos: boolean;
  exigirInventarioDotacion: boolean;
  permitirSobreventa: boolean;
  politicaCancelacion?: string | null;
  avisoPrivacidad?: string | null;
}
interface ITipo {
  id: string;
  nombre: string;
  capacidad: number;
  tarifaBase: number;
}
interface IHab {
  id: string;
  numero: string;
  piso: number | null;
  estado: string;
  tipoHabitacionId: string;
}

type Tab = "hoteles" | "tipos" | "habitaciones" | "dotacion";

export default function ConfiguracionHotelPage() {
  const api =
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === "production"
      ? "/api"
      : "http://localhost:4000/api");
  const tok = () =>
    typeof window !== "undefined"
      ? (localStorage.getItem("syncro_token") ?? "")
      : "";
  const h = () => ({
    Authorization: `Bearer ${tok()}`,
    "Content-Type": "application/json",
  });

  const [tab, setTab] = useState<Tab>("hoteles");
  const [hoteles, setHoteles] = useState<IHotel[]>([]);
  const [hotelId, setHotelId] = useState("");
  const [tipos, setTipos] = useState<ITipo[]>([]);
  const [habs, setHabs] = useState<IHab[]>([]);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Modales
  const [modalHotel, setModalHotel] = useState(false);
  const [hotelEdit, setHotelEdit] = useState<any>(null);
  const [modalTipo, setModalTipo] = useState(false);
  const [modalHab, setModalHab] = useState(false);

  const mostrar = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3200);
  };

  const cargarHoteles = useCallback(async () => {
    const r = await fetch(`${api}/hoteleria/config/hoteles`, { headers: h() });
    if (r.ok) {
      const d = await r.json();
      setHoteles(d);
      // Selecciona el primer hotel si no hay uno válido seleccionado
      setHotelId((prev) => {
        if (prev && d.some((x: IHotel) => x.id === prev)) return prev;
        return d.length ? d[0].id : "";
      });
    }
    setCargando(false);
  }, [api, hotelId]);

  const cargarTipos = useCallback(async () => {
    if (!hotelId) return;
    const r = await fetch(`${api}/hoteleria/config/tipos?hotelId=${hotelId}`, {
      headers: h(),
    });
    if (r.ok) setTipos(await r.json());
  }, [api, hotelId]);

  const cargarHabs = useCallback(async () => {
    if (!hotelId) return;
    const r = await fetch(
      `${api}/hoteleria/config/habitaciones?hotelId=${hotelId}`,
      { headers: h() },
    );
    if (r.ok) setHabs(await r.json());
  }, [api, hotelId]);

  useEffect(() => {
    cargarHoteles();
  }, [cargarHoteles]);

  // Garantiza que siempre haya un hotel seleccionado cuando hay hoteles cargados
  useEffect(() => {
    if (hoteles.length > 0) {
      const valido = hoteles.some((x) => x.id === hotelId);
      if (!valido) setHotelId(hoteles[0].id);
    }
  }, [hoteles, hotelId]);
  useEffect(() => {
    if (hotelId) {
      cargarTipos();
      cargarHabs();
    }
  }, [hotelId, cargarTipos, cargarHabs]);

  const hotelActual = hoteles.find((x) => x.id === hotelId);
  const nombreTipo = (id: string) =>
    tipos.find((t) => t.id === id)?.nombre ?? "—";

  if (cargando)
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-7 h-7 animate-spin text-slate-300" />
      </div>
    );

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8">
      {toast && (
        <div
          className={`fixed top-6 right-6 z-[60] flex items-center gap-2 px-5 py-3 rounded-xl shadow-xl text-sm font-medium text-white ${toast.ok ? "bg-slate-900" : "bg-rose-600"}`}
        >
          {toast.ok ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <X className="w-4 h-4" />
          )}{" "}
          {toast.msg}
        </div>
      )}

      {/* Encabezado */}
      <div className="mb-8">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-[0.15em] mb-1">
          Configuración
        </p>
        <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
          Propiedades y habitaciones
        </h1>
        <p className="text-slate-500 mt-1">
          Da de alta los hoteles de tu cadena, sus tipos de habitación y las
          habitaciones.
        </p>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {[
          { k: "hoteles" as Tab, label: "Propiedades", icon: Building2 },
          { k: "tipos" as Tab, label: "Tipos de habitación", icon: Layers },
          { k: "habitaciones" as Tab, label: "Habitaciones", icon: LayoutGrid },
          { k: "dotacion" as Tab, label: "Dotación de insumos", icon: Package },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.k ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Selector de hotel (para tipos y habitaciones) */}
      {tab !== "hoteles" && (
        <div className="flex items-center gap-2 mb-5">
          <span className="text-sm text-slate-500">Propiedad:</span>
          {hoteles.length === 0 ? (
            <span className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
              Primero crea una propiedad en la pestaña "Propiedades".
            </span>
          ) : (
            <select
              value={hotelId}
              onChange={(e) => setHotelId(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              {hoteles.map((ho) => (
                <option key={ho.id} value={ho.id}>
                  {ho.nombre}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* ─── TAB HOTELES ─── */}
      {tab === "hoteles" && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => {
                setHotelEdit(null);
                setModalHotel(true);
              }}
              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-800"
            >
              <Plus className="w-4 h-4" /> Nueva propiedad
            </button>
          </div>
          {hoteles.length === 0 ? (
            <EmptyState
              icon={Hotel}
              titulo="Sin propiedades"
              texto="Crea tu primer hotel para empezar."
            />
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {hoteles.map((ho) => (
                <div
                  key={ho.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
                      <Hotel className="w-5 h-5 text-white" />
                    </div>
                    <button
                      onClick={() => {
                        setHotelEdit(ho);
                        setModalHotel(true);
                      }}
                      className="p-2 text-slate-300 hover:text-slate-700 hover:bg-slate-50 rounded-lg"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                  <h3 className="font-semibold text-slate-900">{ho.nombre}</h3>
                  {ho.ciudad && (
                    <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" /> {ho.ciudad}
                    </p>
                  )}
                  {ho.telefono && (
                    <p className="text-sm text-slate-400 mt-0.5">
                      {ho.telefono}
                    </p>
                  )}
                  {!ho.almacenId && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      <Package className="w-3 h-3" /> Sin almacén asignado
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB TIPOS ─── */}
      {tab === "tipos" && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setModalTipo(true)}
              disabled={!hotelId}
              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Nuevo tipo
            </button>
          </div>
          {tipos.length === 0 ? (
            <EmptyState
              icon={Layers}
              titulo="Sin tipos de habitación"
              texto="Define tipos como Sencilla, Doble o Suite con su tarifa."
            />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tipos.map((t) => (
                <div
                  key={t.id}
                  className="bg-white border border-slate-200 rounded-2xl p-5"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-slate-900">{t.nombre}</h3>
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                      {t.capacidad} pers.
                    </span>
                  </div>
                  <p className="text-2xl font-semibold text-slate-900 tabular-nums">
                    ${Number(t.tarifaBase).toLocaleString()}
                    <span className="text-sm font-normal text-slate-400">
                      {" "}
                      /noche
                    </span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB HABITACIONES ─── */}
      {tab === "habitaciones" && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setModalHab(true)}
              disabled={!hotelId || tipos.length === 0}
              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Agregar habitaciones
            </button>
          </div>
          {tipos.length === 0 ? (
            <EmptyState
              icon={LayoutGrid}
              titulo="Primero crea tipos de habitación"
              texto="Necesitas al menos un tipo antes de agregar habitaciones."
            />
          ) : habs.length === 0 ? (
            <EmptyState
              icon={LayoutGrid}
              titulo="Sin habitaciones"
              texto="Agrega habitaciones individuales o por lote (ej. 101 a 110)."
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400 font-semibold">
                    <th className="px-5 py-3 text-left">Número</th>
                    <th className="px-5 py-3 text-left">Tipo</th>
                    <th className="px-5 py-3 text-left">Piso</th>
                    <th className="px-5 py-3 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {habs.map((hb) => (
                    <tr key={hb.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-semibold text-slate-900 tabular-nums">
                        {hb.numero}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {nombreTipo(hb.tipoHabitacionId)}
                      </td>
                      <td className="px-5 py-3 text-slate-500">
                        {hb.piso ?? "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs text-slate-500">
                          {hb.estado}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB DOTACIÓN ─── */}
      {tab === "dotacion" &&
        (hoteles.length === 0 ? (
          <EmptyState
            icon={Package}
            titulo="Primero crea una propiedad"
            texto="Necesitas un hotel y sus tipos de habitación."
          />
        ) : (
          <DotacionInsumos api={api} h={h} hotelId={hotelId} tipos={tipos} />
        ))}

      {/* Modales */}
      {modalHotel && (
        <ModalHotel
          api={api}
          h={h}
          hotel={hotelEdit}
          onClose={() => {
            setModalHotel(false);
            setHotelEdit(null);
          }}
          onOk={() => {
            setModalHotel(false);
            setHotelEdit(null);
            cargarHoteles();
            mostrar(hotelEdit ? "Propiedad actualizada" : "Propiedad creada");
          }}
        />
      )}
      {modalTipo && (
        <ModalTipo
          api={api}
          h={h}
          hotelId={hotelId}
          onClose={() => setModalTipo(false)}
          onOk={() => {
            setModalTipo(false);
            cargarTipos();
            mostrar("Tipo creado");
          }}
        />
      )}
      {modalHab && (
        <ModalHab
          api={api}
          h={h}
          hotelId={hotelId}
          tipos={tipos}
          onClose={() => setModalHab(false)}
          onOk={(n: number) => {
            setModalHab(false);
            cargarHabs();
            mostrar(`${n} habitación(es) creada(s)`);
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, titulo, texto }: any) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
      <Icon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
      <p className="font-semibold text-slate-700">{titulo}</p>
      <p className="text-sm text-slate-400 mt-1">{texto}</p>
    </div>
  );
}

// ── MODAL HOTEL ──
function ModalHotel({ api, h, hotel, onClose, onOk }: any) {
  const esEdicion = !!hotel;
  const [f, setF] = useState({
    nombre: hotel?.nombre ?? "",
    ciudad: hotel?.ciudad ?? "",
    direccion: hotel?.direccion ?? "",
    telefono: hotel?.telefono ?? "",
    almacenId: hotel?.almacenId ?? "",
    horaCheckIn: hotel?.horaCheckIn ?? "15:00",
    horaCheckOut: hotel?.horaCheckOut ?? "12:00",
    zonaHoraria: hotel?.zonaHoraria ?? "America/Mexico_City",
    moneda: hotel?.moneda ?? "MXN",
    tasaIva: Number(hotel?.tasaIva ?? 16),
    tasaImpuestoHospedaje: Number(hotel?.tasaImpuestoHospedaje ?? 0),
    preciosIncluyenImpuestos: hotel?.preciosIncluyenImpuestos ?? true,
    exigirInventarioDotacion: hotel?.exigirInventarioDotacion ?? true,
    permitirSobreventa: hotel?.permitirSobreventa ?? false,
    politicaCancelacion: hotel?.politicaCancelacion ?? "",
    avisoPrivacidad: hotel?.avisoPrivacidad ?? "",
  });
  const [almacenes, setAlmacenes] = useState<any[]>([]);
  const [sinAlmacenes, setSinAlmacenes] = useState("");
  const [g, setG] = useState(false);
  const [err, setErr] = useState("");

  /*
    El catalogo completo de almacenes pertenece a Inventario y hoteleria no lo
    tiene. Al pedirlo, el 403 se convertia en lista vacia y el selector de
    «Almacen de insumos» quedaba imposible de contestar: sin almacen no se
    puede postear un consumo, y la pantalla no decia por que. Se pide la lista
    corta —solo id y nombre— y, si tampoco se puede, se dice.
  */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${api}/catalogo/almacenes/para-venta`, {
          headers: h(),
        });
        if (r.ok) {
          const lista = await r.json();
          setAlmacenes(lista);
          setSinAlmacenes(
            Array.isArray(lista) && lista.length === 0
              ? "No hay almacenes dados de alta. Inventario debe crear uno antes de poder descontar consumos."
              : "",
          );
          return;
        }
        setSinAlmacenes(
          r.status === 403
            ? "Tu perfil no puede consultar los almacenes. Pide a Inventario o al administrador que asigne el almacen de insumos."
            : "No se pudo consultar la lista de almacenes.",
        );
      } catch {
        setSinAlmacenes("No se pudo consultar la lista de almacenes.");
      }
    })();
  }, []);
  const guardar = async () => {
    if (!f.nombre.trim()) {
      setErr("El nombre es obligatorio");
      return;
    }
    setG(true);
    const url = esEdicion
      ? `${api}/hoteleria/config/hoteles/${hotel.id}`
      : `${api}/hoteleria/config/hoteles`;
    const method = esEdicion ? "PATCH" : "POST";
    const r = await fetch(url, {
      method,
      headers: h(),
      body: JSON.stringify(f),
    });
    if (r.ok) onOk();
    else {
      const d = await r.json().catch(() => null);
      setErr(d?.message || "Error");
    }
    setG(false);
  };
  return (
    <Modal
      titulo={esEdicion ? "Editar propiedad" : "Nueva propiedad"}
      icon={Hotel}
      onClose={onClose}
    >
      {err && <ErrBox>{err}</ErrBox>}
      <Field label="Nombre del hotel">
        <input
          autoFocus
          value={f.nombre}
          onChange={(e) => setF({ ...f, nombre: e.target.value })}
          placeholder="Ej. HYATT Regency Centro"
          className={inp}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ciudad">
          <input
            value={f.ciudad}
            onChange={(e) => setF({ ...f, ciudad: e.target.value })}
            placeholder="CDMX"
            className={inp}
          />
        </Field>
        <Field label="Teléfono">
          <input
            value={f.telefono}
            onChange={(e) => setF({ ...f, telefono: e.target.value })}
            placeholder="Opcional"
            className={inp}
          />
        </Field>
      </div>
      <Field label="Dirección">
        <input
          value={f.direccion}
          onChange={(e) => setF({ ...f, direccion: e.target.value })}
          placeholder="Opcional"
          className={inp}
        />
      </Field>
      <Field label="Almacén de insumos">
        <select
          value={f.almacenId}
          onChange={(e) => setF({ ...f, almacenId: e.target.value })}
          className={inp}
        >
          <option value="">— Seleccionar almacén —</option>
          {almacenes.map((a: any) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
      </Field>
      {sinAlmacenes && (
        <p className="-mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {sinAlmacenes}
        </p>
      )}
      <p className="text-xs text-slate-400 -mt-1">
        De este almacén se descuentan los consumibles y amenidades; los blancos
        reutilizables no se consumen.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hora de check-in">
          <input
            type="time"
            value={f.horaCheckIn}
            onChange={(e) => setF({ ...f, horaCheckIn: e.target.value })}
            className={inp}
          />
        </Field>
        <Field label="Hora de check-out">
          <input
            type="time"
            value={f.horaCheckOut}
            onChange={(e) => setF({ ...f, horaCheckOut: e.target.value })}
            className={inp}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Zona horaria">
          <select
            value={f.zonaHoraria}
            onChange={(e) => setF({ ...f, zonaHoraria: e.target.value })}
            className={inp}
          >
            <option value="America/Mexico_City">Centro de México</option>
            <option value="America/Merida">Sureste</option>
            <option value="America/Cancun">Quintana Roo</option>
            <option value="America/Monterrey">Noreste</option>
            <option value="America/Tijuana">Noroeste</option>
          </select>
        </Field>
        <Field label="Moneda">
          <select
            value={f.moneda}
            onChange={(e) => setF({ ...f, moneda: e.target.value })}
            className={inp}
          >
            <option>MXN</option>
            <option>USD</option>
            <option>EUR</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="IVA (%)">
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={f.tasaIva}
            onChange={(e) => setF({ ...f, tasaIva: Number(e.target.value) })}
            className={inp}
          />
        </Field>
        <Field label="Impuesto hospedaje (%)">
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={f.tasaImpuestoHospedaje}
            onChange={(e) =>
              setF({ ...f, tasaImpuestoHospedaje: Number(e.target.value) })
            }
            className={inp}
          />
        </Field>
      </div>
      <div className="space-y-2 rounded-xl bg-slate-50 p-3">
        {(
          [
            ["preciosIncluyenImpuestos", "Las tarifas ya incluyen impuestos"],
            ["exigirInventarioDotacion", "Exigir inventario de dotación"],
            ["permitirSobreventa", "Permitir sobreventa"],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            className="flex items-center gap-2 text-sm text-slate-700"
          >
            <input
              type="checkbox"
              checked={f[key]}
              onChange={(e) => setF({ ...f, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
      <Field label="Política de cancelación">
        <textarea
          maxLength={1000}
          value={f.politicaCancelacion}
          onChange={(e) => setF({ ...f, politicaCancelacion: e.target.value })}
          className={inp}
          rows={2}
        />
      </Field>
      <Field label="Aviso de privacidad">
        <textarea
          maxLength={1000}
          value={f.avisoPrivacidad}
          onChange={(e) => setF({ ...f, avisoPrivacidad: e.target.value })}
          className={inp}
          rows={2}
        />
      </Field>
      <Acciones onClose={onClose} onOk={guardar} g={g} />
    </Modal>
  );
}

// ── MODAL TIPO ──
function ModalTipo({ api, h, hotelId, onClose, onOk }: any) {
  const [f, setF] = useState({ nombre: "", capacidad: 2, tarifaBase: 0 });
  const [g, setG] = useState(false);
  const [err, setErr] = useState("");
  const guardar = async () => {
    if (!f.nombre.trim()) {
      setErr("El nombre es obligatorio");
      return;
    }
    if (f.tarifaBase <= 0) {
      setErr("La tarifa debe ser mayor a cero");
      return;
    }
    if (!hotelId) {
      setErr("No hay propiedad seleccionada. Cierra y selecciona un hotel.");
      return;
    }
    setG(true);
    const r = await fetch(`${api}/hoteleria/config/tipos`, {
      method: "POST",
      headers: h(),
      body: JSON.stringify({ hotelId, ...f }),
    });
    if (r.ok) onOk();
    else {
      const d = await r.json().catch(() => null);
      setErr(d?.message || "Error");
    }
    setG(false);
  };
  return (
    <Modal titulo="Nuevo tipo de habitación" icon={Layers} onClose={onClose}>
      {err && <ErrBox>{err}</ErrBox>}
      <Field label="Nombre">
        <input
          autoFocus
          value={f.nombre}
          onChange={(e) => setF({ ...f, nombre: e.target.value })}
          placeholder="Ej. Suite, Doble, Sencilla"
          className={inp}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Capacidad (personas)">
          <input
            type="number"
            min={1}
            value={f.capacidad}
            onChange={(e) => setF({ ...f, capacidad: Number(e.target.value) })}
            className={inp}
          />
        </Field>
        <Field label="Tarifa por noche">
          <input
            type="number"
            min={0}
            value={f.tarifaBase}
            onChange={(e) => setF({ ...f, tarifaBase: Number(e.target.value) })}
            className={inp}
          />
        </Field>
      </div>
      <Acciones onClose={onClose} onOk={guardar} g={g} />
    </Modal>
  );
}

// ── MODAL HABITACIONES (individual o lote) ──
function ModalHab({ api, h, hotelId, tipos, onClose, onOk }: any) {
  const [modo, setModo] = useState<"individual" | "lote">("lote");
  const [f, setF] = useState({
    tipoHabitacionId: "",
    numero: "",
    piso: 1,
    desde: 101,
    hasta: 110,
  });
  const [g, setG] = useState(false);
  const [err, setErr] = useState("");
  const guardar = async () => {
    if (!f.tipoHabitacionId) {
      setErr("Selecciona un tipo");
      return;
    }
    if (!hotelId) {
      setErr("No hay propiedad seleccionada. Cierra y selecciona un hotel.");
      return;
    }
    setG(true);
    try {
      if (modo === "individual") {
        if (!f.numero.trim()) {
          setErr("Indica el número");
          setG(false);
          return;
        }
        const r = await fetch(`${api}/hoteleria/config/habitaciones`, {
          method: "POST",
          headers: h(),
          body: JSON.stringify({
            hotelId,
            tipoHabitacionId: f.tipoHabitacionId,
            numero: f.numero,
            piso: f.piso,
          }),
        });
        if (r.ok) onOk(1);
        else {
          const d = await r.json().catch(() => null);
          setErr(d?.message || "Error");
        }
      } else {
        if (f.hasta < f.desde) {
          setErr("El rango es inválido");
          setG(false);
          return;
        }
        const r = await fetch(`${api}/hoteleria/config/habitaciones/lote`, {
          method: "POST",
          headers: h(),
          body: JSON.stringify({
            hotelId,
            tipoHabitacionId: f.tipoHabitacionId,
            piso: f.piso,
            desde: f.desde,
            hasta: f.hasta,
          }),
        });
        if (r.ok) {
          const d = await r.json();
          onOk(d.creadas ?? 0);
        } else {
          const d = await r.json().catch(() => null);
          setErr(d?.message || "Error");
        }
      }
    } catch {
      setErr("Error de conexión");
    }
    setG(false);
  };
  return (
    <Modal titulo="Agregar habitaciones" icon={LayoutGrid} onClose={onClose}>
      {err && <ErrBox>{err}</ErrBox>}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setModo("lote")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${modo === "lote" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          Por lote
        </button>
        <button
          onClick={() => setModo("individual")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium ${modo === "individual" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          Individual
        </button>
      </div>
      <Field label="Tipo de habitación">
        <select
          value={f.tipoHabitacionId}
          onChange={(e) => setF({ ...f, tipoHabitacionId: e.target.value })}
          className={inp}
        >
          <option value="">— Seleccionar —</option>
          {tipos.map((t: ITipo) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
      </Field>
      {modo === "individual" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Número">
            <input
              value={f.numero}
              onChange={(e) => setF({ ...f, numero: e.target.value })}
              placeholder="101"
              className={inp}
            />
          </Field>
          <Field label="Piso">
            <input
              type="number"
              value={f.piso}
              onChange={(e) => setF({ ...f, piso: Number(e.target.value) })}
              className={inp}
            />
          </Field>
        </div>
      ) : (
        <>
          <Field label="Piso">
            <input
              type="number"
              value={f.piso}
              onChange={(e) => setF({ ...f, piso: Number(e.target.value) })}
              className={inp}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desde">
              <input
                type="number"
                value={f.desde}
                onChange={(e) => setF({ ...f, desde: Number(e.target.value) })}
                className={inp}
              />
            </Field>
            <Field label="Hasta">
              <input
                type="number"
                value={f.hasta}
                onChange={(e) => setF({ ...f, hasta: Number(e.target.value) })}
                className={inp}
              />
            </Field>
          </div>
          <p className="text-xs text-slate-400">
            Se crearán las habitaciones {f.desde} a {f.hasta} (
            {Math.max(0, f.hasta - f.desde + 1)} en total).
          </p>
        </>
      )}
      <Acciones onClose={onClose} onOk={guardar} g={g} />
    </Modal>
  );
}

// ── Helpers UI ──
const inp =
  "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:bg-white";
function Modal({ titulo, icon: Icon, onClose, children }: any) {
  return (
    <div
      className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[70] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Icon className="w-5 h-5 text-slate-400" /> {titulo}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">{children}</div>
      </div>
    </div>
  );
}
function Field({ label, children }: any) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
function ErrBox({ children }: any) {
  return (
    <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-700">
      {children}
    </div>
  );
}
function Acciones({ onClose, onOk, g }: any) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button
        onClick={onClose}
        className="px-4 py-2 text-sm text-slate-600 font-medium hover:bg-slate-100 rounded-lg"
      >
        Cancelar
      </button>
      <button
        onClick={onOk}
        disabled={g}
        className="px-4 py-2 text-sm bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 flex items-center gap-2 disabled:opacity-60"
      >
        {g ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <CheckCircle2 className="w-4 h-4" />
        )}{" "}
        Guardar
      </button>
    </div>
  );
}
interface ITipo {
  id: string;
  nombre: string;
  capacidad: number;
  tarifaBase: number;
}
