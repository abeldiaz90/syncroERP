# Relevo para Codex — estado de las pruebas end-to-end

Escrito por Claude el 2026-09-15. Complementa `CONTINUIDAD_CODEX_CLAUDE.md`, que lleva la bitácora larga; esto es el resumen operativo para retomar sin leerla entera.

---

## 0. Cuatro cosas que hay que saber antes de tocar nada

**1. Cuál es el backend vivo.** Es `syncroERP\claude\backend`. La carpeta `syncroERP\syncro-erp-backend` es una foto vieja en SQL Server, sin módulo `integracion` y sin nada de lo que llevamos hecho. Yo perdí un rato leyendo la equivocada y saqué una conclusión falsa de código muerto. **Comprobación rápida:** si `credito/services/cobranza.service.ts` no contiene `cancelarPago`, estás en el árbol malo.

**2. Cómo se levanta todo.** `D:\SUMA\erpfineract\syncroERP\claude\INICIAR_TODO.bat` (con `/reiniciar` si quedó algo colgado en 8443, 4200, 3002, 4000 o 3000). El backend corre en modo `--watch`: al guardar un archivo se recompila y **se reinicia el proceso**.

**3. Las migraciones no corren solas.** `DB_MIGRATIONS_RUN=false`. Si tocas una entidad, hay que correr `npm.cmd run db:migration:run` o la API devuelve 500. Ya pasó una vez.

**4. Base de datos.** Postgres en el contenedor `syncroerp-postgres`, puerto 55432. El usuario es `syncroerp`, **no** `postgres` (ese rol no existe).

```
docker exec -i syncroerp-postgres psql -U syncroerp -d syncroerp -c "..."
```

---

## 1. Lo que ya está probado end-to-end, por pantalla

| Flujo | Estado |
|---|---|
| Alta de cliente y réplica al externo | ✅ |
| Venta a crédito por POS → crédito en ERP → préstamo en Fineract | ✅ |
| Crédito **con interés**: desglose capital/interés y póliza con 401.32 | ✅ |
| Cobranza: pago, póliza, réplica | ✅ |
| Cancelación de cobranza y su póliza espejo | ✅ |
| **Mora**: marcado de vencidos, bloqueo del POS, detección en tiempo real | ✅ |
| Flujo de aprobación que habilita la línea de crédito | ✅ |
| **Devolución reintegrable**: inventario, costo, crédito, Fineract | ✅ |
| **Devolución dañada → merma**: los tres movimientos y la reclasificación de costo | ✅ |
| Recuperación de cuentas sin mapear (aprovisionar + reencolar) | ✅ ×4 |
| **Modo ERP solo**: venta a crédito sin que Fineract se entere | ✅ |
| **Alta posterior**: contratar Fineract llevando ya operación | ✅ |
| **Modo AUTORIDAD**: la disponibilidad cambia a origen EXTERNO | ✅ con reserva (ver 3.8) |
| **Pago nacido en Fineract reflejado en el ERP, sin eco** | ✅ |

**Suites de Claude: 47 de 47 pasando**, ejecutadas de verdad en contenedor.
Las 6 suites que fallan son **anteriores** a este trabajo; se verificó quitando los métodos nuevos y seguían fallando igual.

---

## 2. Lo que NO está probado — por orden de riesgo

### 2.1 Aislamiento multi-empresa — son DOS problemas, y sólo uno está abierto

**Del lado del ERP: probado el 15/09**, con una segunda empresa creada de verdad.

| Propiedad | Resultado |
|---|---|
| Nombre de empresa único | ✅ 409 limpio, sin dejar basura |
| **Una persona pertenece a una sola empresa** | ✅ 409, normaliza a minúsculas, y el mensaje explica la regla |
| La reserva se niega sin registro de inquilinos | ✅ y dice por qué |
| **El techo global no es valor por omisión** | ✅ empresa nueva en `APAGADO` con el techo en `AUTORIDAD` |
| Formato del correo del administrador | ❌ ver 3.10 |

