# Continuidad compartida Codex / Claude

Actualizado: 2026-09-14. Responsable de esta actualización: Codex.
Estado: trabajo abierto; no declarar terminada la integración.

## Cómo retomar

1. Leer este archivo y `VALIDACION_FINERACT_2026-09-12.md` en el mismo directorio.
2. Revisar `git status -sb`, HEAD y cambios locales antes de editar. No asumir que la rama o el estado de la base siguen iguales.
3. Un agente modifica cada checkout a la vez. Antes de alternar, actualizar este archivo con resultados, pendientes, procesos activos y cambios sin commit.
4. Al volver, leer el avance del otro agente y comprobarlo; no repetir pruebas persistentes a ciegas ni revertir trabajo ajeno.
5. Publicar commits enfocados en la rama acordada y registrar el resultado real del push. No hacer merge a main ni force push por defecto.

## Rutas y permisos

Raíz para Claude Code: `D:\SUMA\erpfineract`.

- ERP: `D:\SUMA\erpfineract\syncroERP\claude` (raíz Git: directorio padre syncroERP).
- Fineract: `D:\SUMA\erpfineract\fineract`.
- SUMA: `D:\SUMA\erpfineract\suma-consola`.
- Este documento versionado: `D:\SUMA\erpfineract\syncroERP\claude\CONTINUIDAD_CODEX_CLAUDE.md`.
- Entrada común: `D:\SUMA\erpfineract\LEER_PRIMERO_CODEX_CLAUDE.md`.

No usar clones antiguos D:\fineract o D:\syncroERP. No copiar secretos a documentación. Las credenciales están configuradas localmente: no imprimir .env, tokens o claves. Usar npm.cmd en PowerShell.

## Git confirmado al inicio de esta actualización

ERP: rama `codex/verificacion-productos-fecha-activacion`, remoto `https://github.com/abeldiaz90/syncroERP.git`. Último commit funcional publicado: `bb1bb3b`; árbol limpio antes de esta documentación. Usuario autorizó publicar avances en esta rama.

No se han revisado nuevamente los cambios ajenos de Fineract/SUMA en esta sesión. Fineract tenía cambios locales previos: no limpiar ni resetear. No se han creado usuarios ni ampliado permisos técnicos en estos últimos hitos.

## Estado validado (volver a consultar antes de modificar)

Empresa SUMA Local: `7dfc9526-986f-47e5-9503-f896646e347b`.
Cartera SOMBRA; contabilidad externa APAGADO. Oficina1. Cinco productos vinculados y verificados (30/60/90 días, MSI, MENS-CI), todos accountingRule NONE. Se encontraron ACTIVO en una sesión posterior; no confundir con antiguos informes BORRADOR.

Puertos usados: ERP frontend3000/backend4000, Fineract frontend3002/core8443, PostgreSQL ERP55432. No reiniciar procesos a ciegas. SUMA3010 y Platform3003 requieren revisión posterior.

## Completado y evidencia

- Fecha mínima de proyección respeta activación del cliente externo.
- Idempotencia de pago/devolución confirma transacción externa antes de aceptar errores400/403/409. Reversa mediante ajuste transactionAmount0.
- Verificación contable revisa productos vinculados, no sólo parámetros antiguos (be726c9).
- Migración PostgreSQL `1789257600000-AmpliarEstadoVenta` aplicada localmente: estado de venta varchar30 admite PARCIALMENTE_DEVUELTA (653e129).
- Devolución parcial/total por servicio ERP y adaptador real: merchantIssuedRefund confirmado (bf5f38a).
- ResumenCliente lee detalle de préstamos porque /clients/:id/accounts no trae summary; presupuesto de tiempo compartido. Cinco regresiones y TypeScript pasaron (76b9b65).
- Alta/originación/cancelación por cron real y conciliación con saldo activo y cerrado sin diferencias.
- Pago y devolución por servicios ERP completos y cron, sin forzar despachador: 1200→600→0. Reintentos del productor no duplicaron IDs/eventos. Préstamo7 del cliente externo9 liquidado, devolución externa21 merchantIssuedRefund; conciliación final5 registros0 diferencias (bb1bb3b).
- Dos pólizas internas ERP (cobranza/devolución) generadas y balanceadas600/600. La devolución inicialmente falló por categoría sintética sin cuenta: se completó con cuenta402.01 existente y reintentó sólo ese asiento. Esto NO es ESPEJO externo.

Scripts portables en `backend/scripts`: probar-fecha-verificacion.cjs, probar-idempotencia.cjs, probar-ciclo-transaccional.cjs, probar-ciclo-fineract.cjs, probar-devolucion-transaccional.cjs, probar-devolucion-fineract.cjs, probar-outbox-automatico.cjs, probar-outbox-credito.cjs y probar-outbox-cobro-devolucion.cjs. Leer argumentos y alcance antes de ejecutar.

