# SyncroERP v14 — Reporte de remediación de auditoría

**Fecha:** 3 de agosto de 2026  
**Base:** SyncroERP backend v13 + frontend v13  
**Alcance:** primera entrega ejecutable de correcciones sobre las dos auditorías técnicas recibidas.

## 1. Dictamen ejecutivo

Esta entrega corrige una parte amplia de los hallazgos críticos y altos, pero **no declara el ERP listo para producción fiscal**. La v14 debe desplegarse primero en desarrollo/QA, ejecutar migraciones, compilar con dependencias instaladas, correr pruebas automatizadas y validar los flujos fiscales contra el sandbox real del PAC.

El patrón principal de la auditoría era correcto: el ERP ya tenía infraestructura valiosa, pero varios procesos estaban desconectados. La remediación priorizó conectar los circuitos que afectan dinero, inventario, contabilidad, CFDI y seguridad.

## 2. Correcciones incorporadas

### 2.1 CFDI, PAC y cobranza

- Credenciales del PAC cifradas mediante AES-256-GCM y llave independiente `CFDI_ENCRYPTION_KEY`.
- La API deja de devolver `facturamaPassword`.
- Migración automática controlada de contraseñas heredadas en texto plano al primer arranque con la llave configurada.
- Venta conectada al CFDI de ingreso mediante una operación específica de timbrado, idempotencia y bloqueo de folio.
- Pantalla para facturar una venta desde el historial.
- Anulación de venta conectada con cancelación del CFDI; una caída del PAC no revierte ni falsea la anulación ya confirmada.
- CFDI de egreso para devoluciones, con relación al comprobante original.
- Procesamiento individual y masivo de notas de crédito pendientes o con error.
- Complemento de Pago 2.0 para abonos ligados a facturas PPD.
- Procesamiento y reintento de REP pendientes.
- Estados fiscales y errores recuperables persistidos en cobranza.

**Pendiente de validación externa:** timbrado, cancelación, nota de crédito y REP deben probarse con credenciales y datos reales del sandbox del PAC.

### 2.2 Caja, efectivo, corte y arqueo

Se añadió un módulo formal de Caja con:

- apertura de turno;
- fondo inicial;
- una sola apertura simultánea por empresa y caja;
- entradas y retiros manuales;
- movimientos de venta, enganche, cobranza y reembolso;
- total de entradas, salidas y efectivo esperado;
- corte, conteo físico, diferencia y observaciones obligatorias;
- idempotencia por documento;
- bloqueo pesimista y transacciones `SERIALIZABLE`;
- rechazo de salidas que dejarían efectivo esperado negativo;
- pantalla `Tesorería → Caja, corte y arqueo`.

Ventas, cobranza y reembolsos en efectivo quedan ligados al turno abierto dentro de la misma transacción de negocio. Las cuentas bancarias ya no sustituyen silenciosamente una caja física.

### 2.3 Ventas y devoluciones

- Validación de `almacenId` contra la empresa aun cuando la venta solo contiene servicios.
- El intento contable posterior al `commit` ya no devuelve un falso error 500 sobre una venta confirmada.
- Cálculo y persistencia del cambio entregado en servidor.
- Clave de idempotencia de devoluciones con mínimo de 16 caracteres.
- Ventana máxima configurable mediante `DEVOLUCIONES_DIAS_MAXIMOS`.
- Umbral configurable de autorización mediante `DEVOLUCIONES_MONTO_APROBACION`.
- Roles autorizadores configurables mediante `DEVOLUCIONES_ROLES_AUTORIZADORES`.
- Bloqueo de devoluciones cuando el periodo contable está cerrado.
- Uso de fecha de negocio en lugar de fecha UTC para reembolsos y consultas diarias relevantes.
- Validación del tipo de cuenta para efectivo, banco y TPV.

### 2.4 Hotelería

- La validación de disponibilidad ya no usa `pessimistic_read`.
- Se agregó candado exclusivo `sp_getapplock` por empresa y tipo de habitación.
- Se usa bloqueo pesimista de escritura durante la validación de cupo.

Esto evita que dos recepcionistas reserven simultáneamente la última habitación disponible.

### 2.5 WMS e inventario físico

- El cierre de conteo físico se ejecuta en transacción `SERIALIZABLE`.
- Bloqueo de escritura sobre el conteo.
- Segregación de funciones conservada.
- Los sobrantes sin lote previo resuelven costo mediante lote reciente o costo del producto; si no existe costo confiable, el cierre se rechaza de forma explícita.
- Los ajustes de sobrante y faltante encolan un asiento contable dentro de la misma transacción.
- Se añadió `TipoAsiento.AJUSTE_INVENTARIO`.
- El motor contable genera póliza para diferencias de inventario con origen idempotente.

### 2.6 Decimales y costeo