**Del lado del core: no se puede probar hoy, por diseño conocido.** Ver `HALLAZGO-AISLAMIENTO-CORE.md` y la cabecera de `alta-empresas.service.ts:34-40`: Fineract deduce el inquilino **del emisor del token, no de la cabecera**, y el ERP se autentica siempre con un solo cliente de servicio. Confirmado en el código vivo: el adaptador manda siempre `this.cfg.tenant` (global). **Hasta que cada empresa tenga su realm, sólo UNA empresa puede operar contra el core.**

Por eso el `tenant: null` de SUMA Local es coherente con ese estado y no una inconsistencia, y por eso la reserva de inquilinos —que existe y funciona— **hoy no compra el aislamiento que parece comprar**.

Lo que queda abierto no es una prueba: es **decidir si se hacen los realms por empresa**. Es arquitectura y producto.

### 2.2 Modo AUTORIDAD — probado, con un cabo suelto
Ya se encendió y se probó (ver 3.8). La disponibilidad cambia a `origen: EXTERNO` correctamente, pero **ningún decisor la consulta**. Falta probar el **modo degradado**: qué hace el sistema cuando el enlace con Fineract se cae estando en AUTORIDAD. El campo `degradado` existe en la respuesta y nunca se ha visto en `true`.

Nota de diseño: el enum no tiene un modo «Fineract solo» literal. Los tres modos comerciales mapean así:

| Modo comercial | `ModoCartera` | `ModoContabilidad` |
|---|---|---|
| ERP + Fineract | SOMBRA o AUTORIDAD | ESPEJO |
| ERP solo | APAGADO | APAGADO |
| Fineract solo | AUTORIDAD | (el ERP es sólo consulta) |

### 2.3 Coincidencia de morosidad entre los dos sistemas
La mora se probó atrasando una cuota **sólo en el ERP** por SQL. Fineract siguió viendo el vencimiento original. Para probar que ambos coinciden hay que **mover también la fecha de negocio de Fineract**. Sin eso, `MORA_DIVERGENTE` está probado detectando la divergencia pero no la coincidencia.

### 2.4 `ajustarPorDevolucionExterna`
Implementado y con pruebas unitarias, **nunca ejecutado en vivo**: el portal no ofrece una acción de `merchantIssuedRefund` que lo dispare desde el lado de Fineract.

### 2.5 Los tres modos desde la consola SUMA
La consola (3010) pide login de Keycloak con un realm que hay que configurar. Es tarea del usuario.

---

## 3. Defectos abiertos, con ubicación

### 3.1 🔴 199 de 206 `@CreateDateColumn` son `timestamp without time zone`
**Síntoma original:** Postgres escribe el instante en UTC sin etiqueta y el driver lo reconstruía con la zona del proceso. Se veía dentro de **un mismo renglón** del outbox: `fechaEnvio` correcta, `fechaCreacion` seis horas adelantada. Consecuencia visible: ninguna venta hecha después de las 18:00 se podía devolver esa noche.

**Mitigado**, no resuelto: primera línea de `src/main.ts`

```ts
process.env.TZ = process.env.TZ || 'UTC';
```

Va en el código y no en el `.bat` porque **el `--watch` reinicia el proceso y la variable del shell no sobrevive** (se comprobó en vivo). La línea del `.bat` se dejó como refuerzo.

**Pendiente de fondo:** migrar las 199 columnas a `timestamptz`. Las 7 que ya lo declaran están en `caja/` y `finanzas/`.

### 3.2 🔴 El stock inicial entra al almacén pero no a la contabilidad
`catalogo/services/inventario.service.ts` → `registrarCompra` (líneas ~125-305) **no encola ningún asiento**, y es la puerta que usan el alta de producto y la API para `stockActual`. En cambio `importacion-stock-inicial-masiva.service.ts:373` sí encola `INVENTARIO_INICIAL`.

**Efecto comprobado:** `115.01 Inventario` quedó con **saldo acreedor de −120** teniendo 9 piezas por 1,080 en el almacén. Una cuenta deudora en saldo acreedor no se puede explicar en un cierre.

