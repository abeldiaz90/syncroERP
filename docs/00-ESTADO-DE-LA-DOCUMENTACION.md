# 00 · Estado de la documentación

**Revisión:** 15 de octubre de 2026
**Para:** saber, sin abrir nada, qué está documentado y qué no.

> Este documento existe porque la pregunta «¿cómo vamos con la documentación?»
> no se puede contestar leyendo la documentación: hay que **contar**. Aquí está
> la cuenta, con los huecos nombrados. Si un renglón dice que falta algo, falta
> de verdad; preferimos un hueco escrito a una casilla verde que nadie midió.

---

## 1. Lo que hay, medido

| Documento | Líneas | Capturas | Revisión |
|---|---:|---:|---|
| `01-instalacion-y-puesta-en-marcha.md` | 257 | 0 | 28-sep |
| `02-arquitectura.md` | 518 | 0 | 28-sep |
| `03-manual-por-rol.md` | 391 | **0** | 8-oct |
| `04-compras-y-nomina.md` | 356 | **0** | 8-oct |
| `05-aprovisionamiento-y-consola-suma.md` | 461 | 6 | **15-oct** |
| `06-limites-conocidos.md` | 298 | 1 | 13-oct |
| `07-flujos-y-procesos.md` | 1 183 | 31 | 13-oct |
| `08-fineract-portal.md` | 797 | 13 | 14-oct |
| `09-hoteleria.md` | 284 | 6 | **15-oct** |

Más `FINERACT_UI_COVERAGE.md`, que es la matriz pantalla por pantalla del
portal, y el `LEEME.md` de la consola, que es su puesta en marcha.

**Que un documento no tenga capturas no lo invalida** —`02-arquitectura` no las
necesita—, pero en `03` y `04` sí importa: son los dos que alguien sigue con el
sistema abierto delante, y son los dos que no enseñan ni una pantalla.

---

## 2. Flujos documentados, por sistema

### ERP · 18 flujos en `07`, 10 manuales en `03`, compras y nómina en `04`

| # | Flujo |
|---|---|
| 1–4 | Vender en mostrador · devolver · anular · facturar (CFDI 4.0) |
| 5 | Mover mercancía entre almacenes (y el conteo físico) |
| 6 | Abrir, cobrar y arquear la caja |
| 7–9 | Vacaciones · incidencias de nómina · correr la nómina |
| 10 | Pedido de venta: apartar, surtir y el backorder |
| 11 | Factura de proveedor y el cotejo de tres vías |
| 12 | Centros de costo y presupuestos |
| 13 | Cerrar el ejercicio |
| 14 | Cuando el sistema te dice que no |
| 15 | Depreciación de activos fijos, y cómo deshacerla |
| 16 | Cotizar y adjudicar |
| 17 | El embudo de ventas, de prospecto a cliente |

### Portal de Fineract · `08`, con su matriz de cobertura

Cartera, cliente 360, cobranza, riesgo y provisiones, la jornada del día, la
administración de roles. La matriz dice pantalla por pantalla qué está
cubierto y qué no.

### Consola SUMA · `05`

El alta completa medida de punta a punta el 15-oct, el reparto de visibilidad
en Keycloak, la reserva de inquilinos, el diagnóstico y «Qué le falta».

---

## 3. Los huecos, por tamaño

El ERP tiene **146 pantallas** bajo `/dashboard`. Contadas por módulo y
cruzadas con lo documentado:

| Módulo | Pantallas | Estado |
|---|---:|---|
| finanzas | 20 | Cubierto por los flujos 12 y 13 y cuatro manuales de `03`. |
| rrhh | 17 | Cubierto por los flujos 7–9 y la parte 2 de `04`. |
| compras | 13 | Cubierto por los flujos 11 y 16 y la parte 1 de `04`. |
| hotelería | 11 | **Cubierto desde el 15-oct por `09`**, recorrido de punta a punta. |
| inventario | 9 | Cubierto por el flujo 5. |
| **configuración** | **9** | **Los seis asistentes no están documentados.** |
| créditos | 8 | Parte en `03`, parte en el portal (`08`). |
| ventas | 7 | Cubierto por los flujos 1–4 y 10. |
| **reportes** | **7** | **Ninguno documentado.** |
| tesorería | 5 | Flujo 6 y dos manuales de `03`. |
| activos | 4 | Flujo 15. |
| productos, catálogos, crm, almacenes, … | 20 | Parcial o por catálogo. |

### 3.1 Hotelería · cerrado el 15-oct

Era el hueco más grande: once pantallas, un rol con su plantilla de permisos,
el módulo operando, y **ni un documento que dijera cómo se usa**. Dos menciones
de paso en `02` y `03` era todo.

Lo cierra `09-hoteleria.md`, escrito recorriendo el módulo entero contra el
sistema corriendo —reserva, check-in, folio, auditoría y rack— con sus seis
capturas. Lo que ese recorrido destapó está en el propio documento: una
habitación ocupada por nadie, y un panel que rotulaba la fecha operativa y
contaba el día del calendario.

Queda fuera el **cobro del check-out**, que mueve dinero a una caja y lo prueba
quien opera.

### 3.2 Los seis asistentes de configuración

`wizard-ventas`, `wizard-compras`, `wizard-inventario`, `wizard-finanzas`,
`wizard-credito`, `wizard-importacion`. Son justo el camino de «antes de la
primera venta / compra / factura», y cada flujo de `07` empieza dando por hecho
que ya se recorrió. `01` describe la instalación, no los asistentes.

### 3.3 Reportes

Siete pantallas —ejecutivo, ventas, inventario, top de productos, estado de
cuenta, corte de caja— sin un renglón que diga qué contesta cada una ni con qué
números.

---

## 4. Lo que se mide solo

No todo depende de que alguien se acuerde de actualizar:

| Qué | Dónde |
|---|---|
| Que la tabla de alcance de `03` diga lo que dicen las plantillas de permisos | `un-manual-que-se-cree-al-dia.spec.ts` |
| Que toda captura prometida en un documento exista de verdad | `una-captura-que-se-promete-y-no-esta.spec.ts` |
| Que el índice lleve a la sección que nombra | `un-indice-que-llevaba-a-otra-seccion.spec.ts` |

Lo que **no** se mide solo es la cobertura de este documento: los números de
§3 se contaron a mano el 15-oct. Dejarlos atados a un conteo automático es el
siguiente paso natural, y está anotado abajo.

---

## 5. Lo siguiente, en orden

1. ~~**Hotelería**~~ **Hecho el 15-oct** (§3.1).
2. **Capturas en `03` y `04`** (§1): son los dos que se siguen con el sistema
   delante y los dos sin pantallas.
3. **Los seis asistentes** (§3.2).
4. **Reportes** (§3.3).
5. Atar §3 a un conteo automático, para que este documento no sea otra cosa que
   se cree al día.
