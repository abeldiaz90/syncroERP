"use client";
import { useState, useEffect } from "react";
import {
  BookOpen,
  Plus,
  X,
  Hash,
  CheckCircle2,
  AlertCircle,
  Search,
  Info,
  Edit2,
  Power,
} from "lucide-react";
import { PuedeCrear, PuedeEditar } from "@/app/components/ProtectedElement";

interface ICuenta {
  id: string;
  numeroCuenta: string;
  nombre: string;
  codigoAgrupadorSAT: string | null;
  naturaleza: "DEUDORA" | "ACREEDORA";
  tipo:
    | "ACTIVO"
    | "PASIVO"
    | "CAPITAL"
    | "INGRESO"
    | "COSTO"
    | "GASTO"
    | "ORDEN";
  esAfectable: boolean;
  activo: boolean;
  rolSistema: string | null;
}

const TIPO_COLOR: Record<string, string> = {
  ACTIVO: "bg-blue-50 text-blue-700 border-blue-200",
  PASIVO: "bg-rose-50 text-rose-700 border-rose-200",
  CAPITAL: "bg-purple-50 text-purple-700 border-purple-200",
  INGRESO: "bg-emerald-50 text-emerald-700 border-emerald-200",
  COSTO: "bg-amber-50 text-amber-700 border-amber-200",
  GASTO: "bg-slate-100 text-slate-600 border-slate-200",
  ORDEN: "bg-cyan-50 text-cyan-700 border-cyan-200",
};

const GUIA = [
  {
    num: "1xxx",
    label: "Activo",
    ej: "110-01 Caja · 130-01 Inventario · 140-01 Clientes",
  },
  {
    num: "2xxx",
    label: "Pasivo",
    ej: "208-01 IVA Trasladado · 210-01 Proveedores",
  },
  {
    num: "3xxx",
    label: "Capital",
    ej: "301-01 Capital Social · 320-01 Utilidades",
  },
  {
    num: "4xxx",
    label: "Ingreso",
    ej: "401-01 Ventas · 402-01 Devoluciones s/Ventas",
  },
  { num: "5xxx", label: "Costo", ej: "501-01 Costo de Ventas" },
  {
    num: "6xxx",
    label: "Gasto",
    ej: "601-01 Mermas · 610-01 Sueldos · 620-01 Renta",
  },
  {
    num: "8xx",
    label: "Cuentas de orden",
    ej: "Información memorándum sin impacto en balance o resultados",
  },
];

const ROLES_SISTEMA = [
  ["CAJA", "Caja y efectivo"],
  ["CLIENTES_CXC", "Clientes por cobrar"],
  ["INVENTARIO", "Inventario"],
  ["IVA_ACREDITABLE_PAGADO", "IVA acreditable pagado"],
  ["IVA_ACREDITABLE_PENDIENTE", "IVA pendiente de pago"],
  ["IVA_TRASLADADO_COBRADO", "IVA trasladado cobrado"],
  ["IVA_TRASLADADO_NO_COBRADO", "IVA trasladado no cobrado"],
  ["PROVEEDORES", "Proveedores"],
  ["VENTAS", "Ventas"],
  ["INTERESES", "Ingresos por intereses"],
  ["COSTO_VENTAS", "Costo de ventas"],
  ["MERMAS", "Mermas"],
  ["SALDOS_INICIALES", "Saldos iniciales"],
] as const;

const FORM_VACIO = {
  numeroCuenta: "",
  nombre: "",
  codigoAgrupadorSAT: "",
  naturaleza: "DEUDORA",
  tipo: "ACTIVO",
  esAfectable: true,
  rolSistema: "",
};

