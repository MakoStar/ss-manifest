const fs = require('fs');
const path = require('path');
const { generate, printSummary, parseArgs, REGIONS, OUT } = require('./build_static_ap');

function verify() {
  const required = ['ap.json', 'ap.md', ...REGIONS.map((r) => `${r.name}_res.json`)];

  for (const name of required) {
    const file = path.join(OUT, name);
    if (!fs.existsSync(file)) throw new Error(`Missing output: ${file}`);
    if (fs.statSync(file).size === 0) throw new Error(`Empty output: ${file}`);
  }

  console.log(`Verified ${required.length} files`);
}

async function main() {
  const started = Date.now();
  const opts = parseArgs(process.argv.slice(2));
  const summary = await generate(opts);

  printSummary(summary);
  verify();
  console.log(`Finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
