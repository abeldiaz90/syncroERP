import WizardPreparacion from '../_components/WizardPreparacion';

export default function Page() {
  return (
    <WizardPreparacion
      titulo="Preparar el ciclo de compras"
      descripcion="Te llevaremos desde proveedores y aprobaciones hasta una orden de prueba."
      modulo="compras"
      operacionRuta="/dashboard/compras/requisiciones"
      pasos={[
        { codigo: 'proveedores', titulo: 'Registrar proveedores', descripcion: 'Captura proveedores activos con datos fiscales y condiciones comerciales.', ruta: '/dashboard/proveedores', requisito: 'COM_PROVEEDORES' },
        { codigo: 'aprobaciones', titulo: 'Definir el flujo de aprobación', descripcion: 'Configura quién autoriza compras según importe y área.', ruta: '/dashboard/configuraciones-aprobacion', requisito: 'COM_APROBACIONES' },
        { codigo: 'almacen', titulo: 'Preparar almacén receptor', descripcion: 'Selecciona el almacén que recibirá las compras.', ruta: '/dashboard/almacenes', requisito: 'COM_ALMACEN' },
        { codigo: 'requisicion', titulo: 'Crear una requisición de prueba', descripcion: 'Valida solicitante, partidas y autorización.', ruta: '/dashboard/compras/requisiciones', requisito: 'COM_PRUEBA_REQ', opcional: true },
        { codigo: 'cotizacion', titulo: 'Capturar una cotización', descripcion: 'Compara proveedor, precios y condiciones.', ruta: '/dashboard/compras/cotizaciones', requisito: 'COM_PRUEBA_COT', opcional: true },
        { codigo: 'orden', titulo: 'Generar la primera orden', descripcion: 'Comprueba que la adjudicación produce una sola orden.', ruta: '/dashboard/compras/ordenes', requisito: 'COM_PRUEBA_OC', opcional: true },
      ]}
    />
  );
}