- Se creó `decimalNumberTransformer` común.
- Se aplicó a **268 columnas DECIMAL/NUMERIC** en las entidades.
- La auditoría automatizada encontró **0 columnas decimales sin transformer**.
- Los valores inválidos provenientes de SQL Server generan error explícito en lugar de permitir concatenaciones silenciosas.
- Se añadieron pruebas unitarias del transformer.

La observación específica de que `movimiento-inventario.entity.ts` usaba `decimal(18,0)` no correspondía a la v13 entregada: esa entidad ya tenía precisión y escala. El riesgo transversal de retorno como cadena sí existía y fue corregido.

### 2.7 Activos y contabilidad

- La depreciación valida que no se salten periodos anteriores.
- La corrida se ejecuta en transacción `SERIALIZABLE`.
- La depreciación se encola al outbox contable dentro de la misma transacción.
- Se implementó `generarAsientoDeDepreciacion`.
- Se registra la póliza en las depreciaciones del activo.
- El cuadre contable se compara en centavos por partida, no mediante `!==` de flotantes.

**Aclaración de auditoría:** la nómina avanzada actual ya genera pólizas de provisión y pago directamente. Lo pendiente de nómina es el timbrado PAC/Complemento 1.2 y otras obligaciones laborales, no la inexistencia absoluta de contabilización.

### 2.8 Sesiones, usuarios y permisos

- `tokenVersion` incorporado al usuario y al JWT.
- Logout, cambio de contraseña, cambio de rol y desactivación invalidan tokens anteriores.
- Mensajes de autenticación y reenvío de verificación dejan de enumerar estados de cuentas.
- Verificar correo ya no devuelve automáticamente una sesión.
- Un invitado no puede reactivar una empresa suspendida.
- Se identifica y protege al propietario de la empresa.
- Roles normalizados en mayúsculas, acentos, espacios y guiones.
- Restricción para asignar roles administrativos.
- Caché local de permisos acotada a 5,000 entradas y TTL corto.

**Pendiente:** access token corto + refresh token rotativo en cookie `httpOnly`, eliminación total de JWT en `localStorage` y Redis/pub-sub para múltiples réplicas.

### 2.9 Validación de entrada y archivos

- Todos los parámetros `@Body()` detectados usan clases DTO validables en runtime.
- Auditor incluido: `npm run audit:update-dtos`.
- Límites de tamaño y cantidad de archivos.
- Filtros de extensión.
- Validación de firma binaria para Excel e imágenes comunes.
- Eliminación del archivo rechazado cuando corresponde.

**Pendiente:** antivirus/antimalware y almacenamiento privado con URL firmada.

### 2.10 Auditoría e índices

- Cadena SHA-256 por empresa mediante `hashAnterior` y `hashRegistro`.
- Serialización de la cadena con `sp_getapplock`.
- Trigger SQL Server que bloquea `UPDATE` y `DELETE` de la bitácora.
- Endpoint de verificación de integridad.
- Enmascaramiento de secretos antes de serializar auditoría.
- Índices `empresaId` en tablas críticas.
- Índice compuesto caliente para permisos `(empresaId, rol, endpointId, permitido)`.

### 2.11 Onboarding y RPA CURP

- El paso 4 completa correctamente el onboarding.
- El RPA de CURP queda deshabilitado por defecto y requiere `CURP_RPA_HABILITADO=true`.

Esto evita su uso accidental, pero no sustituye el análisis jurídico ni una integración institucional autorizada.

## 3. Migraciones nuevas

1. `1785758400000-SeguridadFiscalAuditoriaV14.ts`
   - propietario y `tokenVersion`;
   - ampliación para secreto PAC cifrado;
   - cambio de venta;
   - relaciones CFDI y REP;
   - hashes y trigger de auditoría;
   - índices multiempresa y permisos.

2. `1785762000000-CajaOperativaV14.ts`
   - `caja_turnos`;
   - `caja_movimientos`;
   - restricciones de importes y estados;
   - llaves foráneas;
   - índices e idempotencia;
   - índice filtrado para una sola caja abierta.

Se incluye `scripts/VALIDAR-ESTRUCTURA-V14.sql` para comprobar la estructura posterior a las migraciones y detectar credenciales PAC heredadas que aún no hayan sido cifradas.

## 4. Validaciones ejecutadas

- **616** archivos TypeScript/TSX analizados sintácticamente.
- **0** errores de sintaxis.
- **1,390** imports relativos revisados.
- **0** imports relativos faltantes.
- **123** rutas configuradas en el menú.
- **0** rutas de menú sin página.
- **0** `@Body()` con `any`, tipo inline, primitivo o utility type inseguro.
- **268** columnas DECIMAL/NUMERIC auditadas.
- **0** columnas decimales sin transformer.
- **43** archivos `.spec.ts` en backend.
- **0** pruebas frontend.
- **0** cargas remotas de Chart.js/CDN detectadas.
- **0** llamadas nativas `alert`, `confirm` o `prompt` detectadas.
- **0** usos de `pessimistic_read` en la validación de disponibilidad hotelera.
- ZIPs finales verificados mediante prueba de integridad.