export default function CuentasContablesPage() {
  const [cuentas, setCuentas] = useState<ICuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [guia, setGuia] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Modal crear/editar
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<ICuenta | null>(null);
  const [form, setForm] = useState<typeof FORM_VACIO>(FORM_VACIO);

  const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  const tok = () => localStorage.getItem("syncro_token") ?? "";
  const toast$ = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const cargar = async () => {
    setCargando(true);
    const r = await fetch(`${api}/finanzas/cuentas-contables`, {
      headers: { Authorization: `Bearer ${tok()}` },
    });
    if (r.ok) setCuentas(await r.json());
    setCargando(false);
  };
  useEffect(() => {
    cargar();
  }, []);

  const abrirCrear = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setModal(true);
  };

  const abrirEditar = (c: ICuenta) => {
    setEditando(c);
    setForm({
      numeroCuenta: c.numeroCuenta,
      nombre: c.nombre,
      codigoAgrupadorSAT: c.codigoAgrupadorSAT ?? "",
      naturaleza: c.naturaleza,
      tipo: c.tipo,
      esAfectable: c.esAfectable,
      rolSistema: c.rolSistema ?? "",
    });
    setModal(true);
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    const url = editando
      ? `${api}/finanzas/cuentas-contables/${editando.id}`
      : `${api}/finanzas/cuentas-contables`;
    const r = await fetch(url, {
      method: editando ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tok()}`,
      },
      body: JSON.stringify({
        ...form,
        codigoAgrupadorSAT: form.codigoAgrupadorSAT || null,
        rolSistema: form.rolSistema || null,
      }),
    });
    setGuardando(false);
    if (r.ok) {
      setModal(false);
      cargar();
      toast$(editando ? "Cuenta actualizada" : "Cuenta creada");
    } else {
      const d = await r.json().catch(() => ({}));
      toast$(
        Array.isArray(d.message) ? d.message[0] : (d.message ?? "Error"),
        false,
      );
    }
  };

  const toggleEstado = async (c: ICuenta) => {
    if (
      !confirm(
        `¿${c.activo ? "Desactivar" : "Activar"} la cuenta ${c.numeroCuenta}?`,
      )
    )
      return;
    const r = await fetch(`${api}/finanzas/cuentas-contables/${c.id}/estado`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tok()}` },
    });
    if (r.ok) {
      cargar();
      toast$(c.activo ? "Cuenta desactivada" : "Cuenta activada");
    } else toast$("Error al cambiar el estado", false);
  };

  const filtradas = cuentas.filter((c) => {
    const q = busqueda.toLowerCase();
    return (
      (!q ||
        c.numeroCuenta.toLowerCase().includes(q) ||
        c.nombre.toLowerCase().includes(q)) &&
      (!filtroTipo || c.tipo === filtroTipo)
    );
  });

  const resumen = [
    "ACTIVO",
    "PASIVO",
    "CAPITAL",
    "INGRESO",
    "COSTO",
    "GASTO",
    "ORDEN",
  ].map((t) => ({
    tipo: t,
    n: cuentas.filter((c) => c.tipo === t).length,
  }));

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto text-slate-800">
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl font-semibold text-white ${toast.ok ? "bg-emerald-600" : "bg-rose-600"}`}
        >
          {toast.ok ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 mb-1">
            Contabilidad
          </p>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-indigo-500" /> Catálogo de Cuentas
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Plan contable de la empresa. Define los "cajones" donde se registran
            todos los movimientos.
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          <button
            onClick={() => setGuia((g) => !g)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 shadow-sm"
          >
            <Info className="w-4 h-4" /> Guía SAT
          </button>
          <PuedeCrear ruta="/api/finanzas/cuentas-contables">
            <button
              onClick={abrirCrear}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 shadow-md"
            >
              <Plus className="w-4 h-4" /> Nueva Cuenta
            </button>
          </PuedeCrear>
        </div>
      </div>

      {/* Guía */}
      {guia && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-6">
          <p className="text-sm font-bold text-indigo-900 mb-3">
            Numeración estándar SAT México — primer dígito define el tipo
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {GUIA.map((g) => (
              <div
                key={g.num}
                className="bg-white rounded-lg p-3 border border-indigo-100"
              >
                <p className="font-mono font-bold text-indigo-700 text-sm">
                  {g.num} — {g.label}
                </p>
                <p className="text-xs text-slate-500 mt-1">{g.ej}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resumen por tipo */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-5">
        {resumen.map((r) => (
          <button
            key={r.tipo}
            onClick={() => setFiltroTipo((f) => (f === r.tipo ? "" : r.tipo))}
            className={`p-3 rounded-xl border text-center transition-all ${
              filtroTipo === r.tipo
                ? TIPO_COLOR[r.tipo] + " ring-2 ring-offset-1 ring-indigo-400"
                : "bg-white border-slate-200 hover:border-slate-300"
            }`}
          >
            <p className="text-xl font-black text-inherit">{r.n}</p>
            <p className="text-[10px] font-bold uppercase mt-0.5 opacity-70">
              {r.tipo}
            </p>
          </button>
        ))}
      </div>

      {/* Buscador */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-4 flex items-center gap-3 shadow-sm">
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por número o nombre..."
          className="flex-1 text-sm bg-transparent outline-none text-slate-800 placeholder-slate-400"
        />
        {filtroTipo && (
          <button
            onClick={() => setFiltroTipo("")}
            className={`text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 ${TIPO_COLOR[filtroTipo]}`}
          >
            {filtroTipo} <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Header oscuro estilo contable */}
        <div className="bg-slate-900 text-white px-6 py-3 flex justify-between items-center">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            Plan de Cuentas
          </p>
          <p className="text-xs text-slate-400">{filtradas.length} cuenta(s)</p>
        </div>

        {cargando ? (
          <div className="p-16 text-center">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Cargando catálogo...</p>
          </div>
        ) : filtradas.length === 0 ? (
          <div className="p-16 text-center">
            <BookOpen className="w-12 h-12 mx-auto mb-3 text-slate-200" />
            <p className="font-semibold text-slate-600">No hay cuentas</p>
            <p className="text-sm text-slate-400 mt-1">
              Crea la primera con "Nueva Cuenta"
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                <th className="px-5 py-3 text-left">Núm.</th>
                <th className="px-5 py-3 text-left">Nombre</th>
                <th className="px-4 py-3 text-center">Tipo</th>
                <th className="px-4 py-3 text-center hidden md:table-cell">
                  Naturaleza
                </th>
                <th className="px-4 py-3 text-center hidden lg:table-cell">
                  Nivel
                </th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtradas.map((c) => (
                <tr
                  key={c.id}
                  className={`hover:bg-slate-50 transition-colors ${!c.activo ? "opacity-50" : ""}`}
                >
                  <td className="px-5 py-3 font-mono font-bold text-indigo-600">
                    {c.numeroCuenta}
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-800">{c.nombre}</p>
                    {c.codigoAgrupadorSAT && (
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        SAT: {c.codigoAgrupadorSAT}
                      </p>
                    )}
                    {c.rolSistema && (
                      <p className="text-[10px] text-indigo-600 font-semibold mt-0.5">
                        Uso automático:{" "}
                        {ROLES_SISTEMA.find(
                          ([rol]) => rol === c.rolSistema,
                        )?.[1] ?? c.rolSistema}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${TIPO_COLOR[c.tipo]}`}
                    >
                      {c.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center hidden md:table-cell">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${c.naturaleza === "DEUDORA" ? "text-blue-600 bg-blue-50" : "text-rose-600 bg-rose-50"}`}
                    >
                      {c.naturaleza}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center hidden lg:table-cell">
                    {c.esAfectable ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        Detalle ✓
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                        Mayor
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.activo ? "text-emerald-700 bg-emerald-50" : "text-slate-500 bg-slate-100"}`}
                    >
                      {c.activo ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <PuedeEditar ruta="/api/finanzas/cuentas-contables/:id">
                        <button
                          onClick={() => abrirEditar(c)}
                          title="Editar"
                          className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </PuedeEditar>
                      <PuedeEditar ruta="/api/finanzas/cuentas-contables/:id/estado">
                        <button
                          onClick={() => toggleEstado(c)}
                          title={c.activo ? "Desactivar" : "Activar"}
                          className={`p-1.5 rounded-lg transition-colors ${c.activo ? "text-slate-400 hover:bg-rose-50 hover:text-rose-500" : "text-emerald-500 hover:bg-emerald-50"}`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </PuedeEditar>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL CREAR / EDITAR */}
      {modal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <h2 className="font-bold flex items-center gap-2">
                <Hash className="w-5 h-5 text-indigo-400" />
                {editando
                  ? `Editar — ${editando.numeroCuenta}`
                  : "Nueva Cuenta Contable"}
              </h2>
              <button
                onClick={() => setModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={guardar} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                    Número *
                  </label>
                  <input
                    required
                    value={form.numeroCuenta}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, numeroCuenta: e.target.value }))
                    }
                    placeholder="110-01"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                    Cód. SAT
                  </label>
                  <input
                    value={form.codigoAgrupadorSAT}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        codigoAgrupadorSAT: e.target.value,
                      }))
                    }
                    placeholder="101.01"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Nombre *
                </label>
                <input
                  required
                  value={form.nombre}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nombre: e.target.value }))
                  }
                  placeholder="Ej. Caja General"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                  Uso automático en el ERP
                </label>
                <select
                  value={form.rolSistema}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, rolSistema: e.target.value }))
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Sin función global</option>
                  {ROLES_SISTEMA.map(([rol, etiqueta]) => (
                    <option key={rol} value={rol}>
                      {etiqueta}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Cada función sólo puede asignarse a una cuenta activa de la
                  empresa.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                    Tipo *
                  </label>
                  <select
                    value={form.tipo}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, tipo: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {[
                      "ACTIVO",
                      "PASIVO",
                      "CAPITAL",
                      "INGRESO",
                      "COSTO",
                      "GASTO",
                      "ORDEN",
                    ].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                    Naturaleza *
                  </label>
                  <select
                    value={form.naturaleza}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, naturaleza: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="DEUDORA">Deudora — se carga (débito)</option>
                    <option value="ACREEDORA">
                      Acreedora — se abona (crédito)
                    </option>
                  </select>
                </div>
              </div>
              <label className="flex items-start gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.esAfectable}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, esAfectable: e.target.checked }))
                  }
                  className="mt-0.5 w-4 h-4 text-indigo-600 rounded"
                />
                <div>
                  <p className="text-sm font-bold text-indigo-900">
                    Cuenta de detalle (afectable)
                  </p>
                  <p className="text-xs text-indigo-700 mt-0.5">
                    Recibe movimientos directos. Desmarca si es una cuenta de
                    mayor (agrupadora).
                  </p>
                </div>
              </label>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  className="flex-1 py-2.5 text-slate-700 font-medium hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                >
                  {guardando ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {guardando
                    ? "Guardando..."
                    : editando
                      ? "Guardar cambios"
                      : "Crear Cuenta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
