/**
 * THE CAT WAR - Faction Definitions & Bonuses
 * Defines all 5 cat factions with unique colors, bonuses, AI personalities, and lore.
 */
window.CatWar = window.CatWar || {};

(function () {
    'use strict';

    // ── Faction IDs ──────────────────────────────────────────────────────
    const FACTION_IDS = {
        LION: 'lion',
        SIAMESE: 'siamese',
        MAINE_COON: 'maine_coon',
        BLACK_CAT: 'black_cat',
        PERSIAN: 'persian'
    };

    // ── Faction Data ─────────────────────────────────────────────────────
    const FACTION_DATA = {
        [FACTION_IDS.LION]: {
            id: FACTION_IDS.LION,
            name: 'Lion Cats',
            shortName: 'Lion',
            colors: {
                primary: '#DAA520',
                secondary: '#8B0000'
            },
            icon: '🦁',
            lore: 'The proud Lion Cats rule from their golden fortress. Their warriors are the fiercest in all the kingdoms.',
            strengths: ['Melee combat', 'Early aggression'],
            bonuses: {
                meleeDamage: 1.20,      // +20% melee damage
                unitHP: 1.15,           // +15% unit HP
                rangedDamage: 1.0,
                unitSpeed: 1.0,
                siegeDamage: 1.0,
                buildingHP: 1.0,
                gatherRate: 1.0,
                unitCost: 1.0,
                rangeBonus: 0,
                stealthRange: 0,
                firstStrikeDamage: 1.0,
                scoutSpeedBonus: 1.0,   // No scout bonus
                freeScouts: 0           // No free scouts at start
            },
            personality: {
                type: 'aggressive',
                description: 'Aggressive, early rushes',
                rushTiming: 'early',           // 5-minute first attack
                armyThreshold: 6,              // Attacks with fewer units
                retreatThreshold: 0.25,        // Retreats later (brave)
                preferredUnits: ['knight', 'swordsman'],
                economyTarget: 4,              // Fewer peasants
                expansionPriority: 0.3,
                aggressionLevel: 0.9,
                scoutFrequency: 15000          // ms between scouts
            }
        },

        [FACTION_IDS.SIAMESE]: {
            id: FACTION_IDS.SIAMESE,
            name: 'Siamese Cats',
            shortName: 'Siamese',
            colors: {
                primary: '#4682B4',
                secondary: '#C0C0C0'
            },
            icon: '🐱',
            lore: 'Swift and cunning, the Siamese Cats strike like lightning and vanish before the enemy can react.',
            strengths: ['Speed', 'Ranged combat'],
            bonuses: {
                meleeDamage: 1.0,
                unitHP: 1.0,
                rangedDamage: 1.0,
                unitSpeed: 1.30,            // +30% unit speed
                siegeDamage: 1.0,
                buildingHP: 1.0,
                gatherRate: 1.0,
                unitCost: 1.0,
                rangeBonus: 2,              // +2 range for ranged units
                stealthRange: 0,
                firstStrikeDamage: 1.0,
                scoutSpeedBonus: 1.20,  // +20% scout speed (4.2 instead of 3.5)
                freeScouts: 1           // Starts with 1 free Scout Cat
            },
            personality: {
                type: 'harasser',
                description: 'Harassing, hit-and-run',
                rushTiming: 'mid',
                armyThreshold: 8,
                retreatThreshold: 0.45,        // Retreats earlier (preserve units)
                preferredUnits: ['archer', 'crossbowman'],
                economyTarget: 5,
                expansionPriority: 0.5,
                aggressionLevel: 0.6,
                scoutFrequency: 10000
            }
        },

        [FACTION_IDS.MAINE_COON]: {
            id: FACTION_IDS.MAINE_COON,
            name: 'Maine Coon Cats',
            shortName: 'Maine Coon',
            colors: {
                primary: '#2E8B57',
                secondary: '#8B4513'
            },
            icon: '🐈',
            lore: 'The mighty Maine Coons build impregnable fortresses and crush their foes with devastating siege weapons.',
            strengths: ['Defense', 'Siege'],
            bonuses: {
                meleeDamage: 1.0,
                unitHP: 1.0,
                rangedDamage: 1.0,
                unitSpeed: 1.0,
                siegeDamage: 1.25,          // +25% siege damage
                buildingHP: 1.20,          // +20% building HP
                gatherRate: 1.0,
                unitCost: 1.0,
                rangeBonus: 0,
                stealthRange: 0,
                firstStrikeDamage: 1.0,
                scoutSpeedBonus: 1.0,
                freeScouts: 0
            },
            personality: {
                type: 'defensive',
                description: 'Defensive, late-game powerhouse',
                rushTiming: 'late',
                armyThreshold: 15,             // Waits for big army
                retreatThreshold: 0.35,
                preferredUnits: ['catapult', 'swordsman', 'shieldbearer'],
                economyTarget: 7,
                expansionPriority: 0.7,
                aggressionLevel: 0.3,
                scoutFrequency: 20000
            }
        },

        [FACTION_IDS.BLACK_CAT]: {
            id: FACTION_IDS.BLACK_CAT,
            name: 'Black Cat Kingdom',
            shortName: 'Black Cat',
            colors: {
                primary: '#6A0DAD',
                secondary: '#1C1C1C'
            },
            icon: '🐈‍⬛',
            lore: 'The shadowy Black Cat Kingdom moves unseen through the night. Their enemies never hear the final meow.',
            strengths: ['Stealth', 'Ambush'],
            bonuses: {
                meleeDamage: 1.0,
                unitHP: 1.0,
                rangedDamage: 1.0,
                unitSpeed: 1.0,
                siegeDamage: 1.0,
                buildingHP: 1.0,
                gatherRate: 1.0,
                unitCost: 1.0,
                rangeBonus: 0,
                stealthRange: 4,              // Invisible beyond 4 tiles
                firstStrikeDamage: 1.20,      // +20% first-strike damage
                scoutSpeedBonus: 1.0,
                freeScouts: 0
            },
            personality: {
                type: 'sneaky',
                description: 'Sneaky, guerrilla warfare, ambush tactics',
                rushTiming: 'mid',
                armyThreshold: 5,              // Small raiding parties
                retreatThreshold: 0.40,
                preferredUnits: ['assassin', 'archer', 'swordsman'],
                economyTarget: 5,
                expansionPriority: 0.4,
                aggressionLevel: 0.7,
                scoutFrequency: 8000           // Frequent scouting
            }
        },

        [FACTION_IDS.PERSIAN]: {
            id: FACTION_IDS.PERSIAN,
            name: 'Persian Cat Empire',
            shortName: 'Persian',
            colors: {
                primary: '#FFFFF0',
                secondary: '#FFD700'
            },
            icon: '👑',
            lore: 'The wealthy Persian Empire crushes opposition through sheer economic might and endless armies.',
            strengths: ['Economy', 'Numbers'],
            bonuses: {
                meleeDamage: 1.0,
                unitHP: 1.0,
                rangedDamage: 1.0,
                unitSpeed: 1.0,
                siegeDamage: 1.0,
                buildingHP: 1.0,
                gatherRate: 1.30,           // +30% resource gather rate
                unitCost: 0.85,             // -15% unit costs
                rangeBonus: 0,
                stealthRange: 0,
                firstStrikeDamage: 1.0,
                scoutSpeedBonus: 1.0,
                freeScouts: 0
            },
            personality: {
                type: 'economic',
                description: 'Economic boom, overwhelming numbers',
                rushTiming: 'late',
                armyThreshold: 20,             // Overwhelm with numbers
                retreatThreshold: 0.30,
                preferredUnits: ['swordsman', 'archer', 'spearman'],
                economyTarget: 10,             // Many peasants
                expansionPriority: 0.9,
                aggressionLevel: 0.4,
                scoutFrequency: 18000
            }
        }
    };

    // ── Faction list for iteration ───────────────────────────────────────
    const FACTION_LIST = Object.values(FACTION_DATA);

    // ── Public API ───────────────────────────────────────────────────────

    /**
     * Get the bonus multiplier for a specific stat type for a faction.
     * @param {string} factionId - The faction identifier.
     * @param {string} statType - The stat type (e.g., 'meleeDamage', 'unitHP').
     * @returns {number} The multiplier value (1.0 = no bonus).
     */
    function getFactionBonus(factionId, statType) {
        const faction = FACTION_DATA[factionId];
        if (!faction) {
            console.warn(`[Factions] Unknown faction: ${factionId}`);
            return 1.0;
        }
        const value = faction.bonuses[statType];
        if (value === undefined) {
            return 1.0;
        }
        return value;
    }

    /**
     * Apply faction bonuses to a unit's stats in-place.
     * Should be called after unit creation to modify base stats.
     * @param {object} unit - The unit object with stats to modify.
     *   Expected properties: factionId, hp, maxHp, damage, speed, range,
     *   damageType ('melee'|'ranged'|'siege'), isFirstStrike.
     * @returns {object} The same unit, with stats modified.
     */
    function applyFactionBonuses(unit) {
        if (!unit || !unit.factionId) return unit;

        const faction = FACTION_DATA[unit.factionId];
        if (!faction) return unit;

        const b = faction.bonuses;

        // HP bonus
        if (unit.maxHp != null) {
            unit.maxHp = Math.round(unit.maxHp * b.unitHP);
            unit.hp = unit.maxHp; // Full HP on spawn
        }

        // Damage bonus based on type
        if (unit.damage != null) {
            if (unit.damageType === 'melee') {
                unit.damage = Math.round(unit.damage * b.meleeDamage);
            } else if (unit.damageType === 'ranged') {
                unit.damage = Math.round(unit.damage * b.rangedDamage);
            } else if (unit.damageType === 'siege') {
                unit.damage = Math.round(unit.damage * b.siegeDamage);
            }
        }

        // Speed bonus
        if (unit.speed != null) {
            unit.speed = unit.speed * b.unitSpeed;
        }

        // Scout-specific speed bonus (stacks with general speed)
        if (unit.type === 'scout' && unit.speed != null && b.scoutSpeedBonus > 1.0) {
            unit.speed = unit.speed * b.scoutSpeedBonus;
        }

        // Range bonus (for ranged units)
        if (unit.range != null && unit.damageType === 'ranged') {
            unit.range += b.rangeBonus;
        }

        // Stealth
        if (b.stealthRange > 0) {
            unit.stealthRange = b.stealthRange;
            unit.isStealthed = true;
        }

        // First-strike bonus
        if (b.firstStrikeDamage > 1.0) {
            unit.firstStrikeDamage = b.firstStrikeDamage;
            unit.hasFirstStrike = true;
        }

        return unit;
    }

    /**
     * Apply faction bonuses to a building's stats in-place.
     * @param {object} building - The building object.
     *   Expected properties: factionId, hp, maxHp.
     * @returns {object} The same building, with stats modified.
     */
    function applyFactionBuildingBonuses(building) {
        if (!building || !building.factionId) return building;

        const faction = FACTION_DATA[building.factionId];
        if (!faction) return building;

        if (building.maxHp != null) {
            building.maxHp = Math.round(building.maxHp * faction.bonuses.buildingHP);
            building.hp = building.maxHp;
        }

        return building;
    }

    /**
     * Get the cost of a unit after faction modifiers.
     * @param {string} factionId - The faction identifier.
     * @param {object} baseCost - Base cost object, e.g. {gold: 50, food: 20}.
     * @returns {object} Modified cost object.
     */
    function getModifiedCost(factionId, baseCost) {
        const multiplier = getFactionBonus(factionId, 'unitCost');
        const modified = {};
        for (const resource in baseCost) {
            modified[resource] = Math.round(baseCost[resource] * multiplier);
        }
        return modified;
    }

    /**
     * Get the gather rate multiplier for a faction.
     * @param {string} factionId - The faction identifier.
     * @returns {number} Gather rate multiplier.
     */
    function getGatherRateMultiplier(factionId) {
        return getFactionBonus(factionId, 'gatherRate');
    }

    /**
     * Get faction primary and secondary colors.
     * @param {string} factionId - The faction identifier.
     * @returns {{ primary: string, secondary: string }|null} Color pair or null.
     */
    function getFactionColor(factionId) {
        const faction = FACTION_DATA[factionId];
        if (!faction) {
            console.warn(`[Factions] Unknown faction for color: ${factionId}`);
            return null;
        }
        return { ...faction.colors };
    }

    /**
     * Get all data for a faction.
     * @param {string} factionId - The faction identifier.
     * @returns {object|null} Full faction data object or null.
     */
    function getFactionInfo(factionId) {
        const faction = FACTION_DATA[factionId];
        if (!faction) {
            console.warn(`[Factions] Unknown faction: ${factionId}`);
            return null;
        }
        // Return a shallow copy to prevent external mutation
        return { ...faction };
    }

    /**
     * Get the AI personality profile for a faction.
     * @param {string} factionId - The faction identifier.
     * @returns {object|null} Personality config or null.
     */
    function getFactionPersonality(factionId) {
        const faction = FACTION_DATA[factionId];
        if (!faction) return null;
        return { ...faction.personality };
    }

    /**
     * Get the ordered list of all factions.
     * @returns {object[]} Array of faction data objects.
     */
    function getAllFactions() {
        return FACTION_LIST.map(f => ({ ...f }));
    }

    // ── Export ────────────────────────────────────────────────────────────
    CatWar.Factions = {
        IDS: FACTION_IDS,
        getFactionBonus,
        applyFactionBonuses,
        applyFactionBuildingBonuses,
        getModifiedCost,
        getGatherRateMultiplier,
        getFactionColor,
        getFactionInfo,
        getFactionPersonality,
        getAllFactions
    };

})();