## 5. Validaciones que no pudieron ejecutarse en este entorno

Las dependencias no están instaladas y el acceso al registro de paquetes estuvo bloqueado. Por ello, esta entrega **no afirma** que hayan pasado:

- `npm ci`;
- `nest build`;
- `tsc --noEmit` completo;
- Jest completo;
- `next build`;
- migraciones contra SQL Server real;
- pruebas de concurrencia con múltiples conexiones;
- timbrado/cancelación/REP/nota de crédito contra PAC sandbox.

Las pruebas unitarias nuevas se incluyen, pero deben ejecutarse en un equipo con dependencias instaladas.

## 6. Hallazgos todavía abiertos

### Bloqueantes antes de producción fiscal integral

1. Timbrado de nómina con PAC y Complemento de Nómina 1.2.
2. Factura de proveedor, Cuentas por Pagar y three-way match completo.
3. DIOT.
4. XML de Contabilidad Electrónica/Anexo 24.
5. Pruebas end-to-end fiscales con PAC sandbox.
6. Pruebas de concurrencia e aislamiento multiempresa sobre una base SQL Server real.

### Seguridad y plataforma

1. Refresh token rotativo en cookie `httpOnly` y access token corto.
2. Eliminación de las **138 referencias** a `localStorage` detectadas en frontend.
3. Redis/pub-sub para invalidación distribuida de permisos y sesión en múltiples réplicas.
4. Antivirus y almacenamiento privado de archivos.
5. Programa formal LFPDPPP: ARCO, portabilidad, consentimientos, retención, anonimización, transferencias y respuesta a incidentes.
6. Sustitución definitiva del RPA CURP por un servicio institucional.

### Deuda técnica y funcional

1. Migrar las **241 llamadas directas a `fetch()`** al cliente HTTP central.
2. Añadir pruebas frontend y ampliar pruebas de ventas, inventario, devolución, anulación, WMS y permisos.
3. Paginación uniforme en listados aún no acotados.
4. Depreciación fiscal separada con actualización INPC.
5. SUA, IDSE, PTU, NOM-035 y control de asistencia.
6. Accesibilidad WCAG.
7. Descomposición de páginas monolíticas.
8. Formateo completo de `wms.service.ts` y bloqueo de formato en CI.
9. Multi-moneda, tipo de cambio y Carta Porte cuando correspondan al alcance real del negocio.

## 7. Orden de despliegue obligatorio en QA

### Backend

```bash
npm ci
npm run audit:update-dtos
npm run build
npm test -- --runInBand
npm run db:migration:show
npm run db:migration:run
npm run db:schema:verify
```

Después ejecutar en SQL Server:

```text
scripts/VALIDAR-ESTRUCTURA-V14.sql
```

Variables mínimas nuevas:

```env
CFDI_ENCRYPTION_KEY=<32 bytes Base64 o 64 caracteres hex>
CURP_RPA_HABILITADO=false
DEVOLUCIONES_DIAS_MAXIMOS=30
DEVOLUCIONES_MONTO_APROBACION=5000
DEVOLUCIONES_ROLES_AUTORIZADORES=ADMIN,ADMINISTRADOR,SUPER_ADMIN,GERENTE,SUPERVISOR
```

### Frontend

```bash
npm ci
npm run typecheck
npm run build
```

### Escenarios mínimos de aceptación

1. Dos ventas concurrentes sobre la última pieza.
2. Doble clic con la misma clave de idempotencia.
3. Venta de servicios con almacén de otra empresa.
4. Apertura concurrente de la misma caja.
5. Venta, cobranza y reembolso en efectivo sin turno abierto.
6. Retiro mayor al efectivo esperado.
7. Corte con diferencia sin observaciones.
8. Dos reservaciones concurrentes sobre la última habitación.
9. Conteo con faltante, sobrante y sobrante sin costo disponible.
10. Depreciación intentando saltar un mes.
11. Devolución fuera de plazo, sobre periodo cerrado y sobre umbral sin autorización.
12. Timbrado, nota de crédito, cancelación y REP en sandbox.
13. Empresa A intentando consultar o modificar datos de Empresa B.
14. Logout/cambio de contraseña invalidando inmediatamente un JWT anterior.

## 8. Conclusión

La v14 deja de ser únicamente una validación superficial: incorpora correcciones reales de negocio, seguridad, fiscalidad, inventario, contabilidad y concurrencia. Aun así, debe considerarse una **entrega de remediación para QA**, no una liberación productiva definitiva, mientras permanezcan abiertos nómina timbrada, Cuentas por Pagar, DIOT/Anexo 24, refresh cookies y pruebas integrales con SQL Server/PAC.
