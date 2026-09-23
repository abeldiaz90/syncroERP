/**
 * ============================================================================
 * SyncroERP · Nómina — quién firma qué
 * ----------------------------------------------------------------------------
 * La nómina no la hace un rol: la hace una cadena. RRHH prepara, Tesorería
 * dispersa y paga, Finanzas y Contabilidad cierran y contabilizan. Esa
 * separación es deliberada y es lo que impide que la misma persona capture un
 * empleado, se autorice el pago y lo mande al banco.
 *
 * El problema no era la regla: era dónde estaba escrita. Vivía en quince
 * llamadas a `exigirRol(usuario.rol, ['admin', 'tesoreria'], '…')` dentro del
 * servicio, con la lista de roles a mano en cada una. Ningún guardia la veía,
 * la tabla de permisos no la conocía, y `GET /auth/mis-permisos` —de donde la
 * interfaz saca qué botones pintar— decía que sí a cosas que el servicio
 * negaba después.
 *
 * Se notó operando: Recursos Humanos entra a «Configuración patronal», llena
 * el formulario, pulsa guardar y recibe un 403; y sin esa configuración la
 * nómina no se puede calcular. El módulo era un callejón sin salida para el
 * rol que lo opera, y la pantalla no decía a quién había que pedírselo.
 *
 * Aquí la regla se escribe UNA vez. La usan los dos lados:
 *
 *  · el controlador, con `@Roles(...FIRMAS_NOMINA.x.roles)`, para que
 *    `RolesGuard` la aplique en la puerta y para que el descubrimiento de
 *    permisos la vea —así la tabla no puede encender lo que el guardia apaga,
 *    y la interfaz se entera a tiempo de esconder el botón;
 *  · el servicio, con `exigirRol(rol, FIRMAS_NOMINA.x)`, que sigue cuidando la
 *    puerta de atrás: un método invocado desde una tarea o desde otro servicio
 *    no pasa por el guardia.
 *
 * Dos sitios que la aplican, uno solo que la define. Si mañana Tesorería deja
 * de conciliar, se cambia una línea y cambian los tres comportamientos.
 * ============================================================================
 */

/** Los seis nombres del administrador los resuelve `esRolAdministrador`. */
const ADMIN = 'admin';
const RRHH = ['rrhh', 'recursos humanos', 'recursoshumanos'] as const;

export interface Firma {
  /** Roles que pueden ejecutarla, además del administrador. */
  readonly roles: readonly string[];
  /** Cómo se nombra en el mensaje de error, en infinitivo. */
  readonly accion: string;
  /** A quién dirigir a quien no puede, en la pantalla. */
  readonly dueño: string;
}

const firma = (
  roles: readonly string[],
  accion: string,
  dueño: string,
): Firma => ({ roles: [ADMIN, ...roles], accion, dueño });

