## Melvoredit
Import and export save data for http://melvoridle.com/

## How do I use this?
Using the Melvor Idle sidebar, click on Settings, scroll down and click 'Import / Export Save' and copy your exported save.

1. Paste it into **1. Import**.
2. The **editor** appears with friendly fields:
   - **Character** — name and currencies (GP, Slayer Coins, …).
   - **Skills** — every skill with editable **Level**, **XP**, and **Mastery Pool XP**.
     Level and XP stay in sync (edit either). Combat skills show "—" for mastery.
     **Max all** sets every action you've trained in that skill to mastery level 99, and the
     header's **Set all to level 99** raises every skill below 99 (without lowering higher ones).
   - **Bank** — every banked item with an editable quantity, a **&times;** to remove it, and an
     **Add item** box (autocompletes from items your save already knows about). A **filter** box
     narrows the list, and **Set shown to** bulk-sets the quantity of every currently-shown item
     (e.g. filter "rune", set all to 5,000,000). Each item shows its **icon**, links to its
     **wiki page**, and shows the wiki **description** where one exists — fetched live from the
     [Melvor Idle Wiki](https://wiki.melvoridle.com) and cached in `localStorage` (offline → they
     just don't appear, items stay editable).
   - **Township** — town health plus every resource (Food, Wood, Stone, …) as editable quantities.
   - **Equipment** — the active set's slots; type to change the equipped item, edit quantities, or
     **&times;** to clear a slot. Each slot's autocomplete is **filtered to items that fit that slot**
     (weapons for the weapon slot, helmets for the helmet slot, …) using item-name heuristics; slots
     with no clear naming pattern (Passive, Gem, Enhancement, Consumable) suggest the full list. The
     field still accepts any item your save knows about, even if it isn't a listed suggestion.
   - **Advanced: raw JSON** (collapsible) — the complete save for anything not covered by the
     fields above (per-action mastery, buildings, spells/prayers, extra equipment sets, settings,
     …). Edits here update the friendly fields when you click out of the box, and vice-versa.
3. **3. Export** updates after every change. Use **Copy** or **Download .txt**, then paste/import
   it back into Melvor's Import Save.

Tip: a skill's spendable GP shown in-game lives in **Currencies → GP**, not the cosmetic
save-select number; editing the GP field updates both.

## A note on the save format
Melvor's save export used to be JSON compressed with gzip, so it could be shown directly as editable JSON.

As of game version 1.x (save versions **130/131**) the format changed: it is now `base64( zlib-deflate( an ordered binary stream ) )`. The binary stream has no JSON inside — every value is written in a fixed order with no field tags — so it can only be decoded with a schema that matches the save version.

This tool decodes that binary into a JSON representation you can edit, then writes it back out. Because a lot of the data is stored as ID-keyed maps/sets and raw byte buffers that JSON can't represent losslessly, those are **tagged** so re-export is byte-for-byte identical:

- `{ "#map":  [[key, value], ...] }` — an ordered key/value map (order and numeric keys preserved)
- `{ "#set":  [value, ...] }` — a set
- `{ "#bytes": [0..255, ...] }` — a raw byte buffer

A few binary "maps" can legitimately contain **duplicate keys** (e.g. combat `loot` can hold the
same item in two separate ground stacks). Those decode to a plain `[[key, value], ...]` array
instead of a `#map`, so no entry is lost on re-export.

If an import fails with something like "the save string looks incomplete", the usual cause is a
**truncated copy** — the export string is very long, so copy all of it.

Edit the values inside those, but keep the tags and surrounding structure intact. An unedited save round-trips to an identical payload, so you can trust the export.

Supported save versions: **130 and 131**. Other versions will report "Unsupported save version" — Melvor changes the layout when it bumps this number, so the schema would need updating.

## Project layout
- `index.html`, `main.css`, `main.js` — the static page and UI glue.
- `melvor-save.js` — the save codec (decode/edit/re-encode). **Generated** — do not edit by hand.
- `pako.min.js` — zlib (deflate/inflate) implementation used by the codec.
- `tools/` — the build pipeline and tests (not needed to *use* the site):
  - `build-melvor-save.js` — regenerates `melvor-save.js` from `tools/vendor/*.ts`.
  - `vendor/reader.ts`, `vendor/writer.ts` — the binary schema (see attribution below).
  - `roundtrip-test.js` — verifies decode → encode is byte-identical (run: `node tools/roundtrip-test.js`).
  - `detect-version.js` — prints a save's version/header (run: `node tools/detect-version.js <file>`).

The deployed site needs no build step — `melvor-save.js` is committed pre-generated. To rebuild it after changing the schema:

```
node tools/build-melvor-save.js
node tools/roundtrip-test.js
```

## Attribution & licensing
The binary save schema in `tools/vendor/` is adapted from the open-source
[MelvorParse](https://github.com/Shuttleu/MelvorParse) project by Shuttleu (with fixes: v131
support, lossless `excessData` round-trip, and corrected field names). At the time of writing
MelvorParse ships without a license file. The save *format* itself is Melvor Idle's; this is a
fan tool. If you intend to redistribute this publicly, check the licensing of MelvorParse first.
