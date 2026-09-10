const dataSource = require('../dist/database/data-source').default;

async function main() {
  await dataSource.initialize();
  const memory = await dataSource.driver.createSchemaBuilder().log();
  memory.upQueries.forEach((query, index) => {
    if (/\bmax\b/i.test(query.query)) {
      console.log(`QUERY ${index + 1}: ${query.query}`);
    }
  });
  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
