/**
 * ============================================================================
 * SyncroERP · Segunda empresa limpia para probar el modo AUTORIDAD
 * ----------------------------------------------------------------------------
 * Dos pendientes de un solo movimiento.
 *
 * El primero es el MULTIEMPRESA: hasta hoy la integración se probó con una sola
 * empresa, y lo que hay que demostrar es que dos empresas del mismo servidor
 * tienen catálogos, vínculos y modos independientes —que fue justo la razón de
 * sacar los tipos de crédito del código—.
 *
 * El segundo es AUTORIDAD. La empresa que veníamos usando arrastra seis
 * créditos descuadrados de pruebas viejas, y el sistema —bien— no deja subir a
 * AUTORIDAD con discrepancias abiertas. En vez de inventar movimientos
 * contables para cuadrar un experimento, o borrar filas y arriesgar las
 * referencias, se monta una empresa NUEVA cuyos datos nacen limpios. La prueba
 * sale más fuerte, no más débil.
 *
 * Lo que este script NO hace: crear usuarios. La empresa queda sin nadie que
 * pueda entrar, y es a propósito —dar de alta accesos y repartir contraseñas no
 * es algo que deba hacer un script—. Todo lo que se prueba aquí ocurre del lado
 * del servidor.
 *
 *   npm.cmd run empresa:prueba              muestra el plan
 *   npm.cmd run empresa:prueba -- --aplicar la crea y la deja en SOMBRA
 * ============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Empresa } from '../src/iam/entities/empresa.entity';
import { ConfiguracionIntegracionEmpresa } from '../src/integracion/entities/configuracion-integracion-empresa.entity';
import { ProductosCreditoService } from '../src/credito/services/productos-credito.service';
import { ModoCartera, ModoContabilidad } from '../src/integracion/integracion.constants';

const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m    ${m}`);
const paso = (m: string) => console.log(`  \x1b[36mHARÍA\x1b[0m ${m}`);
const mal = (m: string) => console.log(`  \x1b[31mFALLA\x1b[0m ${m}`);
const nota = (m: string) => console.log(`        \x1b[90m${m}\x1b[0m`);
const titulo = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

const NOMBRE = 'PRUEBA AUTORIDAD SA DE CV';

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const ds = app.get(DataSource);
  const empresas = ds.getRepository(Empresa);
  const configs = ds.getRepository(ConfiguracionIntegracionEmpresa);
  const productos = app.get(ProductosCreditoService);

  if (!aplicar) nota('Modo plan: no se escribe nada.');

  // ── 1. La empresa ────────────────────────────────────────────────────────
  titulo('1 · La empresa de prueba');
  let empresa = await empresas.findOne({ where: { nombreComercial: NOMBRE } });

  if (empresa) {
    ok(`Ya existe: ${empresa.id}`);
  } else if (!aplicar) {
    paso(`crear la empresa «${NOMBRE}»`);
  } else {
    empresa = await empresas.save(
      empresas.create({
        nombreComercial: NOMBRE,
        activo: true,
        rfc: 'XAXX010101000', // RFC genérico: no representa a nadie real.
        tipoPersonaFiscal: 'MORAL',
        perfilImpuestos: 'GENERAL',
        giro: 'Pruebas de integración',
        pais: 'México',
      }),
    );
    ok(`Creada: ${empresa.id}`);
  }

  if (!empresa) {
    nota('El resto del plan necesita la empresa creada. Corre con --aplicar.');
    await app.close();
    return;
  }

  // ── 2. Su propio catálogo ────────────────────────────────────────────────
  titulo('2 · Catálogo de crédito propio');
  const existentes = await productos.listar(empresa.id);
  if (existentes.length) {
    ok(`Ya tiene ${existentes.length} producto(s).`);
  } else if (!aplicar) {
    paso('sembrar el catálogo por omisión para esta empresa');
  } else {
    const sembrados = await productos.sembrar(empresa.id);
    ok(
      `${sembrados.creados.length} producto(s) sembrados` +
        (sembrados.existentes.length ? `, ${sembrados.existentes.length} ya estaban` : '') +
        ', independientes de la otra empresa.',
    );
  }

  // ── 3. El modo ───────────────────────────────────────────────────────────
  titulo('3 · Modo de integración');
  let cfg = await configs.findOne({ where: { empresaId: empresa.id } });
  if (cfg) {
    ok(`Configuración existente: cartera ${cfg.modo}, contabilidad ${cfg.modoContabilidad}.`);
  } else if (!aplicar) {
    paso('dejarla en SOMBRA (cartera) y ESPEJO (contabilidad)');
  } else {
    /*
     * Nace en SOMBRA a propósito, NO en AUTORIDAD. Subir el modo es una
     * decisión que debe pasar por la conciliación, y saltársela aquí
     * convertiría este script en la puerta trasera que el candado quiere
     * impedir.
     */
    cfg = await configs.save(
      configs.create({
        empresaId: empresa.id,
        modo: ModoCartera.SOMBRA,
        modoContabilidad: ModoContabilidad.ESPEJO,
        parametrosProveedor: {},
      }),
    );
    ok('Creada en SOMBRA / ESPEJO.');
  }

  titulo('Qué sigue');
  nota(`empresaId de prueba: ${empresa.id}`);
  nota('1. Corre la conciliación: al no tener créditos, debe salir limpia.');
  nota('2. Sube a AUTORIDAD por la API, que comprueba las discrepancias.');
  nota('3. Comprueba que el catálogo de la otra empresa no cambió.');
  console.log('');
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
