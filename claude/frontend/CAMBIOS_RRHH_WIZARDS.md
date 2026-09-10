# SyncroERP — Wizards visuales de Recursos Humanos y Nómina

## Cambios del frontend

- Alta y edición integral del empleado en cinco pasos.
- Creación de departamento y puesto sin abandonar el alta.
- Borrador local recuperable para altas sin terminar.
- Validaciones de identidad, organización, salario/SBC, CFDI y CLABE.
- Centro integral de nómina con semáforo de preparación y línea de progreso.
- Configuración patronal y contable convertida en asistente de tres pasos.
- Navegación al cierre financiero seguro; se retiró el cierre directo que el
  backend rechaza deliberadamente.
- Compatibilidad visual para las clases heredadas `entrada` y
  `btn-secundario` en las pantallas existentes de RH.
- Se agregó la dependencia `xlsx` que ya era utilizada por el exportador y
  que impedía compilar el frontend.

## Verificación realizada

```bash
npm run typecheck
npm run build
```

La compilación de producción termina correctamente y genera las 118 rutas.
