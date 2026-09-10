# SyncroERP frontend v13

## Correcciones y maduración incluidas

- Corrección del acceso inseguro `dispersion?.dispersion.estado` y protección de la estructura completa de dispersión.
- Protecciones opcionales adicionales en configuración inicial/financiera, CRM, SAT, inventario, activos, tesorería, hotelería, crédito y devoluciones.
- Panel Ejecutivo conectado a `/dashboard/ejecutivo`, conserva el último dato válido y muestra advertencias por indicadores individuales.
- Chart.js remoto eliminado; la gráfica se dibuja localmente sin CDN ni scripts externos.
- Pantalla de contratos laborales con historial de contratos y movimientos.
- Pantalla de bajas y finiquitos estimados con confirmación explícita dentro de la interfaz.
- City Ledger y cobranza visible dentro del módulo Hotelería con etiqueta de convenios.
- Nuevas rutas de RR. HH. registradas en la configuración modular.
- Ruta estática inválida de ticket eliminada; los tickets continúan usando la ruta correcta con ID de venta: `/dashboard/ventas/[id]/ticket`.
- Fechas iniciales de las pantallas nuevas calculadas con calendario local, evitando desfases por UTC.

## Validaciones ejecutadas en este paquete

- 122 rutas configuradas en el menú resuelven a páginas válidas, incluidas rutas dinámicas.
- No quedan referencias a Chart.js, CDN externos ni scripts remotos en las áreas auditadas.
- No quedan llamadas nativas a `alert`, `confirm` o `prompt` en `app` y `components`.
- No quedan accesos inseguros conocidos a `dispersion.dispersion.estado`.
- Transpilación sintáctica conjunta del backend y frontend: 572 archivos TS/TSX, 0 errores.
- Resolución de imports relativos: 1,246 imports, 0 faltantes.

## Validación que debe ejecutarse con dependencias disponibles

```bash
npm ci
npm run typecheck
npm run lint
npm run build
```

La instalación de dependencias no pudo completarse dentro del entorno de revisión porque el registro interno devolvió 404 para paquetes válidos y la resolución DNS hacia el registro público estuvo bloqueada.
