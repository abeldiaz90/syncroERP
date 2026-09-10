# SyncroERP v14.2 — Coherencia de aprobaciones, crédito hotelero y finanzas

Fecha de consolidación: 2026-08-03

## 1. Objetivo de esta versión

Esta versión consolida sobre la base v14.1 un flujo único y trazable para:

`Cliente → propuesta de crédito → aprobación central → línea autorizada → convenio hotelero → aprobación central → City Ledger → cobranza → Tesorería/Caja → Contabilidad`.

La corrección elimina la incoherencia en la que el convenio hotelero pedía nuevamente límite, plazo y tolerancia, aunque esas condiciones ya pertenecían al cliente.

## 2. Fuentes de verdad

### Cliente

El cliente es la única fuente operativa para:

- límite de crédito autorizado;
- plazo autorizado;
- nivel de riesgo;
- clasificación hotelera `EMPRESA | AGENCIA`;
- política de bloqueo por vencidos;
- versión de la línea de crédito;
- estado operativo de la línea.

Una modificación no reemplaza esos datos mientras está pendiente. Se guarda como propuesta separada mediante:

- `estadoSolicitudCredito`;
- `limiteCreditoSolicitado`;
- `diasCreditoSolicitados`;
- `nivelRiesgoSolicitado`;
- `bloquearCreditoConSaldoVencidoSolicitado`;
- `clasificacionHoteleraSolicitada`;
- `versionSolicitudCredito`.

### Convenio hotelero

El convenio conserva una fotografía auditable de las condiciones con las que fue solicitado y aprobado, pero no crea una segunda línea. Contiene:

- hotel, cliente y número de convenio;
- vigencia;
- clasificación heredada;
- versión del convenio;
- versión de crédito del cliente;
- snapshot del límite, plazo y política de vencidos;
- estado y responsables de solicitud, aprobación, rechazo, suspensión o cancelación.

El convenio ya no acepta límite, días o tolerancia como entrada editable.

### Cuenta City Ledger

Cada cuenta conserva evidencia inmutable de las condiciones exactas aplicadas al originarse:

- versión del convenio;
- número y tipo de convenio históricos;
- límite aplicado;
- días aplicados;
- versión de crédito del cliente aplicada.

Una renovación posterior no reescribe los cargos históricos.

## 3. Motor central de aprobaciones

Procesos centralizados operativos:

- `CREDITO_CLIENTE`;
- `HOTEL_CONVENIO`.

Endpoints:

- `GET /aprobaciones/pendientes`;
- `GET /aprobaciones/historial`;
- `PATCH /aprobaciones/:id/resolver`.

No existen endpoints directos de aprobar/rechazar crédito o convenios fuera de la bandeja central. Las acciones operativas separadas son suspensión, cancelación y reenvío.

### Gobierno aplicado

- niveles consecutivos `1..N`;
- matrices globales, sin dependencia de departamento;
- todos los niveles obligatorios;
- autoaprobación prohibida;
- un único responsable por nivel: usuario o rol, nunca ambos;
- escala acumulativa de autoridad financiera;
- último nivel sin tope;
- solicitante excluido de la ruta;
- persona distinta por cada nivel del mismo ciclo;
- asignación concreta de usuario al crear el ciclo;
- resolución secuencial;
- SLA iniciado únicamente cuando el nivel se vuelve atendible;
- snapshot y versión del documento dentro del ciclo;
- cancelación automática de niveles posteriores al rechazo;
- historial de solicitante, asignado, resolutor, comentario y fechas.

## 4. Flujo de crédito del cliente

### Alta o cambio

1. Se validan cliente, tipo de persona y condiciones propuestas.
2. La línea vigente no se modifica.
3. Se almacena una propuesta versionada.
4. Se cancela cualquier ciclo pendiente anterior.
5. Se crea un nuevo ciclo `CREDITO_CLIENTE`.
6. La bandeja muestra condiciones vigentes, condiciones solicitadas y exposición actual.
7. La aprobación final aplica la propuesta de forma atómica.
8. El rechazo conserva intacta la línea autorizada anterior.

### Cambio aprobado

Al aprobar una nueva versión:

- incrementa `versionCredito`;
- actualiza la línea maestra;
- suspende convenios aprobados ligados a la versión anterior;
- cancela convenios pendientes de la versión anterior;
- cancela niveles hoteleros que ya quedaron obsoletos;
- obliga a reenviar cada convenio con las nuevas condiciones.

### Suspensión

La suspensión:

- conserva deuda e historial;
- bloquea nuevas operaciones a crédito;
- cancela propuestas pendientes;
- suspende convenios aprobados;
- cancela convenios pendientes;
- registra responsable, fecha y motivo.

## 5. Flujo del convenio hotelero

