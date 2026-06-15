import { unzlibSync, strToU8 } from 'fflate';
import { saveData } from "./type"

class Reader {
    parsedString: ArrayBuffer;
    dataView: DataView;
    offset = 0;

    constructor (saveString: string) {
        this.parsedString = unzlibSync(strToU8(atob(saveString), true)).buffer;
        this.dataView = new DataView(this.parsedString);
    }

    getStaticString(length: number) {
            const decoder = new TextDecoder()
            const encodedString = this.parsedString.slice(this.offset, this.offset + length);
            const string = decoder.decode(encodedString);
            this.offset += length;
        return string;
    }

    getString() {
            const stringLength = this.getUint32();
            const decoder = new TextDecoder()
            const encodedString = this.parsedString.slice(this.offset, this.offset + stringLength);
            const string = decoder.decode(encodedString);
            this.offset += stringLength;
        return string;
    }

    getInt8() {
        const value = this.dataView.getInt8(this.offset);
        this.offset += Int8Array.BYTES_PER_ELEMENT;
        return value;
    }
    getUint8() {
        const value = this.dataView.getUint8(this.offset);
        this.offset += Uint8Array.BYTES_PER_ELEMENT;
        return value;
    }

    getInt16() {
        const value = this.dataView.getInt16(this.offset);
        this.offset += Int16Array.BYTES_PER_ELEMENT;
        return value;
    }
    getUint16() {
        const value = this.dataView.getUint16(this.offset);
        this.offset += Uint16Array.BYTES_PER_ELEMENT;
        return value;
    }
    getInt32() {
        const value = this.dataView.getInt32(this.offset);
        this.offset += Int32Array.BYTES_PER_ELEMENT;
        return value;
    }

    getUint32() {
        const value = this.dataView.getUint32(this.offset);
        this.offset += Uint32Array.BYTES_PER_ELEMENT;
        return value;
    }

    getBoolean() {
        return this.getUint8() === 1;
    }

    getFloat64() {
        const value = this.dataView.getFloat64(this.offset);
        this.offset += Float64Array.BYTES_PER_ELEMENT;
        return value;
    }
    getFixedLengthBuffer(length: number) {
        const buffer = this.parsedString.slice(this.offset, this.offset + length);
        this.offset += length;
        return buffer;
    }

    getArray(value: (reader: Reader) => any) {
        var result: Array<any> = [];
        const arraySize = this.getUint32();
        for (var i = 0; i < arraySize; i++) {
            result.push(value(this))
        }
        return result;
    }

    getSet(value: (reader: Reader) => any): Set<any> {
        var result = new Set();
        const arraySize = this.getUint32();
        for (var i = 0; i < arraySize; i++) {
            result.add(value(this))
        }
        return result;
    }

    getMap(key: (reader: Reader) => number | string, value: (reader: Reader, key: number) => any) {
        var result = new Map();
        // Melvor's binary maps can contain DUPLICATE keys (e.g. combat `loot` can hold the same
        // item in two separate stacks). A JS Map would dedupe them and lose data on re-encode, so
        // if a duplicate key is seen we switch to a lossless array of [key, value] pairs. Writer's
        // setMap handles both; unique-keyed maps (bank, currencies, skills, ...) stay real Maps.
        var pairs: any = null;
        const arraySize = this.getUint32();
        for (var i = 0; i < arraySize; i++) {
            const setKey = key(this);
            const tempKey = typeof setKey === "number" ? setKey : 0
            const setValue = value(this, tempKey);
            if (pairs !== null) {
                pairs.push([setKey, setValue]);
            } else if (result.has(setKey)) {
                pairs = Array.from(result.entries());
                pairs.push([setKey, setValue]);
            } else {
                result.set(setKey, setValue);
            }
        }
        return pairs !== null ? pairs : result;
    }
}