Pruebas reales locales con datos sintéticos: no producción ni dinero real. Algunas hacen rollback ERP; otras preservan historial. Las pruebas por cron son persistentes. No describirlas como realizadas desde POS. La última venta se preparó por entidades, pago/devolución por servicios. El script final incorpora categoría desde el inicio, pero esa configuración se validó mediante reintento focalizado y no otra corrida completa.

Historial core sintético conservado: préstamos1/5/6 cancelados,2/3/4/7 liquidados. Último ciclo ERP conserva venta parcialmente devuelta y tesorería sintética600, banco/producto desactivados y cliente sin línea. No eliminar historial. Discrepancia sintética0915fd09-96f3-4701-b81a-6b893217dfdd se revisó con nota tras corregir saldo; entonces abiertas0.

## Pendiente prioritario / próximo paso

1. Completar recorrido desde POS: crear configuración comercial sintética mínima, vender por UI, pagar/devolver por UI y confirmar cron/core/conciliación. El usuario inició sesión; comprobar vigencia. El 13/09 el diagnóstico encontró cero almacenes, productos, categorías y bancos activos y ninguna lista de precios. El 14/09 se reabrió POS; aún no se confirmó una venta por pantalla.
2. Probar mayor ESPEJO: mapeo de cuentas necesario, asiento externo balanceado, consulta, reversa e idempotencia. No activar globalmente a ciegas. Simulación de catálogo completo:1030 candidatas y53 cuentas ORDEN sin equivalencia automática; no se aprovisionaron masivamente.
3. Mora real, casos con intereses, devolución de inventario/exceso pagado, fallos de red tras aplicación y escenarios fiscales permanecen fuera del cierre actual.
4. Tras cerrar integración crítica, revisar Platform/SUMA y smoke integrado. No volver a hacer bootstrap ni recrear empresa/cuenta técnica.

## Evidencia detallada local

La carpeta original de Codex `C:\Users\abeld\OneDrive\Documentos\ChatGPT\SyncroERP-Fineract-SUMA` conserva JSON de resultados y scripts diagnósticos. No hace falta dar permiso de escritura allí: las evidencias relevantes se copiarán a `D:\SUMA\erpfineract\evidencias-codex` para lectura compartida. No ejecutar los builders o scripts one-off de esa carpeta; pueden repetir mutaciones.

## Registro de relevo

2026-09-14 Codex: creado protocolo de continuidad pedido por el usuario. Retomando POS. No se ejecutaron nuevas operaciones comerciales en esta actualización inicial. Antes de ceder, añadir estado final abajo y registrar cualquier nuevo fixture o pendiente.

### Cierre de actualización del 14/09 — preparación POS lista

Preparación completada y comprobada: un almacén, categoría, producto y banco activos; lista PRUEBA POS CODEX por defecto (antes no existían listas). Servicio TEST-POS-CODEX a600; categoría con cuentas existentes401.01/402.01. Cliente CLIENTE SINTETICO PRUEBA POS con línea sintética1200, sólo para el escenario. Su alta se publicó; confirmar envío antes de vender. No se simuló una aprobación real: estos datos se prepararon técnicamente.

Evidencia exacta y todos los IDs: D:\SUMA\erpfineract\evidencias-codex\preparacion-pos.json. No volver a ejecutar preparar-pos-local.cjs: el escenario ya existe. Reutilizarlo.

Próxima acción: acceder al ERP3000 con sesión humana, abrir /dashboard/ventas/pos, buscar TEST-POS-CODEX, agregar dos unidades, seleccionar CLIENTE SINTETICO PRUEBA POS y producto MSI a seis cuotas sin enganche. Revisar importes1200 y fecha válida antes de confirmar la venta sintética. Después comprobar crédito, cron, pago600 y devolución de una unidad por UI, y cerrar verificando ambos saldos0 y pólizas. Si cualquier pantalla falla, documentar URL, mensaje y estado persistido antes de reintentar.

Bloqueo de UI al cerrar esta preparación: sesión expirada, login Keycloak abierto y solicitado al usuario. No hubo venta por UI. No hay una prueba comercial ejecutándose en segundo plano. ESPEJO sigue pendiente y no se activó.

Al finalizar el escenario, desactivar únicamente los fixtures identificados en preparacion-pos.json y dejar cliente sin línea, conservando trazabilidad. Lista no tiene columna activo: revisar su uso antes de cambiarla, no borrar historial. Registrar en este archivo cualquier saldo o asiento que quede pendiente.
