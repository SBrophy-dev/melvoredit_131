// Round-trip test for melvor-save.js.
// Decodes a save, re-encodes it, and verifies the DECOMPRESSED payload is
// byte-identical (the zlib encoder differs from the game's, but the bytes it
// wraps must match exactly). Also tests the JSON text round-trip and an edit.

const fs = require("fs");
const path = require("path");
const pako = require(path.join(__dirname, "..", "pako.min.js"));
const MelvorSave = require(path.join(__dirname, "..", "melvor-save.js"));

function inflate(b64) {
    return pako.inflate(Uint8Array.from(Buffer.from(b64.trim(), "base64")));
}
function firstDiff(a, b) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
    return a.length === b.length ? -1 : n;
}
function bytesEqual(a, b) {
    return a.length === b.length && firstDiff(a, b) === -1;
}

function testSave(label, file) {
    console.log("\n=== " + label + " (" + file + ") ===");
    const original = fs.readFileSync(file, "utf8").trim();
    const origBytes = inflate(original);
    console.log("decompressed bytes: " + origBytes.length);

    // 1) object round-trip: decode -> encode -> compare payloads
    const decoded = MelvorSave.decode(original);
    if (typeof decoded === "string") { console.log("DECODE FAILED: " + decoded); return false; }
    const reEncoded = MelvorSave.encode(decoded.saveData, decoded.initialSize);
    const reBytes = inflate(reEncoded);
    const objOk = bytesEqual(origBytes, reBytes);
    console.log("object round-trip byte-identical: " + objOk +
        (objOk ? "" : "  (len " + origBytes.length + " vs " + reBytes.length + ", first diff @ " + firstDiff(origBytes, reBytes) + ")"));

    // 2) JSON text round-trip: decodeToJSON -> encodeFromJSON -> compare payloads
    const jsonText = MelvorSave.decodeToJSON(original);
    const reFromJson = MelvorSave.encodeFromJSON(jsonText);
    const jsonBytes = inflate(reFromJson);
    const jsonOk = bytesEqual(origBytes, jsonBytes);
    console.log("JSON text round-trip byte-identical: " + jsonOk +
        (jsonOk ? "" : "  (len " + origBytes.length + " vs " + jsonBytes.length + ", first diff @ " + firstDiff(origBytes, jsonBytes) + ")"));
    console.log("JSON text size: " + jsonText.length + " chars");

    // 3) edit round-trip: bump GP, confirm it changes and re-decodes
    const obj = JSON.parse(jsonText);
    const oldGp = obj.header.gp;
    obj.header.gp = 999999999;
    const editedSave = MelvorSave.encodeFromJSON(JSON.stringify(obj));
    const reDecoded = JSON.parse(MelvorSave.decodeToJSON(editedSave));
    const editOk = reDecoded.header.gp === 999999999 && reDecoded.header.saveName === obj.header.saveName;
    console.log("edit round-trip (GP " + oldGp + " -> 999999999): " + editOk + " (read back " + reDecoded.header.gp + ")");

    return objOk && jsonOk && editOk;
}

let allOk = true;
const sample = path.join(process.env.TEMP, "MelvorParse", "save.txt");
if (fs.existsSync(sample)) allOk = testSave("v130 sample", sample) && allOk;
const mine = path.join(__dirname, "..", "mysave.txt");
if (fs.existsSync(mine)) allOk = testSave("v131 user save", mine) && allOk;

console.log("\n" + (allOk ? "ALL TESTS PASSED" : "SOME TESTS FAILED"));
process.exit(allOk ? 0 : 1);
