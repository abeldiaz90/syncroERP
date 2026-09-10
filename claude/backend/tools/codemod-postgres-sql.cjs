const fs = require('node:fs');
const path = require('node:path');

const src = path.resolve(__dirname, '..', 'src');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return full.includes(`${path.sep}database${path.sep}migrations`)
        ? []
        : walk(full);
    }
    return [full];
  });
}

const booleanColumns = new Set();
for (const entity of walk(src).filter((name) => name.endsWith('.entity.ts'))) {
  const source = fs.readFileSync(entity, 'utf8');
  const re = /@(?:Column|CreateDateColumn|UpdateDateColumn)\(\{[^}]*type:\s*'boolean'[^}]*\}\)[\s\S]{0,120}?\n\s*(\w+)[!?:]/g;
  for (const match of source.matchAll(re)) booleanColumns.add(match[1]);
}

let changed = 0;
for (const file of walk(src).filter((name) => name.endsWith('.ts'))) {
  const before = fs.readFileSync(file, 'utf8');
  let after = before
    .replace(/\.CURRENT_TIMESTAMP\b/g, '.getDate()')
    .replace(/\bCOALESCE\(\)/g, 'IsNull()')
    // TypeORM usa marcadores posicionales de PostgreSQL empezando en uno.
    .replace(/@(\d+)/g, (_, index) => `$${Number(index) + 1}`)
    .replace(/\bGETDATE\(\)/g, 'CURRENT_TIMESTAMP')
    .replace(/\bISNULL\(/g, 'COALESCE(')
    .replace(/\bCOUNT_BIG\(/gi, 'COUNT(')
    .replace(/\bSYSUTCDATETIME\(\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bdbo\./gi, '')
    .replace(/OBJECT_ID\('([^']+)',\s*'U'\)/gi, "to_regclass('$1')")
    .replace(/OBJECT_ID\((\$\d+),\s*'U'\)/gi, 'to_regclass($1)')
    .replace(
      /COL_LENGTH\('([^']+)',\s*'([^']+)'\)\s+IS\s+(NOT\s+)?NULL/gi,
      (_all, table, column, not) =>
        `${not ? '' : 'NOT '}EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=LOWER('${table}') AND column_name=LOWER('${column}'))`,
    )
    .replace(/OFFSET\s+(\$\d+)\s+ROWS\s+FETCH\s+NEXT\s+(\$\d+)\s+ROWS\s+ONLY/gi, 'LIMIT $2 OFFSET $1')
    .replace(
      /EXEC\s+@resultado\s*=\s*(?:sys\.)?sp_getapplock[\s\S]*?;/gi,
      'SELECT 0 AS resultado, pg_advisory_xact_lock(hashtextextended($1::text, 0));',
    )
    .replace(
      /EXEC\s+(?:sys\.)?sp_getapplock[\s\S]*?;/gi,
      'SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0));',
    );
  for (const column of booleanColumns) {
    const comparison = new RegExp(`\\b${column}\\s*(=|<>|!=)\\s*([01])\\b`, 'g');
    after = after.replace(comparison, (_all, operator, value) =>
      `${column}${operator}${value === '1' ? 'true' : 'false'}`,
    );
  }
  after = after.replace(
    /DECLARE\s+@resultado\s+int;\s*SELECT\s+0\s+AS\s+resultado,\s*pg_advisory_xact_lock\(hashtextextended\(\$1::text,\s*0\)\);\s*SELECT\s+@resultado(?:\s+AS)?\s+resultado;?/gi,
    'SELECT 0 AS resultado, pg_advisory_xact_lock(hashtextextended($1::text, 0));',
  );
  after = after.replace(
    /IF\s+OBJECT_ID[\s\S]*?SELECT\s+0\s+cantidad\s+ELSE\s+(?=SELECT)/gi,
    '',
  );
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed += 1;
  }
}
console.log(`Archivos SQL parametrizados para PostgreSQL: ${changed}`);
