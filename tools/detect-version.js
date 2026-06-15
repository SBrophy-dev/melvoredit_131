// Version detector for Melvor Idle save exports.
// Usage: node tools/detect-version.js <path-to-save-file>
// Reads a base64 save export, zlib-inflates it (via the repo's bundled pako),
// and parses ONLY the generic header (works for ANY save version) to report
// the save version and a few human-readable fields.

const fs = require("fs");
const path = require("path");
const pako = require(path.resolve(__dirname, "..", "pako.min.js"));

const file = process.argv[2] || path.resolve(__dirname, "..", "mysave.txt");
if (!fs.existsSync(file)) {
    console.error("No save file found at: " + file);
    console.error("Pass a path, or create melvoredit/mysave.txt with your save export.");
    process.exit(1);
}

const b64 = fs.readFileSync(file, "utf8").trim();
let bytes;
try {
    bytes = pako.inflate(Uint8Array.from(Buffer.from(b64, "base64")));
} catch (e) {
    console.error("Failed to base64+zlib decode this string. Is it a complete Melvor export? (" + e.message + ")");
    process.exit(1);
}

const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
let off = 0;
const td = new TextDecoder();
const u8 = () => { const v = dv.getUint8(off); off += 1; return v; };
const u16 = () => { const v = dv.getUint16(off); off += 2; return v; };
const u32 = () => { const v = dv.getUint32(off); off += 4; return v; };
const f64 = () => { const v = dv.getFloat64(off); off += 8; return v; };
const bool = () => u8() === 1;
const staticStr = (n) => { const s = td.decode(bytes.slice(off, off + n)); off += n; return s; };
const str = () => { const n = u32(); const s = td.decode(bytes.slice(off, off + n)); off += n; return s; };
const readMap = (kf, vf) => { const n = u32(); const m = []; for (let i = 0; i < n; i++) { const k = kf(); m.push([k, vf()]); } return m; };

const magic = staticStr(6);
if (magic !== "melvor") {
    console.error('Not a Melvor save (missing "melvor" magic). Got: ' + JSON.stringify(magic));
    process.exit(1);
}
u32(); // headerSize
const namespaces = readMap(str, () => readMap(str, u16));
const saveVersion = u32();
const saveName = str();
const gameMode = str();
const skillLevel = u16();
const gp = f64();

console.log("=== Melvor save header ===");
console.log("Decompressed bytes : " + bytes.length);
console.log("Save version       : " + saveVersion);
console.log("Save name          : " + JSON.stringify(saveName));
console.log("Game mode          : " + JSON.stringify(gameMode));
console.log("Total skill level  : " + skillLevel);
console.log("GP (on save-select): " + gp);
console.log("Namespaces (DLCs)  : " + namespaces.map((e) => e[0]).join(", "));
console.log("");
if (saveVersion === 130) {
    console.log(">> Version 130: matches the MelvorParse reader/writer schema. Full editor port is viable.");
} else if (saveVersion === 131) {
    console.log(">> Version 131: matches the MelvorParse node schema. Full editor port is viable (minor deltas vs 130).");
} else {
    console.log(">> Version " + saveVersion + ": NOT 130/131. The known full schema won't parse this correctly.");
    console.log("   A full JSON editor would require the field schema for save version " + saveVersion + ".");
}
