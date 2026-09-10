# Correcciones de integridad de flujos · 2026-08-02

- Clientes: estados de crédito alineados con backend y acciones elegantes para autorizar, rechazar, suspender y reactivar.
- Proveedores: homologación utilizable desde el listado con aprobación, condicionamiento o bloqueo y motivos obligatorios.
- Requisiciones: se eliminó la identidad manipulable del solicitante; prioridad y fecha requerida conservan su contrato real.
- Reportes: búsqueda de clientes corregida, estado de cuenta conectado y top de productos apuntando al endpoint existente.
- Punto de venta: selector explícito de almacén y lista de precios; precio autoritativo del backend; mensajes que indican exactamente en qué lista falta el precio.
- Productos: búsqueda por nombre, SKU o ambos códigos de barras y existencia disponible del almacén seleccionado.
- Cobros: cuenta financiera obligatoria para tarjeta, transferencia, TPV y enganches; los servicios ya no se bloquean por no tener inventario.
- Compilación de producción aprobada: 119 rutas generadas correctamente.

Los diálogos de decisiones sensibles reutilizan el sistema visual del ERP y no `window.alert`, `window.confirm` ni `window.prompt`.
