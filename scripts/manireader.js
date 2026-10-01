const fs = require('fs');

class ManiResource {
    constructor(file, hash, size, fileType) {
        this.file = file;
        this.hash = hash;
        this.size = size;
        this.fileType = fileType;
    }
}

class ManiReader {
    constructor(mainFilePath) {
        this.maniFilePath = mainFilePath;
        this.resourceData = new Map();
        this.configData = new Map();
        this.parse();
    }

    parse() {
        try {
            const content = fs.readFileSync(this.maniFilePath, 'utf-8');
            const lines = content.split(/\r?\n/);
            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line) continue;
                if (line.startsWith('$')) {
                    const entry = line.substring(1);
                    const splitIndex = entry.indexOf(':');
                    if (splitIndex !== -1) {
                        const key = entry.substring(0, splitIndex).trim();
                        const value = entry.substring(splitIndex + 1).trim();
                        this.configData.set(key, value);
                    }
                } else {
                    const parts = line.split('|');
                    if (parts.length < 4) {
                        console.debug(`Skipping malformed resource line: ${line}`);
                        continue;
                    }
                    const fileName = parts[0].trim();
                    this.resourceData.set(fileName, new ManiResource(
                        fileName,
                        parts[1].trim(),
                        parseInt(parts[2].trim(), 10) || 0,
                        parts[3].trim()
                    ));
                }
            }
            console.debug(`Parsed mani: resources=${this.resourceData.size}, configs=${this.configData.size} | ${this.maniFilePath}`);
        } catch (error) {
            throw new Error(`Failed to read mani file: ${this.maniFilePath} - ${error.message}`);
        }
    }

    resources() {
        const items = Array.from(this.resourceData.values());
        items.sort((a, b) => a.file.localeCompare(b.file));
        return items;
    }

    getResourceHashByPatch(patchName) {
        if (this.resourceData.size === 0) {
            console.warn(`Manifest resource data is empty for ${this.maniFilePath}`);
            return null;
        }
        const res = this.resourceData.get(patchName);
        return res ? res.hash : null;
    }

    getConfigValueByKey(key) {
        if (this.configData.size === 0) {
            console.warn(`Manifest config data is empty for ${this.maniFilePath}`);
            return null;
        }
        const value = this.configData.get(key);
        if (value === undefined) {
            console.warn(`Config key '${key}' not found. Available keys: ${Array.from(this.configData.keys()).join(', ')}`);
            return null;
        }
        return value;
    }
}

module.exports = { ManiReader, ManiResource };
