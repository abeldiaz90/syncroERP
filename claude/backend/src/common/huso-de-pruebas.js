/**
 * ============================================================================
 * SyncroERP · Huso horario de las pruebas
 * ----------------------------------------------------------------------------
 * Esto es una nomina mexicana: dias de falta, periodos quincenales, fechas de
 * pago y timbrado. Correr las pruebas en UTC las hace mentir por omision, que
 * fue justo lo que paso con `new Date('2026-09-17')`: en UTC da el dia 17 y
 * todo parece bien; en Mexico da el 16 y una falta se descuenta del dia que
 * no era.
 *
 * `globalSetup` corre antes de que Jest levante sus procesos de trabajo, asi
 * que estos heredan el huso. Funciona igual en Windows y en Linux, sin
 * depender de como se invoque `jest`.
 *
 * Si alguna prueba necesita otro huso, que lo diga explicitamente; el de por
 * defecto es el de la empresa.
 * ============================================================================
 */
module.exports = async () => {
  process.env.TZ = process.env.TZ_PRUEBAS || 'America/Mexico_City';
};