export function parseString(string: string): {saveData: saveData, initialSize: number} {
    try {
        var reader = new Reader(string);

        const staticString = reader.getStaticString(6);

        if (staticString != "melvor") throw new Error("Not a Melvor Idle save string");

        const knownNamespaces = ["melvorD", "melvorF", "melvorAoD", "melvorTotH", "melvorItA"];
        
        function findItemFromNamespace(item: number) {
            for (var i = 0; i < knownNamespaces.length; i++){
                const value = headerNamespaces.get(knownNamespaces[i]);
                var result:string | undefined = undefined;
                if (value != undefined)
                    value.forEach((v: number, k: string) => {
                        if (v == item)
                            result = k;
                    });
                if (result != undefined) return result;
            }
            return "Unknown";
        }
        
        reader.getUint32();
        const headerNamespaces = reader.getMap(
            (reader) => reader.getString(), 
            (reader) => reader.getMap(
                    (reader) => reader.getString(),
                    (reader) => reader.getUint16()
                )
        );
        
        
        const headerSaveVersion = reader.getUint32();
        if (headerSaveVersion != 130 && headerSaveVersion != 131) throw new Error("Unsupported save version: " + headerSaveVersion);
        const headerSaveName = reader.getString();
        const headerGameMode = reader.getString();
        const headerSkillLevel = reader.getUint16();
        const headerGp = reader.getFloat64();
        const headerActiveTraining = reader.getBoolean();
        const headerActiveTrainingName = reader.getString();
        const headerTickTime = reader.getFloat64();
        const headerSaveTime = reader.getFloat64();
        const headerActiveNamespaces = reader.getSet((reader) => reader.getString());
        
        const headerMods = reader.getBoolean() ? {
            profileId: reader.getString(),
            profileName: reader.getString(),
            mods: reader.getSet((reader) => reader.getUint32())
        } : undefined
        reader.getUint32();
        const tickTime = reader.getFloat64();
        const saveTime = reader.getFloat64();
        const activeAction = reader.getBoolean() ? reader.getUint16() : undefined;
        
        const pausedAction = reader.getBoolean() ? reader.getUint16() : undefined;
        
        
        const paused = reader.getBoolean();
        const merchantsPermitRead = reader.getBoolean();
        const gameMode = reader.getUint16();
        const characterName = reader.getString();
        // Bank start
        const lockedItems = reader.getArray((reader) => reader.getUint16());
        const bankTabs = reader.getArray(
            (reader) => reader.getMap(
                (reader) => reader.getUint16(),
                (reader) => reader.getUint32()
            )
        );
        
        const defaultItemTabs = reader.getMap(
            (reader) => reader.getUint16(),
            (reader) => reader.getUint8()
        );
        const customSortOrder = reader.getArray((reader) => reader.getUint16());
        const glowingItems = reader.getArray((reader) => reader.getUint16());
        const tabIcons = reader.getMap(
            (reader) => reader.getUint8(),
            (reader) => reader.getUint16()
        );
        // Bank Complete
        
        
        // Character / Combat start
        // Character start
        const hp = reader.getUint32();
        const nextAction = reader.getUint8();
        const attackCount = reader.getUint32();
        const nextAttack = reader.getUint16();
        const isAttacking = reader.getBoolean();
        const firstHit = reader.getBoolean();
        const actionTicksLeft = reader.getUint32();
        const actionMaxTicks = reader.getUint32();
        const actionActive = reader.getBoolean();
        const regenTicksLeft = reader.getUint32();
        const regenMaxTicks = reader.getUint32();
        const regenActive = reader.getBoolean();
        const turnsTaken = reader.getUint32();
        const bufferedRegen = reader.getUint32();
        const activeEffects = reader.getMap(
            (reader) => reader.getUint16(),
            (reader) => {
                return {
                    player: reader.getBoolean(),
                    type: reader.getUint8(),
                    damageDealt: reader.getFloat64(),
                    damageTaken: reader.getFloat64(),
                    prameters: reader.getArray((reader) => [reader.getString(), reader.getUint32()]),
                    statGroups: reader.getArray((reader) => [reader.getString(), reader.getUint32()]),
                    timers: reader.getArray((reader) => [
                        reader.getString(),
                        reader.getUint32(),
                        reader.getUint32(),
                        reader.getBoolean()
                ])}
            }
        );
        const firstMiss = reader.getBoolean();
        const barrier = reader.getUint32();
        const melee = reader.getBoolean() ? reader.getUint16() : undefined;
        
        const ranged = reader.getBoolean() ? reader.getUint16() : undefined;
        
        const magic = reader.getBoolean() ? reader.getUint16() : undefined;
        
        
        const prayerPoints = reader.getUint32();
        const selectedEquipmentSet = reader.getUint16();
        const equipmentSets = reader.getArray((reader) => {
            return {
                equipment: reader.getArray((reader) => {
                    const id = reader.getUint16();
                    var stackable: number | undefined = undefined;
                    var qty: number | undefined = undefined;
                    if (reader.getBoolean()) {
                        stackable = reader.getUint16();
                        qty = reader.getUint32();
                    }
                    const quickEquip = reader.getArray((reader) => reader.getUint16());
                    return {
                        id: id,
                        stackable: stackable,
                        qty: qty,
                        quickEquip: quickEquip
                    };
                }),
                spells: {
                    spell: reader.getBoolean() ? reader.getUint16() : undefined,
                    aura: reader.getBoolean() ? reader.getUint16() : undefined,
                    curse: reader.getBoolean() ? reader.getUint16() : undefined
                },
                prayers: reader.getArray((reader) => reader.getUint16())
            }
        });
        const selectedFoodSlot = reader.getUint32();
        const maxFoodSlot = reader.getUint32();
        const foodSlots = reader.getArray((reader) => [reader.getUint16(), reader.getUint32()]);
        const summonTicksLeft = reader.getUint32();
        const summonMaxTicks = reader.getUint32();
        const summonActive = reader.getBoolean();
        const soulPoints = reader.getUint32();
        const unholyPrayerMultiplier = reader.getUint8();
        // Character Complete
        
        // Enemy start
        const enemyHitpoints = reader.getUint32();
        const enemyAction = reader.getUint8();
        const enemyAttackCount = reader.getUint32();
        const enemyNextAttack = reader.getUint16();
        const enemyAttacking = reader.getBoolean();
        const enemyFirstHit = reader.getBoolean();
        
        const enemyActionTicksLeft = reader.getUint32();
        const enemyActionMaxTicks = reader.getUint32();
        const enemyActionActive = reader.getBoolean();
        const enemyRegenTicksLeft = reader.getUint32();
        const enemyRegenMaxTicks = reader.getUint32();
        const enemyRegenActive = reader.getBoolean();
        
        const enemyTurnsTaken = reader.getUint32();
        const enemyBufferedRegen = reader.getUint32();
        const enemyActiveEffects = reader.getMap(
            (reader) => reader.getUint16(),
            (reader) => {
                return {
                    player: reader.getBoolean(),
                    type: reader.getUint8(),
                    damageDealt: reader.getFloat64(),
                    damageTaken: reader.getFloat64(),
                    prameters: reader.getArray((reader) => [reader.getString(), reader.getUint32()]),
                    statGroups: reader.getArray((reader) => [reader.getString(), reader.getUint32()]),
                    timers: reader.getArray((reader) => [
                        reader.getString(),
                        reader.getUint32(),
                        reader.getUint32(),
                        reader.getBoolean()
                ])}
            }
        );
        
        
        
        const enemyFirstMiss = reader.getBoolean();
        const enemyBarrier = reader.getUint32();
        
        const enemyState = reader.getUint8();
        const enemyAttackType = reader.getUint8();
        const enemy = reader.getBoolean() ? reader.getUint16() : undefined;
        const damageType = reader.getBoolean() ? reader.getUint16() : undefined;
        // Enemy Complete
        // Fight Start
        const fightInProgess = reader.getBoolean();
        const fightSpawnTicksLeft = reader.getUint32();
        const fightSpawnMaxTicks = reader.getUint32();
        const fightSpawnActive = reader.getBoolean();
        const combatActive = reader.getBoolean();
        const combatPassives = reader.getMap((reader) => reader.getUint16(), (reader) => reader.getBoolean());
        const combatArea = reader.getBoolean() ? {
            area: reader.getUint8(),
            subArea: reader.getUint16()
        } : undefined
        
        const combatAreaProgress = reader.getUint32();
        const monster = reader.getBoolean() ? reader.getUint16() : undefined;
        const combatPaused = reader.getBoolean();
        const loot = reader.getMap((reader) => reader.getUint16(), (reader) => reader.getUint32());


        // Slayer start
        const slayerActive = reader.getBoolean();
        const slayerTask = reader.getBoolean() ? reader.getUint16() : undefined;
        
        const slayerLeft = reader.getUint32();
        const slayerExtended = reader.getBoolean();
        const slayerCategory = reader.getBoolean() ? reader.getUint16() : undefined;
        
        const slayerCategories = reader.getMap((reader) => reader.getUint16(), (reader) => reader.getUint32());
        
        const slayerTaskTicksLeft = reader.getUint32();
        const slayerTaskMaxTicks = reader.getUint32();
        const slayerTaskActive = reader.getBoolean();
        const slayerRealm = reader.getUint16();
        
        const activeEvent = reader.getBoolean() ? reader.getUint16() : undefined;
        
        const eventPassives = reader.getArray((reader) => reader.getUint16());
        const eventPassivesSelected = reader.getArray((reader) => reader.getUint16());
        const eventDungeonLength = reader.getUint32();
        const activeEventAreas = reader.getMap((reader) => reader.getUint16(), (reader) => reader.getUint32());
        const eventProgress = reader.getUint32();
        const eventDungeonCompletions = reader.getMap((reader) => reader.getUint16(), (reader) => reader.getUint32());
        const eventStrongholdTier = reader.getUint8();
        // Combat Complete
        // Slayer Complete
        // Goblin start
        const raidhp = reader.getUint32();
        const raidnextAction = reader.getUint8();
        const raidattackCount = reader.getUint32();
        const raidnextAttack = reader.getUint16();
        const raidisAttacking = reader.getBoolean();
        const raidfirstHit = reader.getBoolean();
        const raidactionTicksLeft = reader.getUint32();
        const raidactionMaxTicks = reader.getUint32();
        const raidactionActive = reader.getBoolean();
        const raidregenTicksLeft = reader.getUint32();
        const raidregenMaxTicks = reader.getUint32();
        const raidregenActive = reader.getBoolean();
        const raidturnsTaken = reader.getUint32();
        const raidbufferedRegen = reader.getUint32();
        const raidactiveEffects = reader.getMap(
            (reader) => reader.getUint16(),
            (reader) => {
                return {
                    player: reader.getBoolean(),
                    type: reader.getUint8(),
                    damageDealt: reader.getFloat64(),
                    damageTaken: reader.getFloat64(),
                    prameters: reader.getArray((reader) => [reader.getString(), reader.getUint32()]),
                    statGroups: reader.getArray((reader) => [reader.getString(), reader.getUint32()]),
                    timers: reader.getArray((reader) => [
                        reader.getString(),
                        reader.getUint32(),
                        reader.getUint32(),
                        reader.getBoolean()
                ])}
            }
        );
        
        const raidfirstMiss = reader.getBoolean();
        const raidbarrier = reader.getUint32();
        const raidMeleeStyle = reader.getBoolean() ? reader.getUint16() : undefined;
        const raidRangedStyle = reader.getBoolean() ? reader.getUint16() : undefined;
        const raidMagicStyle = reader.getBoolean() ? reader.getUint16() : undefined;
        const raidprayerPoints = reader.getUint32();
        const raidselectedEquipmentSet = reader.getUint16();
        const raidequipmentSets = reader.getArray((reader) => {
            return {
                equipment: reader.getArray((reader) => {
                    const id = reader.getUint16();
                    var stackable: number | undefined = undefined;
                    var qty: number | undefined = undefined;
                    if (reader.getBoolean()) {
                        stackable = reader.getUint16();
                        qty = reader.getUint32();
                    }
                    const quickEquip = reader.getArray((reader) => reader.getUint16());
                    return {
                        id: id,
                        stackable: stackable,
                        qty: qty,
                        quickEquip: quickEquip
                    };
                }),
                spells: {
                    spell: reader.getBoolean() ? reader.getUint16() : undefined,
                    aura: reader.getBoolean() ? reader.getUint16() : undefined,
                    curse: reader.getBoolean() ? reader.getUint16() : undefined
                },
                prayers: reader.getArray((reader) => reader.getUint16())
            }
        });
        const raidselectedFoodSlot = reader.getUint32();
        const raidmaxFoodSlot = reader.getUint32();
        const raidfoodSlots = reader.getArray((reader) => [reader.getUint16(), reader.getUint32()]);
        
        const raidsummonTicksLeft = reader.getUint32();
        const raidsummonMaxTicks = reader.getUint32();
        const raidsummonActive = reader.getBoolean();
        const raidsoulPoints = reader.getUint32();
        const raidunholyPrayerMultiplier = reader.getUint8();
        
        const raidAltAttacks = reader.getMap(
            (reader) => reader.getUint16(),
            (reader) => reader.getArray((reader) => reader.getUint16())
        );
        
        // Character Complete
        
        
        // Enemy start
        const raidenemyHitpoints = reader.getUint32();
        const raidenemyAction = reader.getUint8();
        const raidenemyAttackCount = reader.getUint32();
        const raidenemyNextAttack = reader.getUint16();
        const raidenemyAttacking = reader.getBoolean();
        const raidenemyFirstHit = reader.getBoolean();
        
        const raidenemyActionTicksLeft = reader.getUint32();
        const raidenemyActionMaxTicks = reader.getUint32();
        const raidenemyActionActive = reader.getBoolean();
        const raidenemyRegenTicksLeft = reader.getUint32();
        const raidenemyRegenMaxTicks = reader.getUint32();
        const raidenemyRegenActive = reader.getBoolean();
        
        const raidenemyTurnsTaken = reader.getUint32();
        const raidenemyBufferedRegen = reader.getUint32();
        const raidenemyActiveEffects = reader.getMap(
            (reader) => reader.getUint16(),
            (reader) => {
                return {
                    player: reader.getBoolean(),
                    type: reader.getUint8(),
                    damageDealt: reader.getFloat64(),
                    damageTaken: reader.getFloat64(),
                    prameters: reader.getArray((reader) => [reader.getString(), reader.getUint32()]),
                    statGroups: reader.getArray((reader) => [reader.getString(), reader.getUint32()]),
                    timers: reader.getArray((reader) => [
                        reader.getString(),
                        reader.getUint32(),
                        reader.getUint32(),
                        reader.getBoolean()
                ])}
            }
        );
        
        const raidenemyFirstMiss = reader.getBoolean();
        const raidenemyBarrier = reader.getUint32();
        
        const raidenemyState = reader.getUint8();
        const raidenemyAttackType = reader.getUint8();
        
        
        
        const raidenemy = reader.getBoolean() ? reader.getUint16() : undefined;
        
        const goblin = reader.getBoolean() ? {
            name: reader.getString(),
            hitpoints: reader.getUint32(),
            attack: reader.getUint32(),
            strength: reader.getUint32(),
            defence: reader.getUint32(),
            ranged: reader.getUint32(),
            magic: reader.getUint32(),
            attackType: reader.getUint8(),
            image: reader.getInt8(),
            passives: reader.getArray((reader) => reader.getUint16()),
            corruption: reader.getUint32()
        } : undefined;
        // Enemy Complete
        
        // Fight Start
        const raidfightInProgess = reader.getBoolean();
        const raidfightSpawnTicksLeft = reader.getUint32();
        const raidfightSpawnMaxTicks = reader.getUint32();
        const raidfightSpawnActive = reader.getBoolean();
        const raidcombatActive = reader.getBoolean();
        const raidcombatPassives = reader.getMap((reader) => reader.getUint16(), (reader) => reader.getBoolean());
        const raidPlayerModifiers = reader.getMap((reader) => reader.getUint16(), (reader) => {
            var modifiers = [reader.getFloat64(), reader.getUint32()];
            for (var i = 1; i <= 256; i *= 2)
                if (modifiers[1] & i) {
                    modifiers.push(reader.getUint16());
                }
            return modifiers;
        });
        
        const raidEnemyModifiers = reader.getMap((reader) => reader.getUint16(), (reader) => {
            var modifiers = [reader.getFloat64(), reader.getUint32()];
            for (var i = 1; i <= 256; i *= 2)
                if (modifiers[1] & i) {
                    modifiers.push(reader.getUint16());
                }
            return modifiers;
        });
        
        const raidState = reader.getUint8();
        const raidDifficulty = reader.getUint8();
        
        
        const raidlockedItems = reader.getArray((reader) => reader.getUint16());
        
        const raidbankTabs = reader.getArray(
            (reader) => reader.getMap(
                (reader) => reader.getUint16(),
                (reader) => reader.getUint32()
            )
        );
        const raiddefaultItemTabs = reader.getMap((reader) => reader.getUint16(), (reader) => reader.getUint8())
        const raidcustomSortOrder = reader.getArray((reader) => reader.getUint16());
        const raidglowingItems = reader.getArray((reader) => reader.getUint16());
        const raidtabIcons = reader.getMap((reader) => reader.getUint8(), (reader) => reader.getUint16());
        
        const raidWave = reader.getUint32();
        const raidWaveProgress = reader.getUint32();
        const raidKillCount = reader.getUint32();
        const raidStart = reader.getFloat64();
        const raidOwnedCrateItems = reader.getArray((reader) => reader.getUint16());
        
        const raidRandomModifiers = reader.getMap((reader) => reader.getUint16(), (reader) => {
            var modifiers = [reader.getFloat64(), reader.getUint32()];
            for (var i = 1; i <= 256; i *= 2)
                if (modifiers[1] & i) {
                    modifiers.push(reader.getUint16());
                }
            return modifiers;
        });
        
        
        const raidSelectedPositiveModifier = reader.getBoolean();
        const raidItemWeapons = reader.getMap(
            (reader) => reader.getUint16(),
            (reader) => { return { qty: reader.getUint32(), alt: reader.getBoolean()} }
        );
        const raidItemArmour = reader.getMap(
            (reader) => reader.getUint16(), 
            (reader) => { return { qty: reader.getUint32(), alt: reader.getBoolean()} }
        );
        const raidItemAmmo = reader.getMap(
            (reader) => reader.getUint16(),
            (reader) => { return { qty: reader.getUint32(), alt: reader.getBoolean()} }
        );
        const raidItemRunes = reader.getMap(
            (reader) => reader.getUint16(),
            (reader) => { return { qty: reader.getUint32(), alt: reader.getBoolean()} }
        );
        const raidItemFoods = reader.getMap(
            (reader) => reader.getUint16(),
            (reader) => { return { qty: reader.getUint32(), alt: reader.getBoolean()} }
        );
        const raidItemPassives = reader.getMap(
            (reader) => reader.getUint16(),
            (reader) => { return { qty: reader.getUint32(), alt: reader.getBoolean()} }
        );
        const raidItemCategory = reader.getUint8();
        
        
        const raidPosMods = reader.getUint8();
        const raidNegMods = reader.getUint8();
        const raidPaused = reader.getBoolean();
        const raidHistories = reader.getArray((reader) => {
            return {
                skills: reader.getArray((reader) => reader.getUint32()),
                equipment: reader.getArray((reader) => reader.getUint16()),
                ammo: reader.getUint32(),
                inventories: reader.getMap((reader) => reader.getUint16(), (reader) => reader.getUint32()),
                food: reader.getUint16(),
                foodQty: reader.getUint32(),
                wave: reader.getUint32(),
                kills: reader.getUint32(),
                time: reader.getFloat64(),
                coins: reader.getUint32(),
                difficulty: reader.getUint8()
            };
        })
        
        // Goblin Complete
        
        
        
        
        // Minibar Start
        const MinibarItems = reader.getMap((reader) => reader.getUint16(), (reader) => reader.getArray((reader) => reader.getUint16()));
        // Minibar Complete
        
        // Pets Start
        const petList = reader.getArray((reader) => reader.getUint16());
        // Pets Complete
        
        // Shop Start
        const shopItems = reader.getMap((reader) => reader.getUint16(), (reader) => reader.getUint32());
        const purchaseQty = reader.getFloat64();
        // Shop Complete
        
        // Item Charges Start
        const itemCharges = reader.getMap((reader) => reader.getUint16(), (reader) => reader.getUint32());
        // Item Charges Complete
        
        const tutorialComplete = reader.getBoolean();
        if (!tutorialComplete){
            throw new Error("Tutorial not complete");
        }
        
        
        
        // Start Potions
        const potionList = reader.getMap((reader) => reader.getUint16(), (reader) => { return {item: reader.getUint16(), charges: reader.getUint32()}});
        const potionReuse = reader.getArray((reader) => reader.getUint16());
        // End Potions
        
        // Start Stats
        const woodcuttingStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const fishingStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const firemakingStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const cookingStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const miningStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const smithingStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const attackStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const strengthStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const defenceStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const hitpointsStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const theivingStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const farmingStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const rangedStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const fletchingStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const craftingStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const runecraftingStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const magicStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const prayerStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const slayerStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const herbloreStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const agilityStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const summoningStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const itemsStats = reader.getMap(
            (reader) => reader.getUint16(),
            (reader) => reader.getMap(
                (reader) => reader.getUint32(),
                (reader) => reader.getFloat64()
            )
        );
        
        const monstersStats = reader.getMap(
            (reader) => reader.getUint16(),
            (reader) => reader.getMap(
                (reader) => reader.getUint32(),
                (reader) => reader.getFloat64()
            )
        );
        
        
        const generalStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const combatStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const goblinStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const astrologyStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const shopStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const townshipStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const cartographyStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const archaeologyStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const corruptionStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        const harvestingStats = reader.getMap((reader) => reader.getUint32(), (reader) => reader.getFloat64());
        // End Stats
        
        
        // Start Settings
        const settingcontinueIfBankFull = reader.getBoolean();
        const settingcontinueThievingOnStun = reader.getBoolean();
        const settingautoRestartDungeon = reader.getBoolean();
        const settingautoCloudSave = reader.getBoolean();
        const settingdarkMode = reader.getBoolean();
        const settingshowGPNotifications = reader.getBoolean();
        const settingenableAccessibility = reader.getBoolean();
        const settingshowEnemySkillLevels = reader.getBoolean();
        const settingshowCloseConfirmations = reader.getBoolean();
        const settinghideThousandsSeperator = reader.getBoolean();
        const settingshowVirtualLevels = reader.getBoolean();
        const settingshowSaleConfirmations = reader.getBoolean();
        const settingshowShopConfirmations = reader.getBoolean();
        const settingpauseOnUnfocus = reader.getBoolean();
        const settingshowCombatMinibar = reader.getBoolean();
        const settingshowCombatMinibarCombat = reader.getBoolean();
        const settingshowSkillingMinibar = reader.getBoolean();
        const settinguseCombinationRunes = reader.getBoolean();
        const settingenableAutoSlayer = reader.getBoolean();
        const settingshowItemNotifications = reader.getBoolean();
        const settinguseSmallLevelUpNotifications = reader.getBoolean();
        const settinguseDefaultBankBorders = reader.getBoolean();
        const settingdefaultToCurrentEquipSet = reader.getBoolean();
        const settinghideMaxLevelMasteries = reader.getBoolean();
        const settingshowMasteryCheckpointconfirmations = reader.getBoolean();
        const settingenableOfflinePushNotifications = reader.getBoolean();
        const settingenableFarmingPushNotifications = reader.getBoolean();
        const settingenableOfflineCombat = reader.getBoolean();
        const settingenableMiniSidebar = reader.getBoolean();
        const settingenableAutoEquipFood = reader.getBoolean();
        const settingenableAutoSwapFood = reader.getBoolean();
        const settingenablePerfectCooking = reader.getBoolean();
        const settingshowCropDestructionConfirmations = reader.getBoolean();
        const settingshowAstrologyMaxRollConfirmations = reader.getBoolean();
        const settingshowQuantityInItemNotifications = reader.getBoolean();
        const settingshowItemPreservationNotifications = reader.getBoolean();
        const settingshowSlayerCoinNotifications = reader.getBoolean();
        const settingshowEquipmentSetsInCombatMinibar = reader.getBoolean();
        const settingshowBarsInCombatMinibar = reader.getBoolean();
        const settingshowCombatStunNotifications = reader.getBoolean();
        const settingshowCombatSleepNotifications = reader.getBoolean();
        const settingshowSummoningMarkDiscoveryModals = reader.getBoolean();
        const settingenableCombatDamageSplashes = reader.getBoolean();
        const settingenableProgressBars = reader.getBoolean();
        const settingshowTierIPotions = reader.getBoolean();
        const settingshowTierIIPotions = reader.getBoolean();
        const settingshowTierIIIPotions = reader.getBoolean();
        const settingshowTierIVPotions = reader.getBoolean();
        const settingshowNeutralAttackModifiers = reader.getBoolean();
        const settingdefaultPageOnLoad = reader.getUint16();
        const settingformatNumberSetting = reader.getUint8();
        const settingbankSortOrder = reader.getUint8();
        const settingcolourBlindMode = reader.getUint8();
        const settingenableEyebleachMode = reader.getBoolean();
        const settingenableQuickConvert = reader.getBoolean();
        const settingshowLockedTownshipBuildings = reader.getBoolean();
        const settinguseNewNotifications = reader.getBoolean();
        const settingnotificationHorizontalPosition = reader.getUint8();
        const settingnotificationDisappearDelay = reader.getUint8();
        const settingshowItemNamesInNotifications = reader.getBoolean();
        const settingimportanceSummoningMarkFound = reader.getBoolean();
        const settingimportanceErrorMessages = reader.getBoolean();
        const settingenableScrollableBankTabs = reader.getBoolean();
        const settingshowWikiLinks = reader.getBoolean();
        const settingdisableHexGridOutsideSight = reader.getBoolean();
        const settingmapTextureQuality = reader.getUint8();
        const settingenableMapAntialiasing = reader.getBoolean();
        const settingshowSkillXPNotifications = reader.getBoolean();
        const settingbackgroundImage = reader.getInt8();
        const settingsuperDarkMode = reader.getBoolean();
        const settingshowExpansionBackgroundColours = reader.getBoolean();
        const settingshowCombatAreaWarnings = reader.getBoolean();
        const settinguseCompactNotifications = reader.getBoolean();
        const settinguseLegacyNotifications = reader.getBoolean();
        const settinguseCat = reader.getBoolean();
        const settingthrottleFrameRateOnInactivity = reader.getBoolean();
        const settingcartographyFrameRateCap = reader.getUint16();
        const settingtoggleBirthdayEvent = reader.getBoolean();
        const settingtoggleDiscordRPC = reader.getBoolean();
        const settinggenericArtefactAllButOne = reader.getBoolean();
        
        const settinghiddenMasteryNamespaces = reader.getArray((reader) => reader.getString());
        const settingenableDoubleClickEquip = reader.getBoolean();
        const settingenableDoubleClickOpen = reader.getBoolean();
        const settingenableDoubleClickBury = reader.getBoolean();
        const settingshowAbyssalPiecesNotifications = reader.getBoolean();
        const settingshowAbyssalSlayerCoinNotifications = reader.getBoolean();
        const settingenablePermaCorruption = reader.getBoolean();
        const settingshowAPNextToShopSidebar = reader.getBoolean();
        const settingshowASCNextToSlayerSidebar = reader.getBoolean();
        const settingsidebarLevels = reader.getUint8();
        const settingshowAbyssalXPNotifications = reader.getBoolean();
        const settingshowSPNextToPrayerSidebar = reader.getBoolean();
        const settingenableStickyBankTabs = reader.getBoolean();
        const settinguseLegacyRealmSelection = reader.getBoolean();
        const settingshowOpacityForSkillNavs = reader.getBoolean();
        const settingbankFilterShowAll = reader.getBoolean();
        const settingbankFilterShowDemo = reader.getBoolean();
        const settingbankFilterShowFull = reader.getBoolean();
        const settingbankFilterShowTotH = reader.getBoolean();
        const settingbankFilterShowAoD = reader.getBoolean();
        const settingbankFilterShowItA = reader.getBoolean();
        const settingbankFilterShowDamageReduction = reader.getBoolean();
        const settingbankFilterShowAbyssalResistance = reader.getBoolean();
        const settingbankFilterShowNormalDamage = reader.getBoolean();
        const settingbankFilterShowAbyssalDamage = reader.getBoolean();
        const settingbankFilterShowSkillXP = reader.getBoolean();
        const settingbankFilterShowAbyssalXP = reader.getBoolean();
        const settingalwaysShowRealmSelectAgility = reader.getBoolean();
        const settingenableSwipeSidebar = reader.getBoolean();
        
        // Settings Complete
        
        
        const news = reader.getArray((reader) => reader.getString());
        
        const lastLoadedGameVersion = reader.getString();
        
        const scheduledPushNotifications = reader.getArray((reader) => {
            return {
                id: reader.getString(),
                startDate: reader.getFloat64(),
                endDate: reader.getFloat64(),
                notificationType: reader.getUint8(),
                platform: reader.getString(),
            }
        });
        
        
        // Start Skills
        const skills = reader.getMap((reader) => reader.getUint16(), (reader, k) => {
            const skillSize = reader.getUint32();
            const endOffset = skillSize + reader.offset;
            var skill = {
                xp: reader.getFloat64(),
                skillUnlocked: reader.getBoolean(),
                relics: reader.getMap(
                    (reader) => reader.getUint16(),
                    (reader) => reader.getMap(
                        (reader) => reader.getUint16(),
                        (reader) => reader.getUint8()
                    )
                ),
                levelCap: reader.getInt16(),
                abyssalLevelCap: reader.getInt16(),
                skillTrees: reader.getMap(
                    (reader) => reader.getUint16(),
                    (reader) => [reader.getMap((reader) => reader.getUint16(), (reader) => reader.getBoolean()), reader.getUint8()]
                ),
                abyssalXP: reader.getFloat64(),
                realm: reader.getUint16(),
                skillSpecific: {}
            }
            var remaining = endOffset - reader.offset;
            if (remaining > 0) {
                const skillName = findItemFromNamespace(k);
                if (!["Township", "Corruption", "Cartography"].includes(skillName)) {
                    // @ts-ignore
                    skill.mastery = {
                        actionMastery: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => reader.getFloat64()    
                        ),
                        masteryPool: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => reader.getFloat64()    
                        ),
                    }
                    if (skillName != "Farming") {
                        // @ts-ignore
                        skill.active = reader.getBoolean(),
                        // @ts-ignore
                        skill.timer = {
                            ticksLeft: reader.getUint32(),
                            maxTicks: reader.getUint32(),
                            active: reader.getBoolean()
                        }
                    }
                }
                if (["Herblore", "Crafting", "Runecrafting", "Smithing"].includes(skillName)) {
                    skill.skillSpecific = {
                        recipe: reader.getBoolean() ? reader.getUint16() : undefined
                    }
                } else if (skillName == "Archaeology") {
                    skill.skillSpecific = {
                        digsite: reader.getBoolean() ? reader.getUint16() : undefined,
                        digsites: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => {
                                return {
                                    maps: reader.getArray(
                                        (reader) => {
                                            return {
                                                upgradeActions: reader.getUint32(),
                                                charges: reader.getUint32(),
                                                artefactValuesTiny: reader.getUint16(),
                                                artefactValuesSmall: reader.getUint16(),
                                                artefactValuesMedium: reader.getUint16(),
                                                artefactValuesLarge: reader.getUint16(),
                                                refinements: reader.getMap((reader) => reader.getUint16(), (reader) => {
                                                    var modifiers = [reader.getFloat64(), reader.getUint32()];
                                                    for (var i = 1; i <= 256; i *= 2)
                                                        if (modifiers[1] & i) {
                                                            modifiers.push(reader.getUint16());
                                                        }
                                                    return modifiers;
                                                })
                                            }
                                        }
                                    ),
                                    selectedMap: reader.getInt8(),
                                    selectedTools: reader.getArray((reader) => reader.getUint16()),
                                    selectedUpgrade: reader.getUint8()
                                }
                            }
                        ),
                        museum: {
                            items: reader.getMap((reader) => reader.getUint16(), (reader) => reader.getBoolean()),
                            donated: reader.getArray((reader) => reader.getUint16())
                        },
                        hiddenDigsites: reader.getArray((reader) => reader.getUint16())
                    }
                } else if (skillName == "Agility") {
                    skill.skillSpecific = {
                        activeObstacle: reader.getInt16(),
                        obstacleBuildCount: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => reader.getUint32()
                        ),
                        course: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => {
                                return {
                                    builtObstacles: reader.getMap(
                                        (reader) => reader.getUint8(),
                                        (reader) => reader.getUint16()
                                    ),
                                    builtPillars: reader.getMap(
                                        (reader) => reader.getUint8(),
                                        (reader) => reader.getUint16()
                                    ),
                                    blueprints: reader.getMap(
                                        (reader) => reader.getUint8(),
                                        (reader) => {
                                            return {
                                                name: reader.getString(),
                                                obstacles: reader.getMap(
                                                    (reader) => reader.getUint8(),
                                                    (reader) => reader.getUint16()
                                                ),
                                                pillars: reader.getMap(
                                                    (reader) => reader.getUint8(),
                                                    (reader) => reader.getUint16()
                                                )
                                            }
                                        }
                                    )
                                }
                            }
                        )
                    }
                } else if (skillName == "Magic") {
                    skill.skillSpecific = {
                        spell: reader.getBoolean() ? reader.getUint16() : undefined,
                        conversionItem: reader.getBoolean() ? reader.getUint16() : undefined,
                        selectedRecipe: reader.getBoolean() ? reader.getUint16() : undefined
                    }
                } else if (skillName == "Astrology") {
                    skill.skillSpecific = {
                        studied: reader.getBoolean() ? reader.getUint16() : undefined,
                        explored: reader.getBoolean() ? reader.getUint16() : undefined,
                        actions: reader.getArray((reader) => {
                            return {
                                recipie: reader.getUint16(),
                                standardModsBought: reader.getArray((reader) => reader.getUint8()),
                                uniqueModsBought: reader.getArray((reader) => reader.getUint8()),
                                abyssalModsBought: reader.getArray((reader) => reader.getUint8())
                            }
                        }),
                        dummyRecipies: reader.getArray((reader) => {
                            return {
                                recipie: reader.getUint16(),
                                standardModsBought: reader.getArray((reader) => reader.getUint8()),
                                uniqueModsBought: reader.getArray((reader) => reader.getUint8()),
                                abyssalModsBought: reader.getArray((reader) => reader.getUint8())
                            }
                        })
                    }
                } else if (skillName == "Cartography") {
                    skill.skillSpecific = {
                        worldMaps: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => {
                                return {
                                    worldMap: reader.getMap(
                                        (reader) => reader.getInt16(),
                                        (reader) => reader.getMap(
                                            (reader) => reader.getInt16(),
                                            (reader) => reader.getFloat64()
                                        )
                                
                                    ),
                                    position: [reader.getInt16(), reader.getInt16()],
                                    filterSettings: {
                                        markerSettings: reader.getArray((reader) => reader.getBoolean()),
                                        hiddenFastTravelGroups: reader.getArray((reader) => reader.getUint16())
                                    },
                                    pois: reader.getMap(
                                        (reader) => reader.getUint16(),
                                        (reader) => {
                                            return {
                                                discovered: reader.getBoolean(),
                                                fastTravelUnlocked: reader.getUint8(),
                                                discoveryMovesLeft: reader.getUint8(),
                                                surveyOrder: reader.getUint16()
                                            }
                                        }
                                    ),
                                    bonus: reader.getMap(
                                        (reader) => reader.getUint16(),
                                        (reader) => reader.getBoolean()
                                    )
                                }
                            }
                        ),
                    }
                    // @ts-ignore
                    skill.active = reader.getBoolean(),
                    // @ts-ignore
                    skill.skillSpecific.actionMode = reader.getUint8(),
                    // @ts-ignore
                    skill.timer = {
                        ticksLeft: reader.getUint32(),
                        maxTicks: reader.getUint32(),
                        active: reader.getBoolean()
                    },
                    // @ts-ignore
                    skill.skillSpecific.map = reader.getBoolean() ? {
                        activeMap: reader.getUint16(),
                        surveyQueue: reader.getArray((reader) => [reader.getInt16(), reader.getInt16()]),
                        autoSurvey: reader.getBoolean() ? [reader.getInt16(), reader.getInt16()] : undefined
                    } : undefined,
                    // @ts-ignore
                    skill.skillSpecific.event = reader.getBoolean() ? reader.getUint16() : undefined,
                    // @ts-ignore
                    skill.skillSpecific.paperRecipe = reader.getBoolean() ? reader.getUint16() : undefined,
                    // @ts-ignore
                    skill.skillSpecific.digSite = reader.getBoolean() ? reader.getUint16() : undefined
                } else if (skillName == "Cooking") {
                    skill.skillSpecific = {
                        selectedRecipies: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => reader.getUint16()
                        ),
                        passiveCookTimers: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => {
                                return {
                                    ticksLeft: reader.getUint32(),
                                    maxTicks: reader.getUint32(),
                                    active: reader.getBoolean()
                                }
                            }
                        ),
                        stockpileItems: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => {
                                return {
                                    item: reader.getUint16(),
                                    qty: reader.getInt32()
                                }
                            }
                        ),
                        // @ts-ignore
                        activeCategory: skill.active ? reader.getUint16() : undefined
                    }
                } else if (skillName == "Farming") {
                    skill.skillSpecific = {
                        plots: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => {
                                return {
                                    state: reader.getUint8(),
                                    planted: reader.getBoolean() ? reader.getUint16() : undefined,
                                    compost: reader.getBoolean() ? reader.getUint16() : undefined,
                                    compostLevel: reader.getUint8(),
                                    selected: reader.getBoolean() ? reader.getUint16() : undefined,
                                    growthTime: reader.getFloat64()
                                }
                            }
                        ),
                        dummyPlots: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => {
                                return {
                                    state: reader.getUint8(),
                                    planted: reader.getBoolean() ? reader.getUint16() : undefined,
                                    compost: reader.getBoolean() ? reader.getUint16() : undefined,
                                    compostLevel: reader.getUint8(),
                                    selected: reader.getBoolean() ? reader.getUint16() : undefined,
                                    growthTime: reader.getFloat64()
                                }
                            }
                        ),
                        growthTimers: reader.getArray(
                            (reader) => {
                                return {
                                    ticksLeft: reader.getUint32(),
                                    maxTicks: reader.getUint32(),
                                    active: reader.getBoolean()
                                }
                            }
                        )
                    }
                } else if (skillName == "Firemaking") {
                    skill.skillSpecific = {
                        bonfireTimer: {
                            ticksLeft: reader.getUint32(),
                            maxTicks: reader.getUint32(),
                            active: reader.getBoolean()
                        },
                        recipe: reader.getBoolean() ? reader.getUint16() : undefined,
                        bonfireRecipe: reader.getBoolean() ? reader.getUint16() : undefined,
                        oilTimer: {
                            ticksLeft: reader.getUint32(),
                            maxTicks: reader.getUint32(),
                            active: reader.getBoolean()
                        },
                        oiledLogRecipe: reader.getBoolean() ? reader.getUint16() : undefined,
                        oilRecipe: reader.getBoolean() ? reader.getUint16() : undefined,
                    }
                } else if (skillName == "Fishing") {
                    skill.skillSpecific = {
                        secretAreaUnlocked: reader.getBoolean(),
                        // @ts-ignore
                        area: skill.active ? reader.getUint16() : undefined,
                        selectedAreaFish: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => reader.getUint16()
                        ),
                        hiddenAreas: reader.getArray((reader) => reader.getUint16()),
                        contest: reader.getBoolean() ? {
                            completion: reader.getArray((reader) => reader.getBoolean()),
                            mastery: reader.getArray((reader) => reader.getBoolean())
                        } : undefined
                    }
                } else if (skillName == "Fletching") {
                    skill.skillSpecific = {
                        recipe: reader.getBoolean() ? reader.getUint16() : undefined,
                        altRecipies: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => reader.getUint16()
                        )
                    }
                } else if (skillName == "Summoning") {
                    skill.skillSpecific = {
                        recipe: reader.getBoolean() ? reader.getUint16() : undefined,
                        selectedNonShardCosts: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => reader.getUint16()
                        ),
                        marksUnlocked: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => reader.getUint8()
                        )
                    }
                } else if (skillName == "Thieving") {
                    skill.skillSpecific = {
                        stunTimer: {
                            ticksLeft: reader.getUint32(),
                            maxTicks: reader.getUint32(),
                            active: reader.getBoolean()
                        },
                        // @ts-ignore
                        area: skill.active ? reader.getUint16() : undefined,
                        // @ts-ignore
                        npc: skill.active ? reader.getUint16() : undefined,
                        hiddenAreas: reader.getArray((reader) => reader.getUint16()),
                        stunState: reader.getUint8()
                    }
                } else if (skillName == "Township") {
                    skill.skillSpecific = {
                        townData: {
                            worship: reader.getUint16(),
                            created: reader.getBoolean(),
                            seasonTicksRemaining: reader.getInt16(),
                            season: reader.getBoolean() ? reader.getUint16() : undefined,
                            previousSeason: reader.getBoolean() ? reader.getUint16() : undefined,
                            health: reader.getInt8(),
                            souls: reader.getInt32(),
                            abyssalWaveTicksRemaining: reader.getInt16()
                        },
                        resources: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => {
                                return {
                                    qty: reader.getFloat64(),
                                    cap: reader.getUint8()
                                }
                            }
                        ),
                        dummyResources: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => {
                                return {
                                    qty: reader.getFloat64(),
                                    cap: reader.getUint8()
                                }
                            }
                        ),
                        biomes: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => {
                                return {
                                    buildingsBuilt: reader.getMap(
                                        (reader) => reader.getUint16(),
                                        (reader) => reader.getUint32()
                                    ),
                                    buildingEfficiency: reader.getMap(
                                        (reader) => reader.getUint16(),
                                        (reader) => reader.getUint32()
                                    )
                                }
                            }
                        ),
                        dummyBiomes: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => {
                                return {
                                    buildingsBuilt: reader.getMap(
                                        (reader) => reader.getUint16(),
                                        (reader) => reader.getUint32()
                                    ),
                                    buildingEfficiency: reader.getMap(
                                        (reader) => reader.getUint16(),
                                        (reader) => reader.getUint32()
                                    )
                                }
                            }
                        ),
                        legacyTicks: reader.getUint32(),
                        totalTicks: reader.getUint32(),
                        tasksCompleted: reader.getArray((reader) => reader.getUint16()),
                        townshipConverted: reader.getBoolean(),
                        casualTasks: {
                            completed: reader.getUint32(),
                            currentCasualTasks: reader.getMap(
                                (reader) => reader.getUint16(),
                                (reader) => reader.getArray((reader) => reader.getFloat64())
                            ),
                            newTaskTimer: {
                                ticksLeft: reader.getUint32(),
                                maxTicks: reader.getUint32(),
                                active: reader.getBoolean()
                            }
                        },
                        tickTimer: {
                            ticksLeft: reader.getUint32(),
                            maxTicks: reader.getUint32(),
                            active: reader.getBoolean()
                        },
                        displayReworkNotification: reader.getBoolean(),
                        gpRefunded: reader.getFloat64(),
                        abyssalWaveTimer: {
                            ticksLeft: reader.getUint32(),
                            maxTicks: reader.getUint32(),
                            active: reader.getBoolean()
                        }
                    }
                } else if (skillName == "Woodcutting") {
                    skill.skillSpecific = {
                        activeTrees: reader.getArray((reader) => reader.getUint16())
                    }
                } else if (skillName == "Mining") {
                    skill.skillSpecific = {
                        // @ts-ignore
                        selectedRock: skill.active ? reader.getUint16() : undefined,
                        rocks: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => {
                                return {
                                    isRespawning: reader.getBoolean(),
                                    currentHP: reader.getUint32(),
                                    maxHP: reader.getUint32()
                                }
                            }
                        ),
                        rockRespawnTimers: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => {
                                return {
                                    ticksLeft: reader.getUint32(),
                                    maxTicks: reader.getUint32(),
                                    active: reader.getBoolean()
                                }
                            }
                        ),
                        passiveRegenTimer: {
                            ticksLeft: reader.getUint32(),
                            maxTicks: reader.getUint32(),
                            active: reader.getBoolean()
                        }
                    }
                } else if (skillName == "Corruption") {
                    skill.skillSpecific = {
                        corruptionEffects: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => reader.getBoolean()
                        ),
                        corruptionUnlockedRows: reader.getArray((reader) => reader.getUint16())
                    }
                } else if (skillName == "Harvesting") {
                    skill.skillSpecific = {
                        // @ts-ignore
                        selectedVein: skill.active ? reader.getUint16() : undefined,
                        veins: reader.getMap(
                            (reader) => reader.getUint16(),
                            (reader) => {
                                return {
                                    currentIntensity: reader.getUint32(),
                                    maxIntensity: reader.getUint32()
                                }
                            }
                        ),
                        veinDecayTimer: {
                            ticksLeft: reader.getUint32(),
                            maxTicks: reader.getUint32(),
                            active: reader.getBoolean()
                        }
                    }
                } 
            }
            remaining = endOffset - reader.offset;
            if (remaining > 0) {
                // @ts-ignore
                skill.excessData = reader.getFixedLengthBuffer(remaining);
            }
            return skill;
        });
        // Skills Complete
        
        
        // Mods Start
        
        const mods = reader.getMap(
            (reader) => reader.getUint32(),
            (reader) => {
                return {
                    settings: reader.getString(),
                    storage: reader.getString()
                }
            }
        );
        
        // Mods Complete
        
        
        const completion = reader.getString();
        
        const keyBindings = reader.getMap(
            (reader) => reader.getUint16(),
            (reader) => reader.getArray(
                (reader) => {
                    if (reader.getBoolean()) {
                        return {
                            key: reader.getString(),
                            alt: reader.getBoolean(),
                            ctrl: reader.getBoolean(),
                            meta: reader.getBoolean(),
                            shift: reader.getBoolean()
                        }
                    } else {
                        return undefined;
                    }
                }
            )
        );
        
        const birthdayCompletions = reader.getArray((reader) => reader.getBoolean());
        const clueHuntStep = reader.getInt8();
        
        const currencies = reader.getMap(
            (reader) => reader.getUint16(),
            (reader) => {
                return {
                    qty: reader.getFloat64(),
                    stats: reader.getMap(
                        (reader) => reader.getUint32(),
                        (reader) => reader.getFloat64()
                    ),
                    currencySkills: reader.getMap(
                        (reader) => reader.getUint16(),
                        (reader) => reader.getMap(
                            (reader) => reader.getUint32(),
                            (reader) => reader.getFloat64()
                        )
                    )
                }
            }
        )
        
        
        
        
        const areaCompletions = reader.getMap((reader) => reader.getUint16(), (reader) => reader.getUint32());
        const strongholdCompletions = reader.getMap((reader) => reader.getUint16(), (reader) => reader.getUint32());
        
        const levelCapIncreases = reader.getMap(
            (reader) => reader.getUint16(),
            (reader) => {
                return {
                    given: reader.getArray((reader) => reader.getUint16()),
                    increases: reader.getArray((reader) => reader.getUint16())
                }
            }
        );
        
        const levelCapIncreasesSelected = reader.getArray((reader) => reader.getUint16());
        
        const levelCapIncreasesBought = reader.getUint16();
        const abyssalLevelCapIncreasesBought = reader.getUint16();
        const realm = reader.getUint16();
        
        return {
            saveData: {
                header: {
                    saveVersion: headerSaveVersion,
                    saveName: headerSaveName,
                    gameMode: headerGameMode,
                    skillLevel: headerSkillLevel,
                    gp: headerGp,
                    activeTraining: headerActiveTraining,
                    activeTrainingName: headerActiveTrainingName,
                    tickTime: headerTickTime,
                    saveTime: headerSaveTime,
                    activeNamespaces: headerActiveNamespaces,
                    mods: headerMods,
                    namespaces: headerNamespaces
                },
                tickTime: tickTime,
                saveTime: saveTime,
                activeAction: activeAction,
                pausedAction: pausedAction,
                paused: paused,
                merchantsPermitRead: merchantsPermitRead,
                gameMode: gameMode,
                characterName: characterName,
                bank: {
                    lockedItems: lockedItems,
                    tabs: bankTabs,
                    defaultTabs: defaultItemTabs,
                    sortOrder: customSortOrder,
                    glowing: glowingItems,
                    icons: tabIcons
                },
                combat: {
                    player: {
                        character: {
                            hp: hp,
                            nextAction: nextAction,
                            attackCount: attackCount,
                            nextAttack: nextAttack,
                            isAttacking: isAttacking,
                            firstHit: firstHit,
                            actionTimer: {
                                ticksLeft: actionTicksLeft,
                                maxTicks: actionMaxTicks,
                                active: actionActive
                            },
                            regenTimer :{
                                ticksLeft: regenTicksLeft,
                                maxTicks: regenMaxTicks,
                                active: regenActive
                            },
                            turnsTaken: turnsTaken,
                            bufferedRegen: bufferedRegen,
                            activeEffects: activeEffects,
                            firstMiss: firstMiss,
                            barrier: barrier
                        },
                        meleeType: melee,
                        rangedType: ranged,
                        magicType: magic,
                        prayerPoints: prayerPoints,
                        equipmentSet: selectedEquipmentSet,
                        equipmentSets: equipmentSets,
                        foodSlot: selectedFoodSlot,
                        foodSlots: foodSlots,
                        maxFoodSlot: maxFoodSlot,
                        summoningTimer: {
                            ticksLeft: summonTicksLeft,
                            maxTicks: summonMaxTicks,
                            active: summonActive
                        },
                        soulPoints: soulPoints,
                        unholyPrayerMultiplier: unholyPrayerMultiplier
                    },
                    enemy: {
                        character: {
                            hp: enemyHitpoints,
                            nextAction: enemyAction,
                            attackCount: enemyAttackCount,
                            nextAttack: enemyNextAttack,
                            isAttacking: enemyAttacking,
                            firstHit: enemyFirstHit,
                            actionTimer: {
                                ticksLeft: enemyActionTicksLeft,
                                maxTicks: enemyActionMaxTicks,
                                active: enemyActionActive
                            },
                            regenTimer: {
                                ticksLeft: enemyRegenTicksLeft,
                                maxTicks: enemyRegenMaxTicks,
                                active: enemyRegenActive
                            },
                            turnsTaken: enemyTurnsTaken,
                            bufferedRegen: enemyBufferedRegen,
                            activeEffects: enemyActiveEffects,
                            firstMiss: enemyFirstMiss,
                            barrier: enemyBarrier
                        },
                        state: enemyState,
                        attackType: enemyAttackType,
                        enemy: enemy,
                        damageType: damageType
                    },
                    fightInProgress: fightInProgess,
                    fightTimer: {
                        ticksLeft: fightSpawnTicksLeft,
                        maxTicks: fightSpawnMaxTicks,
                        active: fightSpawnActive
                    },
                    combatActive: combatActive,
                    combatPassives: combatPassives,
                    combatArea: combatArea,
                    combatAreaProgress: combatAreaProgress,
                    monster: monster,
                    combatPaused: combatPaused,
                    loot: loot,
                    slayer: {
                        taskActive: slayerActive,
                        task: slayerTask,
                        left: slayerLeft,
                        extended: slayerExtended,
                        category: slayerCategory,
                        categories: slayerCategories,
                        timer: {
                            ticksLeft: slayerTaskTicksLeft,
                            maxTicks: slayerTaskMaxTicks,
                            active: slayerTaskActive
                        },
                        realm: slayerRealm
                    },
                    event: {
                        active: activeEvent,
                        passives: eventPassives,
                        passivesSelected: eventPassivesSelected,
                        dungeonLength: eventDungeonLength,
                        dungeonCompletions: eventDungeonCompletions,
                        activeEventAreas: activeEventAreas,
                        progress: eventProgress,
                        strongholdTier: eventStrongholdTier
                    }
                },
                goblinRaid: {
                    player: {
                        character: {
                            hp: raidhp,
                            nextAction: raidnextAction,
                            attackCount: raidattackCount,
                            nextAttack: raidnextAttack,
                            isAttacking: raidisAttacking,
                            firstHit: raidfirstHit,
                            actionTimer: {
                                ticksLeft: raidactionTicksLeft,
                                maxTicks: raidactionMaxTicks,
                                active: raidactionActive
                            },
                            regenTimer :{
                                ticksLeft: raidregenTicksLeft,
                                maxTicks: raidregenMaxTicks,
                                active: raidregenActive
                            },
                            turnsTaken: raidturnsTaken,
                            bufferedRegen: raidbufferedRegen,
                            activeEffects: raidactiveEffects,
                            firstMiss: raidfirstMiss,
                            barrier: raidbarrier
                        },
                        meleeType: raidMeleeStyle,
                        rangedType: raidRangedStyle,
                        magicType: raidMagicStyle,
                        prayerPoints: raidprayerPoints,
                        equipmentSet: raidselectedEquipmentSet,
                        equipmentSets: raidequipmentSets,
                        foodSlot: raidselectedFoodSlot,
                        foodSlots: raidfoodSlots,
                        maxFoodSlot: raidmaxFoodSlot,
                        summoningTimer: {
                            ticksLeft: raidsummonTicksLeft,
                            maxTicks: raidsummonMaxTicks,
                            active: raidsummonActive
                        },
                        soulPoints: raidsoulPoints,
                        unholyPrayerMultiplier: raidunholyPrayerMultiplier,
                        altAttacks: raidAltAttacks
                    },
                    enemy: {
                        character: {
                            hp: raidenemyHitpoints,
                            nextAction: raidenemyAction,
                            attackCount: raidenemyAttackCount,
                            nextAttack: raidenemyNextAttack,
                            isAttacking: raidenemyAttacking,
                            firstHit: raidenemyFirstHit,
                            actionTimer: {
                                ticksLeft: raidenemyActionTicksLeft,
                                maxTicks: raidenemyActionMaxTicks,
                                active: raidenemyActionActive
                            },
                            regenTimer: {
                                ticksLeft: raidenemyRegenTicksLeft,
                                maxTicks: raidenemyRegenMaxTicks,
                                active: raidenemyRegenActive
                            },
                            turnsTaken: raidenemyTurnsTaken,
                            bufferedRegen: raidenemyBufferedRegen,
                            activeEffects: raidenemyActiveEffects,
                            firstMiss: raidenemyFirstMiss,
                            barrier: raidenemyBarrier
                        },
                        state: raidenemyState,
                        attackType: raidenemyAttackType,
                        enemy: raidenemy,
                        goblin: goblin
                    },
                    inProgress: raidfightInProgess,
                    spawnTimer: {
                        ticksLeft: raidfightSpawnTicksLeft,
                        maxTicks: raidfightSpawnMaxTicks,
                        active: raidfightSpawnActive
                    },
                    active: raidcombatActive,
                    passives: raidcombatPassives,
                    playerModifiers: raidPlayerModifiers,
                    enemyModifiers: raidEnemyModifiers,
                    state: raidState,
                    difficulty: raidDifficulty,
                    bank: {
                        lockedItems: raidlockedItems,
                        tabs: raidbankTabs,
                        defaultTabs: raiddefaultItemTabs,
                        sortOrder: raidcustomSortOrder,
                        glowing: raidglowingItems,
                        icons: raidtabIcons
                    },
                    wave: raidWave,
                    waveProgress: raidWaveProgress,
                    killCount: raidKillCount,
                    start: raidStart,
                    ownedCrateItems: raidOwnedCrateItems,
                    randomModifiers: raidRandomModifiers,
                    positiveModifier: raidSelectedPositiveModifier,
                    items: {
                        weapons: raidItemWeapons,
                        armour: raidItemArmour,
                        ammo: raidItemAmmo,
                        runes: raidItemRunes,
                        food: raidItemFoods,
                        passives: raidItemPassives
                    },
                    itemCategory: raidItemCategory,
                    positiveModifiers: raidPosMods,
                    negativeModifiers: raidNegMods,
                    paused: raidPaused,
                    history: raidHistories
                },
                minibar: MinibarItems,
                pets: petList,
                shop: {
                    items: shopItems,
                    purchases: purchaseQty
                },
                itemCharges: itemCharges,
                tutorialComplete: tutorialComplete,
                potions: {
                    list: potionList,
                    reuse: potionReuse
                },
                stats: {
                    woodcutting: woodcuttingStats,
                    fishing: fishingStats,
                    firemaking: firemakingStats,
                    cooking: cookingStats,
                    mining: miningStats,
                    smithing: smithingStats,
                    attack: attackStats,
                    strength: strengthStats,
                    defence: defenceStats,
                    hitpoints: hitpointsStats,
                    theiving: theivingStats,
                    farming: farmingStats,
                    ranged: rangedStats,
                    fletching: fletchingStats,
                    crafting: craftingStats,
                    runecrafting: runecraftingStats,
                    magic: magicStats,
                    prayer: prayerStats,
                    slayer: slayerStats,
                    herblore: herbloreStats,
                    agility: agilityStats,
                    summoning: summoningStats,
                    items: itemsStats,
                    monsters: monstersStats,
                    general: generalStats,
                    combat: combatStats,
                    goblinRaid: goblinStats,
                    astrology: astrologyStats,
                    shop: shopStats,
                    township: townshipStats,
                    cartography: cartographyStats,
                    archaeology: archaeologyStats,
                    corruption: corruptionStats,
                    harvesting: harvestingStats
                },
                settings: {
                    continueIfBankFull: settingcontinueIfBankFull,
                    continueThievingOnStun: settingcontinueThievingOnStun,
                    autoRestartDungeon: settingautoRestartDungeon,
                    autoCloudSave: settingautoCloudSave,
                    darkMode: settingdarkMode,
                    showGPNotifications: settingshowGPNotifications,
                    enableAccessibility: settingenableAccessibility,
                    showEnemySkillLevels: settingshowEnemySkillLevels,
                    showCloseConfirmations: settingshowCloseConfirmations,
                    hideThousandsSeperator: settinghideThousandsSeperator,
                    showVirtualLevels: settingshowVirtualLevels,
                    showSaleConfirmations: settingshowSaleConfirmations,
                    showShopConfirmations: settingshowShopConfirmations,
                    pauseOnUnfocus: settingpauseOnUnfocus,
                    showCombatMinibar: settingshowCombatMinibar,
                    showCombatMinibarCombat: settingshowCombatMinibarCombat,
                    showSkillingMinibar: settingshowSkillingMinibar,
                    useCombinationRunes: settinguseCombinationRunes,
                    enableAutoSlayer: settingenableAutoSlayer,
                    showItemNotifications: settingshowItemNotifications,
                    useSmallLevelUpNotifications: settinguseSmallLevelUpNotifications,
                    useDefaultBankBorders: settinguseDefaultBankBorders,
                    defaultToCurrentEquipSet: settingdefaultToCurrentEquipSet,
                    hideMaxLevelMasteries: settinghideMaxLevelMasteries,
                    showMasteryCheckpointconfirmations: settingshowMasteryCheckpointconfirmations,
                    enableOfflinePushNotifications: settingenableOfflinePushNotifications,
                    enableFarmingPushNotifications: settingenableFarmingPushNotifications,
                    enableOfflineCombat: settingenableOfflineCombat,
                    enableMiniSidebar: settingenableMiniSidebar,
                    enableAutoEquipFood: settingenableAutoEquipFood,
                    enableAutoSwapFood: settingenableAutoSwapFood,
                    enablePerfectCooking: settingenablePerfectCooking,
                    showCropDestructionConfirmations: settingshowCropDestructionConfirmations,
                    showAstrologyMaxRollConfirmations: settingshowAstrologyMaxRollConfirmations,
                    showQuantityInItemNotifications: settingshowQuantityInItemNotifications,
                    showItemPreservationNotifications: settingshowItemPreservationNotifications,
                    showSlayerCoinNotifications: settingshowSlayerCoinNotifications,
                    showEquipmentSetsInCombatMinibar: settingshowEquipmentSetsInCombatMinibar,
                    showBarsInCombatMinibar: settingshowBarsInCombatMinibar,
                    showCombatStunNotifications: settingshowCombatStunNotifications,
                    showCombatSleepNotifications: settingshowCombatSleepNotifications,
                    showSummoningMarkDiscoveryModals: settingshowSummoningMarkDiscoveryModals,
                    enableCombatDamageSplashes: settingenableCombatDamageSplashes,
                    enableProgressBars: settingenableProgressBars,
                    showTierIPotions: settingshowTierIPotions,
                    showTierIIPotions: settingshowTierIIPotions,
                    showTierIIIPotions: settingshowTierIIIPotions,
                    showTierIVPotions: settingshowTierIVPotions,
                    showNeutralAttackModifiers: settingshowNeutralAttackModifiers,
                    defaultPageOnLoad: settingdefaultPageOnLoad,
                    formatNumberSetting: settingformatNumberSetting,
                    bankSortOrder: settingbankSortOrder,
                    colourBlindMode: settingcolourBlindMode,
                    enableEyebleachMode: settingenableEyebleachMode,
                    enableQuickConvert: settingenableQuickConvert,
                    showLockedTownshipBuildings: settingshowLockedTownshipBuildings,
                    useNewNotifications: settinguseNewNotifications,
                    notificationHorizontalPosition: settingnotificationHorizontalPosition,
                    notificationDisappearDelay: settingnotificationDisappearDelay,
                    showItemNamesInNotifications: settingshowItemNamesInNotifications,
                    importanceSummoningMarkFound: settingimportanceSummoningMarkFound,
                    importanceErrorMessages: settingimportanceErrorMessages,
                    enableScrollableBankTabs: settingenableScrollableBankTabs,
                    showWikiLinks: settingshowWikiLinks,
                    disableHexGridOutsideSight: settingdisableHexGridOutsideSight,
                    mapTextureQuality: settingmapTextureQuality,
                    enableMapAntialiasing: settingenableMapAntialiasing,
                    showSkillXPNotifications: settingshowSkillXPNotifications,
                    backgroundImage: settingbackgroundImage,
                    superDarkMode: settingsuperDarkMode,
                    showExpansionBackgroundColours: settingshowExpansionBackgroundColours,
                    showCombatAreaWarnings: settingshowCombatAreaWarnings,
                    useCompactNotifications: settinguseCompactNotifications,
                    useLegacyNotifications: settinguseLegacyNotifications,
                    useCat: settinguseCat,
                    throttleFrameRateOnInactivity: settingthrottleFrameRateOnInactivity,
                    cartographyFrameRateCap: settingcartographyFrameRateCap,
                    toggleBirthdayEvent: settingtoggleBirthdayEvent,
                    toggleDiscordRPC: settingtoggleDiscordRPC,
                    genericArtefactAllButOne: settinggenericArtefactAllButOne,
                    hiddenMasteryNamespaces: settinghiddenMasteryNamespaces,
                    enableDoubleClickEquip: settingenableDoubleClickEquip,
                    enableDoubleClickOpen: settingenableDoubleClickOpen,
                    enableDoubleClickBury: settingenableDoubleClickBury,
                    showAbyssalPiecesNotifications: settingshowAbyssalPiecesNotifications,
                    showAbyssalSlayerCoinNotifications: settingshowAbyssalSlayerCoinNotifications,
                    enablePermaCorruption: settingenablePermaCorruption,
                    showAPNextToShopSidebar: settingshowAPNextToShopSidebar,
                    showASCNextToSlayerSidebar: settingshowASCNextToSlayerSidebar,
                    sidebarLevels: settingsidebarLevels,
                    showAbyssalXPNotifications: settingshowAbyssalXPNotifications,
                    showSPNextToPrayerSidebar: settingshowSPNextToPrayerSidebar,
                    enableStickyBankTabs: settingenableStickyBankTabs,
                    useLegacyRealmSelection: settinguseLegacyRealmSelection,
                    showOpacityForSkillNavs: settingshowOpacityForSkillNavs,
                    bankFilterShowAll: settingbankFilterShowAll,
                    bankFilterShowDemo: settingbankFilterShowDemo,
                    bankFilterShowFull: settingbankFilterShowFull,
                    bankFilterShowTotH: settingbankFilterShowTotH,
                    bankFilterShowAoD: settingbankFilterShowAoD,
                    bankFilterShowItA: settingbankFilterShowItA,
                    bankFilterShowDamageReduction: settingbankFilterShowDamageReduction,
                    bankFilterShowAbyssalResistance: settingbankFilterShowAbyssalResistance,
                    bankFilterShowNormalDamage: settingbankFilterShowNormalDamage,
                    bankFilterShowAbyssalDamage: settingbankFilterShowAbyssalDamage,
                    bankFilterShowSkillXP: settingbankFilterShowSkillXP,
                    bankFilterShowAbyssalXP: settingbankFilterShowAbyssalXP,
                    alwaysShowRealmSelectAgility: settingalwaysShowRealmSelectAgility,
                    enableSwipeSidebar: settingenableSwipeSidebar,
                    keyBindings: keyBindings
                },
                news: news,
                lastLoadedGameVersion: lastLoadedGameVersion,
                scheduledPushNotifications: scheduledPushNotifications,
                skills: skills,
                mods: mods,
                completion: {
                    completion: completion,
                    birthdayCompletions: birthdayCompletions,
                    clueHuntStep: clueHuntStep,
                    areaCompletions: areaCompletions,
                    strongholdCompletions: strongholdCompletions
                },
                currencies: currencies,
                levelCapIncreases: {
                    increases: levelCapIncreases,
                    selected: levelCapIncreasesSelected,
                    bought: levelCapIncreasesBought,
                    abyssalBought: abyssalLevelCapIncreasesBought,
                },
                realm: realm
            },
            initialSize: reader.dataView.byteLength
        };
    } catch (e: any) {
        if (!(e instanceof Error)) {
            e = new Error(e);
        }
        return e.message;
    }
}