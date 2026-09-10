const fs = require('node:fs');
const path = require('node:path');

const src = path.resolve(__dirname, '..', 'src');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

let changed = 0;
for (const file of walk(src).filter((name) => name.endsWith('.entity.ts'))) {
  const before = fs.readFileSync(file, 'utf8');
  let after = before
    .replace(/type:\s*'nvarchar',\s*length:\s*'MAX'/g, "type: 'text'")
    .replace(/type:\s*'uniqueidentifier'/g, "type: 'uuid'")
    .replace(/type:\s*'nvarchar'/g, "type: 'varchar'")
    .replace(/type:\s*'datetime2'/g, "type: 'timestamptz'")
    .replace(/type:\s*'bit'/g, "type: 'boolean'");

  // PostgreSQL no acepta 0/1 como DEFAULT de una columna boolean.
  after = after
    .replace(/(type:\s*'boolean'[^}\n]*default:\s*)1\b/g, '$1true')
    .replace(/(type:\s*'boolean'[^}\n]*default:\s*)0\b/g, '$1false');

  if (after !== before) {
    fs.writeFileSync(file, after);
    changed += 1;
  }
}

console.log(`Entidades convertidas para PostgreSQL: ${changed}`);
