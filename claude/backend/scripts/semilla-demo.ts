/**
 * ============================================================================
 * SyncroERP · Los interlocutores de la demostración
 * ----------------------------------------------------------------------------
 * La limpieza dejó el ERP sin proveedores ni clientes, y con razón: eran los de
 * prueba. Pero el guion de mañana los da por hechos — una requisición se cotiza
 * CON proveedores y una venta a crédito se hace A un cliente—, así que sin esto
 * la demostración empieza capturando formularios de alta en pantalla.
 *
 * Se siembra por los REPOSITORIOS de TypeORM y no con SQL a mano, a propósito:
 * los nombres de propiedad los valida el compilador. Esta noche ya me equivoqué
 * cuatro veces escribiendo nombres de columna de memoria.
 *
 * Es idempotente: si el RFC ya existe, no lo duplica.
 *
 *   npx ts-node -T scripts/semilla-demo.ts --empresa=<UUID>              (ensayo)
 *   npx ts-node -T scripts/semilla-demo.ts --empresa=<UUID> --execute
 * ============================================================================
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Proveedor } from '../src/proveedores/entities/proveedor.entity';
import { Cliente } from '../src/clientes/entities/cliente.entity';

const EMPRESA = process.argv.find((a) => a.startsWith('--empresa='))?.split('=')[1];
const EJECUTAR = process.argv.includes('--execute');
const t = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);

const PROVEEDORES: Partial<Proveedor>[] = [
  {
    nombre: 'Ferretera del Bajío',
    razonSocial: 'Ferretera del Bajío SA de CV',
    rfc: 'FBA150312QK4',
    contactoNombre: 'Martín Ochoa',
    contactoTelefono: '4491234567',
    contactoEmail: 'ventas@ferreterabajio.mx',
    telefono: '4491234567',
    email: 'ventas@ferreterabajio.mx',
    direccion: 'Av. Convención Norte 1450',
  },
  {
    nombre: 'Distribuidora Altura',
    razonSocial: 'Distribuidora Altura SA de CV',
    rfc: 'DAL180725HM2',
    contactoNombre: 'Rocío Estrada',
    contactoTelefono: '4497654321',
    contactoEmail: 'pedidos@altura.mx',
    telefono: '4497654321',
    email: 'pedidos@altura.mx',
    direccion: 'Calle Morelos 210, Zona Centro',
  },
  {
    nombre: 'Suministros Industriales Vega',
    razonSocial: 'Suministros Industriales Vega SA de CV',
    rfc: 'SIV121108TT9',
    contactoNombre: 'Jorge Vega',
    contactoTelefono: '4492223344',
    contactoEmail: 'contacto@sivega.mx',
    telefono: '4492223344',
    email: 'contacto@sivega.mx',
    direccion: 'Parque Industrial San Francisco, Nave 12',
  },
];

const CLIENTES: Partial<Cliente>[] = [
  {
    nombre: 'Constructora San Marcos',
    razonSocial: 'Constructora San Marcos SA de CV',
    rfc: 'CSM160204RB8',
    email: 'compras@sanmarcos.mx',
    telefono: '4493334455',
    direccion: 'Blvd. a Zacatecas 700',
    ciudad: 'Aguascalientes',
    estado: 'Aguascalientes',
    codigoPostal: '20128',
    pais: 'México',
  },
  {
    nombre: 'Talleres Ruiz',
    razonSocial: 'Talleres Ruiz S de RL',
    rfc: 'TRU190611LP3',
    email: 'admin@talleresruiz.mx',
    telefono: '4495556677',
    direccion: 'Av. Aguascalientes Sur 903',
    ciudad: 'Aguascalientes',
    estado: 'Aguascalientes',
    codigoPostal: '20280',
    pais: 'México',
  },
  {
    nombre: 'María Fernanda Gutiérrez',
    rfc: 'GUMF880921R45',
    email: 'mf.gutierrez@correo.mx',
    telefono: '4498887766',
    direccion: 'Calle Nieto 45',
    ciudad: 'Aguascalientes',
    estado: 'Aguascalientes',
    codigoPostal: '20000',
    pais: 'México',
  },
];

async function main() {
  if (!EMPRESA) throw new Error('Falta --empresa=<UUID>.');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const ds = app.get(DataSource);
  const provRepo = ds.getRepository(Proveedor);
  const cliRepo = ds.getRepository(Cliente);

  t(`SEMILLA · ${EJECUTAR ? '\x1b[31mALTA REAL\x1b[0m' : 'sólo enseñar'}`);

  for (const p of PROVEEDORES) {
    const existe = await provRepo.findOne({
      where: { empresaId: EMPRESA, rfc: p.rfc },
    });
    console.log(`  ${existe ? '✓' : '·'} proveedor ${p.nombre}${existe ? ' (ya está)' : ''}`);
    if (!existe && EJECUTAR) {
      await provRepo.save(provRepo.create({ ...p, empresaId: EMPRESA }));
    }
  }

  for (const c of CLIENTES) {
    const existe = await cliRepo.findOne({
      where: { empresaId: EMPRESA, rfc: c.rfc },
    });
    console.log(`  ${existe ? '✓' : '·'} cliente ${c.nombre}${existe ? ' (ya está)' : ''}`);
    if (!existe && EJECUTAR) {
      await cliRepo.save(cliRepo.create({ ...c, empresaId: EMPRESA }));
    }
  }

  if (!EJECUTAR) {
    t('No se dio de alta nada');
    nota('Repite con --execute.');
  } else {
    t('LISTO');
    nota('La línea de crédito NO se siembra: se pide y se autoriza en vivo,');
    nota('que es justo lo que vale la pena enseñar del circuito de crédito.');
  }
  await app.close();
}
main().catch((e) => { console.error(`\n\x1b[31m${e?.message ?? e}\x1b[0m`); process.exit(1); });
