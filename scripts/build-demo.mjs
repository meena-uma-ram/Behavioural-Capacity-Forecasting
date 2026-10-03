// Bundles the demo into one self-contained HTML file (no server, no Jira needed).
// Usage: node scripts/build-demo.mjs [output]   (default: dist/capacity-forecast-demo.html)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const out = resolve(process.argv[2] || `${root}/dist/capacity-forecast-demo.html`);

// Wrap each ES module in a function scope so helper names can't collide.
const modules = new Map(); // path -> bundled code, in dependency order
const varName = (path) => `__m_${relative(root, path).replace(/\W/g, '_')}`;

function bundle(path) {
  if (modules.has(path)) return;
  modules.set(path, null); // reserve to stop cycles
  const exports = [];
  const body = readFileSync(path, 'utf8')
    .replace(/^import \{([^}]+)\} from '([^']+)';$/gm, (_, names, spec) => {
      const dep = resolve(dirname(path), spec);
      bundle(dep);
      return `const {${names}} = ${varName(dep)};`;
    })
    .replace(/^export (async function|function|const|let|class) (\w+)/gm, (_, kind, name) => {
      exports.push(name);
      return `${kind} ${name}`;
    });
  if (/^\s*(import|export)\b/m.test(body)) throw new Error(`Unsupported import/export form in ${path}`);
  modules.delete(path); // re-insert after dependencies so order is correct
  modules.set(path, `const ${varName(path)} = (() => {\n${body}\nreturn { ${exports.join(', ')} };\n})();`);
}
bundle(`${root}/demo/demo.js`);

const css = readFileSync(`${root}/src/ui/panel.css`, 'utf8');
const html = readFileSync(`${root}/demo/demo.html`, 'utf8')
  .replace('<link rel="stylesheet" href="../src/ui/panel.css">', () => `<style>\n${css}</style>`)
  .replace('<script type="module" src="demo.js"></script>', () => `<script>\n${[...modules.values()].join('\n\n')}\n</script>`);

if (html.includes('src="') || html.includes('href="../')) throw new Error('A reference was not inlined');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`Wrote ${relative(process.cwd(), out)} (${Math.round(html.length / 1024)} KB, ${modules.size} modules)`);
