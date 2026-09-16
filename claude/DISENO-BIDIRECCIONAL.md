# Sincronización bidireccional ERP ↔ Fineract

Especificación de diseño. Escrita por Claude el 2026-09-14 a partir del criterio que fijó el usuario. Sustituye cualquier supuesto previo sobre el sentido core → ERP.

## 1. Criterio del usuario

Bidireccional cuando el cliente tiene **ERP y Fineract** contratados juntos: lo que se mueve en uno se ve en el otro, en ambos sentidos. Sólo ERP: Fineract no se entera. Sólo Fineract: el ERP no se entera.

Y dos precisiones que ordenan todo lo demás:

- **Automático de punta a punta.** Nada debe quedar esperando a que una persona lo teclee.
- **Sin quitar poder a los roles.** Los permisos siguen gobernando qué se puede hacer.

Estas dos no se contradicen, y la forma de cumplir ambas es la regla del apartado 2.

## 2. Principio rector: automatizar quién teclea, no qué se permite

El reflejo hacia el ERP **nunca escribe filas directamente en las tablas**. Entra por los servicios del ERP que ya existen —cobranza, devoluciones, pólizas— con sus validaciones, sus reglas de negocio y sus comprobaciones de rol intactas. Lo que se automatiza es el disparo, mediante una cuenta de servicio identificada; lo que no se toca es el conjunto de reglas.

Escribir directo en las tablas sería más rápido de programar y es exactamente el atajo que convierte una integración en una fuente de datos corruptos: saltarse las validaciones del ERP significa que el core puede meter en el ERP estados que el ERP considera imposibles. Además deja sin trazabilidad quién hizo qué, que es justo lo que un sistema financiero no se puede permitir.

Toda operación reflejada queda marcada con su origen externo y el identificador de la transacción del core que la causó. Auditable, reversible, atribuible.

## 3. El discriminador: qué nació fuera

No hace falta heurística ni ventanas de tiempo. **El ERP pone un `externalId` propio en cada transacción que origina** en el core, y guarda el vínculo. El adaptador ya sabe buscar por esa vía (`/v1/loans/{id}/transactions/external-id/{referencia}`).

Regla: *toda transacción presente en el core cuyo identificador externo no corresponda a un vínculo conocido del ERP fue originada fuera del ERP.* Exacto, sin ambigüedad, sin falsos positivos por relojes desincronizados.

Esto es lo que hace viable todo el resto del diseño, y conviene no romperlo: cualquier camino nuevo que escriba en el core debe seguir poniendo su `externalId` y registrando el vínculo.

## 4. Reparto por entidad: qué se refleja y qué se corrige

No todo debe viajar igual. La diferencia no es de comodidad, es de a quién le pertenece el dato.

### 4.1 Cartera — reflejo real en ambos sentidos

El core es un lugar legítimo para operar cartera. Lo que pase ahí debe aparecer en el ERP aplicado, no anunciado:

| Ocurre en el core | El ERP hace |
|---|---|
| Pago sobre un préstamo vinculado | Aplica la cobranza equivalente por su servicio de cobranza |
| Devolución / ajuste | Aplica la devolución equivalente |
| Cancelación del préstamo | Cancela el crédito vinculado |
| Reversa de un pago | Reversa la cobranza correspondiente |

### 4.2 Contabilidad — detección y corrección, también automática, pero por la puerta del ERP

Los libros contables del ERP son fiscales. El core **no escribe en ellos**. Pero eso no significa dejarlo en un aviso esperando a una persona: significa que la corrección se aplica **generando la operación del ERP que corresponde**, con su numeración de folios, su cuadre y su registro.

Caso ya real y probado: reversa externa del asiento `a2bef5f612d7`. Hoy la conciliación contable lo detecta bien (`REVERSA_EXTERNA`) y se detiene ahí. Debe continuar: cancelar la póliza vinculada por el servicio de cancelación del ERP, que genera su propia póliza de reversa.

**Bloqueo conocido:** ese servicio responde hoy `409 — "Debes completar el Asistente Maestro de Finanzas"`. Hay que resolverlo antes de poder cerrar este caso, y es decisión del negocio, no técnica.