1. Requiere cliente moral, activo y clasificado como `EMPRESA` o `AGENCIA`.
2. Requiere línea maestra `AUTORIZADO`, con límite y plazo mayores a cero.
3. Impide crear o reenviar cuando existe cambio de crédito pendiente.
4. Evita duplicar cliente+hotel y número+hotel.
5. Hereda límite, plazo, clasificación, versión y política de vencidos.
6. Crea ciclo `HOTEL_CONVENIO` en la bandeja central.
7. La aprobación valida nuevamente hotel, cliente, vigencia y versión.
8. Sólo el estado `APROBADO` y vigente permite un checkout a crédito.
9. Suspender o cancelar bloquea cargos nuevos sin borrar cartera existente.
10. Reenviar o renovar crea un ciclo nuevo y conserva el histórico anterior.

Estados controlados:

- `PENDIENTE`;
- `APROBADO`;
- `RECHAZADO`;
- `SUSPENDIDO`;
- `VENCIDO`;
- `CANCELADO`.

## 6. Integración financiera

### Exposición global

`PoliticaCreditoService` calcula una sola exposición por cliente:

- saldo de ventas a crédito;
- saldo de City Ledger;
- vencidos de ventas;
- vencidos de hotelería;
- utilizado global;
- disponible global.

Ventas y checkout hotelero comparten `sp_getapplock` con recurso:

`LINEA_CREDITO:{empresaId}:{clienteId}`

Esto evita que dos canales consuman simultáneamente el último crédito disponible.

### Momento contable

La aprobación de crédito o convenio es una autorización y no genera póliza por sí misma.

Los eventos económicos sí generan integración:

- checkout hotelero: cuenta City Ledger y evento contable `HOSPEDAJE`;
- cobro City Ledger: movimiento de Tesorería, movimiento de Caja cuando corresponde y evento `COBRANZA`;
- cobro parcial: reclasificación proporcional del IVA;
- error contable posterior al commit: la operación queda confirmada y el outbox conserva el reintento, sin devolver un falso fracaso financiero al usuario.

### Efectivo

Un cobro en efectivo requiere:

- cuenta financiera de tipo `CAJA`;
- turno de caja abierto;
- movimiento de entrada en Caja;
- movimiento de ingreso en Tesorería;
- asiento pendiente de cobranza.

## 7. Diagnóstico antes de producción

El endpoint de preparación valida:

- tablas y columnas requeridas;
- propuestas maker-checker;
- matrices de aprobación coherentes;
- aprobadores activos suficientes y segregados;
- niveles pendientes con persona concreta asignada;
- SLA secuencial;
- convenios vencidos, inactivos o desfasados;
- versiones de crédito y convenio;
- cuentas City Ledger con evidencia histórica completa;
- roles contables mínimos.

Script adicional:

`scripts/VALIDAR-COHERENCIA-CREDITO-HOTEL-V14_2.sql`

## 8. Migraciones en orden

1. `1785765600000-AprobacionesCreditoHotelV142.ts`
2. `1785769200000-CoherenciaCreditoAprobacionesV143.ts`
3. `1785772800000-GobiernoCreditoFinanzasV144.ts`
4. `1785776400000-CicloVidaConveniosV145.ts`
5. `1785780000000-SlaSecuencialAprobacionesV146.ts`
6. `1785783600000-SolicitudCreditoMakerCheckerV147.ts`
7. `1785787200000-HistorialFinancieroConveniosV148.ts`

Deben ejecutarse en staging sobre una copia anonimizada y revisar el resultado del verificador antes de habilitar operaciones.

## 9. Pruebas agregadas o ampliadas

- ruta acumulativa de autoridad;
- asignación segregada y determinista de personas;
- imposibilidad de reutilizar un aprobador en varios niveles;
- propuesta de crédito sin sobrescribir línea vigente;
- rechazo conservando línea previa;
- aprobación final aplicando versión nueva;
- invalidación de convenios anteriores;
- política de exposición global;
- bloqueo por vencidos;
- snapshot de condiciones en cuentas City Ledger;
- validación de DTOs hoteleros.

## 10. Alcance honesto

Esta versión corrige el dominio revisado de crédito, convenios, City Ledger, cobranza y su conexión financiera. No afirma que todos los motores especializados del ERP hayan sido sustituidos por uno solo: Compras, Nómina y RR. HH. todavía conservan circuitos propios y deben revisarse con la misma matriz de coherencia antes de declararlos unificados.

Tampoco constituye certificación fiscal, contable, laboral o jurídica. Antes de producción se requieren:

- compilación completa backend/frontend con dependencias instaladas;
- Jest y pruebas de integración;
- ejecución real de migraciones en SQL Server;
- pruebas de concurrencia;
- conciliación de pólizas con Contabilidad;
- UAT de crédito, hotelería, caja y cobranza;
- revisión de controles y reportes por contador y responsables legales del cliente.

La instalación de dependencias no pudo completarse en el entorno de empaquetado por timeout/bloqueo del registro. Por ello la validación entregada es estática y estructural, no una afirmación falsa de build exitoso.
