import { zlibSync, strFromU8 } from 'fflate';
import { saveData } from './type';

export class Writer {
    data: ArrayBuffer;
    dataView: DataView;
    offset = 0;

    constructor (initialSize: number) {
        this.data = new ArrayBuffer(initialSize);
        this.dataView = new DataView(this.data);
    }

    checkDataViewSize(sizeOfData: number) {
        if (this.dataView.byteLength < (this.offset + sizeOfData)) {
            var newBuffer = new ArrayBuffer(this.dataView.byteLength + sizeOfData);
            new Uint8Array(newBuffer).set(new Uint8Array(this.data));
            this.data = newBuffer;
            this.dataView = new DataView(this.data);
        }
    }

    generateSaveString() {
        const data = new Uint8Array(this.dataView.buffer, 0, this.offset)
        return btoa(strFromU8(zlibSync(data), true));
    }

    setStaticString(value: string) {
        const stringLength = value.length;
        const encoder = new TextEncoder()
        const encodedString = encoder.encode(value);
        for (var i = 0; i < stringLength; i++)
            this.setUint8(encodedString[i])
    }

    setString(value: string) {
        const stringLength = value.length;
        this.setUint32(stringLength);
        const encoder = new TextEncoder()
        const encodedString = encoder.encode(value);
        for (var i = 0; i < stringLength; i++)
            this.setUint8(encodedString[i])
    }

    setInt8(value: number) {
        this.checkDataViewSize(Int8Array.BYTES_PER_ELEMENT);
        this.dataView.setInt8(this.offset, value);
        this.offset += Int8Array.BYTES_PER_ELEMENT;
    }
    setUint8(value: number) {
        this.checkDataViewSize(Uint8Array.BYTES_PER_ELEMENT);
        this.dataView.setUint8(this.offset, value);
        this.offset += Uint8Array.BYTES_PER_ELEMENT;
    }

    setInt16(value: number) {
        this.checkDataViewSize(Int16Array.BYTES_PER_ELEMENT);
        this.dataView.setInt16(this.offset, value);
        this.offset += Int16Array.BYTES_PER_ELEMENT;
    }
    setUint16(value: number) {
        this.checkDataViewSize(Uint16Array.BYTES_PER_ELEMENT);
        this.dataView.setUint16(this.offset, value);
        this.offset += Uint16Array.BYTES_PER_ELEMENT;
    }
    setInt32(value: number) {
        this.checkDataViewSize(Int32Array.BYTES_PER_ELEMENT);
        this.dataView.setInt32(this.offset, value);
        this.offset += Int32Array.BYTES_PER_ELEMENT;
    }

    setUint32(value: number) {
        this.checkDataViewSize(Uint32Array.BYTES_PER_ELEMENT);
        this.dataView.setUint32(this.offset, value);
        this.offset += Uint32Array.BYTES_PER_ELEMENT;
    }

    setBoolean(value: boolean) {
        this.setUint8(value ? 1 : 0);
    }

    setFloat64(value: number) {
        this.checkDataViewSize(Float64Array.BYTES_PER_ELEMENT);
        this.dataView.setFloat64(this.offset, value);
        this.offset += Float64Array.BYTES_PER_ELEMENT;
    }
    setFixedLengthBuffer(value: Uint8Array) {
        const arraySize = value.length;
        for (var i = 0; i < arraySize; i++)
            this.setUint8(value[i])
    }

    setArray(array: Array<any>, setValue: (writer: Writer, value: any) => void) {
        const arraySize = array.length;
        this.setUint32(arraySize);
        array.forEach((value) => {
            setValue(this, value)
        })
    }

    setSet(set: Set<any>, setValue: (writer: Writer, value: any) => void) {
        const array = Array.from(set);
        const arraySize = array.length;
        this.setUint32(arraySize);
        set.forEach((value) => {
            setValue(this, value)
        })
    }

    setMap(map: any, setKey: (writer: Writer, key: any) => void, setValue: (writer: Writer, value: any, key: number) => void) {
        if (Array.isArray(map)) {
            // lossless array of [key, value] pairs (the map had duplicate keys -- see reader getMap)
            this.setUint32(map.length);
            map.forEach((pair: any) => {
                setKey(this, pair[0]);
                const tempKey = typeof pair[0] === "number" ? pair[0] : 0
                setValue(this, pair[1], tempKey);
            })
            return;
        }
        const mapSize = map.size;
        this.setUint32(mapSize);
        map.forEach((value: any, key: any) => {
            setKey(this, key);
            const tempKey = typeof key === "number" ? key : 0
            setValue(this, value, tempKey);
        })
    }
}