### 4.3 Altas nacidas en el core

Cliente o préstamo creado directamente en el core, con ambos productos contratados: el ERP debe crear su contraparte. Es el caso de mayor riesgo de duplicado —el mismo cliente dado de alta por los dos lados— así que la contraparte se crea **vinculada por identificador externo desde el primer momento**, nunca por coincidencia de nombre o RFC.

## 5. Mecanismo: sondeo como base, webhook como acelerador

Fineract ofrece Hooks, pero **el mecanismo base debe ser el sondeo (pull)**, por tres razones:

1. Sobrevive a cortes de red. Un webhook perdido se pierde para siempre; un sondeo simplemente llega tarde.
2. No obliga a exponer el ERP a conexiones entrantes, lo que en despliegues de cliente es a menudo imposible.
3. **De todas formas hace falta un conciliador de respaldo.** Si hay que construirlo, que sea el camino principal en vez de un segundo mecanismo que se pruebe poco y falle callado.

El webhook, si se añade después, sólo reduce la latencia: dispara el mismo sondeo antes. Nunca debe ser la única vía por la que un dato entra.

## 6. Ingesta: outbox inverso

Un `inbox` espejo del outbox que ya funciona, reutilizando sus patrones probados en vez de inventar otros: estado, intentos, `claveIdempotencia`, marca EN_VUELO antes de aplicar, tope de reintentos, respeto al circuito abierto.

- Clave de idempotencia: el identificador de la transacción del core. Reaplicar es inofensivo.
- El aplicador llama a los servicios del ERP (apartado 2), nunca al repositorio.
- Lo que falla tras agotar reintentos **no se descarta**: queda visible como discrepancia, que es donde el buzón de avisos actual sí tiene sentido —como excepción, no como flujo normal.

## 7. Backfill al contratar el segundo producto

Hoy encender un eje **no recupera nada del pasado**, comprobado dos veces (cartera el 14/09 con el crédito CRD-2026-0005, y contabilidad con las pólizas anteriores a ESPEJO). Un cliente que contrata el segundo producto arranca con el otro lado permanentemente atrasado, y además **no puede promoverse a AUTORIDAD**, porque esa promoción se rechaza con discrepancias abiertas.

Hace falta una sincronización inicial explícita que, al encender un eje, recorra lo existente y encole lo que falte en la dirección que corresponda. No debe ser automática y silenciosa al cambiar el modo: debe ser un paso declarado, con su informe de qué va a mover, porque en un cliente real puede ser mucho volumen.

Mientras no exista, la consola SUMA debe avisar explícitamente de que el cambio de modo no es retroactivo.

## 8. Aislamiento: la parte que no se puede romper

Todo lo anterior vive bajo el modo efectivo. En concreto:

- Empresa en **sólo ERP**: el sondeo no debe ni siquiera consultar al core. No basta con descartar el resultado.
- Empresa en **sólo Fineract**: no debe existir empresa operando en el ERP.
- El filtro va por **modo efectivo**, nunca por el modo pedido por la empresa: el techo global manda, tal como ya hace `combinarContabilidad`.

La conciliación contable de Codex ya lo hace bien y sirve de patrón a copiar.

## 9. Orden de trabajo sugerido

1. Puerto: listar transacciones de un préstamo con su identificador externo. Es la pieza que hoy no existe y de la que depende todo el sentido core → ERP.
2. Inbox + aplicador de cartera, empezando por el pago externo, que es el caso más frecuente y el de mayor valor.
3. Cierre automático del caso contable `REVERSA_EXTERNA` (requiere desbloquear el Asistente Maestro de Finanzas).
4. Sincronización inicial y aviso en la consola.
5. Altas nacidas en el core.
6. Modo sólo Fineract, que sigue sin probarse.

---

# Anexo — Flujo de validación previo al crédito

Requisito añadido por el usuario el 2026-09-14:

> Cuando alguien va a pedir un crédito debe pasar primero por un flujo de aprobación. Cada empresa deberá configurarlo. Si después de las validaciones el crédito se aprueba, entonces se da de alta en el ERP y en Fineract. Y ese flujo debería poder configurarse desde la consola, igual que hoy se configuran los modos de contratación.

