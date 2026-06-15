// melvoredit UI.
//   1. Import  -> decode save into an in-memory object (state.saveData)
//   2. Edit    -> friendly fields (Character / Currencies / Skills / Bank) + raw JSON,
//                 both editing the SAME object
//   3. Export  -> re-encoded save, regenerated after every change
// Codec + tagged-JSON format live in melvor-save.js.

window.addEventListener('DOMContentLoaded', () => {
    const byId = (id) => document.getElementById(id);
    const $import = byId('txtImport');
    const $edit = byId('txtEdit');        // advanced raw JSON
    const $export = byId('txtExport');
    const $msg = byId('msg');
    const $editor = byId('editor');
    const $charName = byId('charName');
    const $currencies = byId('currenciesBody');
    const $skillsBody = byId('skillsBody');
    const $bankBody = byId('bankBody');
    const $bankCount = byId('bankCount');
    const $bankAddName = byId('bankAddName');
    const $bankAddQty = byId('bankAddQty');
    const $bankAddBtn = byId('bankAddBtn');
    const $bankFilter = byId('bankFilter');
    const $bankBulkQty = byId('bankBulkQty');
    const $bankBulkBtn = byId('bankBulkBtn');
    const $itemNames = byId('itemNames');
    const $townshipCard = byId('townshipCard');
    const $townHealth = byId('townHealth');
    const $townshipResources = byId('townshipResources');
    const $equipmentCard = byId('equipmentCard');
    const $equipSetLabel = byId('equipSetLabel');
    const $equipBody = byId('equipBody');
    const $equipDatalists = byId('equipDatalists');
    const $maxSkillsBtn = byId('maxSkillsBtn');
    const $copyBtn = byId('copyBtn');
    const $downloadBtn = byId('downloadBtn');
    const $copyMsg = byId('copyMsg');

    const MAX_XP = 13034431; // level 99 (and mastery level 99)
    const state = { saveData: null, id2name: new Map(), name2id: new Map(), gpCurrencyId: null, bankFilter: '', equipGroups: new Set() };

    // Per-slot item-name heuristics (Melvor names equipment consistently). Used only to filter
    // the dropdown SUGGESTIONS per slot; the field still accepts any registry item you type.
    const EQUIP_KEYWORDS = {
        Helmet: ['helmet', 'helm', 'hat', 'hood', 'coif', 'cowl', 'mask', 'crown', 'circlet', 'headband'],
        Platebody: ['platebody', 'body', 'chestplate', 'vestments', 'shirt', 'tunic', 'jacket', 'robes'],
        Platelegs: ['platelegs', 'legs', 'chaps', 'trousers', 'bottoms', 'greaves', 'skirt'],
        Boots: ['boots', 'shoes'],
        Gloves: ['gloves', 'gauntlets', 'vambraces', 'bracers'],
        Shield: ['shield', 'defender', 'buckler'],
        Weapon: ['sword', 'scimitar', 'battleaxe', 'greataxe', 'axe', 'mace', 'dagger', 'spear', 'halberd', 'warhammer', 'maul', 'hammer', 'longbow', 'shortbow', 'crossbow', 'bow', 'staff', 'wand', 'claw', 'sickle', 'trident', 'blade', 'whip', '2h', 'rapier', 'cutlass'],
        Amulet: ['amulet', 'necklace', 'pendant'],
        Ring: ['ring'],
        Cape: ['cape', 'cloak', 'skillcape', 'scarf', 'shroud'],
        Quiver: ['arrows', 'bolts', 'javelin', 'javelins', 'knife', 'knives'],
        Summon: ['familiar']
    };
    const slotGroup = (slotName) => /^Summon/.test(slotName) ? 'Summon' : slotName;

    // --- Melvor/RuneScape XP curve (level <-> total xp) ---
    const levelToXp = (level) => {
        level = Math.max(1, Math.min(200, Math.floor(level)));
        let total = 0;
        for (let l = 1; l < level; l++) total += Math.floor(l + 300 * Math.pow(2, l / 7));
        return Math.floor(total / 4);
    };
    const xpToLevel = (xp) => {
        let level = 1, total = 0;
        for (let l = 1; l < 200; l++) {
            total += Math.floor(l + 300 * Math.pow(2, l / 7));
            if (Math.floor(total / 4) > xp) break;
            level = l + 1;
        }
        return level;
    };

    const setError = (text) => { $msg.textContent = text || ''; $msg.style.display = text ? 'block' : 'none'; };

    // turn a raw decode error into something actionable
    const friendlyImportError = (msg) => {
        if (/Offset is outside the bound|out of (range|bounds)|DataView/i.test(msg))
            return 'the save string looks incomplete. Make sure you copied the ENTIRE "Export Save" string from Melvor — it is very long and easy to cut off.';
        if (/atob|base.?64|not correctly encoded|InvalidCharacter/i.test(msg))
            return 'that does not look like a valid save string (could not base64-decode it). Paste the full Export Save string from Melvor.';
        if (/header check|incorrect|invalid (distance|literal|stored|block)|inflate|unzlib|zlib/i.test(msg))
            return 'could not decompress the save — it looks incomplete or is not a Melvor export.';
        if (/Unsupported save version/i.test(msg))
            return msg + '. This tool currently supports save versions 130 and 131.';
        if (/Not a Melvor Idle save/i.test(msg))
            return 'that is not a Melvor Idle save string.';
        return msg;
    };
    const nameOf = (id) => state.id2name.get(id) || ('#' + id);
    const num = (v, min) => Math.max(min, Number(v) || 0);
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const buildNameMaps = (saveData) => {
        const id2name = new Map(), name2id = new Map();
        saveData.header.namespaces.forEach((reg) => reg.forEach((id, name) => {
            if (!id2name.has(id)) id2name.set(id, name);
            if (!name2id.has(name)) name2id.set(name, id);
        }));
        state.id2name = id2name;
        state.name2id = name2id;
    };
    const findGpId = () => {
        for (const [id] of state.saveData.currencies) if (state.id2name.get(id) === 'GP') return id;
        return null;
    };

    // mastery pool is keyed by realm; prefer the save's realm, else the first entry
    const masteryPool = (skill) => {
        if (!skill.mastery || !skill.mastery.masteryPool) return null;
        const mp = skill.mastery.masteryPool;
        if (mp.has(state.saveData.realm)) return mp.get(state.saveData.realm);
        const first = mp.values().next();
        return first.done ? 0 : first.value;
    };
    const setMasteryPool = (skill, value) => {
        const mp = skill.mastery.masteryPool;
        let key = state.saveData.realm;
        if (!mp.has(key)) { const f = mp.keys().next(); if (!f.done) key = f.value; }
        mp.set(key, value);
    };

    // --- regenerate Export + raw JSON from the object ---
    const regenerate = () => {
        const json = MelvorSave.toJSON(state.saveData);
        $edit.value = json;
        $edit.disabled = false;
        $export.value = MelvorSave.encode(state.saveData, json.length + 1024);
        $export.disabled = false;
        setError('');
    };

    // --- renderers ---
    const renderCurrencies = () => {
        $currencies.innerHTML = '';
        state.saveData.currencies.forEach((cur, id) => {
            const row = document.createElement('div');
            row.className = 'form-group row mb-1';
            row.innerHTML =
                '<label class="col-4 col-form-label col-form-label-sm text-right">' + esc(nameOf(id)) + '</label>' +
                '<div class="col-8"><input type="number" min="0" class="form-control form-control-sm" ' +
                'data-currency="' + id + '" value="' + Math.floor(cur.qty) + '"></div>';
            $currencies.appendChild(row);
        });
    };

    const renderSkills = () => {
        $skillsBody.innerHTML = '';
        const rows = Array.from(state.saveData.skills.entries())
            .map(([id, skill]) => ({ id, skill, name: nameOf(id) }))
            .sort((a, b) => a.name.localeCompare(b.name));
        for (const { id, skill, name } of rows) {
            const pool = masteryPool(skill);
            const actions = skill.mastery && skill.mastery.actionMastery ? skill.mastery.actionMastery.size : 0;
            const tr = document.createElement('tr');
            tr.innerHTML =
                '<td class="pl-3 align-middle">' + esc(name) + '</td>' +
                '<td><input type="number" min="1" max="200" class="form-control form-control-sm" data-skill="' + id + '" data-field="level" value="' + xpToLevel(skill.xp) + '"></td>' +
                '<td><input type="number" min="0" class="form-control form-control-sm" data-skill="' + id + '" data-field="xp" value="' + Math.floor(skill.xp) + '"></td>' +
                '<td>' + (pool === null
                    ? '<span class="text-muted">&mdash;</span>'
                    : '<input type="number" min="0" class="form-control form-control-sm" data-skill="' + id + '" data-field="pool" value="' + Math.floor(pool) + '">') +
                '</td>' +
                '<td class="align-middle">' + (actions > 0
                    ? '<button type="button" class="btn btn-sm btn-outline-secondary" data-maxmastery="' + id + '">Max all (' + actions + ')</button>'
                    : '<span class="text-muted">&mdash;</span>') +
                '</td>';
            $skillsBody.appendChild(tr);
        }
    };

    const bankItemRows = () => {
        // flatten { tab, id, qty } across all tabs, sorted by item name
        const rows = [];
        state.saveData.bank.tabs.forEach((tab, ti) => tab.forEach((qty, id) => rows.push({ ti, id, qty })));
        rows.sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id)));
        return rows;
    };
    // --- Melvor wiki enrichment: item icon + description (cached in localStorage) ---
    const WIKI_API = 'https://wiki.melvoridle.com/api.php';
    const WIKI_PAGE = 'https://wiki.melvoridle.com/w/';
    const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    const wikiMem = new Map();
    const cssEsc = (s) => (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
    // internal item name (PascalCase_with_underscores) -> wiki title case ("Ancient Ring of Mastery")
    const SMALL_WORDS = new Set(['of', 'the', 'and', 'to', 'in', 'on', 'for', 'with', 'from', 'at', 'by', 'or', 'nor', 'vs']);
    const toWikiTitle = (name) => name.split('_')
        .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase())) ? w.toLowerCase() : w)
        .join(' ');
    const wikiGet = (name) => {
        if (wikiMem.has(name)) return wikiMem.get(name);
        try {
            const s = localStorage.getItem('melvoredit:wiki:v2:' + name);
            if (s) { const d = JSON.parse(s); wikiMem.set(name, d); return d; }
        } catch (e) { /* localStorage unavailable */ }
        return undefined;
    };
    const wikiSet = (name, d) => {
        wikiMem.set(name, d);
        try { localStorage.setItem('melvoredit:wiki:v2:' + name, JSON.stringify(d)); } catch (e) { /* ignore */ }
    };
    const applyEnrichment = (name, d) => {
        if (!d) return;
        if (d.thumb) document.querySelectorAll('img.bank-icon[data-icon="' + cssEsc(name) + '"]').forEach((img) => {
            img.onerror = () => { img.onerror = null; img.src = PLACEHOLDER; };
            img.src = d.thumb;
        });
        if (d.extract) document.querySelectorAll('span.bank-desc[data-desc="' + cssEsc(name) + '"]').forEach((span) => {
            span.textContent = d.extract;
            span.title = d.extract;
        });
    };
    const fetchWiki = async (names) => {
        const titles = names.map(toWikiTitle);
        const url = WIKI_API + '?action=query&format=json&redirects=1' +
            '&prop=pageimages|extracts&piprop=thumbnail&pithumbsize=40&pilimit=max' +
            '&exintro&explaintext&exlimit=max' +
            '&titles=' + encodeURIComponent(titles.join('|')) + '&origin=*';
        const j = await (await fetch(url)).json();
        const out = new Map();
        if (!j.query) return out;
        const norm = new Map((j.query.normalized || []).map((x) => [x.from, x.to]));
        const redir = new Map((j.query.redirects || []).map((x) => [x.from, x.to]));
        const byTitle = new Map(Object.values(j.query.pages || {}).map((p) => [p.title, p]));
        const resolve = (t) => { t = norm.get(t) || t; t = redir.get(t) || t; return t; };
        names.forEach((n, i) => {
            const p = byTitle.get(resolve(titles[i]));
            out.set(n, {
                thumb: p && p.thumbnail ? p.thumbnail.source : null,
                extract: p && p.extract ? p.extract.replace(/\s+/g, ' ').trim() : null
            });
        });
        return out;
    };
    let enriching = false;
    const enrichBank = async (names) => {
        const todo = [];
        for (const n of [...new Set(names)]) {
            if (!/^[A-Za-z0-9]/.test(n)) continue; // skip "#123" placeholders for unknown ids
            const c = wikiGet(n);
            if (c) applyEnrichment(n, c);
            else todo.push(n);
        }
        if (!todo.length || enriching) return;
        enriching = true;
        try {
            for (let i = 0; i < todo.length; i += 20) {
                const chunk = todo.slice(i, i + 20).filter((n) => !wikiGet(n));
                if (!chunk.length) continue;
                const data = await fetchWiki(chunk);
                for (const n of chunk) {
                    const d = data.get(n) || { thumb: null, extract: null };
                    wikiSet(n, d);
                    applyEnrichment(n, d);
                }
            }
        } catch (e) {
            // offline / blocked: keep placeholders, items remain fully editable
        } finally {
            enriching = false;
        }
    };

    const bankMatches = (id) => {
        const f = state.bankFilter.trim().toLowerCase();
        if (!f) return true;
        return nameOf(id).toLowerCase().includes(f) || toWikiTitle(nameOf(id)).toLowerCase().includes(f);
    };
    const renderBank = () => {
        const all = bankItemRows();
        const rows = all.filter((r) => bankMatches(r.id));
        $bankCount.textContent = state.bankFilter.trim()
            ? '(' + rows.length + ' of ' + all.length + ' shown)'
            : '(' + all.length + ' items)';
        $bankBody.innerHTML = rows.map((r) => {
            const name = nameOf(r.id);
            const known = /^[A-Za-z0-9]/.test(name);
            const cached = wikiGet(name);
            const display = esc(toWikiTitle(name));
            const src = cached && cached.thumb ? esc(cached.thumb) : PLACEHOLDER;
            const desc = cached && cached.extract ? esc(cached.extract) : '';
            const label = known
                ? '<a class="bank-name" href="' + WIKI_PAGE + encodeURIComponent(toWikiTitle(name).replace(/ /g, '_')) + '" target="_blank" rel="noopener">' + display + '</a>'
                : '<span class="bank-name">' + display + '</span>';
            return '<div class="form-row align-items-center mb-1">' +
                '<div class="col d-flex align-items-center" style="min-width:0;">' +
                    '<img class="bank-icon" alt="" data-icon="' + esc(name) + '" src="' + src + '">' +
                    label +
                    '<span class="bank-desc text-muted small" data-desc="' + esc(name) + '" title="' + desc + '">' + desc + '</span>' +
                '</div>' +
                '<div class="col-auto"><input type="number" min="0" class="form-control form-control-sm" style="width:10rem;" ' +
                    'data-bank-tab="' + r.ti + '" data-bank-item="' + r.id + '" value="' + Math.floor(r.qty) + '"></div>' +
                '<div class="col-auto"><button type="button" class="btn btn-sm btn-outline-danger" title="Remove" ' +
                    'data-bank-del-tab="' + r.ti + '" data-bank-del-item="' + r.id + '">&times;</button></div>' +
                '</div>';
        }).join('');
        enrichBank(rows.map((r) => nameOf(r.id)));
    };

    const renderDatalist = () => {
        $itemNames.innerHTML = Array.from(state.name2id.keys())
            .sort()
            .map((n) => '<option value="' + esc(n) + '">')
            .join('');
    };

    const findSkillByName = (name) => {
        for (const [id, skill] of state.saveData.skills) if (nameOf(id) === name) return skill;
        return null;
    };
    const township = () => {
        const ts = findSkillByName('Township');
        return ts && ts.skillSpecific && ts.skillSpecific.townData ? ts.skillSpecific : null;
    };

    const renderTownship = () => {
        const ts = township();
        if (!ts) { $townshipCard.style.display = 'none'; return; }
        $townshipCard.style.display = '';
        $townHealth.value = ts.townData.health;
        $townshipResources.innerHTML = '';
        ts.resources.forEach((res, id) => {
            const row = document.createElement('div');
            row.className = 'form-group row mb-1';
            row.innerHTML =
                '<label class="col-4 col-form-label col-form-label-sm text-right">' + esc(nameOf(id).replace(/_/g, ' ')) + '</label>' +
                '<div class="col-8"><input type="number" min="0" class="form-control form-control-sm" ' +
                'data-township-res="' + id + '" value="' + Math.floor(res.qty) + '"></div>';
            $townshipResources.appendChild(row);
        });
    };

    // active equipment set (combat.player.equipmentSets[selected])
    const equipSet = () => {
        const p = state.saveData.combat && state.saveData.combat.player;
        if (!p || !p.equipmentSets || !p.equipmentSets.length) return null;
        const idx = Math.min(p.equipmentSet || 0, p.equipmentSets.length - 1);
        return p.equipmentSets[idx];
    };
    // Build one <datalist> per equipment slot group, from registry items whose name tokens
    // match that slot's keywords. Slots with no matches fall back to the full itemNames list.
    const buildEquipDatalists = () => {
        const groups = {};
        for (const name of state.name2id.keys()) {
            const tokens = name.toLowerCase().split('_');
            for (const grp in EQUIP_KEYWORDS) {
                if (tokens.some((t) => EQUIP_KEYWORDS[grp].includes(t))) (groups[grp] = groups[grp] || []).push(name);
            }
        }
        state.equipGroups = new Set(Object.keys(groups));
        $equipDatalists.innerHTML = Object.keys(groups).map((grp) =>
            '<datalist id="eqslot-' + grp + '">' +
            groups[grp].sort().map((n) => '<option value="' + esc(n) + '">').join('') +
            '</datalist>'
        ).join('');
    };

    const renderEquipment = () => {
        const set = equipSet();
        if (!set || !set.equipment || !set.equipment.length) { $equipmentCard.style.display = 'none'; return; }
        $equipmentCard.style.display = '';
        const p = state.saveData.combat.player;
        $equipSetLabel.textContent = p.equipmentSets.length > 1 ? '(set ' + ((p.equipmentSet || 0) + 1) + ' of ' + p.equipmentSets.length + ')' : '';
        $equipBody.innerHTML = set.equipment.map((slot, idx) => {
            const occupied = slot.stackable != null;
            const itemName = occupied ? nameOf(slot.stackable) : '';
            const grp = slotGroup(nameOf(slot.id));
            const listId = state.equipGroups.has(grp) ? 'eqslot-' + grp : 'itemNames';
            return '<tr>' +
                '<td class="pl-3 align-middle text-muted">' + esc(nameOf(slot.id)) + '</td>' +
                '<td><input type="text" list="' + listId + '" class="form-control form-control-sm" data-equip-slot="' + idx + '" data-equip-field="item" value="' + esc(itemName) + '" placeholder="(empty)"></td>' +
                '<td><input type="number" min="1" class="form-control form-control-sm" data-equip-slot="' + idx + '" data-equip-field="qty" value="' + (occupied ? Math.floor(slot.qty != null ? slot.qty : 1) : '') + '"' + (occupied ? '' : ' disabled') + '></td>' +
                '<td class="align-middle">' + (occupied ? '<button type="button" class="btn btn-sm btn-outline-danger" title="Clear" data-equip-clear="' + idx + '">&times;</button>' : '') + '</td>' +
                '</tr>';
        }).join('');
    };

    const renderAll = () => {
        $charName.value = state.saveData.characterName;
        renderCurrencies();
        renderSkills();
        renderBank();
        renderTownship();
        buildEquipDatalists();
        renderEquipment();
        renderDatalist();
    };

    // --- field edit handlers ---
    $charName.addEventListener('change', () => {
        state.saveData.characterName = $charName.value;
        regenerate();
    });

    $currencies.addEventListener('change', (e) => {
        const id = Number(e.target.dataset.currency);
        if (!state.saveData.currencies.has(id)) return;
        const cur = state.saveData.currencies.get(id);
        cur.qty = num(e.target.value, 0);
        if (id === state.gpCurrencyId) state.saveData.header.gp = cur.qty; // keep save-select display in sync
        regenerate();
    });

    $skillsBody.addEventListener('change', (e) => {
        const field = e.target.dataset.field;
        if (!field) return;
        const id = Number(e.target.dataset.skill);
        const skill = state.saveData.skills.get(id);
        const row = e.target.closest('tr');
        if (field === 'level') {
            skill.xp = levelToXp(num(e.target.value, 1));
            e.target.value = xpToLevel(skill.xp);
            row.querySelector('[data-field="xp"]').value = Math.floor(skill.xp);
        } else if (field === 'xp') {
            skill.xp = num(e.target.value, 0);
            row.querySelector('[data-field="level"]').value = xpToLevel(skill.xp);
        } else if (field === 'pool') {
            setMasteryPool(skill, num(e.target.value, 0));
        }
        regenerate();
    });

    // township: town health + resource quantities
    $townHealth.addEventListener('change', () => {
        const ts = township();
        if (!ts) return;
        ts.townData.health = Math.max(0, Math.min(100, Math.floor(Number($townHealth.value) || 0)));
        regenerate();
    });
    $townshipResources.addEventListener('change', (e) => {
        const id = Number(e.target.dataset.townshipRes);
        const ts = township();
        if (!ts || !ts.resources.has(id)) return;
        ts.resources.get(id).qty = num(e.target.value, 0);
        regenerate();
    });

    // equipment: change equipped item / quantity / clear a slot
    $equipBody.addEventListener('change', (e) => {
        const field = e.target.dataset.equipField;
        if (!field) return;
        const set = equipSet();
        const slot = set.equipment[Number(e.target.dataset.equipSlot)];
        if (field === 'item') {
            const name = e.target.value.trim();
            if (!name) { slot.stackable = undefined; slot.qty = undefined; }
            else if (state.name2id.has(name)) { slot.stackable = state.name2id.get(name); if (slot.qty == null) slot.qty = 1; }
            else { setError('Unknown item "' + name + '" — pick a suggested (registry) name.'); return; }
            renderEquipment();
        } else if (field === 'qty') {
            if (slot.stackable != null) slot.qty = num(e.target.value, 1) || 1;
        }
        regenerate();
    });
    $equipBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-equip-clear]');
        if (!btn) return;
        const slot = equipSet().equipment[Number(btn.dataset.equipClear)];
        slot.stackable = undefined; slot.qty = undefined;
        renderEquipment();
        regenerate();
    });

    // "Max all" trained masteries for a skill
    $skillsBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-maxmastery]');
        if (!btn) return;
        const skill = state.saveData.skills.get(Number(btn.dataset.maxmastery));
        skill.mastery.actionMastery.forEach((_, actionId) => skill.mastery.actionMastery.set(actionId, MAX_XP));
        btn.textContent = 'Maxed ✓';
        btn.disabled = true;
        regenerate();
    });

    // --- bank handlers ---
    $bankBody.addEventListener('change', (e) => {
        const ti = e.target.dataset.bankTab, id = e.target.dataset.bankItem;
        if (ti === undefined || id === undefined) return;
        state.saveData.bank.tabs[Number(ti)].set(Number(id), num(e.target.value, 0));
        regenerate();
    });
    $bankBody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-bank-del-item]');
        if (!btn) return;
        state.saveData.bank.tabs[Number(btn.dataset.bankDelTab)].delete(Number(btn.dataset.bankDelItem));
        renderBank();
        regenerate();
    });
    $bankFilter.addEventListener('input', () => {
        state.bankFilter = $bankFilter.value;
        renderBank();
    });
    $bankBulkBtn.addEventListener('click', () => {
        if ($bankBulkQty.value.trim() === '') { setError('Enter a quantity to set.'); return; }
        const qty = num($bankBulkQty.value, 0);
        let count = 0;
        state.saveData.bank.tabs.forEach((tab) => tab.forEach((q, id) => {
            if (bankMatches(id)) { tab.set(id, qty); count++; }
        }));
        renderBank();
        regenerate();
    });
    $bankAddBtn.addEventListener('click', () => {
        const name = $bankAddName.value.trim();
        if (!name) return;
        if (!state.name2id.has(name)) {
            setError('Add failed: "' + name + '" is not an item known to this save. Pick a suggested name.');
            return;
        }
        const id = state.name2id.get(name);
        const qty = num($bankAddQty.value, 1) || 1;
        const tabs = state.saveData.bank.tabs;
        // if already banked (in any tab), just update its quantity
        let found = false;
        for (const tab of tabs) if (tab.has(id)) { tab.set(id, qty); found = true; break; }
        if (!found) {
            let ti = state.saveData.bank.defaultTabs.has(id) ? state.saveData.bank.defaultTabs.get(id) : 0;
            if (ti >= tabs.length) ti = 0;
            tabs[ti].set(id, qty);
        }
        $bankAddName.value = '';
        $bankAddQty.value = '1';
        renderBank();
        regenerate();
    });

    // --- import / advanced raw-JSON ---
    const resetEditor = () => {
        $editor.style.display = 'none';
        $edit.value = ''; $edit.disabled = true;
        $export.value = ''; $export.disabled = true;
        state.saveData = null;
    };

    const loadSaveData = (saveData) => {
        state.saveData = saveData;
        buildNameMaps(saveData);
        state.gpCurrencyId = findGpId();
        renderAll();
        $editor.style.display = '';
    };

    const doImport = () => {
        if (!$import.value.trim()) { resetEditor(); setError(''); return; }
        try {
            const decoded = MelvorSave.decode($import.value.trim());
            if (typeof decoded === 'string') throw new Error(decoded); // reader returns its error as a string
            loadSaveData(decoded.saveData);
            regenerate();
        } catch (e) {
            resetEditor();
            setError('Import failed: ' + friendlyImportError(e.message));
        }
    };

    // edits in the raw JSON box flow back into the friendly fields
    const doAdvancedEdit = () => {
        try {
            loadSaveData(MelvorSave.fromJSON($edit.value));
            $export.value = MelvorSave.encode(state.saveData, $edit.value.length + 1024);
            $export.disabled = false;
            setError('');
        } catch (e) {
            setError('Advanced JSON is invalid: ' + e.message);
        }
    };

    // "Set all skills to level 99" (raise-only: never lowers a higher skill)
    $maxSkillsBtn.addEventListener('click', () => {
        if (!state.saveData) return;
        state.saveData.skills.forEach((skill) => { if (skill.xp < MAX_XP) skill.xp = MAX_XP; });
        renderSkills();
        regenerate();
    });

    // Export: copy to clipboard / download
    const flashCopyMsg = (text) => { $copyMsg.textContent = text; setTimeout(() => { $copyMsg.textContent = ''; }, 2000); };
    $copyBtn.addEventListener('click', async () => {
        if (!$export.value) return;
        try {
            await navigator.clipboard.writeText($export.value);
            flashCopyMsg('Copied!');
        } catch (e) {
            // fallback for non-secure contexts
            $export.disabled = false; $export.select(); document.execCommand('copy'); $export.disabled = true;
            flashCopyMsg('Copied!');
        }
    });
    $downloadBtn.addEventListener('click', () => {
        if (!$export.value) return;
        const name = (state.saveData && state.saveData.header && state.saveData.header.saveName) || 'melvor';
        const blob = new Blob([$export.value], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name.replace(/[^A-Za-z0-9_-]/g, '_') + '_save.txt';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    });

    $import.addEventListener('input', doImport);
    $edit.addEventListener('change', doAdvancedEdit);
});
