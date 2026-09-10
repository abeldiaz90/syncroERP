const fs = require('node:fs');
const path = require('node:path');

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.entity.ts')) {
      const before = fs.readFileSync(full, 'utf8');
      const after = before.replace(
        /(@JoinColumn\(\{\s*name:\s*')([^']+)('\s*\}\))/g,
        (_, start, name, end) => `${start}${name.toLowerCase()}${end}`,
      );
      if (after !== before) fs.writeFileSync(full, after);
    }
  }
}

walk(path.resolve(__dirname, '..', 'src'));
