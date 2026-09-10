"use client";

import { useMemo, useState } from 'react';

export type Regla<T> = (valor: T) => string | undefined;
export type Esquema<T extends Record<string, any>> = Partial<{ [K in keyof T]: Regla<T[K]>[] }>;

export const requerido = (mensaje = 'Este campo es obligatorio') => (v: unknown) =>
  v === null || v === undefined || String(v).trim() === '' ? mensaje : undefined;
export const emailValido = (mensaje = 'Captura un correo válido') => (v: unknown) =>
  !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) ? undefined : mensaje;
export const minimo = (n: number, mensaje?: string) => (v: unknown) =>
  Number(v) >= n ? undefined : (mensaje ?? `El valor mínimo es ${n}`);

export function useValidacionEnVivo<T extends Record<string, any>>(inicial: T, esquema: Esquema<T>) {
  const [valores, setValores] = useState<T>(inicial);
  const [tocados, setTocados] = useState<Partial<Record<keyof T, boolean>>>({});
  const errores = useMemo(() => {
    const out: Partial<Record<keyof T, string>> = {};
    for (const k of Object.keys(esquema) as (keyof T)[]) {
      for (const regla of esquema[k] ?? []) {
        const e = regla(valores[k]);
        if (e) { out[k] = e; break; }
      }
    }
    return out;
  }, [valores, esquema]);
  const setCampo = <K extends keyof T>(campo: K, valor: T[K]) => setValores(v => ({ ...v, [campo]: valor }));
  const tocar = (campo: keyof T) => setTocados(t => ({ ...t, [campo]: true }));
  const validarTodo = () => {
    setTocados(Object.keys(esquema).reduce((a, k) => ({ ...a, [k]: true }), {}));
    return Object.keys(errores).length === 0;
  };
  return { valores, setValores, setCampo, tocados, tocar, errores, esValido: Object.keys(errores).length === 0, validarTodo };
}
