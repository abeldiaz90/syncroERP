"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Building2,
  Check,
  CircleAlert,
  FileCheck2,
  Loader2,
  MapPin,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type TipoPersona = "FISICA" | "MORAL";
type Perfil = "GENERAL" | "MIXTO" | "EXENTO" | "FRONTERA";
type Regimen = {
  clave: string;
  nombre: string;
  personas: TipoPersona[];
};
type PerfilInfo = {
  clave: Perfil;
  nombre: string;
  descripcion: string;
  advertencia?: string;
};
type Catalogos = {
  versionCFDI: string;
  ejercicioReferencia: number;
  regimenes: Regimen[];
  perfilesImpuestos: PerfilInfo[];
  aviso: string;
  fuentes: { nombre: string; url: string }[];
};

const PASOS = ["Identidad fiscal", "Impuestos", "Revisión", "Resultado"];

const CUENTAS = [
  ["110-01", "Caja", "101.01"],
  ["111-01", "Bancos", "102.01"],
  ["116-01", "IVA acreditable", "118.01"],
  ["130-01", "Inventario", "115.01"],
  ["140-01", "Clientes", "105.01"],
  ["208-01", "IVA trasladado", "208.01"],
  ["210-01", "Proveedores", "201.01"],
  ["399-01", "Saldos iniciales", "304.01"],
  ["401-01", "Ventas", "401.01"],
  ["402-01", "Intereses", "702.01"],
  ["501-01", "Costo de ventas", "501.01"],
  ["601-01", "Mermas", "601.84"],
];

