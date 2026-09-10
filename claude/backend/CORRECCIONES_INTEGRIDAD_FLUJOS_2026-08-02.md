# Correcciones de integridad de flujos · 2026-08-02

Esta versión aplica la primera ola prioritaria de la auditoría módulo por módulo.

- Crédito de clientes: autorización efectiva, rechazo y suspensión con actor, fecha y comentario; cualquier cambio de límite o plazo devuelve la línea a revisión.
- Requisiciones: el solicitante siempre proviene del JWT; productos, empresa, departamento y ruta de aprobación se validan; creación atómica; consulta por propietario/aprobador; ya no existe el salto manual de pendiente a cotización.
- Proveedores: homologación operativa con riesgo y trazabilidad; Compras rechaza proveedores inactivos, ajenos, bloqueados o sin homologar al cotizar y generar órdenes.
- WMS: DTOs anidados y listas blancas para escrituras; actor autenticado corregido; segregación solicitar/autorizar, enviar/recibir y capturar/autorizar conteos.
- Reportes: estado de cuenta registrado y calculado desde créditos reales; endpoint de pagos diarios; rutas de búsqueda y top de productos alineadas con el backend.
- Punto de venta: la importación ya persiste `precioVenta` en la lista predeterminada; las empresas sin lista predeterminada se reparan automáticamente; la venta conserva la lista aplicada para auditoría.
- Inventario y servicios: las búsquedas del POS respetan el almacén seleccionado y muestran stock disponible; los servicios pueden venderse sin generar una salida física.
- Integridad: las listas de precio se validan por empresa, la primera se vuelve predeterminada y los enganches a crédito exigen una cuenta financiera activa de la empresa.
- Calidad: 35 suites y 145 pruebas aprobadas; compilación de NestJS aprobada.

El proyecto conserva la administración de esquema sin migraciones solicitada para esta instalación. Las nuevas columnas se crean mediante la sincronización de entidades al iniciar sobre una base vacía.
