# SyncroERP + Apache Fineract · Documentación

**Revisión:** 15 de octubre de 2026
**Alcance:** lo que el sistema **hace**, verificado contra el sistema corriendo.

> Esta carpeta documenta únicamente lo que se considera **terminado y estable**.
> Lo que todavía se mueve —el timbrado CFDI y el realm por empresa— está en
> `06-limites-conocidos.md`, nombrado y con su estado, y **no** se describe aquí
> como si funcionara. Una documentación que promete lo que el sistema no hace
> cuesta más que no tener documentación.

---

## Dónde se leen

Aquí, como archivos del repositorio, y **dentro del ERP**: entrando en
**Ayuda y documentación**, con descarga en PDF. El backend los lee de esta misma
carpeta en cada petición, así que corregir un documento aquí lo corrige también
en la pantalla, sin volver a desplegar nada.

Los siete manuales de usuario —`03`, `04`, `07`, `08`, `09`, `10` y `11`— los
lee cualquiera; los cinco documentos técnicos, sólo el administrador. El detalle está en `01-instalacion-y-puesta-en-marcha.md`
§2.9.

---

## Los documentos

| # | Documento | Para quién |
|---|---|---|
| 00 | [Estado de la documentación](00-ESTADO-DE-LA-DOCUMENTACION.md) | Quien decide qué documentar. Qué hay, qué falta y en qué orden conviene cerrarlo, contado contra las 146 pantallas del ERP. |
| 01 | [Instalación y puesta en marcha](01-instalacion-y-puesta-en-marcha.md) | Quien despliega. Piezas, variables de entorno, orden de arranque, verificación. |
| 02 | [Arquitectura](02-arquitectura.md) | Quien mantiene el código. Autenticación, autorización, aislamiento, contabilidad, integración. |
| 03 | [Manual por rol](03-manual-por-rol.md) | Usuarios finales y quien los capacita. Los trece roles y los manuales de cierre, conciliación, póliza y crédito. |
| 04 | [Compras y nómina](04-compras-y-nomina.md) | Los dos ciclos que firma más de una persona. |
| 05 | [Aprovisionamiento y consola SUMA](05-aprovisionamiento-y-consola-suma.md) | SUMA. Cómo se da de alta una empresa nueva en cada uno de los tres modos. |
| 06 | [Límites conocidos](06-limites-conocidos.md) | Todos. Lo que no está probado y lo que falta, con el motivo. |
| 07 | [Flujos y procesos, paso a paso](07-flujos-y-procesos.md) | Usuarios finales. Diecisiete procesos de punta a punta, con quién firma cada paso y el texto exacto de cada negativa. |
| 11 | [Configuración y asistentes](11-configuracion-y-asistentes.md) | Quien pone una empresa en marcha. El centro de preparación, los seis asistentes y el orden de una empresa nueva. |
| 10 | [Reportes](10-reportes.md) | Dirección, gerencia y caja. Las siete pantallas de reportes y de dónde sale cada número. |
| 09 | [Hotelería](09-hoteleria.md) | Recepción, ama de llaves y alimentos y bebidas. Las once pantallas del hotel, recorridas de punta a punta contra el sistema corriendo. |
| 08 | [El portal de Fineract](08-fineract-portal.md) | Quien opera crédito y captación. Las ocho áreas del portal y el ciclo de un crédito acto por acto. |

> El 07 existía desde el 9 de octubre y **no estaba en esta tabla**. Un índice al
> que le falta un documento no se lee como incompleto: se lee como que ese
> documento no existe.

---

## Las capturas

Las capturas de pantalla viven en `img/` y los documentos las nombran así:

```
![La lista de pedidos, con el estado derivado de lo que falta por surtir.](img/pedido-lista.jpg)
```

Una captura va **sola en su línea** y su destino empieza por `img/`. El pie es
también el texto alternativo, así que se escribe como una frase, no como un
nombre de archivo.

Se sacan con un script, no a mano:

```
cd claude/backend
npm run docs:capturar            # todas
npm run docs:capturar -- pedido  # sólo las que coincidan
```

Abre una ventana de verdad y **espera a que entres con tu usuario**: no escribe
contraseñas ni las pide. Las captura con el rol de quien entró, y al terminar
avisa si alguna documenta una pantalla de otro puesto — un manual que enseña
botones que el lector no tiene es peor que uno sin capturas.

Dos cosas las vigila la suite, no la buena voluntad: que **toda captura que un
documento nombra exista** —si no, sale un recuadro que lo dice, y la prueba se
pone roja antes— y que **ninguna pase de 400 KB**. Las capturas viajan dentro
del HTML del manual, así que su peso es el tiempo que tarda en abrir.

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

## Estado de las pruebas

Aquí había una tabla con el número de pruebas de cada suite. Se quita, y el
motivo vale más que la tabla: **decía 1 075 cuando ya eran más del doble**. Un
número copiado a mano envejece en silencio y, mientras envejece, se lee como
medido.

El número de verdad lo imprime la suite al correr:

```
cd claude/backend && npx jest
```

Lo que sí es una promesa de este proyecto, y no un número: **toda prueba que
fija un defecto se verificó en rojo antes de aceptarse.** Una prueba que nunca
falló no demuestra nada.