### 3.3 🟡 Un crédito que deja de tener cuotas vencidas no vuelve a ACTIVO
`credito/services/cobranza.service.ts` → `actualizarVencidos` **sólo escala**: marca VENCIDO y nunca desmarca. El único camino de vuelta es `registrarPago`, que sí recalcula bien (líneas ~155-168).

CRD-2026-0007 está ahora mismo en VENCIDO con todas sus cuotas al corriente y `vencido: 0`. La disponibilidad no se deja engañar —calcula por fecha en tiempo real y deja comprar—, pero el estado que ven las pantallas, la cartera vencida y las provisiones dice otra cosa.

### 3.4 🟡 El mapeo de cuentas al mayor externo se descubre fallando
Cuatro operaciones nuevas, cuatro cuentas sin mapear: intereses (401.32), costo de ventas (501.01), inventario (115.01) y merma (601.84). El modo de fallo es **el correcto** —se niega a asentar incompleto y nombra la cuenta—, pero siempre se descubre con un evento en rojo.

**Recomendación:** que la conciliación contable avise de cuentas usadas y sin mapear **antes** de que una póliza falle. El mapeo no es tarea de puesta en marcha, crece con la operación.

**Recuperación mientras tanto**, probada cuatro veces:
```
GET  /api/integracion/cuentas/pendientes
POST /api/integracion/cuentas/aprovisionar
POST /api/integracion/outbox/{id}/reencolar
POST /api/integracion/outbox/despachar
```

### 3.5 🟡 `autoConfigurarCuentas` ignora `rolSistema`
`catalogo/services/categorias.service.ts:119`. Resuelve las cuentas **por prefijo de número**, con fallbacks de un solo dígito (`porPrefijo('4')`, `porPrefijo('5')`, `porPrefijo('13')`). Aquí acertó porque existen 115.01 y 501.01 exactas, pero las cuentas ya traen `rolSistema` con INVENTARIO y COSTO_VENTAS etiquetados de forma inequívoca, y no se usa. Con otro catálogo el fallback toma la primera cuenta que encuentre, sin orden definido.

Detalle menor: busca `'401-01'` y `'501-01'` con guion mientras el catálogo cargado usa punto, así que la coincidencia exacta nunca acierta y siempre cae al prefijo.

### 3.6 🟢 UX del asistente de devoluciones
Pide **el UUID de la venta a mano**. No hay búsqueda por folio de ticket ni por cliente. Ningún cajero se sabe un UUID.

### 3.7 🟢 El botón bloqueado del POS no se ve bloqueado
Con el cliente en mora, «Registrar Crédito» queda `disabled` de verdad —se pulsó dos veces sin emitir una sola petición— pero **sus clases no incluyen ningún estilo de estado deshabilitado**, y los cinco productos de crédito se siguen ofreciendo. El cajero pulsa, no pasa nada, y tiene que buscar el aviso de arriba.

### 3.8 🟡 En AUTORIDAD nadie consulta a la autoridad
`DisponibilidadCreditoService` es lo que implementa el modo AUTORIDAD: lee el disponible de Fineract y marca `origen` y `degradado`. Su **único consumidor es el endpoint que lo expone**, `GET /integracion/disponibilidad/:clienteId`, y **nadie llama a ese endpoint**: el POS pide `/credito/creditos/cliente/:id/politica` (`pos/page.tsx:208`) y decide con `politicaCredito.disponible` (`:370`, `:471-473`), calculado de las tablas del ERP.

**Comprobado en vivo:** con un pago de 100 registrado directamente en Fineract, la autoridad decía 114.85 disponible y el POS mostraba 14.85.

No es que el modo no haga nada —la disponibilidad sí cambia de origen— y en la práctica el sistema converge, porque `cartera-reflejo` arrastra las tablas del ERP hacia Fineract. **El riesgo es la ventana**: hasta cinco minutos (el cron) decidiendo con números viejos. En SOMBRA es aceptable; en AUTORIDAD es justo lo que el modo promete eliminar.

