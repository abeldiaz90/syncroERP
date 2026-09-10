# Revisión crítica de Hotelería · 2026-08-02

Esta entrega corrige la integridad operativa del PMS sin migraciones. En
desarrollo, las nuevas columnas e índices se crean con `DB_SYNC=true`, según
la estrategia vigente del proyecto.

## Corregido

- Check-out único desde Caja, con pagos obligatorios e idempotencia.
- El cierre materializa todas las noches contratadas que falten antes de cobrar.
- Tarifas de habitación y precios de consumos determinados por el servidor.
- IVA configurable por producto en consumos; el impuesto de hospedaje sólo se
  aplica a las rentas de habitación.
- Pagos limitados a la moneda funcional del hotel para evitar diferencias sin
  conversión contable.
- Disponibilidad real por fechas y tipo, bloqueo concurrente y sobreventa con
  tope del 10 % cuando está autorizada.
- Auditoría automática por zona horaria con recuperación de fechas operativas
  omitidas; el cierre también puede correr sin huéspedes.
- Housekeeping auditable: pendiente, en proceso, terminada, inspección y
  liberación/rechazo. El rack ya no permite saltarse el supervisor.
- Almacén hotelero y dotaciones validados contra empresa, actividad y productos
  reales. Los blancos reutilizables no se descuentan como consumibles.
- Recetas y costos registrados en Nest. Guardado transaccional, productos de la
  misma empresa, sin duplicados ni autorreferencias.
- Un consumo hotelero con receta descuenta ingredientes; si falta inventario,
  se revierte toda la operación.
- Ingresos contables separados entre hospedaje y consumos; IVA e impuesto local
  permanecen en sus pasivos correspondientes.
- Navegación/permisos actualizados para folios, auditoría, configuración y
  costos de recetas.

## Experiencia de usuario

- Caja muestra el total estimado al cierre y las noches pendientes.
- Pagos mixtos pueden agregarse y quitarse, con cuentas filtradas por medio.
- Reservaciones consultan cupo por fechas y muestran existencias por tipo.
- Los consumos se seleccionan mediante buscador; ya no existe producto ficticio
  ni captura manual del precio.
- Configuración expone horarios, zona horaria, moneda, IVA, impuesto local,
  inventario, sobreventa, cancelación y privacidad.
- Se eliminaron los cierres incompletos y los diálogos nativos de JavaScript en
  las pantallas intervenidas.

## Verificación

- Backend: `npm run build` correcto.
- Frontend: `npm run build` correcto, 119 rutas generadas.
- Pruebas: 37 suites y 152 pruebas aprobadas.
- Se agregaron siete pruebas específicas para impuestos, noches, GUID y DTOs
  hoteleros.

## Siguiente fase recomendada

La base crítica ya es consistente. La siguiente fase funcional debe incorporar
modificación/cancelación/no-show con penalizaciones, anticipos y depósitos,
reservas grupales, cuentas por cobrar para agencias/empresas, mantenimiento con
órdenes de trabajo y reportes gerenciales (ADR, RevPAR, ocupación y forecast).
