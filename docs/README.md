# SyncroERP + Apache Fineract · Documentación

**Revisión:** 28 de septiembre de 2026
**Alcance:** lo que el sistema **hace**, verificado contra el sistema corriendo.

> Esta carpeta documenta únicamente lo que se considera **terminado y estable**.
> Lo que todavía se mueve —el timbrado CFDI y el realm por empresa— está en
> `06-limites-conocidos.md`, nombrado y con su estado, y **no** se describe aquí
> como si funcionara. Una documentación que promete lo que el sistema no hace
> cuesta más que no tener documentación.

---

## Los documentos

| # | Documento | Para quién |
|---|---|---|
| 01 | [Instalación y puesta en marcha](01-instalacion-y-puesta-en-marcha.md) | Quien despliega. Piezas, variables de entorno, orden de arranque, verificación. |
| 02 | [Arquitectura](02-arquitectura.md) | Quien mantiene el código. Autenticación, autorización, aislamiento, contabilidad, integración. |
| 03 | [Manual por rol](03-manual-por-rol.md) | Usuarios finales y quien los capacita. Los trece roles y los manuales de cierre, conciliación, póliza y crédito. |
| 04 | [Compras y nómina](04-compras-y-nomina.md) | Los dos ciclos que firma más de una persona. |
| 05 | [Aprovisionamiento y consola SUMA](05-aprovisionamiento-y-consola-suma.md) | SUMA. Cómo se da de alta una empresa nueva en cada uno de los tres modos. |
| 06 | [Límites conocidos](06-limites-conocidos.md) | Todos. Lo que no está probado y lo que falta, con el motivo. |

---

## Tres cosas que conviene saber antes de leer nada

**1 · El código que corre vive en `claude/backend` y `claude/frontend`.**
Las carpetas `syncro-erp-backend` y `syncro-erp-frontend` de este mismo
repositorio están congeladas desde el 10 de septiembre de 2026 y no ejecutan
nada. Ya costaron horas de trabajo sobre el árbol equivocado.

**2 · El producto se vende de tres formas** —sólo ERP, sólo Fineract, ERP +
Fineract— y el código lo respeta pantalla por pantalla. Ver §2 de
`02-arquitectura.md`.

**3 · Keycloak es la autoridad de identidad.** El ERP no autentica contraseñas,
no las guarda y no las cambia. Si hay que reponer una, se repone en Keycloak.

---

## Estado de las pruebas en esta revisión

| Suite | Pruebas | Suites |
|---|---|---|
| ERP (backend) | 1 075 | 170 |
| Portal Fineract | 106 | 14 |
| Consola SUMA | 8 | 1 |

Toda prueba que fija un defecto se verificó **en rojo** antes de aceptarse: una
prueba que nunca falló no demuestra nada.