export function parseSave(save: saveData, initialSize: number): string {
    const knownNamespaces = ["melvorD", "melvorF", "melvorAoD", "melvorTotH", "melvorItA"];
        
    function findItemFromNamespace(item: number) {
        for (var i = 0; i < knownNamespaces.length; i++){
            const value = save.header.namespaces.get(knownNamespaces[i]);
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

    var writer = new Writer(initialSize);
    writer.setStaticString("melvor");
    const headerSizeLocation = writer.offset;
    writer.setUint32(0);
    writer.setMap(save.header.namespaces,
        (writer, key) => writer.setString(key), 
        (writer, value) => writer.setMap(value,
            (writer, key) => writer.setString(key),
            (writer, value) => writer.setUint16(value)
        )
    );
    writer.setUint32(save.header.saveVersion);
    writer.setString(save.header.saveName);
    writer.setString(save.header.gameMode);
    writer.setUint16(save.header.skillLevel);
    writer.setFloat64(save.header.gp);
    writer.setBoolean(save.header.activeTraining);
    writer.setString(save.header.activeTrainingName);
    writer.setFloat64(save.header.tickTime);
    writer.setFloat64(save.header.saveTime);
    writer.setSet(save.header.activeNamespaces, (writer, value) => writer.setString(value));
    writer.setBoolean(save.header.mods != undefined)
    if (save.header.mods != undefined) {
        writer.setString(save.header.mods.profileId),
        writer.setString(save.header.mods.profileName),
        writer.setSet(save.header.mods.mods, (writer, value) => writer.setUint32(value))
    }
    writer.dataView.setUint32(headerSizeLocation, writer.offset - headerSizeLocation - 4);
    const bodySizeLocation = writer.offset;
    writer.setUint32(0);
    writer.setFloat64(save.tickTime);
    writer.setFloat64(save.saveTime);
    writer.setBoolean(save.activeAction != undefined);
    if (save.activeAction != undefined)
        writer.setUint16(save.activeAction);
    writer.setBoolean(save.pausedAction != undefined);
    if (save.pausedAction)
        writer.setUint16(save.pausedAction);
    writer.setBoolean(save.paused);
    writer.setBoolean(save.merchantsPermitRead);
    writer.setUint16(save.gameMode);
    writer.setString(save.characterName);
    writer.setArray(save.bank.lockedItems, (writer, value) => writer.setUint16(value));
    writer.setArray(save.bank.tabs,
        (writer, value) => writer.setMap(value,
            (writer, key) => writer.setUint16(key),
            (writer, value) => writer.setUint32(value)
        )
    );
    writer.setMap(save.bank.defaultTabs,
        (writer, key) => writer.setUint16(key),
        (writer, value) => writer.setUint8(value)
    );
    writer.setArray(save.bank.sortOrder, (writer, value) => writer.setUint16(value));
    writer.setArray(save.bank.glowing, (writer, value) => writer.setUint16(value));
    writer.setMap(save.bank.icons,
        (writer, key) => writer.setUint8(key),
        (writer, value) => writer.setUint16(value)
    );
    writer.setUint32(save.combat.player.character.hp);
    writer.setUint8(save.combat.player.character.nextAction);
    writer.setUint32(save.combat.player.character.attackCount);
    writer.setUint16(save.combat.player.character.nextAttack);
    writer.setBoolean(save.combat.player.character.isAttacking);
    writer.setBoolean(save.combat.player.character.firstHit);
    writer.setUint32(save.combat.player.character.actionTimer.ticksLeft);
    writer.setUint32(save.combat.player.character.actionTimer.maxTicks);
    writer.setBoolean(save.combat.player.character.actionTimer.active);
    writer.setUint32(save.combat.player.character.regenTimer.ticksLeft);
    writer.setUint32(save.combat.player.character.regenTimer.maxTicks);
    writer.setBoolean(save.combat.player.character.regenTimer.active);
    writer.setUint32(save.combat.player.character.turnsTaken);
    writer.setUint32(save.combat.player.character.bufferedRegen);
    writer.setMap(save.combat.player.character.activeEffects,
        (writer, key) => writer.setUint16(key),
        (writer, value) => {
                writer.setBoolean(value.player),
                writer.setUint8(value.type),
                writer.setFloat64(value.damageDealt),
                writer.setFloat64(value.damageTaken),
                writer.setArray(value.prameters, (writer, value) => {writer.setString(value[0]), writer.setUint32(value[1])}),
                writer.setArray(value.statGroups, (writer, value) => {writer.setString(value[0]), writer.setUint32(value[1])}),
                writer.setArray(value.timers, (writer, value) => {
                    writer.setString(value[0]),
                    writer.setUint32(value[1]),
                    writer.setUint32(value[2]),
                    writer.setBoolean(value[3])
            })
        }
    );
    writer.setBoolean(save.combat.player.character.firstMiss);
    writer.setUint32(save.combat.player.character.barrier);
    writer.setBoolean(save.combat.player.meleeType != undefined);
    if (save.combat.player.meleeType != undefined)
        writer.setUint16(save.combat.player.meleeType);
    writer.setBoolean(save.combat.player.rangedType != undefined);
    if (save.combat.player.rangedType != undefined)
        writer.setUint16(save.combat.player.rangedType);
    writer.setBoolean(save.combat.player.magicType != undefined);
    if (save.combat.player.magicType != undefined)
        writer.setUint16(save.combat.player.magicType);
    writer.setUint32(save.combat.player.prayerPoints);
    writer.setUint16(save.combat.player.equipmentSet);
    writer.setArray(save.combat.player.equipmentSets,
        (writer, value) => {
            writer.setArray(value.equipment, (writer, value) => {
                writer.setUint16(value.id);
                writer.setBoolean(value.stackable != undefined)
                if (value.stackable != undefined) {
                    writer.setUint16(value.stackable);
                    writer.setUint32(value.qty);
                }
                writer.setArray(value.quickEquip, (writer, value) => writer.setUint16(value));
            }),
            writer.setBoolean(value.spells.spell != undefined);
            if (value.spells.spell != undefined)
                writer.setUint16(value.spells.spell);
            writer.setBoolean(value.spells.aura != undefined);
            if (value.spells.aura != undefined)
                writer.setUint16(value.spells.aura);
            writer.setBoolean(value.spells.curse != undefined);
            if (value.spells.curse != undefined)
                writer.setUint16(value.spells.curse);
            writer.setArray(value.prayers, (writer, value) => writer.setUint16(value))
    });
    writer.setUint32(save.combat.player.foodSlot);
    writer.setUint32(save.combat.player.maxFoodSlot);
    writer.setArray(save.combat.player.foodSlots, (writer, value) => { writer.setUint16(value[0]), writer.setUint32(value[1])});
    writer.setUint32(save.combat.player.summoningTimer.ticksLeft);
    writer.setUint32(save.combat.player.summoningTimer.maxTicks);
    writer.setBoolean(save.combat.player.summoningTimer.active);
    writer.setUint32(save.combat.player.soulPoints);
    writer.setUint8(save.combat.player.unholyPrayerMultiplier);
    writer.setUint32(save.combat.enemy.character.hp);
    writer.setUint8(save.combat.enemy.character.nextAction);
    writer.setUint32(save.combat.enemy.character.attackCount);
    writer.setUint16(save.combat.enemy.character.nextAttack);
    writer.setBoolean(save.combat.enemy.character.isAttacking);
    writer.setBoolean(save.combat.enemy.character.firstHit);
    writer.setUint32(save.combat.enemy.character.actionTimer.ticksLeft);
    writer.setUint32(save.combat.enemy.character.actionTimer.maxTicks);
    writer.setBoolean(save.combat.enemy.character.actionTimer.active);
    writer.setUint32(save.combat.enemy.character.regenTimer.ticksLeft);
    writer.setUint32(save.combat.enemy.character.regenTimer.maxTicks);
    writer.setBoolean(save.combat.enemy.character.regenTimer.active)
    writer.setUint32(save.combat.enemy.character.turnsTaken);
    writer.setUint32(save.combat.enemy.character.bufferedRegen);
    writer.setMap(save.combat.enemy.character.activeEffects,
        (writer, key) => writer.setUint16(key),
        (writer, value) => {
                writer.setBoolean(value.player),
                writer.setUint8(value.type),
                writer.setFloat64(value.damageDealt),
                writer.setFloat64(value.damageTaken),
                writer.setArray(value.prameters, (writer, value) => {writer.setString(value[0]), writer.setUint32(value[1])}),
                writer.setArray(value.statGroups, (writer, value) => {writer.setString(value[0]), writer.setUint32(value[1])}),
                writer.setArray(value.timers, (writer, value) => {
                    writer.setString(value[0]),
                    writer.setUint32(value[1]),
                    writer.setUint32(value[2]),
                    writer.setBoolean(value[3])
            })
        }
    );
    writer.setBoolean(save.combat.enemy.character.firstMiss);
    writer.setUint32(save.combat.enemy.character.barrier);
    writer.setUint8(save.combat.enemy.state);
    writer.setUint8(save.combat.enemy.attackType);
    writer.setBoolean(save.combat.enemy.enemy != undefined);
    if (save.combat.enemy.enemy != undefined)
        writer.setUint16(save.combat.enemy.enemy);
    writer.setBoolean(save.combat.enemy.damageType != undefined);
    if (save.combat.enemy.damageType != undefined)
        writer.setUint16(save.combat.enemy.damageType);
    writer.setBoolean(save.combat.fightInProgress);
    writer.setUint32(save.combat.fightTimer.ticksLeft);
    writer.setUint32(save.combat.fightTimer.maxTicks);
    writer.setBoolean(save.combat.fightTimer.active);
    writer.setBoolean(save.combat.combatActive);
    writer.setMap(save.combat.combatPassives,
        (writer, key) => writer.setUint16(key),
        (writer, value) => writer.setBoolean(value)
    );
    writer.setBoolean(save.combat.combatArea != undefined);
    if (save.combat.combatArea != undefined)
    {
        writer.setUint8(save.combat.combatArea.area),
        writer.setUint16(save.combat.combatArea.subArea)
    }
    writer.setUint32(save.combat.combatAreaProgress);
    writer.setBoolean(save.combat.monster != undefined);
    if (save.combat.monster != undefined)
        writer.setUint16(save.combat.monster);
    writer.setBoolean(save.combat.combatPaused);
    writer.setMap(save.combat.loot,
        (writer, key) => writer.setUint16(key),
        (writer, value) => writer.setUint32(value)
    );
    writer.setBoolean(save.combat.slayer.taskActive);
    writer.setBoolean(save.combat.slayer.task != undefined);
    if (save.combat.slayer.task != undefined)
        writer.setUint16(save.combat.slayer.task);
    writer.setUint32(save.combat.slayer.left);
    writer.setBoolean(save.combat.slayer.extended);
    writer.setBoolean(save.combat.slayer.category != undefined);
    if (save.combat.slayer.category != undefined)
        writer.setUint16(save.combat.slayer.category);
    writer.setMap(save.combat.slayer.categories,
        (writer, key) => writer.setUint16(key),
        (writer, value) => writer.setUint32(value)
    );
    writer.setUint32(save.combat.slayer.timer.ticksLeft);
    writer.setUint32(save.combat.slayer.timer.maxTicks);
    writer.setBoolean(save.combat.slayer.timer.active);
    writer.setUint16(save.combat.slayer.realm);
    writer.setBoolean(save.combat.event.active != undefined);
    if (save.combat.event.active != undefined)
        writer.setUint16(save.combat.event.active);
    writer.setArray(save.combat.event.passives, (writer, value) => writer.setUint16(value));
    writer.setArray(save.combat.event.passivesSelected, (writer, value) => writer.setUint16(value));
    writer.setUint32(save.combat.event.dungeonLength);
    writer.setMap(save.combat.event.activeEventAreas,
        (writer, key) => writer.setUint16(key),
        (writer, value) => writer.setUint32(value)
    );
    writer.setUint32(save.combat.event.progress);
    writer.setMap(save.combat.event.dungeonCompletions,
        (writer, key) => writer.setUint16(key),
        (writer, value) => writer.setUint32(value)
    );
    writer.setUint8(save.combat.event.strongholdTier);
    writer.setUint32(save.goblinRaid.player.character.hp);
    writer.setUint8(save.goblinRaid.player.character.nextAction);
    writer.setUint32(save.goblinRaid.player.character.attackCount);
    writer.setUint16(save.goblinRaid.player.character.nextAttack);
    writer.setBoolean(save.goblinRaid.player.character.isAttacking);
    writer.setBoolean(save.goblinRaid.player.character.firstHit);
    writer.setUint32(save.goblinRaid.player.character.actionTimer.ticksLeft);
    writer.setUint32(save.goblinRaid.player.character.actionTimer.maxTicks);
    writer.setBoolean(save.goblinRaid.player.character.actionTimer.active);
    writer.setUint32(save.goblinRaid.player.character.regenTimer.ticksLeft);
    writer.setUint32(save.goblinRaid.player.character.regenTimer.maxTicks);
    writer.setBoolean(save.goblinRaid.player.character.regenTimer.active);
    writer.setUint32(save.goblinRaid.player.character.turnsTaken);
    writer.setUint32(save.goblinRaid.player.character.bufferedRegen);
    writer.setMap(save.goblinRaid.player.character.activeEffects,
        (writer, key) => writer.setUint16(key),
        (writer, value) => {
                writer.setBoolean(value.player),
                writer.setUint8(value.type),
                writer.setFloat64(value.damageDealt),
                writer.setFloat64(value.damageTaken),
                writer.setArray(value.prameters, (writer, value) => {writer.setString(value[0]), writer.setUint32(value[1])}),
                writer.setArray(value.statGroups, (writer, value) => {writer.setString(value[0]), writer.setUint32(value[1])}),
                writer.setArray(value.timers, (writer, value) => {
                    writer.setString(value[0]),
                    writer.setUint32(value[1]),
                    writer.setUint32(value[2]),
                    writer.setBoolean(value[3])
            })
        }
    );
    writer.setBoolean(save.goblinRaid.player.character.firstMiss);
    writer.setUint32(save.goblinRaid.player.character.barrier);
    writer.setBoolean(save.goblinRaid.player.meleeType != undefined);
    if (save.goblinRaid.player.meleeType != undefined)
        writer.setUint16(save.goblinRaid.player.meleeType);
    writer.setBoolean(save.goblinRaid.player.rangedType != undefined);
    if (save.goblinRaid.player.rangedType != undefined)
        writer.setUint16(save.goblinRaid.player.rangedType);
    writer.setBoolean(save.goblinRaid.player.magicType != undefined);
    if (save.goblinRaid.player.magicType != undefined)
        writer.setUint16(save.goblinRaid.player.magicType);
    writer.setUint32(save.goblinRaid.player.prayerPoints);
    writer.setUint16(save.goblinRaid.player.equipmentSet);
    writer.setArray(save.goblinRaid.player.equipmentSets,
        (writer, value) => {
            writer.setArray(value.equipment, (writer, value) => {
                writer.setUint16(value.id);
                writer.setBoolean(value.stackable != undefined)
                if (value.stackable != undefined) {
                    writer.setUint16(value.stackable);
                    writer.setUint32(value.qty);
                }
                writer.setArray(value.quickEquip, (writer, value) => writer.setUint16(value));
            }),
            writer.setBoolean(value.spells.spell != undefined);
            if (value.spells.spell != undefined)
                writer.setUint16(value.spells.spell);
            writer.setBoolean(value.spells.aura != undefined);
            if (value.spells.aura != undefined)
                writer.setUint16(value.spells.aura);
            writer.setBoolean(value.spells.curse != undefined);
            if (value.spells.curse != undefined)
                writer.setUint16(value.spells.curse);
            writer.setArray(value.prayers, (writer, value) => writer.setUint16(value))
    });
    writer.setUint32(save.goblinRaid.player.foodSlot);
    writer.setUint32(save.goblinRaid.player.maxFoodSlot);
    writer.setArray(save.goblinRaid.player.foodSlots, (writer, value) => { writer.setUint16(value[0]), writer.setUint32(value[1])});
    writer.setUint32(save.goblinRaid.player.summoningTimer.ticksLeft);
    writer.setUint32(save.goblinRaid.player.summoningTimer.maxTicks);
    writer.setBoolean(save.goblinRaid.player.summoningTimer.active);
    writer.setUint32(save.goblinRaid.player.soulPoints);
    writer.setUint8(save.goblinRaid.player.unholyPrayerMultiplier);
    writer.setMap(save.goblinRaid.player.altAttacks,
        (writer, key) => writer.setUint16(key),
        (writer, value) => writer.setArray(value, (writer, value) => writer.setUint16(value))
    );
    writer.setUint32(save.goblinRaid.enemy.character.hp);
    writer.setUint8(save.goblinRaid.enemy.character.nextAction);
    writer.setUint32(save.goblinRaid.enemy.character.attackCount);
    writer.setUint16(save.goblinRaid.enemy.character.nextAttack);
    writer.setBoolean(save.goblinRaid.enemy.character.isAttacking);
    writer.setBoolean(save.goblinRaid.enemy.character.firstHit);
    writer.setUint32(save.goblinRaid.enemy.character.actionTimer.ticksLeft);
    writer.setUint32(save.goblinRaid.enemy.character.actionTimer.maxTicks);
    writer.setBoolean(save.goblinRaid.enemy.character.actionTimer.active);
    writer.setUint32(save.goblinRaid.enemy.character.regenTimer.ticksLeft);
    writer.setUint32(save.goblinRaid.enemy.character.regenTimer.maxTicks);
    writer.setBoolean(save.goblinRaid.enemy.character.regenTimer.active)
    writer.setUint32(save.goblinRaid.enemy.character.turnsTaken);
    writer.setUint32(save.goblinRaid.enemy.character.bufferedRegen);
    writer.setMap(save.goblinRaid.enemy.character.activeEffects,
        (writer, key) => writer.setUint16(key),
        (writer, value) => {
                writer.setBoolean(value.player),
                writer.setUint8(value.type),
                writer.setFloat64(value.damageDealt),
                writer.setFloat64(value.damageTaken),
                writer.setArray(value.prameters, (writer, value) => {writer.setString(value[0]), writer.setUint32(value[1])}),
                writer.setArray(value.statGroups, (writer, value) => {writer.setString(value[0]), writer.setUint32(value[1])}),
                writer.setArray(value.timers, (writer, value) => {
                    writer.setString(value[0]),
                    writer.setUint32(value[1]),
                    writer.setUint32(value[2]),
                    writer.setBoolean(value[3])
            })
        }
    );
    writer.setBoolean(save.goblinRaid.enemy.character.firstMiss);
    writer.setUint32(save.goblinRaid.enemy.character.barrier);
    writer.setUint8(save.goblinRaid.enemy.state);
    writer.setUint8(save.goblinRaid.enemy.attackType);
    writer.setBoolean(save.goblinRaid.enemy.enemy != undefined);
    if (save.goblinRaid.enemy.enemy != undefined)
        writer.setUint16(save.goblinRaid.enemy.enemy);
    writer.setBoolean(save.goblinRaid.enemy.goblin != undefined);
    if (save.goblinRaid.enemy.goblin != undefined) {
        writer.setString(save.goblinRaid.enemy.goblin.name),
        writer.setUint32(save.goblinRaid.enemy.goblin.hitpoints),
        writer.setUint32(save.goblinRaid.enemy.goblin.attack),
        writer.setUint32(save.goblinRaid.enemy.goblin.strength),
        writer.setUint32(save.goblinRaid.enemy.goblin.defence),
        writer.setUint32(save.goblinRaid.enemy.goblin.ranged),
        writer.setUint32(save.goblinRaid.enemy.goblin.magic),
        writer.setUint8(save.goblinRaid.enemy.goblin.attackType),
        writer.setInt8(save.goblinRaid.enemy.goblin.image),
        writer.setArray(save.goblinRaid.enemy.goblin.passives, (writer, value) => writer.setUint16(value)),
        writer.setUint32(save.goblinRaid.enemy.goblin.corruption)
    };
    writer.setBoolean(save.goblinRaid.inProgress);
    writer.setUint32(save.goblinRaid.spawnTimer.ticksLeft);
    writer.setUint32(save.goblinRaid.spawnTimer.maxTicks);
    writer.setBoolean(save.goblinRaid.spawnTimer.active);
    writer.setBoolean(save.goblinRaid.active);
    writer.setMap(save.goblinRaid.passives,
        (writer, key) => writer.setUint16(key),
        (writer, value) => writer.setBoolean(value)
    );
    writer.setMap(save.goblinRaid.playerModifiers,
        (writer, key) => writer.setUint16(key),
        (writer, value) => {
            writer.setFloat64(value[0])
            writer.setUint32(value[1]);
            var j = 2;
            for (var i = 1; i <= 256; i *= 2)
                if (value[1] & i) {
                    writer.setUint16(value[j]);
                    j += 1;
                }
        }
    );
    writer.setMap(save.goblinRaid.enemyModifiers,
        (writer, key) => writer.setUint16(key),
        (writer, value) => {
            writer.setFloat64(value[0])
            writer.setUint32(value[1]);
            var j = 2;
            for (var i = 1; i <= 256; i *= 2)
                if (value[1] & i) {
                    writer.setUint16(value[j]);
                    j += 1;
                }
        }
    );
    writer.setUint8(save.goblinRaid.state);
    writer.setUint8(save.goblinRaid.difficulty);
    writer.setArray(save.goblinRaid.bank.lockedItems, (writer, value) => writer.setUint16(value));
    writer.setArray(save.goblinRaid.bank.tabs,
        (writer, value) => writer.setMap(value, 
            (writer, key) => writer.setUint16(key),
            (writer, value) => writer.setUint32(value)
        )
    );
    writer.setMap(save.goblinRaid.bank.defaultTabs,
        (writer, key) => writer.setUint16(key),
        (writer, value) => writer.setUint8(value)
    )
    writer.setArray(save.goblinRaid.bank.sortOrder, (writer, value) => writer.setUint16(value));
    writer.setArray(save.goblinRaid.bank.glowing, (writer, value) => writer.setUint16(value));
    writer.setMap(save.goblinRaid.bank.icons,
        (writer, key) => writer.setUint8(key),
        (writer, value) => writer.setUint16(value)
    );
    writer.setUint32(save.goblinRaid.wave);
    writer.setUint32(save.goblinRaid.waveProgress);
    writer.setUint32(save.goblinRaid.killCount);
    writer.setFloat64(save.goblinRaid.start);
    writer.setArray(save.goblinRaid.ownedCrateItems, (writer, value) => writer.setUint16(value));
    writer.setMap(save.goblinRaid.randomModifiers,
        (writer, key) => writer.setUint16(key),
        (writer, value) => {
            writer.setFloat64(value[0])
            writer.setUint32(value[1]);
            var j = 2;
            for (var i = 1; i <= 256; i *= 2)
                if (value[1] & i) {
                    writer.setUint16(value[j]);
                    j += 1;
                }
        }
    );
    writer.setBoolean(save.goblinRaid.positiveModifier);
    writer.setMap(save.goblinRaid.items.weapons, 
        (writer, key) => writer.setUint16(key),
        (writer, value) => { 
            writer.setUint32(value.qty);
            writer.setBoolean(value.alt)
        }
    );
    writer.setMap(save.goblinRaid.items.armour, 
        (writer, key) => writer.setUint16(key),
        (writer, value) => { 
            writer.setUint32(value.qty);
            writer.setBoolean(value.alt)
        }
    );
    writer.setMap(save.goblinRaid.items.ammo, 
        (writer, key) => writer.setUint16(key),
        (writer, value) => { 
            writer.setUint32(value.qty);
            writer.setBoolean(value.alt)
        }
    );
    writer.setMap(save.goblinRaid.items.runes, 
        (writer, key) => writer.setUint16(key),
        (writer, value) => { 
            writer.setUint32(value.qty);
            writer.setBoolean(value.alt)
        }
    );
    writer.setMap(save.goblinRaid.items.food, 
        (writer, key) => writer.setUint16(key),
        (writer, value) => { 
            writer.setUint32(value.qty);
            writer.setBoolean(value.alt)
        }
    );
    writer.setMap(save.goblinRaid.items.passives, 
        (writer, key) => writer.setUint16(key),
        (writer, value) => { 
            writer.setUint32(value.qty);
            writer.setBoolean(value.alt)
        }
    );
    writer.setUint8(save.goblinRaid.itemCategory);
    writer.setUint8(save.goblinRaid.positiveModifiers);
    writer.setUint8(save.goblinRaid.negativeModifiers);
    writer.setBoolean(save.goblinRaid.paused);
    writer.setArray(save.goblinRaid.history, (writer, value) => {
        writer.setArray(value.skills, (writer, value) => writer.setUint32(value));
        writer.setArray(value.equipment, (writer, value) => writer.setUint16(value));
        writer.setUint32(value.ammo);
        writer.setMap(value.inventories,
            (writer, key) => writer.setUint16(key),
            (writer, value) => writer.setUint32(value)
        );
        writer.setUint16(value.food);
        writer.setUint32(value.foodQty);
        writer.setUint32(value.wave);
        writer.setUint32(value.kills);
        writer.setFloat64(value.time);
        writer.setUint32(value.coins);
        writer.setUint8(value.difficulty);
    })
    writer.setMap(save.minibar,
        (writer, key) => writer.setUint16(key),
        (writer, value) => writer.setArray(value,
            (writer, value) => writer.setUint16(value)
        )
    );
    writer.setArray(save.pets, (writer, value) => writer.setUint16(value));
    writer.setMap(save.shop.items,
        (writer, key) => writer.setUint16(key),
        (writer, value) => writer.setUint32(value)
    );
    writer.setFloat64(save.shop.purchases);
    writer.setMap(save.itemCharges,
        (writer, key) => writer.setUint16(key),
        (writer, value) => writer.setUint32(value)
    );
    writer.setBoolean(save.tutorialComplete);
    writer.setMap(save.potions.list, 
        (writer, key) => writer.setUint16(key), 
        (writer, value ) => {
            writer.setUint16(value.item);
            writer.setUint32(value.charges)
        }
    );
    writer.setArray(save.potions.reuse, (writer, value) => writer.setUint16(value));

    writer.setMap(save.stats.woodcutting,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.fishing,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.firemaking,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.cooking,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.mining,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.smithing,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.attack,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.strength,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.defence,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.hitpoints,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.theiving,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.farming,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.ranged,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.fletching,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.crafting,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.runecrafting,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.magic,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.prayer,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.slayer,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.herblore,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.agility,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.summoning,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.items,
        (writer, key) => writer.setUint16(key),
        (writer, value) => writer.setMap(value, 
            (writer, key) => writer.setUint32(key),
            (writer, value) => writer.setFloat64(value)
        )
    )
    writer.setMap(save.stats.monsters,
        (writer, key) => writer.setUint16(key),
        (writer, value) => writer.setMap(value, 
            (writer, key) => writer.setUint32(key),
            (writer, value) => writer.setFloat64(value)
        )
    )
    writer.setMap(save.stats.general,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.combat,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.goblinRaid,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.astrology,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.shop,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.township,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.cartography,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.archaeology,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.corruption,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );
    writer.setMap(save.stats.harvesting,
        (writer, key) => writer.setUint32(key),
        (writer, value) => writer.setFloat64(value)
    );

    writer.setBoolean(save.settings.continueIfBankFull);
    writer.setBoolean(save.settings.continueThievingOnStun);
    writer.setBoolean(save.settings.autoRestartDungeon);
    writer.setBoolean(save.settings.autoCloudSave);
    writer.setBoolean(save.settings.darkMode);
    writer.setBoolean(save.settings.showGPNotifications);
    writer.setBoolean(save.settings.enableAccessibility);
    writer.setBoolean(save.settings.showEnemySkillLevels);
    writer.setBoolean(save.settings.showCloseConfirmations);
    writer.setBoolean(save.settings.hideThousandsSeperator);
    writer.setBoolean(save.settings.showVirtualLevels);
    writer.setBoolean(save.settings.showSaleConfirmations);
    writer.setBoolean(save.settings.showShopConfirmations);
    writer.setBoolean(save.settings.pauseOnUnfocus);
    writer.setBoolean(save.settings.showCombatMinibar);
    writer.setBoolean(save.settings.showCombatMinibarCombat);
    writer.setBoolean(save.settings.showSkillingMinibar);
    writer.setBoolean(save.settings.useCombinationRunes);
    writer.setBoolean(save.settings.enableAutoSlayer);
    writer.setBoolean(save.settings.showItemNotifications);
    writer.setBoolean(save.settings.useSmallLevelUpNotifications);
    writer.setBoolean(save.settings.useDefaultBankBorders);
    writer.setBoolean(save.settings.defaultToCurrentEquipSet);
    writer.setBoolean(save.settings.hideMaxLevelMasteries);
    writer.setBoolean(save.settings.showMasteryCheckpointconfirmations);
    writer.setBoolean(save.settings.enableOfflinePushNotifications);
    writer.setBoolean(save.settings.enableFarmingPushNotifications);
    writer.setBoolean(save.settings.enableOfflineCombat);
    writer.setBoolean(save.settings.enableMiniSidebar);
    writer.setBoolean(save.settings.enableAutoEquipFood);
    writer.setBoolean(save.settings.enableAutoSwapFood);
    writer.setBoolean(save.settings.enablePerfectCooking);
    writer.setBoolean(save.settings.showCropDestructionConfirmations);
    writer.setBoolean(save.settings.showAstrologyMaxRollConfirmations);
    writer.setBoolean(save.settings.showQuantityInItemNotifications);
    writer.setBoolean(save.settings.showItemPreservationNotifications);
    writer.setBoolean(save.settings.showSlayerCoinNotifications);
    writer.setBoolean(save.settings.showEquipmentSetsInCombatMinibar);
    writer.setBoolean(save.settings.showBarsInCombatMinibar);
    writer.setBoolean(save.settings.showCombatStunNotifications);
    writer.setBoolean(save.settings.showCombatSleepNotifications);
    writer.setBoolean(save.settings.showSummoningMarkDiscoveryModals);
    writer.setBoolean(save.settings.enableCombatDamageSplashes);
    writer.setBoolean(save.settings.enableProgressBars);
    writer.setBoolean(save.settings.showTierIPotions);
    writer.setBoolean(save.settings.showTierIIPotions);
    writer.setBoolean(save.settings.showTierIIIPotions);
    writer.setBoolean(save.settings.showTierIVPotions);
    writer.setBoolean(save.settings.showNeutralAttackModifiers);
    writer.setUint16(save.settings.defaultPageOnLoad);
    writer.setUint8(save.settings.formatNumberSetting);
    writer.setUint8(save.settings.bankSortOrder);
    writer.setUint8(save.settings.colourBlindMode);
    writer.setBoolean(save.settings.enableEyebleachMode);
    writer.setBoolean(save.settings.enableQuickConvert);
    writer.setBoolean(save.settings.showLockedTownshipBuildings);
    writer.setBoolean(save.settings.useNewNotifications);
    writer.setUint8(save.settings.notificationHorizontalPosition);
    writer.setUint8(save.settings.notificationDisappearDelay);
    writer.setBoolean(save.settings.showItemNamesInNotifications);
    writer.setBoolean(save.settings.importanceSummoningMarkFound);
    writer.setBoolean(save.settings.importanceErrorMessages);
    writer.setBoolean(save.settings.enableScrollableBankTabs);
    writer.setBoolean(save.settings.showWikiLinks);
    writer.setBoolean(save.settings.disableHexGridOutsideSight);
    writer.setUint8(save.settings.mapTextureQuality);
    writer.setBoolean(save.settings.enableMapAntialiasing);
    writer.setBoolean(save.settings.showSkillXPNotifications);
    writer.setInt8(save.settings.backgroundImage);
    writer.setBoolean(save.settings.superDarkMode);
    writer.setBoolean(save.settings.showExpansionBackgroundColours);
    writer.setBoolean(save.settings.showCombatAreaWarnings);
    writer.setBoolean(save.settings.useCompactNotifications);
    writer.setBoolean(save.settings.useLegacyNotifications);
    writer.setBoolean(save.settings.useCat);
    writer.setBoolean(save.settings.throttleFrameRateOnInactivity);
    writer.setUint16(save.settings.cartographyFrameRateCap);
    writer.setBoolean(save.settings.toggleBirthdayEvent);
    writer.setBoolean(save.settings.toggleDiscordRPC);
    writer.setBoolean(save.settings.genericArtefactAllButOne);
    writer.setArray(save.settings.hiddenMasteryNamespaces, (writer, value) => writer.setString(value));
    writer.setBoolean(save.settings.enableDoubleClickEquip);
    writer.setBoolean(save.settings.enableDoubleClickOpen);
    writer.setBoolean(save.settings.enableDoubleClickBury);
    writer.setBoolean(save.settings.showAbyssalPiecesNotifications);
    writer.setBoolean(save.settings.showAbyssalSlayerCoinNotifications);
    writer.setBoolean(save.settings.enablePermaCorruption);
    writer.setBoolean(save.settings.showAPNextToShopSidebar);
    writer.setBoolean(save.settings.showASCNextToSlayerSidebar);
    writer.setUint8(save.settings.sidebarLevels);
    writer.setBoolean(save.settings.showAbyssalXPNotifications);
    writer.setBoolean(save.settings.showSPNextToPrayerSidebar);
    writer.setBoolean(save.settings.enableStickyBankTabs);
    writer.setBoolean(save.settings.useLegacyRealmSelection);
    writer.setBoolean(save.settings.showOpacityForSkillNavs);
    writer.setBoolean(save.settings.bankFilterShowAll);
    writer.setBoolean(save.settings.bankFilterShowDemo);
    writer.setBoolean(save.settings.bankFilterShowFull);
    writer.setBoolean(save.settings.bankFilterShowTotH);
    writer.setBoolean(save.settings.bankFilterShowAoD);
    writer.setBoolean(save.settings.bankFilterShowItA);
    writer.setBoolean(save.settings.bankFilterShowDamageReduction);
    writer.setBoolean(save.settings.bankFilterShowAbyssalResistance);
    writer.setBoolean(save.settings.bankFilterShowNormalDamage);
    writer.setBoolean(save.settings.bankFilterShowAbyssalDamage);
    writer.setBoolean(save.settings.bankFilterShowSkillXP);
    writer.setBoolean(save.settings.bankFilterShowAbyssalXP);
    writer.setBoolean(save.settings.alwaysShowRealmSelectAgility);
    writer.setBoolean(save.settings.enableSwipeSidebar);
    writer.setArray(save.news, (writer, value) => writer.setString(value));   
    writer.setString(save.lastLoadedGameVersion);
    writer.setArray(save.scheduledPushNotifications,
        (writer, value) => {
            writer.setString(value.id),
            writer.setFloat64(value.startDate),
            writer.setFloat64(value.endDate),
            writer.setUint8(value.notificationType),
            writer.setString(value.platform)
        }
    );



    writer.setMap(save.skills, 
        (writer, key) => writer.setUint16(key), 
        (writer, value, k) => {
            const skillSizeLocation = writer.offset
            writer.setUint32(0);
            writer.setFloat64(value.xp);
            writer.setBoolean(value.skillUnlocked);
            writer.setMap(value.relics,
                (writer, key) => writer.setUint16(key),
                (writer, value) => writer.setMap(value, 
                    (writer, key) => writer.setUint16(key),
                    (writer, value) => writer.setUint8(value)
                )
            );
            writer.setInt16(value.levelCap);
            writer.setInt16(value.abyssalLevelCap);
            writer.setMap(value.skillTrees,
                (writer, key) => writer.setUint16(key),
                (writer, value) => {
                    writer.setMap(value[0],
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => writer.setBoolean(value)
                    );
                    writer.setUint8(value[1])
                }
            );
            writer.setFloat64(value.abyssalXP);
            writer.setUint16(value.realm);
            const skillName = findItemFromNamespace(k);
            if (!["Attack", "Strength", "Defence", "Hitpoints", "Ranged", "Prayer", "Slayer"].includes(skillName)) {
                if (!["Township", "Corruption", "Cartography"].includes(skillName)) {
                    writer.setMap(value.mastery.actionMastery,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => writer.setFloat64(value)    
                    );
                    writer.setMap(value.mastery.masteryPool,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => writer.setFloat64(value)    
                    );
                    if (skillName != "Farming") {
                        writer.setBoolean(value.active);
                        writer.setUint32(value.timer.ticksLeft);
                        writer.setUint32(value.timer.maxTicks);
                        writer.setBoolean(value.timer.active);
                    }
                }
                if (["Herblore", "Crafting", "Runecrafting", "Smithing"].includes(skillName)) {
                    writer.setBoolean(value.skillSpecific.recipe != undefined);
                    if (value.skillSpecific.recipe != undefined)
                        writer.setUint16(value.skillSpecific.recipe);
                } else if (skillName == "Archaeology") {
                    writer.setBoolean(value.skillSpecific.digsite != undefined);
                    if (value.skillSpecific.digsite != undefined)
                        writer.setUint16(value.skillSpecific.digsite);
                    writer.setMap(value.skillSpecific.digsites,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => {
                            writer.setArray(value.maps,
                                (writer, value) => {
                                    writer.setUint32(value.upgradeActions);
                                    writer.setUint32(value.charges);
                                    writer.setUint16(value.artefactValuesTiny);
                                    writer.setUint16(value.artefactValuesSmall);
                                    writer.setUint16(value.artefactValuesMedium);
                                    writer.setUint16(value.artefactValuesLarge);
                                    writer.setMap(value.refinements, 
                                        (writer, key) => writer.setUint16(key),
                                        (writer, value) => {
                                            writer.setFloat64(value[0]);
                                            writer.setUint32(value[1]);
                                            var j = 2
                                            for (var i = 1; i <= 256; i *= 2)
                                                if (value[1] & i) {
                                                    writer.setUint16(value[j]);
                                                    j += 1;
                                                }
                                        }
                                    )
                                }
                            );
                            writer.setInt8(value.selectedMap);
                            writer.setArray(value.selectedTools, (writer, value) => writer.setUint16(value));
                            writer.setUint8(value.selectedUpgrade);
                        }
                    ),
                    writer.setMap(value.skillSpecific.museum.items,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => writer.setBoolean(value)
                    );
                    writer.setArray(value.skillSpecific.museum.donated, (writer, value) => writer.setUint16(value));
                    writer.setArray(value.skillSpecific.hiddenDigsites, (writer, value) => writer.setUint16(value));
                } else if (skillName == "Agility") {
                    writer.setInt16(value.skillSpecific.activeObstacle),
                    writer.setMap(value.skillSpecific.obstacleBuildCount,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => writer.setUint32(value)
                    ),
                    writer.setMap(value.skillSpecific.course,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => {
                            writer.setMap(value.builtObstacles,
                                (writer, key) => writer.setUint8(key),
                                (writer, value) => writer.setUint16(value)
                            ),
                            writer.setMap(value.builtPillars,
                                (writer, key) => writer.setUint8(key),
                                (writer, value) => writer.setUint16(value)
                            ),
                            writer.setMap(value.blueprints,
                                (writer, key) => writer.setUint8(key),
                                (writer, value) => {
                                    writer.setString(value.name),
                                    writer.setMap(value.obstacles,
                                        (writer, key) => writer.setUint8(key),
                                        (writer, value) => writer.setUint16(value)
                                    ),
                                    writer.setMap(value.pillars,
                                        (writer, key) => writer.setUint8(key),
                                        (writer, value) => writer.setUint16(value)
                                    )
                                }
                            )
                        }
                    )
                } else if (skillName == "Magic") {
                    writer.setBoolean(value.skillSpecific.spell != undefined);
                    if (value.skillSpecific.spell != undefined)
                        writer.setUint16(value.skillSpecific.spell);
                    writer.setBoolean(value.skillSpecific.conversionItem != undefined);
                    if (value.skillSpecific.conversionItem != undefined)
                        writer.setUint16(value.skillSpecific.conversionItem);
                    writer.setBoolean(value.skillSpecific.selectedRecipe != undefined);
                    if (value.skillSpecific.selectedRecipe != undefined)
                        writer.setUint16(value.skillSpecific.selectedRecipe);
                } else if (skillName == "Astrology") {
                    writer.setBoolean(value.skillSpecific.studied != undefined);
                    if (value.skillSpecific.studied != undefined)
                        writer.setUint16(value.skillSpecific.studied);
                    writer.setBoolean(value.skillSpecific.explored != undefined);
                    if (value.skillSpecific.explored != undefined)
                        writer.setUint16(value.skillSpecific.explored);
                    writer.setArray(value.skillSpecific.actions,
                        (writer, value) => {
                            writer.setUint16(value.recipie),
                            writer.setArray(value.standardModsBought, (writer, value) => writer.setUint8(value)),
                            writer.setArray(value.uniqueModsBought, (writer, value) => writer.setUint8(value)),
                            writer.setArray(value.abyssalModsBought, (writer, value) => writer.setUint8(value))
                        }
                    ),
                    writer.setArray(value.skillSpecific.dummyRecipies,
                        (writer, value) => {
                            writer.setUint16(value.recipie),
                            writer.setArray(value.standardModsBought, (writer, value) => writer.setUint8(value)),
                            writer.setArray(value.uniqueModsBought, (writer, value) => writer.setUint8(value)),
                            writer.setArray(value.abyssalModsBought, (writer, value) => writer.setUint8(value))
                        }
                    )
                } else if (skillName == "Cartography") {
                    writer.setMap(value.skillSpecific.worldMaps,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => {
                            writer.setMap(value.worldMap,
                                (writer, key) => writer.setInt16(key),
                                (writer, value) => writer.setMap(value,
                                    (writer, key) => writer.setInt16(key),
                                    (writer, value) => writer.setFloat64(value)
                                )
                        
                            );
                            writer.setInt16(value.position[0]);
                            writer.setInt16(value.position[1]);
                            writer.setArray(value.filterSettings.markerSettings, (writer, value) => writer.setBoolean(value));
                            writer.setArray(value.filterSettings.hiddenFastTravelGroups, (writer, value) => writer.setUint16(value));
                            writer.setMap(value.pois,
                                (writer, key) => writer.setUint16(key),
                                (writer, value) => {
                                        writer.setBoolean(value.discovered);
                                        writer.setUint8(value.fastTravelUnlocked);
                                        writer.setUint8(value.discoveryMovesLeft);
                                        writer.setUint16(value.surveyOrder);
                                }
                            ),
                            writer.setMap(value.bonus,
                                (writer, key) => writer.setUint16(key),
                                (writer, value) => writer.setBoolean(value)
                            )
                        }
                    );
                    writer.setBoolean(value.active);
                    writer.setUint8(value.skillSpecific.actionMode);
                    writer.setUint32(value.timer.ticksLeft);
                    writer.setUint32(value.timer.maxTicks);
                    writer.setBoolean(value.timer.active);
                    writer.setBoolean(value.skillSpecific.map != undefined);
                    if (value.skillSpecific.map != undefined) {
                        writer.setUint16(value.skillSpecific.map.activeMap);
                        writer.setArray(value.skillSpecific.map.surveyQueue, 
                            (writer, value) => {
                                writer.setInt16(value[0]);
                                writer.setInt16(value[1])
                            }
                        );
                        writer.setBoolean(value.skillSpecific.map.autoSurvey != undefined)
                        if (value.skillSpecific.map.autoSurvey != undefined) {
                            writer.setInt16(value.skillSpecific.map.autoSurvey[0]);
                            writer.setInt16(value.skillSpecific.map.autoSurvey[1]);
                        }
                    }
                    writer.setBoolean(value.skillSpecific.event != undefined);
                    if (value.skillSpecific.event != undefined)
                        writer.setUint16(value.skillSpecific.event);
                    writer.setBoolean(value.skillSpecific.paperRecipe != undefined);
                    if (value.skillSpecific.paperRecipe != undefined)
                        writer.setUint16(value.skillSpecific.paperRecipe);
                    writer.setBoolean(value.skillSpecific.digSite != undefined);
                    if (value.skillSpecific.digSite != undefined)
                        writer.setUint16(value.skillSpecific.digSite);
                } else if (skillName == "Cooking") {
                    writer.setMap(value.skillSpecific.selectedRecipies,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => writer.setUint16(value)
                    );
                    writer.setMap(value.skillSpecific.passiveCookTimers,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => {
                            writer.setUint32(value.ticksLeft);
                            writer.setUint32(value.maxTicks);
                            writer.setBoolean(value.active);
                        }
                    );
                    writer.setMap(value.skillSpecific.stockpileItems,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => {
                            writer.setUint16(value.item);
                            writer.setInt32(value.qty);
                        }
                    );
                    if (value.active)
                        writer.setUint16(value.skillSpecific.activeCategory);
                } else if (skillName == "Farming") {
                    writer.setMap(value.skillSpecific.plots,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => {
                            writer.setUint8(value.state),
                            writer.setBoolean(value.planted != undefined)
                            if (value.planted != undefined)
                                writer.setUint16(value.planted);
                            writer.setBoolean(value.compost != undefined)
                            if (value.compost != undefined)
                                writer.setUint16(value.compost);
                            writer.setUint8(value.compostLevel),
                            writer.setBoolean(value.selected != undefined)
                            if (value.selected != undefined)
                                writer.setUint16(value.selected);
                            writer.setFloat64(value.growthTime);
                        }
                    );
                    writer.setMap(value.skillSpecific.dummyPlots,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => {
                            writer.setUint8(value.state),
                            writer.setBoolean(value.planted != undefined)
                            if (value.planted != undefined)
                                writer.setUint16(value.planted);
                            writer.setBoolean(value.compost != undefined)
                            if (value.compost != undefined)
                                writer.setUint16(value.compost);
                            writer.setUint8(value.compostLevel),
                            writer.setBoolean(value.selected != undefined)
                            if (value.selected != undefined)
                                writer.setUint16(value.selected);
                            writer.setFloat64(value.growthTime);
                        }
                    );
                    writer.setArray(value.skillSpecific.growthTimers,
                        (writer, value) => {
                            writer.setUint32(value.ticksLeft);
                            writer.setUint32(value.maxTicks);
                            writer.setBoolean(value.active);
                        }
                    );
                } else if (skillName == "Firemaking") {
                    writer.setUint32(value.skillSpecific.bonfireTimer.ticksLeft);
                    writer.setUint32(value.skillSpecific.bonfireTimer.maxTicks);
                    writer.setBoolean(value.skillSpecific.bonfireTimer.active);
                    writer.setBoolean(value.skillSpecific.recipe != undefined);
                    if (value.skillSpecific.recipe != undefined)
                        writer.setUint16(value.skillSpecific.recipe);
                    writer.setBoolean(value.skillSpecific.bonfireRecipe != undefined);
                    if (value.skillSpecific.bonfireRecipe != undefined)
                        writer.setUint16(value.skillSpecific.bonfireRecipe);
                    writer.setUint32(value.skillSpecific.oilTimer.ticksLeft);
                    writer.setUint32(value.skillSpecific.oilTimer.maxTicks);
                    writer.setBoolean(value.skillSpecific.oilTimer.active);
                    writer.setBoolean(value.skillSpecific.oiledLogRecipe != undefined);
                    if (value.skillSpecific.oiledLogRecipe != undefined)
                        writer.setUint16(value.skillSpecific.oiledLogRecipe);
                    writer.setBoolean(value.skillSpecific.oilRecipe != undefined);
                    if (value.skillSpecific.oilRecipe != undefined)
                        writer.setUint16(value.skillSpecific.oilRecipe);
                } else if (skillName == "Fishing") {
                    writer.setBoolean(value.skillSpecific.secretAreaUnlocked);
                    if (value.active)
                        writer.setUint16(value.skillSpecific.area);
                    writer.setMap(value.skillSpecific.selectedAreaFish,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => writer.setUint16(value)
                    );
                    writer.setArray(value.skillSpecific.hiddenAreas, (writer, value) => writer.setUint16(value));
                    writer.setBoolean(value.skillSpecific.contest != undefined);
                    if (value.skillSpecific.contest != undefined) {
                        writer.setArray(value.skillSpecific.contest.completion, (writer, value) => writer.setBoolean(value));
                        writer.setArray(value.skillSpecific.contest.mastery, (writer, value) => writer.setBoolean(value));
                    }
                } else if (skillName == "Fletching") {
                    writer.setBoolean(value.skillSpecific.recipe != undefined);
                    if (value.skillSpecific.recipe != undefined)
                        writer.setUint16(value.skillSpecific.recipe);
                    writer.setMap(value.skillSpecific.altRecipies,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => writer.setUint16(value)
                    )
                } else if (skillName == "Summoning") {
                    writer.setBoolean(value.skillSpecific.recipe != undefined);
                    if (value.skillSpecific.recipe != undefined)
                        writer.setUint16(value.skillSpecific.recipe);
                    writer.setMap(value.skillSpecific.selectedNonShardCosts,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => writer.setUint16(value)
                    );
                    writer.setMap(value.skillSpecific.marksUnlocked,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => writer.setUint8(value)
                    );
                } else if (skillName == "Thieving") {
                    writer.setUint32(value.skillSpecific.stunTimer.ticksLeft);
                    writer.setUint32(value.skillSpecific.stunTimer.maxTicks);
                    writer.setBoolean(value.skillSpecific.stunTimer.active);
                    if (value.active)
                        writer.setUint16(value.skillSpecific.area);
                    if (value.active)
                        writer.setUint16(value.skillSpecific.npc);
                    writer.setArray(value.skillSpecific.hiddenAreas, (writer, value) => writer.setUint16(value));
                    writer.setUint8(value.skillSpecific.stunState);
                } else if (skillName == "Township") {
                    writer.setUint16(value.skillSpecific.townData.worship);
                    writer.setBoolean(value.skillSpecific.townData.created);
                    writer.setInt16(value.skillSpecific.townData.seasonTicksRemaining);
                    writer.setBoolean(value.skillSpecific.townData.season != undefined);
                    if (value.skillSpecific.townData.season != undefined)
                        writer.setUint16(value.skillSpecific.townData.season);
                    writer.setBoolean(value.skillSpecific.townData.previousSeason != undefined);
                    if (value.skillSpecific.townData.previousSeason != undefined)
                        writer.setUint16(value.skillSpecific.townData.previousSeason);
                    writer.setInt8(value.skillSpecific.townData.health);
                    writer.setInt32(value.skillSpecific.townData.souls);
                    writer.setInt16(value.skillSpecific.townData.abyssalWaveTicksRemaining);
                    writer.setMap(value.skillSpecific.resources,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => {
                            writer.setFloat64(value.qty);
                            writer.setUint8(value.cap);
                        }
                    );
                    writer.setMap(value.skillSpecific.dummyResources,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => {
                            writer.setFloat64(value.qty);
                            writer.setUint8(value.cap);
                        }
                    );
                    writer.setMap(value.skillSpecific.biomes,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => {
                            writer.setMap(value.buildingsBuilt,
                                (writer, key) => writer.setUint16(key),
                                (writer, value) => writer.setUint32(value)
                            );
                            writer.setMap(value.buildingEfficiency,
                                (writer, key) => writer.setUint16(key),
                                (writer, value) => writer.setUint32(value)
                            );
                        }
                    );
                    writer.setMap(value.skillSpecific.dummyBiomes,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => {
                            writer.setMap(value.buildingsBuilt,
                                (writer, key) => writer.setUint16(key),
                                (writer, value) => writer.setUint32(value)
                            );
                            writer.setMap(value.buildingEfficiency,
                                (writer, key) => writer.setUint16(key),
                                (writer, value) => writer.setUint32(value)
                            );
                        }
                    );
                    writer.setUint32(value.skillSpecific.legacyTicks);
                    writer.setUint32(value.skillSpecific.totalTicks);
                    writer.setArray(value.skillSpecific.tasksCompleted, (writer, value) => writer.setUint16(value));
                    writer.setBoolean(value.skillSpecific.townshipConverted);
                    writer.setUint32(value.skillSpecific.casualTasks.completed);
                    writer.setMap(value.skillSpecific.casualTasks.currentCasualTasks,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => writer.setArray(value, (writer, value) => writer.setFloat64(value))
                    );
                    writer.setUint32(value.skillSpecific.casualTasks.newTaskTimer.ticksLeft);
                    writer.setUint32(value.skillSpecific.casualTasks.newTaskTimer.maxTicks);
                    writer.setBoolean(value.skillSpecific.casualTasks.newTaskTimer.active);
                    writer.setUint32(value.skillSpecific.tickTimer.ticksLeft);
                    writer.setUint32(value.skillSpecific.tickTimer.maxTicks);
                    writer.setBoolean(value.skillSpecific.tickTimer.active);
                    writer.setBoolean(value.skillSpecific.displayReworkNotification);
                    writer.setFloat64(value.skillSpecific.gpRefunded);
                    writer.setUint32(value.skillSpecific.abyssalWaveTimer.ticksLeft);
                    writer.setUint32(value.skillSpecific.abyssalWaveTimer.maxTicks);
                    writer.setBoolean(value.skillSpecific.abyssalWaveTimer.active);
                } else if (skillName == "Woodcutting") {
                    writer.setArray(value.skillSpecific.activeTrees, (writer, value) => writer.setUint16(value));
                } else if (skillName == "Mining") {
                    if (value.active)
                        writer.setUint16(value.skillSpecific.selectedRock);
                    writer.setMap(value.skillSpecific.rocks,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => {
                                writer.setBoolean(value.isRespawning);
                                writer.setUint32(value.currentHP);
                                writer.setUint32(value.maxHP);
                        }
                    );
                    writer.setMap(value.skillSpecific.rockRespawnTimers,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => {
                                writer.setUint32(value.ticksLeft);
                                writer.setUint32(value.maxTicks);
                                writer.setBoolean(value.active);
                        }
                    );
                    writer.setUint32(value.skillSpecific.passiveRegenTimer.ticksLeft);
                    writer.setUint32(value.skillSpecific.passiveRegenTimer.maxTicks);
                    writer.setBoolean(value.skillSpecific.passiveRegenTimer.active);
                } else if (skillName == "Corruption") {
                    writer.setMap(value.skillSpecific.corruptionEffects,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => writer.setBoolean(value)
                    );
                    writer.setArray(value.skillSpecific.corruptionUnlockedRows, (writer, value) => writer.setUint16(value));
                } else if (skillName == "Harvesting") {
                    if (value.active)
                        writer.setUint16(value.skillSpecific.selectedVein);
                    writer.setMap(value.skillSpecific.veins,
                        (writer, key) => writer.setUint16(key),
                        (writer, value) => {
                            writer.setUint32(value.currentIntensity);
                            writer.setUint32(value.maxIntensity);
                        }
                    );
                    writer.setUint32(value.skillSpecific.veinDecayTimer.ticksLeft);
                    writer.setUint32(value.skillSpecific.veinDecayTimer.maxTicks);
                    writer.setBoolean(value.skillSpecific.veinDecayTimer.active);
                }
            }
            if (value.excessData != undefined)
                writer.setFixedLengthBuffer(new Uint8Array(value.excessData));
            writer.dataView.setUint32(skillSizeLocation, writer.offset - skillSizeLocation - 4);
        }
    );
    writer.setMap(save.mods,
        (writer, key) => writer.setUint32(key),
        (writer, value) => {
            writer.setString(value.settings),
            writer.setString(value.storage)
        }
    );
    writer.setString(save.completion.completion);
    writer.setMap(save.settings.keyBindings,
        (writer, key) => writer.setUint16(key),
        (writer, value) => writer.setArray(value,
            (writer, value) => {
                writer.setBoolean(true)
                writer.setString(value.key);
                writer.setBoolean(value.alt);
                writer.setBoolean(value.ctrl);
                writer.setBoolean(value.meta);
                writer.setBoolean(value.shift);
            }
        )
    );
    writer.setArray(save.completion.birthdayCompletions, (writer, value) => writer.setBoolean(value));
    writer.setInt8(save.completion.clueHuntStep);
    
    writer.setMap(save.currencies,
        (writer, key) => writer.setUint16(key),
        (writer, value) => {
            writer.setFloat64(value.qty),
            writer.setMap(value.stats,
                (writer, key) => writer.setUint32(key),
                (writer, value) => writer.setFloat64(value)
            ),
            writer.setMap(value.currencySkills,
                (writer, key) => writer.setUint16(key),
                (writer, value) => writer.setMap(value,
                    (writer, key) => writer.setUint32(key),
                    (writer, value) => writer.setFloat64(value)
                )
            )
        }
    )
    writer.setMap(save.completion.areaCompletions,
        (writer, key) => writer.setUint16(key),
        (writer, value) => writer.setUint32(value)
    );
    writer.setMap(save.completion.strongholdCompletions,
        (writer, key) => writer.setUint16(key),
        (writer, value) => writer.setUint32(value)
    );
    writer.setMap(save.levelCapIncreases.increases,
        (writer, key) => writer.setUint16(key),
        (writer, value) => {
            writer.setArray(value.given, (writer,value) => writer.setUint16(value));
            writer.setArray(value.increases, (writer, value) => writer.setUint16(value))
        }
    );
    writer.setArray(save.levelCapIncreases.selected, (writer, value) => writer.setUint16(value));
    writer.setUint16(save.levelCapIncreases.bought);
    writer.setUint16(save.levelCapIncreases.abyssalBought);
    writer.setUint16(save.realm);
    writer.dataView.setUint32(bodySizeLocation, writer.offset - bodySizeLocation - 4);
    return writer.generateSaveString();
}