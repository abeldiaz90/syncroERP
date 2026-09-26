import {
  MODULOS_ASIGNABLES,
  MODULOS_POR_ID,
  moduloDeRuta,
} from './modulos-catalogo';
import { PLANTILLAS_PERMISOS } from './plantillas-permisos';

/**
 * ============================================================================
 * Ningún módulo se queda sin dueño
 * ----------------------------------------------------------------------------
 * QUÉ PASÓ
 *
 * CRM —prospectos, oportunidades, pipeline y agenda comercial— sólo lo tenían
 * gerencia y dirección, y en CONSULTA. Las tres pantallas estaban ahí, salían
 * en el menú de esos dos roles, y cada botón que escribe algo —«Nueva
 * oportunidad», «Registrar actividad», mover una etapa— contestaba 403 a todo
 * el mundo. Un módulo entero del ERP que ningún puesto podía trabajar.
 *
 * Nadie lo reportó porque nadie lo intentó: para descubrirlo hay que entrar
 * con cada rol y pulsar. Por API tampoco se ve —el 403 es correcto—, y las
 * pruebas de permisos comprobaban que cada rol tuviera lo suyo, no que lo de
 * alguien fuera de alguien.
 *
 * LA REGLA
 *
 * Un módulo que ninguna plantilla concede en PLENO es una función que el
 * sistema ofrece y nadie puede usar. O se le da dueño, o se retira del
 * producto; lo que no puede es quedarse a medias, enseñándose en un menú y
 * negándose al pulsarlo.
 *
 * `modulosConsulta` no cuenta: da lecturas, y un módulo del que sólo se puede
 * leer es exactamente el caso que se está corrigiendo.
 * ============================================================================
 */

/*
 * La excepción, con su motivo.
 *
 * · «administracion» —usuarios, permisos, configuración, bitácora y RPA— es
 *   del ADMINISTRADOR, que no lleva plantilla porque lleva `*`. Que ningún
 *   puesto de negocio lo tenga es justo lo que se quiere.
 */
const SIN_DUENO_A_PROPOSITO = ['administracion'];

describe('Permisos · ningún módulo se queda sin dueño', () => {
  const conPleno = new Set(
    PLANTILLAS_PERMISOS.flatMap((p) => p.modulos ?? []),
  );
  const conConsulta = new Set(
    PLANTILLAS_PERMISOS.flatMap((p) => p.modulosConsulta ?? []),
  );

  /*
   * Un módulo también tiene dueño cuando su trabajo se concede por ACCIÓN: hay
   * módulos —la integración con el core, sin ir más lejos— que nadie recibe
   * enteros y cuyas escrituras se reparten una a una entre quienes las firman.
   */
  const conEscrituraDeclarada = new Set(
    PLANTILLAS_PERMISOS.flatMap((p) => p.accionesIrrenunciables ?? [])
      .filter((accion) => /^(POST|PATCH|PUT|DELETE) /.test(accion))
      .map((accion) => moduloDeRuta(accion.split(' ')[1])),
  );

  it('cada módulo del catálogo lo trabaja al menos un rol', () => {
    const huerfanos = MODULOS_ASIGNABLES.filter(
      (id) =>
        !conPleno.has(id) &&
        !conEscrituraDeclarada.has(id) &&
        !SIN_DUENO_A_PROPOSITO.includes(id),
    ).map((id) => `${id} (${MODULOS_POR_ID.get(id)?.nombre ?? id})`);

    expect(huerfanos.sort()).toEqual([]);
  });

  it('las excepciones siguen siendo excepciones de verdad', () => {
    /* Si a «administracion» le sale dueño, sobra de la lista. */
    const sobrantes = SIN_DUENO_A_PROPOSITO.filter((id) => conPleno.has(id));
    expect(sobrantes).toEqual([]);
  });

  it('las plantillas no nombran módulos que no existen', () => {
    const conocidos = new Set(MODULOS_ASIGNABLES);
    const inventados = [...conPleno, ...conConsulta].filter(
      (id) => !conocidos.has(id),
    );
    expect([...new Set(inventados)].sort()).toEqual([]);
  });

  it('el CRM tiene dueño y no sólo espectadores', () => {
    const duenos = PLANTILLAS_PERMISOS.filter((p) =>
      (p.modulos ?? []).includes('crm'),
    ).map((p) => p.rol);
    expect(duenos.length).toBeGreaterThan(0);
  });
});