**Arreglo propuesto:** que el POS pida `/integracion/disponibilidad/:clienteId` cuando el modo efectivo sea AUTORIDAD, y caiga a `politica` si la respuesta viene `degradado: true`.

### 3.9 🟢 Nota anterior a revisar antes de actuar
En la bitácora escribí que el botón «Registrar Crédito» deshabilitado no se veía deshabilitado. Hoy sus clases sí incluyen `disabled:opacity-50 disabled:cursor-not-allowed`. O me equivoqué, o cambió. **Reproducir antes de tocar nada.**

### 3.10 🟡 La puerta de aprovisionamiento no valida el formato del correo
`POST /aprovisionamiento/empresas` aceptó `EL-CORREO-CON-EL-QUE-ENTRAS-AL-ERP` como correo del administrador. **No tiene arroba.** Y ese correo es justamente lo que el ERP usa para resolver a qué empresa pertenece una persona, además de ocupar el candado de unicidad del que cuelga todo el aislamiento.

Un dedazo ahí crea un administrador que no podrá entrar nunca y reserva esa cadena para siempre. Arreglo: validar formato en el DTO, al lado de la comprobación de unicidad que ya está en `alta-empresas.service.ts:265`.

---

## 4. Cambios hechos por Claude que **no están en Git**

Nada de esto está versionado. Ojo con los finales de línea: el repo tiene archivos CRLF y LF mezclados, y hay que respetar el de cada archivo.

| Archivo | Qué |
|---|---|
| `integracion/ports/cartera-externa.port.ts` | `TransaccionCreditoExterna` + `transaccionesCredito()` |
| `integracion/adaptadores/fineract/fineract-cartera.adapter.ts` | `transaccionesCredito` vía `GET /v1/loans/{id}?associations=transactions`; helper `esNoEncontrado()` que arregla una rama 404 muerta |
| `integracion/integracion.constants.ts` | Listas de tipos de transacción, `tipoTransaccionNormalizado()`, `capacidadPermitida()` |
| `integracion/services/cartera-conciliacion.service.ts` | `revisarTransacciones()`, cierre automático, **`MORA_DIVERGENTE`**, arreglo del falso positivo de `ESTADO_DIVERGENTE` |
| `integracion/services/cartera-publicador.service.ts` | `dia()` baja los instantes con `fechaCalendarioNegocio()` |
| `credito/services/cartera-reflejo.service.ts` | **nuevo** — aplica en el ERP lo que pasó en el externo |
| `credito/services/cobranza.service.ts` | `cancelarPago()`, `ajustarPorDevolucionExterna()`, supresión de eco vía `idTransaccionExterna` |
| `credito/entities/pago-cobranza.entity.ts` | columnas de cancelación y origen externo |
| `database/migrations/postgres/1789430000000-CancelacionCobranza.ts` | **nueva**, ya aplicada |
| `finanzas/services/motor-contable.service.ts` | asientos de cancelación de cobranza y de ajuste por devolución externa |
| `integracion/services/sincronizacion-inicial.service.ts` | **nuevo** — backfill con `?simular=1` |
| `aprobaciones/services/aprobaciones-documentos.service.ts` | `exigirValidacionFavorable()` antes de autorizar una línea |
| `main.ts` | `process.env.TZ` (ver 3.1) |
| `INICIAR_TODO.bat` | `$env:TZ='UTC'` (original en `.bak-claude`) |

**Specs nuevas, las cuatro pasando:** `fineract-transacciones-credito.spec.ts`, `cartera-transacciones-externas.spec.ts`, `cartera-reflejo.spec.ts`, `aprobaciones-validacion.spec.ts`.

Limpiar cuando ya no sirva: `_backups-local\claude-tests-src.tgz`.

---

## 5. Estado de los datos de prueba, ahora mismo

