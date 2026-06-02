/*******************************************************************************
 * units.js — The Cat War: Unit Type Definitions & Factory
 *
 * Provides:
 *   CatWar.Units.createUnit(type, x, y, faction) — factory
 *   CatWar.Units.UNIT_DEFS — stat definitions for every unit type
 *
 * Depends on: entities.js
 ******************************************************************************/

window.CatWar = window.CatWar || {};

CatWar.Units = (function () {
  'use strict';

  /* ========================================================================
   *  UNIT DEFINITIONS — stats for every type
   *  Any Config overrides would be merged on top if CatWar.Config exists.
   * ====================================================================== */

  var UNIT_DEFS = {
    HEAD_MINER: {
      hp: 50,
      damage: 4,
      speed: 50,
      range: 32,
      armor: 1,
      attackCooldown: 1.5,
      cost: { gold: 0, wood: 0, stone: 0, food: 0 },
      trainTime: 0,        // unique unit, not trained normally
      width: 26,
      height: 26,
      isRanged: false,
      gatherRateMultiplier: 1.5,  // 50% faster gathering
      gatherDuration: 2,
      carryCapacity: 15,
      canGather: true,
      canBuild: true
    },

    PEASANT: {
      hp: 30,
      damage: 3,
      speed: 55,
      range: 32,
      armor: 0,
      attackCooldown: 1.5,
      cost: { gold: 0, wood: 0, stone: 0, food: 0 },
      trainTime: 15,
      width: 24,
      height: 24,
      isRanged: false,
      gatherRateMultiplier: 1.0,
      gatherDuration: 3,
      carryCapacity: 10,
      canGather: true,
      canBuild: true
    },

    SWORDSCAT: {
      hp: 60,
      damage: 8,
      speed: 55,
      range: 32,
      armor: 3,
      attackCooldown: 1.2,
      cost: { gold: 50, wood: 20, stone: 0, food: 10 },
      trainTime: 20,
      width: 24,
      height: 24,
      isRanged: false
    },

    SPEARCAT: {
      hp: 50,
      damage: 7,
      speed: 60,
      range: 40,
      armor: 2,
      attackCooldown: 1.4,
      cost: { gold: 40, wood: 30, stone: 0, food: 10 },
      trainTime: 18,
      width: 24,
      height: 24,
      isRanged: false,
      bonusDamageVs: { CAVALRY: 2.0 }   // 2x damage vs cavalry
    },

    ARCHER: {
      hp: 35,
      damage: 6,
      speed: 55,
      range: 6 * 32,  // 6 tiles
      armor: 1,
      attackCooldown: 1.8,
      cost: { gold: 60, wood: 40, stone: 0, food: 10 },
      trainTime: 22,
      width: 24,
      height: 24,
      isRanged: true,
      projectileType: 'ARROW'
    },

    CROSSBOW: {
      hp: 45,
      damage: 10,
      speed: 50,
      range: 5 * 32,  // 5 tiles
      armor: 2,
      attackCooldown: 2.5,
      cost: { gold: 80, wood: 30, stone: 10, food: 10 },
      trainTime: 25,
      width: 24,
      height: 24,
      isRanged: true,
      projectileType: 'BOLT'
    },

    KNIGHT: {
      hp: 100,
      damage: 14,
      speed: 45,
      range: 36,
      armor: 6,
      attackCooldown: 1.6,
      cost: { gold: 120, wood: 0, stone: 40, food: 20 },
      trainTime: 30,
      width: 28,
      height: 28,
      isRanged: false
    },

    CAVALRY: {
      hp: 80,
      damage: 10,
      speed: 90,
      range: 38,
      armor: 3,
      attackCooldown: 1.5,
      cost: { gold: 100, wood: 0, stone: 0, food: 40 },
      trainTime: 28,
      width: 32,
      height: 28,
      isRanged: false,
      chargeBonus: true       // 2x damage on first hit after moving 3+ tiles
    },

    HEALER: {
      hp: 30,
      damage: 0,
      speed: 50,
      range: 4 * 32,  // 4 tiles
      armor: 0,
      attackCooldown: 3,
      cost: { gold: 80, wood: 0, stone: 0, food: 20 },
      trainTime: 25,
      width: 24,
      height: 24,
      isRanged: true,
      isHealer: true,
      healAmount: 8,
      healCooldown: 3,
      projectileType: 'HEALING_POTION'
    },

    CATAPULT: {
      hp: 70,
      damage: 25,
      speed: 30,
      range: 8 * 32,  // 8 tiles
      armor: 1,
      attackCooldown: 4,
      cost: { gold: 150, wood: 80, stone: 60, food: 0 },
      trainTime: 40,
      width: 32,
      height: 28,
      isRanged: true,
      projectileType: 'BOULDER',
      minimumRange: 3 * 32,  // can't fire closer than 3 tiles
      aoeRadius: 48           // splash damage radius
    },

    ROYAL_COMMANDER: {
      hp: 120,
      damage: 12,
      speed: 50,
      range: 36,
      armor: 5,
      attackCooldown: 1.4,
      cost: { gold: 200, wood: 0, stone: 50, food: 30 },
      trainTime: 35,
      width: 28,
      height: 28,
      isRanged: false,
      damageAura: 0.15,     // +15% damage to nearby allies
      auraRange: 4 * 32     // 4 tiles
    },

    SCOUT: {
      hp: 15,
      damage: 2,
      speed: 112,   // 3.5 * 32 pixels/sec
      range: 32,
      armor: 0,
      attackCooldown: 1.0,
      cost: { gold: 30, wood: 0, stone: 0, food: 0 },
      trainTime: 10,
      width: 22,
      height: 22,
      isRanged: false,
      visionRange: 8 * 32,   // 8 tiles vision (normal is 5)
      canDetectStealth: true,
      autoExplore: true
    },

    BIPLANE: {
      hp: 35,
      damage: 6,
      speed: 112,   // 3.5 * 32 pixels/sec
      range: 6 * 32, // 6 tiles range
      armor: 1,
      attackCooldown: 1.2,
      cost: { gold: 120, wood: 80, stone: 0, food: 20 },
      trainTime: 28,
      width: 28,
      height: 28,
      isRanged: true,
      isFlyer: true,
      projectileType: 'BULLET'
    },
    TRANSPORT_SHIP: {
      hp: 150,
      damage: 0,
      speed: 144,   // 4.5 * 32 pixels/sec
      range: 0,
      armor: 2,
      attackCooldown: 1.0,
      cost: { gold: 80, wood: 120, stone: 0, food: 0 },
      trainTime: 20,
      width: 32,
      height: 32,
      isRanged: false,
      isWaterOnly: true
    },
    WARSHIP: {
      hp: 200,
      damage: 8,
      speed: 112,   // 3.5 * 32 pixels/sec
      range: 8 * 32,
      armor: 3,
      attackCooldown: 1.5,
      cost: { gold: 150, wood: 100, stone: 0, food: 0 },
      trainTime: 30,
      width: 32,
      height: 32,
      isRanged: true,
      isWaterOnly: true,
      projectileType: 'BOLT'
    }
  };

  /* ========================================================================
   *  FACTORY — createUnit
   * ====================================================================== */

  function createUnit(type, x, y, faction) {
    var def = UNIT_DEFS[type];
    if (!def) {
      console.warn('CatWar.Units: Unknown unit type "' + type + '", defaulting to PEASANT');
      def = UNIT_DEFS.PEASANT;
      type = 'PEASANT';
    }

    // Merge with config if available
    if (CatWar.Config && CatWar.Config.units && CatWar.Config.units[type]) {
      var cfgDef = CatWar.Config.units[type];
      for (var key in cfgDef) {
        if (cfgDef.hasOwnProperty(key)) {
          def[key] = cfgDef[key];
        }
      }
    }

    var unit = new CatWar.Unit(type, x, y, faction);

    // Apply all stats from definition
    unit.maxHp = def.hp;
    unit.hp = def.hp;
    unit.damage = def.damage;
    unit.speed = def.speed;
    unit.range = def.range;
    unit.armor = def.armor;
    unit.attackCooldown = def.attackCooldown;
    unit.width = def.width || 24;
    unit.height = def.height || 24;

    // Ranged
    unit.isRanged = !!def.isRanged;
    unit.projectileType = def.projectileType || null;
    unit.minimumRange = def.minimumRange || 0;
    unit.aoeRadius = def.aoeRadius || 0;

    // Gathering
    if (def.canGather) {
      unit.gatherRateMultiplier = def.gatherRateMultiplier || 1;
      unit.gatherDuration = def.gatherDuration || 3;
      unit.carryCapacity = def.carryCapacity || 10;
    }

    // Charge (cavalry)
    unit.chargeBonus = !!def.chargeBonus;

    // Flyer
    unit.isFlyer = !!def.isFlyer;

    // Water Only & Cargo
    unit.isWaterOnly = !!def.isWaterOnly;
    if (unit.isWaterOnly) {
      unit.cargo = [];
    }

    // Healer
    if (def.isHealer) {
      unit.isHealer = true;
      unit.healAmount = def.healAmount || 8;
      unit.healCooldown = def.healCooldown || 3;
    }

    // Commander aura
    unit.damageAura = def.damageAura || 0;
    unit.auraRange = def.auraRange || 0;

    // Type bonus damage
    if (def.bonusDamageVs) {
      unit.bonusDamageVs = Object.assign({}, def.bonusDamageVs);
    }

    // Scout specifics
    if (def.visionRange) {
      unit.visionRange = def.visionRange;
    }
    if (def.canDetectStealth) {
      unit.canDetectStealth = true;
    }
    if (def.autoExplore) {
      unit.autoExplore = true;
    }

    // Apply type-specific initialisation
    if (typeInitializers[type]) {
      typeInitializers[type](unit, faction);
    }

    return unit;
  }

  /* ========================================================================
   *  TYPE-SPECIFIC INITIALISERS — special setup per unit type
   * ====================================================================== */

  var typeInitializers = {};

  typeInitializers.HEAD_MINER = function (unit) {
    // Head miner is unique — can't be trained normally
    // Slightly sparkly appearance handled by sprites.js
    unit.gatherRateMultiplier = 1.5;
    unit.gatherDuration = 2;
    unit.carryCapacity = 15;
  };

  typeInitializers.PEASANT = function (unit) {
    // Peasants can gather and build
    unit.buildRate = 0.1; // construction progress per second
  };

  typeInitializers.SPEARCAT = function (unit) {
    // 2x damage vs cavalry already set via bonusDamageVs
  };

  typeInitializers.HEALER = function (unit) {
    // Healer uses catnip potion system
    unit.isHealer = true;
    unit.catnipAbilityCooldown = 30;
    unit.catnipAbilityTimer = 0;
  };

  typeInitializers.CATAPULT = function (unit) {
    // Slower turn rate (visual only, handled by animSpeed)
    unit.animSpeed = 0.25;
  };

  typeInitializers.ROYAL_COMMANDER = function (unit) {
    // Aura that boosts nearby units
    // Aura application happens in game loop, we just store the values
    unit.damageAura = 0.15;
    unit.auraRange = 4 * 32;
  };

  typeInitializers.CAVALRY = function (unit) {
    unit.chargeBonus = true;
    unit.chargeDistance = 0;
  };

  typeInitializers.SCOUT = function (unit, faction) {
    unit.visionRange = 8 * 32;
    unit.canDetectStealth = true;
    unit.autoExplore = true;

    // Siamese bonus: scouts move faster
    // Faction ID for Siamese would be configurable; assume faction 3 for now
    if (CatWar.Config && CatWar.Config.SIAMESE_FACTION !== undefined) {
      if (faction === CatWar.Config.SIAMESE_FACTION) {
        unit.speed = 4.2 * 32; // 134.4 px/sec
      }
    }
  };

  /* ========================================================================
   *  UTILITY METHODS
   * ====================================================================== */

  function getUnitCost(type) {
    var def = UNIT_DEFS[type];
    if (!def) return null;
    return Object.assign({}, def.cost || {});
  }

  function getTrainTime(type) {
    var def = UNIT_DEFS[type];
    return def ? def.trainTime : 0;
  }

  function getUnitDef(type) {
    return UNIT_DEFS[type] || null;
  }

  function getAllUnitTypes() {
    return Object.keys(UNIT_DEFS);
  }

  /* ========================================================================
   *  AURA PROCESSING — called by game loop each tick
   * ====================================================================== */

  /**
   * Apply commander aura buffs. Call each frame with the full unit list.
   * Commanders give +15% damage to nearby friendly units.
   */
  function processAuras(units) {
    // Reset all aura bonuses first
    for (var i = 0; i < units.length; i++) {
      units[i]._auraDamageBonus = 0;
    }

    // Find commanders and apply their aura
    for (var c = 0; c < units.length; c++) {
      var cmd = units[c];
      if (!cmd.alive || cmd.damageAura <= 0) continue;

      for (var u = 0; u < units.length; u++) {
        var ally = units[u];
        if (ally === cmd || !ally.alive) continue;
        if (ally.faction !== cmd.faction) continue;
        if (cmd.distanceTo(ally) <= cmd.auraRange) {
          ally._auraDamageBonus = Math.max(ally._auraDamageBonus || 0, cmd.damageAura);
        }
      }
    }
  }

  /**
   * Process auto-heal for healer units.
   * Finds lowest-HP friendly unit nearby and heals them.
   */
  function processHealers(units) {
    for (var i = 0; i < units.length; i++) {
      var healer = units[i];
      if (!healer.alive || !healer.isHealer || healer.healTimer > 0) continue;

      var bestTarget = null;
      var lowestHpRatio = 1;

      for (var j = 0; j < units.length; j++) {
        var ally = units[j];
        if (ally === healer || !ally.alive) continue;
        if (ally.faction !== healer.faction) continue;
        if (ally.hp >= ally.maxHp) continue;

        var dist = healer.distanceTo(ally);
        if (dist > healer.range) continue;

        var hpRatio = ally.hp / ally.maxHp;
        if (hpRatio < lowestHpRatio) {
          lowestHpRatio = hpRatio;
          bestTarget = ally;
        }
      }

      if (bestTarget) {
        healer.healTarget(bestTarget);
      }
    }
  }

  /**
   * Process auto-attack for idle units.
   * Units in IDLE state attack nearest enemy within aggro range.
   */
  function processAutoAttack(units) {
    for (var i = 0; i < units.length; i++) {
      var unit = units[i];
      if (!unit.alive) continue;
      if (unit.state !== CatWar.UnitState.IDLE) continue;
      if (unit.isHealer) continue; // healers don't auto-attack

      var closestEnemy = null;
      var closestDist = unit.aggroRange;

      for (var j = 0; j < units.length; j++) {
        var enemy = units[j];
        if (enemy === unit || !enemy.alive) continue;
        if (enemy.faction === unit.faction) continue;

        var dist = unit.distanceTo(enemy);
        if (dist < closestDist) {
          closestDist = dist;
          closestEnemy = enemy;
        }
      }

      if (closestEnemy) {
        unit.attackTarget(closestEnemy);
      }
    }
  }

  /**
   * Process scout auto-explore behavior.
   */
  function processScoutExplore(units) {
    for (var i = 0; i < units.length; i++) {
      var scout = units[i];
      if (!scout.alive || !scout.autoExplore) continue;
      if (scout.state !== CatWar.UnitState.IDLE) continue;

      // If no orders, explore towards nearest fog-of-war
      if (CatWar.GameMap && CatWar.GameMap.getNearestUnexplored) {
        var target = CatWar.GameMap.getNearestUnexplored(scout.x, scout.y, scout.faction);
        if (target) {
          scout.moveTo(target.x, target.y);
        }
      }
    }
  }

  /* ========================================================================
   *  PUBLIC API
   * ====================================================================== */

  return {
    createUnit: createUnit,
    getUnitCost: getUnitCost,
    getTrainTime: getTrainTime,
    getUnitDef: getUnitDef,
    getAllUnitTypes: getAllUnitTypes,
    processAuras: processAuras,
    processHealers: processHealers,
    processAutoAttack: processAutoAttack,
    processScoutExplore: processScoutExplore,
    UNIT_DEFS: UNIT_DEFS
  };

})();
