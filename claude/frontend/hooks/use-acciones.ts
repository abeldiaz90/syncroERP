"use client";
/**
 * ============================================================================
 * ¿Puedo pulsar este botón?
 * ----------------------------------------------------------------------------
 * `use-permisos` contesta a qué PANTALLAS puede entrar quien está dentro. Esto
 * contesta la otra pregunta, que no es la misma: cuáles de los BOTONES de esa
 * pantalla puede pulsar. Una pantalla se concede entera; sus acciones no.
 *
 * Medido el 28-sep-2026 con la sesión de gerencia: la pantalla de
 * transferencias ofrecía «Enviar» sobre una transferencia autorizada y el
 * servidor contestaba 403, porque enviar la mercancía es el acto físico del
 * almacén de origen —del almacenista— mientras que autorizar y recibir son la
 * firma de supervisión. El reparto es correcto y sostiene el control de cuatro
 * ojos; lo que estaba mal era ofrecer un botón que siempre contesta que no.
 *
 * Las acciones se piden UNA vez por sesión y se guardan en memoria: son las de
 * un rol, no cambian mientras dure la sesión, y pedirlas por pantalla sería
 * una llamada por cada montaje para la misma respuesta.
 * ============================================================================
 */

import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

/** El administrador llega con esto y puede todo. */
const COMODIN = '*';

let cache: Promise<string[]> | null = null;

function pedirAcciones(): Promise<string[]> {
  if (!cache) {
    cache = api
      .get<{ acciones?: string[] }>('/admin/permisos/mis-acciones')
      .then((r) => (Array.isArray(r?.acciones) ? r.acciones : []))
      .catch(() => {
        /*
         * Si no se puede preguntar, NO se esconde nada. Es deliberado: ocultar
         * botones por una llamada fallida dejaría a alguien mirando una
         * pantalla mutilada sin saber por qué, y el servidor sigue siendo
         * quien decide de verdad. Un 403 explicado es mejor que un botón que
         * desapareció en silencio.
         */
        cache = null;
        return [COMODIN];
      });
  }
  return cache;
}

/**
 * Devuelve una función que dice si la sesión tiene concedida una acción,
 * escrita como el servidor la nombra: `'PATCH /catalogo/wms/transferencias/:id/enviar'`.
 *
 * Mientras la respuesta no ha llegado devuelve `true`, por lo mismo de arriba:
 * no se parpadea escondiendo botones que sí están.
 */
export function useAcciones(): (accion: string) => boolean {
  const [acciones, setAcciones] = useState<string[] | null>(null);

  useEffect(() => {
    let vivo = true;
    void pedirAcciones().then((a) => {
      if (vivo) setAcciones(a);
    });
    return () => {
      vivo = false;
    };
  }, []);

  return (accion: string) => {
    if (acciones === null) return true;
    if (acciones.includes(COMODIN)) return true;
    return acciones.includes(accion);
  };
}