- Empresa `7dfc9526-986f-47e5-9503-f896646e347b` «SUMA Local», en **SOMBRA / ESPEJO**.
- **Basura de prueba: `EMPRESA B PRUEBA AISLAMIENTO`** (`866908f3-…`), creada el 15/09 con el administrador `el-correo-con-el-que-entras-al-erp` —un marcador de posición que se pegó literal—. Inerte (`usaFineract: false`, modo `APAGADO`) pero conviene borrarla con su usuario.
- `CARTERA_MODO=SOMBRA` restaurado en `.env.local` (surte efecto al próximo reinicio completo; la empresa ya está en SOMBRA, así que el efectivo es el correcto).
- Producto `INV-CLAUDE-001` TERMO ACERO: **8 piezas**, costo 120, precio 200.
- **CRD-2026-0010 ACTIVO con saldo 100**, préstamo 14 en Fineract con desembolso 36 y pago 37. Este es el crédito que nació con la integración apagada, se recuperó con el backfill, y recibió un pago nacido en Fineract.
- CRD-2026-0008 y CRD-2026-0009 LIQUIDADOS; préstamos 12 y 13 cerrados.
- CRD-2026-0007 en **VENCIDO** con cuotas al corriente (ver 3.3).
- Outbox: **43 ENVIADO, 0 pendientes, 0 fallidos**.
- Conciliación de cartera: **9 revisados, 0 discrepancias**.
- Conciliación contable: 1 `REVERSA_EXTERNA` sobre `IN-2026-00005`, **anterior** a estas pruebas.
- Cuentas mapeadas al mayor externo: 401.01, 401.32, 402.01, 105.01, 101.01, 115.01, 501.01, 601.84.
- `115.01 Inventario` en saldo acreedor, por el defecto 3.2.

## 6. Por dónde seguir

1. **Modo degradado** — lo que queda de mayor riesgo real. Tirar Fineract con la empresa en AUTORIDAD y ver qué hace el sistema. El campo `degradado` existe y nunca se ha visto en `true`. Es el escenario que decide si ese modo es usable en producción. Requiere `CARTERA_MODO=AUTORIDAD` y reinicio completo.
2. **Fecha de negocio de Fineract**, para cerrar la prueba de mora (2.3).
3. **Cablear la autoridad al POS** (defecto 3.8), si se decide que AUTORIDAD va a producción.
4. **Decidir los realms por empresa** (ver 2.1). No es una prueba pendiente, es una decisión.

### Cómo cambiar de modo, ya probado

```
PATCH /api/integracion/configuracion   {"modo":"APAGADO|SOMBRA|AUTORIDAD","modoContabilidad":"APAGADO|ESPEJO"}
```

Dos cosas aprendidas a golpes:

- El **techo global** de `.env.local` manda sobre lo que pida la empresa. Subir a AUTORIDAD requiere `CARTERA_MODO=AUTORIDAD` **y reinicio completo del backend**: el `--watch` NO relee `.env.local`, porque dotenv no pisa variables ya presentes en el entorno del proceso padre y ese entorno sobrevive al reinicio del watch.
- El servicio **se niega a subir a AUTORIDAD con discrepancias abiertas**. La conciliación tiene que estar en cero.

### Para registrar un pago desde el portal de Fineract

El portal espera el comando **en el cuerpo**, no en la query:

```js
POST /api/loans/{id}/transactions
{"command":"repayment","payload":{"transactionDate":"2026-09-15","transactionAmount":100}}
```

Con `?command=repayment` responde «Transacción de crédito no permitida», que suena a bloqueo de negocio y no lo es.

---

## 7. Pendientes, priorizados (Claude, 15/09 tarde)

El criterio del orden es daño × probabilidad, no esfuerzo. Lo primero no es lo más difícil: es lo que más duele si no se hace.

### P0 — Hoy, antes que nada

**1. Salvar el trabajo en Git.** Último commit: `a3107ce`, 14/09. Desde entonces hay dos días de trabajo de tres manos sin commitear.

Hay una trampa que conviene conocer antes de intentarlo: `git status` muestra **1,338 modificados**, pero **sólo 29 tienen cambios reales** (2,920 inserciones / 287 borrados) más 17 rutas nuevas. Los otros 1,309 son **puro final de línea**: `activos.controller.ts`, que nadie tocó, reporta 147 inserciones y 147 borrados, y con `git diff --ignore-cr-at-eol` el diff queda vacío. No hay `.gitattributes` ni `core.autocrlf` configurado.

