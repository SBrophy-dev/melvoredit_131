// Diagnostic: decode a save and check it re-encodes to a byte-identical payload.
// If not identical, reports the first differing byte offset and surrounding bytes,
// which localises any reader/writer schema mismatch. Usage: node tools/diagnose-save.js [file]
const fs = require("fs");
const path = require("path");
const pako = require(path.join(__dirname, "..", "pako.min.js"));
const MelvorSave = require(path.join(__dirname, "..", "melvor-save.js"));

const file = process.argv[2] || path.join(__dirname, "..", "mysave2.txt");
const b64 = fs.readFileSync(file, "utf8").trim();

let orig;
try { orig = pako.inflate(Uint8Array.from(Buffer.from(b64, "base64"))); }
catch (e) { console.log("Could not base64+zlib decode (incomplete or not a Melvor save):", e.message); process.exit(1); }

const dec = MelvorSave.decode(b64);
if (typeof dec === "string") { console.log("DECODE FAILED:", dec); process.exit(1); }
console.log("decode: ok | decompressed bytes:", orig.length, "| save version:", dec.saveData.header.saveVersion);

const re = pako.inflate(Uint8Array.from(Buffer.from(MelvorSave.encode(dec.saveData, dec.initialSize), "base64")));
const n = Math.min(orig.length, re.length);
let diff = -1;
for (let i = 0; i < n; i++) if (orig[i] !== re[i]) { diff = i; break; }
if (diff === -1 && orig.length === re.length) {
    console.log("round-trip: BYTE-IDENTICAL");
} else {
    if (diff === -1) diff = n;
    const hex = (a, i) => Array.from(a.slice(Math.max(0, i - 4), i + 8)).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    console.log("round-trip: DIFFERENT (orig " + orig.length + " vs re " + re.length + " bytes), first diff @ " + diff);
    console.log("  orig:", hex(orig, diff));
    console.log("  re  :", hex(re, diff));
}