## A1. Lo que ya existe, y funciona

El motor está construido y es bueno: `integracion/validacion/`. Siete tipos de paso (identidad INE, buró, círculo, historial interno, listas de bloqueo, política interna, revisión humana), tres políticas por paso (bloqueante, deriva a revisión, informativo), pesos, umbrales, puntaje mínimo y tope de aprobación automática. Produce un veredicto y un **expediente** que queda guardado.

Hay pantalla de diseño en `/dashboard/creditos/verificacion`, con plantilla sugerida para no empezar en blanco, y guardado como borrador separado de la activación —«activarlo cambia a quién se le presta, y eso es un paso aparte»—.

**Simulado por Claude el 14/09** sobre un flujo de 5 pasos, con respuestas forzadas:

| Escenario | Veredicto | Puntaje |
|---|---|---|
| Todo aprobado | REVISION_MANUAL | 100 |
| Identidad rechazada (bloqueante) | RECHAZADA | 0 |
| Buró rechazado (deriva a revisión) | REVISION_MANUAL | 75 |
| Historial rechazado (bloqueante) | RECHAZADA | 0 |
| Ejecución real, sin proveedores | REVISION_MANUAL | 0 |

Dos comportamientos que conviene no cambiar por descuido: con `topeAutomatico` en 0, ni un expediente perfecto aprueba solo —«el flujo no autoriza montos de forma automática»—; y sin proveedores configurados el motor **no aprueba**, manda a revisión. Falla en cerrado, que es lo correcto.

## A2. El hueco: el flujo no obliga a nada

**Nada llama al motor fuera de su propio controlador.** Comprobado: `MotorValidacionService` sólo aparece en el módulo y en `validacion.controller.ts`. La venta a crédito del POS no lo consulta, y el crédito se origina y se replica a Fineract sin que el flujo haya opinado.

La propia pantalla lo dice: *«Este flujo produce un veredicto y un expediente; no otorga el crédito»*. Hoy es un asesor, no una puerta.

Lo que pide el usuario es convertirlo en puerta: **sin veredicto favorable no hay crédito, ni en el ERP ni en Fineract**.

### Qué hace falta

1. **Enganchar el motor en la originación.** Antes de crear el crédito, ejecutar el flujo activo y exigir veredicto aprobatorio. Sin flujo activo, el comportamiento de hoy (sólo política general) para no romper a quien no lo ha configurado.
2. **Decidir qué pasa con REVISION_MANUAL en el punto de venta.** Es la decisión de producto de verdad: o la venta se detiene y queda una solicitud pendiente, o no se vende a crédito ahí. Ambas son defendibles; lo que no lo es es dejar que pase.
3. **Guardar el expediente junto al crédito.** Si mañana alguien pregunta por qué se otorgó, la respuesta tiene que estar. Es además lo que un auditor va a pedir.
4. **Orden con la integración:** el veredicto va primero, el alta en el ERP después, y el evento a Fineract al final por el outbox de siempre. Nunca al revés: un préstamo creado en el core para un crédito que luego se rechaza es exactamente la basura que la conciliación tendría que limpiar.

## A3. Sobre llevarlo a la consola SUMA

La idea del usuario es razonable pero conviene partirla en dos, porque **hay una mitad que no debe vivir en la consola**.

El LEEME de la consola es explícito sobre su propio límite: *«**No:** nada de operación. Ni cartera, ni clientes finales, ni créditos, ni contabilidad. Si algún día se propone agregar “un reportito de cartera porque es cómodo”, ése es el momento de decir que no.»*

Y decidir **a quién le presta un cliente de SUMA** es operación suya, no contratación. Si SUMA define el flujo, SUMA decide quién recibe crédito en sus clientes, y eso es responsabilidad —y probablemente exposición legal— que no le corresponde.

El reparto que sí respeta ese principio:

- **Consola SUMA:** qué capacidades de validación tiene **contratadas** cada empresa —si su paquete incluye buró, círculo, verificación de identidad— y los topes duros que SUMA imponga. Es el catálogo de lo que está disponible, exactamente igual que los modos de contratación. Encaja perfecto.
- **ERP, administrador de la empresa:** cómo ordena esos pasos en su flujo, con qué política, qué pesos, qué puntaje mínimo y qué tope automático. Eso ya existe y funciona.

