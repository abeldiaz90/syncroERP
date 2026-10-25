"use client";

/**
 * ============================================================================
 * EL PROVEEDOR DE IDIOMA
 * ----------------------------------------------------------------------------
 * Aquí vivía el diccionario: 26 palabras escritas a mano dentro del archivo del
 * proveedor. Ahora vive en `lib/traducciones/`, generado, y la razón de todo
 * está en `lib/idioma.ts`.
 *
 * Lo que este archivo añade a `traducir`:
 *
 *  · EL IDIOMA DE QUIEN MIRA, con tres fuentes y en este orden: la cookie —que
 *    es la única que el servidor también lee—, el `localStorage` y la
 *    preferencia guardada en el servidor. La del servidor gana cuando llega,
 *    porque es la que la persona eligió en otra computadora.
 *
 *  · LA COOKIE SE ESCRIBE SIEMPRE. Sin ella, las diez pantallas de servidor del
 *    ERP se quedan en español aunque el selector diga inglés. No es `httpOnly`
 *    a propósito: el cliente también la lee, y no hay nada reservado en saber
 *    en qué idioma mira alguien.
 *
 *  · `t` RECIBE DATOS. `t('Faltan {n}', { n: 3 })` en vez de interpolar en la
 *    llamada: una frase ya interpolada no se puede traducir, porque el orden de
 *    las palabras no es el mismo en los dos idiomas.
 * ============================================================================
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, token } from '@/lib/api';
import {
  COOKIE_IDIOMA,
  IDIOMA_POR_OMISION,
  esIdioma,
  idiomaDeCookies,
  traducir,
  type DatosDeTexto,
  type Idioma,
} from '@/lib/idioma';

export type { Idioma };

/*
 * LA FIRMA DE `t`, CON LAS DOS FORMAS QUE DE VERDAD SE USAN.
 *
 * Una cadena entra y sale cadena —lo que necesita un `title=`—; cualquier otra
 * cosa sale tal como entró. El texto de pantalla llega a menudo de datos
 * opcionales (`cliente?.nombre`), y prometer `string` obligaba a ensuciar la
 * llamada con `?? ''`. El porqué completo está en `lib/idioma.ts`.
 */
type Traducir = {
  (texto: string, datos?: DatosDeTexto): string;
  <T>(texto: T, datos?: DatosDeTexto): T;
};

type Contexto = {
  idioma: Idioma;
  cambiarIdioma: (idioma: Idioma) => Promise<void>;
  t: Traducir;
};

const Context = createContext<Contexto>({
  idioma: IDIOMA_POR_OMISION,
  cambiarIdioma: async () => undefined,
  t: ((texto: unknown) => texto) as Traducir,
});

/** Un año. El idioma no es una sesión: es de la persona. */
const UN_ANO = 60 * 60 * 24 * 365;

function escribirCookie(idioma: Idioma) {
  try {
    document.cookie = `${COOKIE_IDIOMA}=${idioma}; path=/; max-age=${UN_ANO}; samesite=lax`;
  } catch {
    /* Sin cookies las pantallas de servidor quedan en español; no es motivo
       para tumbar la aplicación. */
  }
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [idioma, setIdioma] = useState<Idioma>(IDIOMA_POR_OMISION);

  useEffect(() => {
    /*
     * Primero lo que ya está en este navegador, para no pintar un parpadeo en
     * el idioma equivocado; después lo que diga el servidor.
     */
    const deCookie = idiomaDeCookies(
      typeof document === 'undefined' ? null : document.cookie,
    );
    let local: string | null = null;
    try { local = localStorage.getItem(COOKIE_IDIOMA); } catch { local = null; }
    const inicial = esIdioma(local) ? local : deCookie;
    setIdioma(inicial);
    escribirCookie(inicial);

    if (!token.get()) return;
    api
      .get<{ idioma?: string }>('/usuarios/me/preferencias')
      .then((p) => {
        if (!esIdioma(p.idioma)) return;
        setIdioma(p.idioma);
        try { localStorage.setItem(COOKIE_IDIOMA, p.idioma); } catch { /* ignora */ }
        escribirCookie(p.idioma);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    document.documentElement.lang = idioma.slice(0, 2);
  }, [idioma]);

  const cambiarIdioma = useCallback(async (nuevo: Idioma) => {
    setIdioma(nuevo);
    try { localStorage.setItem(COOKIE_IDIOMA, nuevo); } catch { /* ignora */ }
    escribirCookie(nuevo);
    if (token.get()) {
      await api.patch('/usuarios/me/preferencias', { idioma: nuevo }).catch(() => undefined);
    }
  }, []);

  const value = useMemo<Contexto>(
    () => ({
      idioma,
      cambiarIdioma,
      t: ((texto: unknown, datos?: DatosDeTexto) => traducir(texto, idioma, datos)) as Traducir,
    }),
    [idioma, cambiarIdioma],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useI18n = () => useContext(Context);

/**
 * Sólo la función de traducir, para pantallas que no necesitan el resto.
 *
 * Existe porque el codemod envuelve miles de textos y cada pantalla envuelta
 * necesita una línea de enganche: una sola, corta y siempre igual.
 */
export const useT = () => useI18n().t;
