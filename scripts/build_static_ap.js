const fs = require('fs');
const path = require('path');

const ROOT = process.env.SS_MANIFEST_ROOT
  ? path.resolve(process.env.SS_MANIFEST_ROOT)
  : path.join(__dirname, '..');

const SRC_DIR = path.join(ROOT, 'resource-manifest');

const OUT = process.env.AP_OUT_DIR
  ? path.resolve(process.env.AP_OUT_DIR)
  : path.join(ROOT, 'res-ap-manifest');

const REGIONS = [
  { name: 'CN', host: 'https://nova-static.yostar.cn' },
  { name: 'EN', host: 'https://nova-static.stellasora.global' },
  { name: 'JP', host: 'https://nova-static.stellasora.jp' },
  { name: 'KR', host: 'https://nova-static.stellasora.kr' },
  { name: 'TW', host: 'https://nova-static.stargazer-games.com' },
];

function parseArgs(argv) {
  const opts = { fresh: false, mdOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--fresh') opts.fresh = true;
    else if (arg === '--md-only') opts.mdOnly = true;
  }
  return opts;
}

function readManifest(region) {
  const file = path.join(SRC_DIR, region, 'resource_manifest.json');

  if (!fs.existsSync(file)) throw new Error(`Manifest not found: ${file}`);

  return fs.readFileSync(file, 'utf8');
}

function mergeManifest(agg, raw) {
  let obj;

  try {
    obj = JSON.parse(raw);
  } catch (e) {
    return 0;
  }

  let n = 0;

  for (const key of Object.keys(obj)) {
    const item = obj[key];
    if (!item) continue;

    const ap = item.AdditionalPath || item.AdditionaonalPath;
    const ver = parseInt(item.Version, 10);
    const file = item.FileName || key;

    if (!ap || !Number.isFinite(ver) || !file) continue;
    if (!/^[0-9a-f]{32}$/i.test(ap)) continue;

    const groupKey = `${ver}|${ap.toLowerCase()}`;
    let set = agg.get(groupKey);

    if (!set) {
      set = new Set();
      agg.set(groupKey, set);
    }

    set.add(file);
    n++;
  }

  return n;
}

function loadExisting(region, host) {
  const file = path.join(OUT, `${region}_res.json`);
  const agg = new Map();

  if (!fs.existsSync(file)) return agg;

  let obj;

  try {
    obj = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return agg;
  }

  for (const version of Object.keys(obj)) {
    for (const ap of Object.keys(obj[version])) {
      const prefix = `${host}/res/win/${version}/${ap}/`;
      const set = new Set();

      for (const url of obj[version][ap]) {
        if (url.startsWith(prefix)) set.add(url.slice(prefix.length));
      }

      if (set.size) agg.set(`${version}|${ap}`, set);
    }
  }

  return agg;
}

function buildUrl(host, version, ap, file) {
  return `${host}/res/win/${version}/${ap}/${file}`;
}

function buildRows(region, agg) {
  return [...agg.entries()]
    .map(([key, set]) => {
      const [version, ap] = key.split('|');
      return { region, version: parseInt(version, 10), ap, files: set.size };
    })
    .sort((a, b) => a.version - b.version || a.ap.localeCompare(b.ap));
}

function writeApJson(allRows) {
  const result = {};

  for (const region of REGIONS) {
    result[region.name] = allRows
      .filter((row) => row.region === region.name)
      .map((row) => ({
        version: row.version,
        ap: row.ap,
        files: row.files,
      }));
  }

  fs.writeFileSync(path.join(OUT, 'ap.json'), JSON.stringify(result, null, 2));
}

function writeApMd(allRows) {
  const blocks = [];

  for (const region of REGIONS) {
    const rows = allRows.filter((row) => row.region === region.name);
    if (!rows.length) continue;

    const lines = [`## ${region.name}`, '', '| version | ap | files |', '| --- | --- | --- |'];

    for (const row of rows) {
      lines.push(`| ${row.version} | ${row.ap} | ${row.files} |`);
    }

    blocks.push(lines.join('\n'));
  }

  fs.writeFileSync(path.join(OUT, 'ap.md'), blocks.join('\n\n') + '\n');
}

function writeResJson(region, host, agg) {
  const entries = [...agg.entries()].sort((a, b) => {
    const [av, aa] = a[0].split('|');
    const [bv, ba] = b[0].split('|');
    return parseInt(av, 10) - parseInt(bv, 10) || aa.localeCompare(ba);
  });

  const result = {};
  let count = 0;

  for (const [key, set] of entries) {
    const [version, ap] = key.split('|');

    if (!result[version]) result[version] = {};

    const urls = [...set].sort().map((file) => buildUrl(host, version, ap, file));
    result[version][ap] = urls;
    count += urls.length;
  }

  fs.writeFileSync(path.join(OUT, `${region}_res.json`), JSON.stringify(result, null, 2));

  return count;
}

function rebuildMd() {
  const data = JSON.parse(fs.readFileSync(path.join(OUT, 'ap.json'), 'utf8'));
  const rows = [];

  for (const region of REGIONS) {
    for (const item of data[region.name] || []) {
      rows.push({
        region: region.name,
        version: item.version,
        ap: item.ap,
        files: item.files,
      });
    }
  }

  writeApMd(rows);
}

function generate(opts) {
  if (!fs.existsSync(SRC_DIR)) throw new Error(`Source directory not found: ${SRC_DIR}`);

  fs.mkdirSync(OUT, { recursive: true });

  const allRows = [];
  const summary = [];

  for (const region of REGIONS) {
    const agg = opts.fresh ? new Map() : loadExisting(region.name, region.host);
    const before = agg.size;

    mergeManifest(agg, readManifest(region.name));

    const rows = buildRows(region.name, agg);
    allRows.push(...rows);

    const urls = writeResJson(region.name, region.host, agg);
    summary.push({ region: region.name, versions: rows.length, added: agg.size - before, urls });
  }

  writeApJson(allRows);
  writeApMd(allRows);

  return summary;
}

function printSummary(summary) {
  for (const item of summary) {
    console.log(
      `${item.region}: ${item.versions} versions, ${item.added} new groups, ${item.urls} urls`
    );
  }

  console.log(`Output directory: ${OUT}`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.mdOnly) {
    rebuildMd();
    console.log('Rebuilt ap.md only');
    return;
  }

  printSummary(generate(opts));
}

module.exports = { generate, rebuildMd, printSummary, parseArgs, REGIONS, ROOT, SRC_DIR, OUT };

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
