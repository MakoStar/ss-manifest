const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { ManiReader } = require('./manireader');

const FILE_URL = 'http://na.jvav.net.cn/res/win/ss_win.mani';
const OUTPUT_DIR = './uncensor-manifest';
const FILE_NAME = 'ss_win.mani';

const CONFIG_KEYS = [
  'RES_VER',
  'CLIENT_VER',
  'CLIENT_VER_COMP_MODE',
  'GAME_VER',
  'CLEAR_EXPIRED_FILES'
];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Creating directory: ${dirPath}`);
  }
}

function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const fileStream = fs.createWriteStream(filePath);

    const handleResponse = (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        console.log(`Redirecting to: ${response.headers.location}`);
        client.get(response.headers.location, handleResponse).on('error', reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Request failed with status code ${response.statusCode}`));
        return;
      }
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
    };

    client.get(url, handleResponse).on('error', (err) => {
      fileStream.close();
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      reject(err);
    });
  });
}

function extractVersionData(reader) {
  const versionData = {};
  for (const key of CONFIG_KEYS) {
    const value = reader.getConfigValueByKey(key);
    if (value !== null) {
      versionData[key] = value;
    }
  }
  return versionData;
}

function generateResourcesJson(reader, outputPath) {
  const meta = extractVersionData(reader);

  const data = {};
  const resources = reader.resources();
  for (const res of resources) {
    data[res.hash] = res.file;
  }

  meta.len = Object.keys(data).length;

  const output = {
    meta,
    data
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Generated resources.json at: ${outputPath}`);
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`Generated JSON at: ${filePath}`);
}

(async () => {
  try {
    const dirPath = path.resolve(OUTPUT_DIR);
    const maniPath = path.join(dirPath, FILE_NAME);
    const versionJsonPath = path.join(dirPath, 'version.json');
    const resourcesJsonPath = path.join(dirPath, 'manifest.json');

    ensureDir(dirPath);

    console.log(`Starting download: ${FILE_URL}`);
    await downloadFile(FILE_URL, maniPath);
    console.log(`Download complete! File saved to: ${maniPath}`);

    const reader = new ManiReader(maniPath);

    const versionData = extractVersionData(reader);
    writeJson(versionJsonPath, versionData);

    generateResourcesJson(reader, resourcesJsonPath);

    console.log('All steps completed successfully.');
  } catch (error) {
    console.error(`Failed: ${error.message}`);
    process.exit(1);
  }
})();