export default function ConfiguracionInicialPage() {
  const router = useRouter();
  const api =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
    "http://localhost:4000/api";
  const token = () => localStorage.getItem("syncro_token") ?? "";

  const [paso, setPaso] = useState(0);
  const [catalogos, setCatalogos] = useState<Catalogos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<any>(null);
  const [form, setForm] = useState({
    tipoPersona: "MORAL" as TipoPersona,
    rfc: "",
    razonSocial: "",
    regimenFiscal: "",
    codigoPostal: "",
    giro: "",
    perfilImpuestos: "GENERAL" as Perfil,
    confirmaEstimuloFronterizo: false,
    confirmaRevisionConContador: false,
  });

  useEffect(() => {
    const cargar = async () => {
      try {
        const respuesta = await fetch(
          `${api}/cfdi/configuracion-mexico/catalogos`,
          { headers: { Authorization: `Bearer ${token()}` } },
        );
        const datos = await respuesta.json().catch(() => null);
        if (!respuesta.ok) {
          throw new Error(
            datos?.message || "No se pudieron consultar los catálogos fiscales.",
          );
        }
        setCatalogos(datos);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error de conexión.");
      } finally {
        setCargando(false);
      }
    };
    cargar();
  }, [api]);

  const regimenes = useMemo(
    () =>
      catalogos?.regimenes.filter((r) =>
        r.personas.includes(form.tipoPersona),
      ) ?? [],
    [catalogos, form.tipoPersona],
  );

  const cambiarTipoPersona = (tipoPersona: TipoPersona) => {
    const regimenValido = catalogos?.regimenes.find(
      (r) =>
        r.clave === form.regimenFiscal && r.personas.includes(tipoPersona),
    );
    setForm((actual) => ({
      ...actual,
      tipoPersona,
      regimenFiscal: regimenValido ? actual.regimenFiscal : "",
    }));
  };

  const validarPaso = () => {
    setError("");
    if (paso === 0) {
      const longitud = form.tipoPersona === "FISICA" ? 13 : 12;
      if (form.rfc.trim().length !== longitud)
        return `El RFC debe tener ${longitud} caracteres para este tipo de persona.`;
      if (!form.razonSocial.trim())
        return "Escribe el nombre o razón social exactamente como aparece en tu constancia.";
      if (!form.regimenFiscal) return "Selecciona tu régimen fiscal SAT.";
      if (!/^\d{5}$/.test(form.codigoPostal))
        return "El código postal fiscal debe tener 5 dígitos.";
    }
    if (
      paso === 1 &&
      form.perfilImpuestos === "FRONTERA" &&
      !form.confirmaEstimuloFronterizo
    )
      return "Confirma que cumples los requisitos del estímulo para habilitar IVA 8%.";
    if (paso === 2 && !form.confirmaRevisionConContador)
      return "Debes confirmar que cotejaste estos datos antes de aplicarlos.";
    return "";
  };

  const siguiente = () => {
    const mensaje = validarPaso();
    if (mensaje) return setError(mensaje);
    setPaso((actual) => Math.min(actual + 1, 3));
  };

  const aplicar = async () => {
    const mensaje = validarPaso();
    if (mensaje) return setError(mensaje);
    setGuardando(true);
    setError("");
    try {
      const respuesta = await fetch(
        `${api}/cfdi/configuracion-mexico/aplicar`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token()}`,
          },
          body: JSON.stringify({
            ...form,
            rfc: form.rfc.toUpperCase().trim(),
            razonSocial: form.razonSocial.trim(),
          }),
        },
      );
      const datos = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        const detalle = Array.isArray(datos?.message)
          ? datos.message.join(" · ")
          : datos?.message;
        throw new Error(detalle || "No se pudo aplicar la configuración.");
      }
      setResultado(datos);
      setPaso(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión.");
    } finally {
      setGuardando(false);
    }
  };

  if (cargando)
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-500">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin" />
          Consultando catálogos fiscales…
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 font-black text-white">
            S
          </div>
          <div>
            <p className="font-bold text-slate-900">Asistente fiscal México</p>
            <p className="text-xs text-slate-500">
              CFDI {catalogos?.versionCFDI ?? "4.0"} · referencia{" "}
              {catalogos?.ejercicioReferencia ?? 2026}
            </p>
          </div>
          <button
            onClick={() => router.push("/dashboard")}
            className="ml-auto text-sm text-slate-500 hover:text-slate-800"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-7 grid grid-cols-4 gap-2">
          {PASOS.map((nombre, indice) => (
            <div key={nombre}>
              <div
                className={`h-1.5 rounded-full ${
                  indice <= paso ? "bg-indigo-600" : "bg-slate-200"
                }`}
              />
              <p
                className={`mt-2 text-xs font-semibold ${
                  indice === paso ? "text-indigo-700" : "text-slate-400"
                }`}
              >
                {indice + 1}. {nombre}
              </p>
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          {paso === 0 && (
            <div>
              <div className="mb-6 flex items-start gap-3">
                <FileCheck2 className="h-7 w-7 text-indigo-600" />
                <div>
                  <h1 className="text-2xl font-black text-slate-900">
                    Copia tu Constancia de Situación Fiscal
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    No adivines estos datos: deben coincidir carácter por
                    carácter con el documento del SAT.
                  </p>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  Tipo de persona
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(["FISICA", "MORAL"] as TipoPersona[]).map((tipo) => (
                      <button
                        key={tipo}
                        type="button"
                        onClick={() => cambiarTipoPersona(tipo)}
                        className={`rounded-xl border p-3 ${
                          form.tipoPersona === tipo
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                            : "border-slate-200"
                        }`}
                      >
                        Persona {tipo === "FISICA" ? "física" : "moral"}
                      </button>
                    ))}
                  </div>
                </label>
                <Campo
                  etiqueta="RFC"
                  valor={form.rfc}
                  maxLength={form.tipoPersona === "FISICA" ? 13 : 12}
                  onChange={(rfc) =>
                    setForm({ ...form, rfc: rfc.toUpperCase() })
                  }
                  ayuda="Sin espacios ni guiones."
                />
                <Campo
                  etiqueta={
                    form.tipoPersona === "FISICA"
                      ? "Nombre completo"
                      : "Denominación o razón social"
                  }
                  valor={form.razonSocial}
                  onChange={(razonSocial) =>
                    setForm({ ...form, razonSocial })
                  }
                  ayuda="Sin régimen societario si tu constancia no lo incluye."
                />
                <label className="text-sm font-semibold text-slate-700">
                  Régimen fiscal SAT
                  <select
                    value={form.regimenFiscal}
                    onChange={(e) =>
                      setForm({ ...form, regimenFiscal: e.target.value })
                    }
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal"
                  >
                    <option value="">Selecciona la clave de tu constancia</option>
                    {regimenes.map((regimen) => (
                      <option key={regimen.clave} value={regimen.clave}>
                        {regimen.clave} — {regimen.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <Campo
                  etiqueta="Código postal fiscal"
                  valor={form.codigoPostal}
                  maxLength={5}
                  onChange={(codigoPostal) =>
                    setForm({
                      ...form,
                      codigoPostal: codigoPostal.replace(/\D/g, ""),
                    })
                  }
                  ayuda="Es el domicilio fiscal, no necesariamente tu sucursal."
                />
                <Campo
                  etiqueta="Actividad o giro (opcional)"
                  valor={form.giro}
                  onChange={(giro) => setForm({ ...form, giro })}
                  ayuda="Sirve para personalizar ayudas posteriores."
                />
              </div>
            </div>
          )}

          {paso === 1 && (
            <div>
              <div className="mb-6 flex items-start gap-3">
                <Sparkles className="h-7 w-7 text-indigo-600" />
                <div>
                  <h1 className="text-2xl font-black text-slate-900">
                    ¿Cómo se gravan tus operaciones?
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Esto prepara opciones; cada producto debe conservar su
                    tratamiento fiscal correcto.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {catalogos?.perfilesImpuestos.map((perfil) => (
                  <button
                    key={perfil.clave}
                    type="button"
                    onClick={() =>
                      setForm({ ...form, perfilImpuestos: perfil.clave })
                    }
                    className={`rounded-xl border p-4 text-left ${
                      form.perfilImpuestos === perfil.clave
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <p className="font-bold text-slate-900">{perfil.nombre}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {perfil.descripcion}
                    </p>
                    {perfil.advertencia && (
                      <p className="mt-2 text-xs font-semibold text-amber-700">
                        {perfil.advertencia}
                      </p>
                    )}
                  </button>
                ))}
              </div>
              {form.perfilImpuestos === "FRONTERA" && (
                <label className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={form.confirmaEstimuloFronterizo}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        confirmaEstimuloFronterizo: e.target.checked,
                      })
                    }
                  />
                  Confirmo que el contribuyente y las operaciones cumplen los
                  requisitos vigentes del estímulo fronterizo. El ERP no
                  determina por sí solo la elegibilidad.
                </label>
              )}
              <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                El catálogo distinguirá <b>IVA 0%</b>, <b>exento</b> y{" "}
                <b>no objeto</b>. Aunque los tres pueden sumar $0 de IVA, no
                significan lo mismo en un CFDI.
              </div>
            </div>
          )}

          {paso === 2 && (
            <div>
              <div className="mb-6 flex items-start gap-3">
                <ShieldCheck className="h-7 w-7 text-indigo-600" />
                <div>
                  <h1 className="text-2xl font-black text-slate-900">
                    Revisa antes de aplicar
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    El proceso es idempotente: conserva cuentas existentes y
                    completa las que falten.
                  </p>
                </div>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <Resumen titulo="Identidad fiscal" icono={<Building2 />}>
                  <p>{form.razonSocial}</p>
                  <p>{form.rfc}</p>
                  <p>
                    Régimen {form.regimenFiscal} · CP {form.codigoPostal}
                  </p>
                </Resumen>
                <Resumen titulo="Tratamiento inicial" icono={<MapPin />}>
                  <p>
                    {
                      catalogos?.perfilesImpuestos.find(
                        (p) => p.clave === form.perfilImpuestos,
                      )?.nombre
                    }
                  </p>
                  <p>IVA 16%, 0%, exento y no objeto</p>
                  {form.perfilImpuestos === "FRONTERA" && <p>Incluye IVA 8%</p>}
                </Resumen>
              </div>
              <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                <div className="bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800">
                  Plan base con código agrupador SAT
                </div>
                <div className="grid max-h-56 gap-x-5 overflow-auto p-4 md:grid-cols-2">
                  {CUENTAS.map(([numero, nombre, sat]) => (
                    <div
                      key={numero}
                      className="flex border-b border-slate-100 py-2 text-xs"
                    >
                      <span className="w-16 font-mono text-slate-500">
                        {numero}
                      </span>
                      <span className="flex-1 text-slate-700">{nombre}</span>
                      <span className="font-mono text-indigo-600">
                        SAT {sat}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <label className="mt-5 flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={form.confirmaRevisionConContador}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      confirmaRevisionConContador: e.target.checked,
                    })
                  }
                />
                Confirmo que cotejé RFC, razón social, régimen y código postal
                con la Constancia de Situación Fiscal, y que el perfil de
                impuestos fue revisado con quien lleva la contabilidad.
              </label>
            </div>
          )}

          {paso === 3 && resultado && (
            <div className="py-4 text-center">
              <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-emerald-100">
                <BadgeCheck className="h-11 w-11 text-emerald-600" />
              </div>
              <h1 className="text-2xl font-black text-slate-900">
                Configuración fiscal base lista
              </h1>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
                Se prepararon {resultado.cuentas?.creadas ?? 0} cuentas nuevas y{" "}
                {resultado.impuestos?.creados ?? 0} impuestos nuevos. Lo que ya
                existía se conservó y se normalizó.
              </p>
              <div className="mx-auto mt-6 max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900">
                <b>Siguiente requisito para facturar:</b>{" "}
                {resultado.diagnostico?.facturacion?.mensaje}
              </div>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <button
                  onClick={() => router.push("/configuracion-financiera")}
                  className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700"
                >
                  Continuar con Finanzas
                </button>
                <button
                  onClick={() =>
                    router.push("/dashboard/finanzas/cuentas-contables")
                  }
                  className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700"
                >
                  Revisar cuentas
                </button>
              </div>
            </div>
          )}

          {paso === 3 && !resultado && (
            <div className="py-8 text-center">
              <CircleAlert className="mx-auto h-10 w-10 text-amber-500" />
              <p className="mt-3 text-slate-700">
                Aún no se ha aplicado la configuración.
              </p>
            </div>
          )}

          {paso < 3 && (
            <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
              <button
                onClick={() =>
                  paso === 0
                    ? router.push("/dashboard")
                    : setPaso((actual) => actual - 1)
                }
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                <ArrowLeft className="h-4 w-4" /> Atrás
              </button>
              {paso < 2 ? (
                <button
                  onClick={siguiente}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
                >
                  Continuar <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={aplicar}
                  disabled={guardando}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {guardando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Aplicar configuración
                </button>
              )}
            </div>
          )}
        </section>

        <aside className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
          <div className="flex gap-2">
            <BookOpen className="h-4 w-4 shrink-0" />
            <div>
              <p>{catalogos?.aviso}</p>
              <div className="mt-2 flex flex-wrap gap-4">
                {catalogos?.fuentes.map((fuente) => (
                  <a
                    key={fuente.url}
                    href={fuente.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-indigo-600 hover:underline"
                  >
                    {fuente.nombre}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Campo({
  etiqueta,
  valor,
  onChange,
  ayuda,
  maxLength,
}: {
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  ayuda: string;
  maxLength?: number;
}) {
  return (
    <label className="text-sm font-semibold text-slate-700">
      {etiqueta}
      <input
        value={valor}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal outline-none focus:border-indigo-500"
      />
      <span className="mt-1 block text-xs font-normal text-slate-400">
        {ayuda}
      </span>
    </label>
  );
}

function Resumen({
  titulo,
  icono,
  children,
}: {
  titulo: string;
  icono: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="mb-3 flex items-center gap-2 font-bold text-slate-900">
        <span className="text-indigo-600 [&>svg]:h-5 [&>svg]:w-5">
          {icono}
        </span>
        {titulo}
      </div>
      <div className="space-y-1 text-sm text-slate-600">{children}</div>
    </div>
  );
}
