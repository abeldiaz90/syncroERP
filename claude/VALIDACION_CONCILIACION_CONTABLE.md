# Conciliación de pólizas vinculadas — Codex, 14/15 septiembre 2026

## Resultado

El ERP detecta la reversa externa de IN-2026-00005. La consulta real final revisó 15 pólizas vinculadas y encontró una discrepancia: REVERSA_EXTERNA sobre a2bef5f612d7. Su reversa a2bf0fcd569d fue ejecutada por el usuario en la sesión anterior. No se modificaron saldos, pólizas ni transacciones al conciliar.

## Implementación

- GET /integracion/contabilidad/conciliacion consulta el estado actual sin escribir avisos.
- POST /integracion/contabilidad/conciliacion/ejecutar consulta y registra avisos deduplicados. Ambas rutas exigen administrador o dirección y toman empresaId de la sesión.
- Tarea contabilidad-conciliar cada diez minutos, sólo para empresas en ESPEJO efectivo y cuando CRONS_HABILITADOS permite ejecutar tareas.
- Se compara únicamente lo vinculado al proveedor: referencia, moneda MXN del envío existente, cuentas y cargos/abonos al centavo. No presupone que las pólizas históricas anteriores a ESPEJO estén en el core.
- La consulta remota pagina y comprueba oficina, transacción, tipos de partida y respuesta completa. Errores de red no significan saldo cero.
- Avisos en integracion_avisos, acción CONCILIACION_CONTABLE, cuerpo.origen=conciliacion-erp. Huella única por empresa/proveedor/póliza/asiento/código evita duplicados ante reintentos simultáneos. No hay migración nueva.
- Corregido listarHuerfanos: IsNull() genera IS NULL; pasar null omitía el filtro en TypeORM y duplicaba visualmente avisos ya asignados a empresa.
- El frontend dice «Detalle del aviso» porque el cuerpo también puede ser un diagnóstico del ERP.

## Validación

21 pruebas focalizadas aprobadas (5 suites), TypeScript backend aprobado. Las4 suites adicionales nuevas de Claude pasaron47 pruebas, pero eso no constituye aprobación completa de su implementación financiera.

Prueba real de servicio: una ejecución y su reintento generaron un único aviso de reversa 02653050-c0c8-4b1f-8679-2a443546513e. Visible en /dashboard/creditos/avisos. Después de las nuevas operaciones de Claude, la consulta de sólo lectura revisó15 pólizas y siguió detectando únicamente la reversa. No se repitieron ventas/pagos/devoluciones.

La pantalla muestra además un aviso histórico CONSULTA_FALLIDA de IN-2026-00006 generado por la tarea. La consulta final ya lee esa póliza correctamente. Los avisos conservan el historial y requieren revisión; no se cierran solos. No confundir la cantidad de avisos pendientes con discrepancias de la consulta actual.

Evidencias locales compartidas en D:\SUMA\erpfineract\evidencias-codex:
- conciliacion-contable-codex.json
- conciliacion-contable-reintento-codex.json
- conciliacion-contable-final-codex.json
- aviso-contable-codex.json

Script portable: backend/scripts/verificar-conciliacion-contable.cjs --empresa=UUID --resultado=ruta.json. Por defecto no guarda avisos; --guardar-avisos los persiste. Arranca contexto Nest con tareas, sincronización y migraciones deshabilitadas; los inicializadores habituales del contexto pueden ejecutarse.

## Límites y siguiente trabajo

No repara automáticamente los libros, no recupera historia anterior a ESPEJO y no compara saldos de apertura ni asientos externos sin vínculo. El asiento original reversado sigue vinculado y la póliza ERP sigue vigente. No se debe reencolar para intentar arreglarlo: exige decidir la corrección contable.

Revisar el relevo reciente RELEVO_PARA_CODEX.md de Claude. Su código financiero sigue pendiente de publicación/revisión completa. Riesgos encontrados leyendo el código, aún sin corrección:
1. SincronizacionInicialService selecciona pagos de créditos vivos sin filtrar cancelado; replicaría también pagos anulados.
2. CarteraReflejoService guarda entidadId=t.idExterno para ajustes externos, pero entidadId es UUID. Además el ajuste y el vínculo se confirman en transacciones separadas; un fallo después de bajar el saldo deja un reintento que puede bajarlo otra vez. Requiere idempotencia atómica del ajuste, no sólo una búsqueda previa de vínculo.
3. CobranzaService.cancelarPago llama a tesoreria.cancelar dentro de su transacción pero sin pasar su EntityManager: revisar atomicidad entre saldo/cancelación y tesorería antes de publicar.

No promover AUTORIDAD ni iniciar nuevos reflejos monetarios para probar estos caminos hasta corregirlos. Mantener todos los archivos de Claude intactos mientras se prepara una corrección revisable. Su migración de cancelación se reporta ya aplicada localmente; no revertirla.
