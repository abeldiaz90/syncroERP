// Consulta operaciones existentes; --guardar-avisos sólo agrega diagnósticos deduplicados.
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.ERP_BACKEND_ROOT || path.resolve(__dirname, '..');
const empresa = process.argv.find(a => a.startsWith('--empresa='))?.slice(10);
const salida = process.argv.find(a => a.startsWith('--resultado='))?.slice(12);
if (!empresa || !salida) throw new Error('Requiere --empresa=UUID --resultado=ruta.json');
const output = path.resolve(salida);
process.chdir(root);
Object.assign(process.env, { CRONS_HABILITADOS: 'false', DB_SYNC: 'false', DB_MIGRATIONS_RUN: 'false' });
require(root + '/node_modules/ts-node').register({ transpileOnly: true, project: root + '/tsconfig.json' });
const load = p => require(root + '/src/' + p);
(async () => {
  const app = await require(root + '/node_modules/@nestjs/core').NestFactory.createApplicationContext(load('app.module').AppModule, { logger: ['error'] });
  try {
    const service = app.get(load('integracion/services/contabilidad-conciliacion.service').ContabilidadConciliacionService);
    const result = await service.conciliarEmpresa(empresa, process.argv.includes('--guardar-avisos'));
    fs.writeFileSync(output, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await app.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
