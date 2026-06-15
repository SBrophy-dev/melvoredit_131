// Dump the user's skills with id->name and computed levels, to design the UI.
const fs = require("fs");
const path = require("path");
require(path.join(__dirname, "..", "pako.min.js")); // ensure pako resolvable
const MelvorSave = require(path.join(__dirname, "..", "melvor-save.js"));

// Standard Melvor/RS XP curve
function levelToXp(level) {
    if (level <= 1) return 0;
    let total = 0;
    for (let l = 1; l < level; l++) total += Math.floor(l + 300 * Math.pow(2, l / 7));
    return Math.floor(total / 4);
}
function xpToLevel(xp) {
    let level = 1, total = 0;
    for (let l = 1; l < 200; l++) {
        total += Math.floor(l + 300 * Math.pow(2, l / 7));
        if (Math.floor(total / 4) > xp) break;
        level = l + 1;
    }
    return level;
}
// sanity
console.log("level 99 xp =", levelToXp(99), "(expect 13034431)");
console.log("xpToLevel(13034431) =", xpToLevel(13034431), "| xpToLevel(13034430) =", xpToLevel(13034430));

const save = fs.readFileSync(path.join(__dirname, "..", "mysave.txt"), "utf8");
const { saveData } = MelvorSave.decode(save);

// invert namespaces -> id->name (first namespace wins, matching the reader)
const id2name = new Map();
saveData.header.namespaces.forEach((reg /* Map<name,id> */, ns) => {
    reg.forEach((id, name) => { if (!id2name.has(id)) id2name.set(id, ns + ":" + name); });
});

console.log("\nid    name                         level  xp            masteryPool  actionMasteries");
saveData.skills.forEach((skill, id) => {
    const name = id2name.get(id) || ("#" + id);
    const lvl = xpToLevel(skill.xp);
    const pool = skill.mastery && skill.mastery.masteryPool ? Array.from(skill.mastery.masteryPool.values()) : [];
    const acts = skill.mastery && skill.mastery.actionMastery ? skill.mastery.actionMastery.size : "-";
    console.log(
        String(id).padEnd(5),
        name.padEnd(28),
        String(lvl).padStart(5),
        String(Math.floor(skill.xp)).padStart(12),
        String(pool.map((x) => Math.floor(x)).join(",")).padEnd(12),
        String(acts)
    );
});