export const FIRMAS_NOMINA = {
  /* ── Lo que prepara Recursos humanos ──────────────────────────────────── */
  asignarConceptos: firma(RRHH, 'asignar conceptos de nómina', 'Recursos humanos'),
  prepararAprobacion: firma(RRHH, 'preparar la aprobación', 'Recursos humanos'),
  prepararCfdi: firma(RRHH, 'preparar CFDI de nómina', 'Recursos humanos'),
  capturarCuentaBancaria: firma(
    [...RRHH, 'tesoreria'],
    'capturar cuentas bancarias',
    'Recursos humanos o Tesorería',
  ),
  modificarCuentaBancaria: firma(
    [...RRHH, 'tesoreria'],
    'modificar cuentas bancarias',
    'Recursos humanos o Tesorería',
  ),
  registrarPrestamo: firma(
    [...RRHH, 'finanzas'],
    'registrar préstamos',
    'Recursos humanos o Finanzas',
  ),
  registrarObligacion: firma(
    [...RRHH, 'finanzas'],
    'registrar obligaciones',
    'Recursos humanos o Finanzas',
  ),

  /* ── Lo que mueve el dinero: Tesorería ────────────────────────────────── */
  /*
   * Dispersar es pagar, y pagar es de Tesorería. La lista anterior incluía a
   * Finanzas; se quitó por dos razones que apuntan al mismo sitio. La primera
   * es la regla que ya rige en compras: quien compra no paga, quien recibe no
   * paga, paga Tesorería contra lo que otro dio por bueno. La segunda es que
   * el archivo de dispersión trae el neto y la CLABE de cada empleado, y a
   * Finanzas se le dejó fuera de la plantilla a propósito: aprueba el
   * presupuesto de un puesto sin ver quién lo ocupa ni cuánto gana.
   *
   * Es una decisión de política, no una restricción técnica: si la empresa
   * quiere que Finanzas también disperse, se añade aquí y las tres capas se
   * enteran solas.
   */
  generarDispersion: firma(['tesoreria'], 'generar dispersión', 'Tesorería'),
  marcarDispersionEnviada: firma(
    ['tesoreria'],
    'marcar una dispersión como enviada',
    'Tesorería',
  ),
  conciliarDispersion: firma(['tesoreria'], 'conciliar dispersión', 'Tesorería'),
  registrarPago: firma(['tesoreria'], 'registrar el pago de nómina', 'Tesorería'),
  migrarCifradoCuentas: firma(
    ['tesoreria'],
    'migrar el cifrado de cuentas bancarias',
    'Tesorería',
  ),
  validarCuentaBancaria: firma(
    ['finanzas', 'tesoreria'],
    'validar cuentas bancarias',
    'Finanzas o Tesorería',
  ),

  /* ── Lo que define y cierra la contabilidad ───────────────────────────── */
  /*
   * La cuenta contable de cada concepto de nomina.
   *
   * El concepto —que existe, como grava, si integra al SBC— lo define Recursos
   * humanos. A que cuenta va el gasto lo define Contabilidad, igual que el
   * mapa patronal. Son dos decisiones distintas sobre el mismo registro y las
   * toman dos areas distintas.
   *
   * Hasta hoy no habia forma de tomar la segunda: el campo existia en la base
   * y en el DTO, y ninguna pantalla lo pedia. Sin el, la poliza de devengo es
   * imposible para cualquier empresa y cualquier mes.
   */
  cuentaDeConcepto: firma(
    ['finanzas', 'contador'],
    'asignar la cuenta contable de un concepto de nómina',
    'Finanzas o Contabilidad',
  ),

  configuracionPatronal: firma(
    ['finanzas', 'contador'],
    'modificar la configuración patronal',
    'Finanzas o Contabilidad',
  ),
  contabilizar: firma(
    ['finanzas', 'contador'],
    'contabilizar la nómina',
    'Finanzas o Contabilidad',
  ),
  cerrar: firma(['finanzas', 'contador'], 'cerrar la nómina', 'Finanzas o Contabilidad'),
} as const satisfies Record<string, Firma>;

export type ClaveFirma = keyof typeof FIRMAS_NOMINA;

/**
 * Las etapas de aprobación del periodo se nombran con el rol que firma; la
 * traducción a roles reales sale del mismo vocabulario.
 */
export const FIRMAS_POR_ETAPA: Record<string, readonly string[]> = {
  RRHH: [ADMIN, ...RRHH],
  /*
   * Direccion acompana a Gerencia en la misma etapa, como sustitucion cuando
   * el gerente no esta: es la misma regla que ya rige el alta de estructura.
   */
  GERENCIA: [ADMIN, 'gerencia', 'direccion'],
  FINANZAS: [ADMIN, 'finanzas', 'contador'],
  TESORERIA: [ADMIN, 'tesoreria'],
};

/**
 * La cadena de firmas cuando la empresa no ha configurado la suya en Gobierno
 * de flujos.
 *
 * Empezaba en RRHH, que es el mismo rol que prepara la nomina, y como quien
 * prepara no puede firmar, en una empresa con una sola persona de Recursos
 * humanos la cadena se trababa siempre. Ahora abre Gerencia: autoriza la
 * nomina por sus totales —trabajadores, percepciones, deducciones y neto—, que
 * es la decision que le toca, sin ver la prenomina trabajador por trabajador,
 * que sigue vedada para ese rol.
 *
 * Despues Finanzas, que responde del gasto y de la poliza, y Tesoreria, que es
 * quien finalmente dispersa. Tres duenos distintos y ninguno firma lo que el
 * mismo preparo.
 */
export const CADENA_FIRMAS_NOMINA = ['GERENCIA', 'FINANZAS', 'TESORERIA'] as const;