Commitear a ciegas entierra 29 archivos reales bajo 1,309 fantasmas y deja un diff que nadie puede revisar. Lo correcto son dos pasos separados:

```
# 1) Sólo lo real, por ruta explícita
git diff --ignore-cr-at-eol --name-only          # los 29
git status --short | grep '^??'                  # los 17 nuevos
git add <esas rutas>  &&  git commit

# 2) Aparte, y sólo después, decidir la normalización
#    .gitattributes con `* text=auto` + commit de normalización propio
```

### P1 — Bloqueantes de producción

**2. Migrar las 199 `@CreateDateColumn` a `timestamptz`.** Hoy está **mitigado, no resuelto**, con una línea en `main.ts`. Quien la borre o arranque el proceso de otro modo reintroduce el bug entero: auditoría seis horas corrida, ventana de devoluciones mal medida, cierres de periodo en el día equivocado. Una mitigación que depende de que nadie toque una línea no es un arreglo.

**3. El stock inicial que no llega a contabilidad** (defecto 3.2). `115.01 Inventario` en saldo acreedor. Aparece con el primer cliente que venda productos físicos y no hay forma de explicarlo en un cierre.

**4. Crear los roles operativos en Fineract.** Hoy sólo existen Super user, Self Service User y la cuenta técnica, así que todo usuario del ERP acaba operando como **Super user**. Es un hallazgo de control interno, no de software: un cajero con permisos para cerrar el periodo.

### P2 — Decisiones de producto que bloquean trabajo

**5. ¿Se hacen los realms por empresa?** Sin eso, **sólo una empresa puede operar contra el core** (ver 2.1). No es una prueba pendiente, es una decisión de arquitectura, y condiciona todo el discurso multi-inquilino.

**6. Las dos del portal de Fineract:** con qué credencial llama al ERP, y **quién aplica el candado de verificación cuando no hay ERP de por medio**. La segunda es lógica nueva.

**7. AUTORIDAD: cablearlo al POS o no venderlo** (defecto 3.8). Hoy el modo existe y ningún decisor lo consulta.

**8. El crédito que no vuelve a ACTIVO** (defecto 3.3). Afecta cartera vencida, provisiones y lo que ven las pantallas. Es pequeño de arreglar y sucio de dejar.

### P3 — Pruebas que faltan

**9. Modo degradado en AUTORIDAD.** `degradado` nunca se ha visto en `true`. Es lo que decide si ese modo es usable.
**10. Coincidencia de mora entre los dos sistemas.** Requiere mover la fecha de negocio de Fineract.
**11. `ajustarPorDevolucionExterna` en vivo.** Implementado y con pruebas unitarias, nunca ejecutado de verdad.

### P4 — Construcción pendiente

**12. Consola SUMA.** Se puede llenar el `.env.local` y el enlace con el ERP; **el realm `suma-consola` y el grupo `/operadores` en Keycloak son del usuario** (son cuentas y seguridad).
**13. `crearRol()` en el puerto de usuarios externos**, para los roles espejo del P1-4. Criterio: el ERP propone la **correspondencia**, no los **permisos**.

### P5 — Higiene, cuando haya hueco

**14.** `etapaComercial` que nadie mantiene (la lista ya no lo muestra, pero el campo sigue muerto).
**15.** Avisar de cuentas usadas y sin mapear **antes** de que una póliza falle (pasó cuatro veces).
**16.** `autoConfigurarCuentas` que resuelve por prefijo e ignora `rolSistema` (3.5).
**17.** Validar el formato del correo en el alta de empresas (3.10).
**18.** El asistente de devoluciones que pide un UUID a mano (3.6).
**19.** Las 96 `@Roles()` decorativas — decidido: documentadas, sin tocar.
**20.** Limpieza: `EMPRESA B PRUEBA AISLAMIENTO` con su usuario inventado, y en `_backups-local` los archivos `claude-tests-src.tgz`, `src-hoy.tgz` y `jest.claude.config.js.borrar`.
