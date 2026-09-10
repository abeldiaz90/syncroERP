"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, token } from "@/lib/api";

export type Idioma = "es-MX" | "en-US";
const EN: Record<string, string> = {
  "Panel principal": "Main dashboard", "Panel": "Dashboard", "Buscar": "Search",
  "Contraer menú": "Collapse menu", "Cerrar sesión": "Sign out", "acceso total": "full access",
  "Configuración": "Settings", "Compras": "Purchasing", "Ventas": "Sales",
  "Finanzas": "Finance", "Recursos Humanos": "Human Resources", "Nómina": "Payroll",
  "Inventario": "Inventory", "Almacenes": "Warehouses", "Productos": "Products",
  "Clientes": "Customers", "Proveedores": "Vendors", "Reportes": "Reports",
  "Usuarios": "Users", "Aprobaciones": "Approvals", "Puestos": "Positions",
  "Empleados": "Employees", "Configuración general": "General settings",
  "Preparando tu espacio de trabajo…": "Preparing your workspace…",
};

type Contexto = { idioma: Idioma; cambiarIdioma: (idioma: Idioma) => Promise<void>; t: (texto: string) => string };
const Context = createContext<Contexto>({ idioma: "es-MX", cambiarIdioma: async () => undefined, t: (x) => x });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [idioma, setIdioma] = useState<Idioma>("es-MX");
  useEffect(() => {
    const local = localStorage.getItem("syncro_idioma") as Idioma | null;
    if (local === "en-US" || local === "es-MX") setIdioma(local);
    if (!token.get()) return;
    api.get<{ idioma?: Idioma }>("/usuarios/me/preferencias").then((p) => {
      if (p.idioma) { setIdioma(p.idioma); localStorage.setItem("syncro_idioma", p.idioma); }
    }).catch(() => undefined);
  }, []);
  useEffect(() => { document.documentElement.lang = idioma.substring(0, 2); }, [idioma]);
  const value = useMemo<Contexto>(() => ({
    idioma,
    cambiarIdioma: async (nuevo) => {
      setIdioma(nuevo); localStorage.setItem("syncro_idioma", nuevo);
      if (token.get()) await api.patch("/usuarios/me/preferencias", { idioma: nuevo }).catch(() => undefined);
    },
    t: (texto) => idioma === "en-US" ? EN[texto] ?? texto : texto,
  }), [idioma]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useI18n = () => useContext(Context);
