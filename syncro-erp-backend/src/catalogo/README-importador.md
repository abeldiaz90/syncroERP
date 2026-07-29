# Importador de inventario por Excel — instrucciones de integración

Módulo de carga masiva de productos para **SyncroERP** (`src/catalogo`). No agrega
dependencias ni cambia el esquema.

## ⚠️ IMPORTANTE — alcance contable (léelo primero)

Este importador carga **SOLO el catálogo** (material maestro: SKU, nombre, precios,
categoría, etc.). **NO carga existencias.** Esto es intencional y sigue el estándar
de los ERP grandes (SAP):

- Crear un producto NO mueve la contabilidad (es solo su "ficha").
- Meter existencias SÍ es un movimiento valorizado que **debe** generar su asiento
  contable (Dr. Inventario / Cr. contrapartida), porque el inventario es un activo
  del balance. En SAP esto es el movimiento 561 de "carga inicial de existencias".

Por eso la carga de stock inicial **se hace aparte**, por el canal de inventario
que genera contabilidad — nunca colada en este importador. Así el catálogo se puede
cargar masivamente sin ningún riesgo de descuadrar el balance.

## ⚠️ PASO OBLIGATORIO — registrar en el módulo (esto causaba el 404)

Las rutas dan **404 hasta que registres el controlador en `catalogo.module.ts`**.
En el arranque de Nest deben aparecer estas dos líneas; si no aparecen, falta el
registro:

```
Mapped {/api/catalogo/importacion/plantilla, GET} route
Mapped {/api/catalogo/importacion/productos, POST} route
```

En `catalogo.module.ts` agrega (ver `catalogo.module.REGISTRO.ts`):
- `controllers: [ ..., ImportacionController ]`
- `providers:  [ ..., ImportacionProductosService, PlantillaInventarioService ]`

## Rutas

- Descargar plantilla: `GET /api/catalogo/importacion/plantilla`
- Importar (validar/aplicar): `POST /api/catalogo/importacion/productos?modo=validar|aplicar`

## Archivos

| Archivo | Qué es |
|---|---|
| `importacion.types.ts` | Tipos del resultado. |
| `dto/fila-producto.dto.ts` | Forma de una fila del Excel (catálogo, sin stock). |
| `services/importacion-productos.service.ts` | Parseo, validación, resolución por nombre, upsert por SKU. |
| `services/plantilla-inventario.service.ts` | Genera la plantilla `.xlsx`. |
| `controllers/importacion.controller.ts` | Los dos endpoints. |
| `catalogo.module.REGISTRO.ts` | Qué agregar al módulo. |

## Stock inicial (paso posterior, con contabilidad)

Para cargar existencias iniciales, hazlo por el módulo de inventario que ya genera
asiento contable. Tu ERP ya tiene el motor (`MotorContableService.generarAsientoDeCompra`,
que hace Dr. Inventario / Cr. contrapartida). Lo recomendable es un proceso de
"carga inicial de existencias" que, por cada producto con stock, registre el
movimiento de entrada **y** su asiento — igual que una compra, pero contra una
cuenta de saldos iniciales. Eso mantiene inventario y contabilidad siempre cuadrados.

## Puntos a revisar antes de compilar

- Métodos de servicios reutilizados: `MarcaService.create/findAll`,
  `CategoriasService.crearCategoria/obtenerCategorias`, `ImpuestoService.findAll`,
  `UnidadesMedidaService.obtenerTodas`. Confirmados contra el código; si difieren,
  ajusta en `cargarCatalogos` y `resolverRelaciones`.
- `unidadMedida` se guarda como texto (varchar) en la entidad Producto; `aEntidad()`
  asigna el nombre directo. Si fuera relación, cambia el mapeo.
- Política de creación al vuelo (propiedad `crearAlVuelo`): marca y categoría se
  crean solas; impuesto y unidad deben existir.

## Pruebas sugeridas

- Archivo válido → creados == filas, `conError == 0`, y el stock de todos queda
  intacto (este importador no lo toca).
- SKU repetido → `actualizados` incrementa (upsert, no duplica).
- Fila sin `sku`/`tipoProducto` inválido → aparece en `errores`, no se guarda.
- `marca` inexistente → se crea (advertencia); `impuesto` inexistente → error.
