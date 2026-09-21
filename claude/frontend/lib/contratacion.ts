"use client";

/**
 * ============================================================================
 * Qué tiene contratado esta empresa
 * ----------------------------------------------------------------------------
 * La interfaz enseñaba el core a todo el mundo: el enlace a Fineract en el
 * menú y la pestaña de correspondencia de roles salían igual para una empresa
 * que solo usa el ERP. Eso no es un adorno de más, es prometer un módulo que
 * no se compró — y en la pantalla de roles, invitar a mapear roles contra un
 * registro que esa empresa no tiene.
 *
 * Aquí se pregunta una vez y se reparte. Tres estados, no dos: mientras no se
 * sabe (`undefined`) no se enseña ni se oculta nada definitivamente, porque
 * hacer parpadear un enlace que aparece y desaparece es peor que tardar medio
 * segundo.
 *
 * NO se cachea entre recargas a propósito. El plan se cambia desde la consola
 * de SUMA y tiene que notarse al recargar: un plan cacheado es un cliente que
 * paga un módulo y no lo ve.
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import { api, intentar } from '@/lib/api';

export interface Contratacion {
  usaRegistroExterno: boolean;
  cartera: string;
  contabilidad: string;
}

export function useContratacion(): Contratacion | undefined {
  const [plan, setPlan] = useState<Contratacion | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    void intentar(
      api.get<Contratacion>('/integracion/contratacion'),
      // Si no se pudo preguntar, lo prudente es el plan más pequeño: enseñar de
      // menos molesta; enseñar de más manda a alguien a una pantalla que va a
      // contestarle que no le corresponde.
      { usaRegistroExterno: false, cartera: 'APAGADO', contabilidad: 'APAGADO' },
    ).then((p) => {
      if (vivo) setPlan(p);
    });
    return () => { vivo = false; };
  }, []);

  return plan;
}
