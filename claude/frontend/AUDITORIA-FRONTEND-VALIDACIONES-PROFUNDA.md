# Auditoría profunda de validaciones del frontend

Heurística estática: complementa, no sustituye pruebas funcionales.

| Severidad | Pantalla | Campos | Required | Riesgo | Hallazgos |
|---|---|---:|---:|---:|---|
| CRITICA | `app/recuperar-password/page.tsx` | 1 | 0 | 7 | sin required declarados; sin normalización trim visible; sin bloqueo de doble envío detectable; manejo débil de errores API |
| ALTA | `app/register/page.tsx` | 5 | 0 | 5 | sin required declarados; sin bloqueo de doble envío detectable |
| MEDIA | `app/dashboard/productos/components/ModalFichaProducto.tsx` | 45 | 0 | 4 | sin required declarados; manejo débil de errores API |
| MEDIA | `app/dashboard/marcas/page.tsx` | 2 | 0 | 4 | sin required declarados; sin normalización trim visible |
| MEDIA | `app/restablecer-password/page.tsx` | 2 | 0 | 4 | sin required declarados; sin normalización trim visible |
| MEDIA | `app/dashboard/productos/components/ModalInventarioRapido.tsx` | 6 | 4 | 3 | sin bloqueo de doble envío detectable; manejo débil de errores API |
| MEDIA | `app/dashboard/inventario/ubicaciones/page.tsx` | 3 | 2 | 3 | sin normalización trim visible; sin bloqueo de doble envío detectable |
| MEDIA | `app/aceptar-invitacion/page.tsx` | 2 | 0 | 3 | sin required declarados |
| MEDIA | `app/dashboard/inventario/conteos/page.tsx` | 2 | 2 | 3 | sin normalización trim visible; sin bloqueo de doble envío detectable |
| BAJA | `app/dashboard/finanzas/cuentas-contables/page.tsx` | 8 | 2 | 1 | sin normalización trim visible |
| BAJA | `app/dashboard/inventario/transferencias/page.tsx` | 5 | 5 | 1 | sin normalización trim visible |
| BAJA | `app/dashboard/compras/cotizaciones/page.tsx` | 4 | 2 | 1 | sin normalización trim visible |
| BAJA | `app/dashboard/listas-precio/page.tsx` | 2 | 1 | 1 | sin normalización trim visible |
| BAJA | `app/dashboard/proveedores/page.tsx` | 31 | 1 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/clientes/page.tsx` | 19 | 6 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/hoteleria/configuracion/page.tsx` | 15 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/hoteleria/reservaciones/page.tsx` | 15 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/ventas/pos/page.tsx` | 15 | 0 | 0 | Patrón aceptable |
| BAJA | `app/onboarding/page.tsx` | 11 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/ventas/devoluciones/nueva/page.tsx` | 9 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/inventario/recepciones/[id]/page.tsx` | 7 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/productos/atributos/page.tsx` | 7 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/creditos/cuentas-bancarias/page.tsx` | 6 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/finanzas/polizas/nueva/page.tsx` | 6 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/hoteleria/recetas/page.tsx` | 6 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/productos/[id]/page.tsx` | 6 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/auditoria/page.tsx` | 5 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/compras/requisiciones/page.tsx` | 5 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/creditos/cobranza/page.tsx` | 5 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/finanzas/polizas/page.tsx` | 5 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/inventario/ajustes/page.tsx` | 5 | 4 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/usuarios/page.tsx` | 5 | 0 | 0 | Patrón aceptable |
| BAJA | `app/configuracion-financiera/page.tsx` | 4 | 0 | 0 | Patrón aceptable |
| BAJA | `app/configuracion-inicial/page.tsx` | 4 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/catalogos/estados/page.tsx` | 4 | 2 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/categorias/page.tsx` | 4 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/compras/pago-proveedores/page.tsx` | 4 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/finanzas/categorias-contables/page.tsx` | 4 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/finanzas/declaracion-iva/page.tsx` | 4 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/productos/page.tsx` | 4 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/rpa/curp/page.tsx` | 4 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/almacenes/page.tsx` | 3 | 1 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/catalogos/bancos/page.tsx` | 3 | 2 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/catalogos/paises/page.tsx` | 3 | 2 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/crm/actividades/page.tsx` | 3 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/finanzas/balanza/page.tsx` | 3 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/finanzas/cierre-contable/page.tsx` | 3 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/hoteleria/configuracion/DotacionInsumos.tsx` | 3 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/impuestos/page.tsx` | 3 | 1 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/reportes/estado-cuenta/page.tsx` | 3 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/reportes/ventas/page.tsx` | 3 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/unidades-medida/page.tsx` | 3 | 1 | 0 | Patrón aceptable |
| BAJA | `app/configuracion-inicial/PasoImpuestos.tsx` | 2 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/catalogos/formas-pago/page.tsx` | 2 | 1 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/configuraciones-aprobacion/page.tsx` | 2 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/crm/pipeline/page.tsx` | 2 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/finanzas/estado-resultados/page.tsx` | 2 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/finanzas/saldos-iniciales/page.tsx` | 2 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/productos/components/SelectConCrear.tsx` | 2 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/rrhh/puestos/page.tsx` | 2 | 0 | 0 | Patrón aceptable |
| BAJA | `app/login/page.tsx` | 2 | 2 | 0 | Patrón aceptable |
| BAJA | `components/ui/index.tsx` | 2 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/compras/aprobaciones/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/compras/ordenes/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/compras/requisiciones/[id]/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/creditos/creditos/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/departamentos/page.tsx` | 1 | 1 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/finanzas/balance-general/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/finanzas/catalogos-sat/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/finanzas/conciliacion-inicial/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/hoteleria/auditoria/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/hoteleria/housekeeping/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/hoteleria/rack/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/inventario/importar/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/inventario/recepciones/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/inventario/stock-inicial/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/permisos/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/reportes/corte-caja/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/reportes/inventario/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/rrhh/asistencia/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/tesoreria/conciliacion/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `app/dashboard/ventas/historial/page.tsx` | 1 | 0 | 0 | Patrón aceptable |
| BAJA | `components/PaletaComandos.tsx` | 1 | 0 | 0 | Patrón aceptable |