Dicho de otro modo: **la consola dice qué puedes usar; el ERP dice cómo lo usas.** Con eso el usuario obtiene lo que quiere —que la consola gobierne el flujo— sin convertir a SUMA en el comité de crédito de sus clientes.

## A4. Estado dejado por la prueba

Flujo **PRUEBA CLAUDE - Originacion de credito** (`fbd60ae4`), 5 pasos, **ACTIVO** en la empresa de pruebas. Se dejó activo a propósito, para que se vea en pantalla que hay flujo y aun así el POS vende a crédito sin consultarlo. 8 expedientes de simulación guardados. Todo sintético y desechable: borrar cuando estorbe.

## A5. CORRECCIÓN — el flujo va en el otorgamiento de la línea, no en la venta

El usuario precisó el modelo el 14/09, y corrige lo que este anexo planteaba antes:

> Antes de venderle a alguien a crédito ya debió de haber pasado por esta validación, y si fue todo favorable se otorga el producto de crédito, si no, no. Una vez que el crédito se aprueba se inscribe en Fineract y en el ERP.

Es decir: la validación **no** se ejecuta en cada venta del POS. Se ejecuta al **otorgar la línea de crédito al cliente**. Cuando llega al mostrador, el cliente ya trae línea o no la trae.

Eso disuelve la pregunta que yo había dejado abierta —qué hacer con REVISION_MANUAL en el punto de venta—: en el punto de venta no se hace nada, porque ahí ya está decidido.

### El punto de enganche, que ya existía

`aprobaciones/services/aprobaciones-documentos.service.ts`, proceso `CREDITO_CLIENTE`. Es un maker-checker: alguien solicita la línea y otro la resuelve. Al aprobar pone `estadoCredito = AUTORIZADO`, fija límite y versión, y publica **`lineaAutorizada`** al outbox dentro de la misma transacción —si la aprobación se revierte, el externo nunca supo de una línea que no llegó a existir—.

O sea: el recorrido que describe el usuario ya estaba construido. Lo único que faltaba era que el motor de validación tuviera voz en él.

### Implementado

`exigirValidacionFavorable(empresaId, clienteId, limiteSolicitado)`, llamada justo antes de autorizar:

- **Sin flujo activo, no exige nada.** Quien no configuró verificación sigue igual. Activar el flujo es la declaración de «no quiero autorizar líneas a ciegas».
- **Con flujo activo y sin expediente: bloquea.**
- **Expediente RECHAZADA: bloquea**, citando los motivos.
- **REVISION_MANUAL y APROBADA_CON_AJUSTE: dejan pasar**, a propósito. REVISION_MANUAL significa «que lo mire una persona», y quien aprueba aquí es una persona. Bloquearlo convertiría el veredicto más frecuente del motor —el que sale mientras no haya proveedores— en un candado imposible de abrir.
- **El expediente debe cubrir el importe.** Uno hecho por 5.000 no justifica una línea de 500.000. Sin esto bastaría con validar barato una vez para autorizar cualquier cosa después.
- **Los expedientes de simulación no valen.** Si valieran, cualquiera autorizaría una línea forzando las respuestas a APROBADO desde la pantalla de diseño.

Pruebas: `aprobaciones/services/aprobaciones-validacion.spec.ts`, 9 casos.

### Lo que queda de esta pieza

1. **Ejecutar el flujo automáticamente al solicitar la línea.** Hoy la puerta exige el expediente pero alguien tiene que haberlo creado a mano desde `/dashboard/creditos/verificacion`. Lo natural es que la solicitud lo dispare sola.
2. **Mostrar el expediente en la pantalla de aprobación**, para que quien autoriza vea el veredicto y sus motivos sin ir a buscarlos.
3. **Proveedores reales.** Hoy todos los pasos devuelven NO_DISPONIBLE y el motor manda a revisión. Falla en cerrado, que es correcto, pero significa que hasta que lleguen los proveedores de SUMA ninguna línea se aprobará sola.
