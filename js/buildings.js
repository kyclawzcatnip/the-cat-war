/*******************************************************************************
 * buildings.js — The Cat War: Building Type Definitions & Factory
 *
 * Provides:
 *   CatWar.Buildings.createBuilding(type, tileX, tileY, faction)
 *   CatWar.Buildings.BUILDING_DEFS
 *   CatWar.Buildings.canPlace(type, tileX, tileY, gameMap, buildings)
 *
 * Depends on: entities.js
 ******************************************************************************/

window.CatWar = window.CatWar || {};

CatWar.Buildings = (function () {
  'use strict';

  /* ========================================================================
   *  BUILDING DEFINITIONS
   * ====================================================================== */

  var BUILDING_DEFS = {
    CASTLE_KEEP: {
      hp: 2000,
      tileWidth: 3,
      tileHeight: 3,
      cost: { gold: 0, wood: 0, stone: 0 },  // starting building — free
      buildTime: 0,          // pre-built
      trainableUnits: ['PEASANT', 'SCOUT'],
      isDropOff: true,
      dropOffTypes: ['GOLD', 'WOOD', 'STONE', 'FOOD'],
      description: 'Main stronghold. Trains peasants and scouts. Drop-off for all resources.'
    },

    BARRACKS: {
      hp: 800,
      tileWidth: 2,
      tileHeight: 2,
      cost: { gold: 100, wood: 100, stone: 50 },
      buildTime: 30,
      trainableUnits: ['SWORDSCAT', 'SPEARCAT'],
      description: 'Trains melee infantry: Swordscats and Spearcats.'
    },

    ARCHERY_RANGE: {
      hp: 600,
      tileWidth: 2,
      tileHeight: 2,
      cost: { gold: 80, wood: 120, stone: 30 },
      buildTime: 28,
      trainableUnits: ['ARCHER', 'CROSSBOW'],
      description: 'Trains ranged units: Archers and Crossbow cats.'
    },

    BLACKSMITH: {
      hp: 700,
      tileWidth: 2,
      tileHeight: 2,
      cost: { gold: 120, wood: 60, stone: 80 },
      buildTime: 35,
      trainableUnits: ['KNIGHT', 'HEALER'],
      description: 'Trains heavy units: Knights and Healers.'
    },

    STABLE: {
      hp: 700,
      tileWidth: 2,
      tileHeight: 2,
      cost: { gold: 100, wood: 80, stone: 40 },
      buildTime: 30,
      trainableUnits: ['CAVALRY'],
      description: 'Trains cavalry units. Requires hay (food).'
    },

    SIEGE_WORKSHOP: {
      hp: 900,
      tileWidth: 3,
      tileHeight: 2,
      cost: { gold: 200, wood: 150, stone: 100 },
      buildTime: 45,
      trainableUnits: ['CATAPULT', 'ROYAL_COMMANDER'],
      description: 'Builds siege equipment and trains Royal Commanders.'
    },

    FARM: {
      hp: 400,
      tileWidth: 2,
      tileHeight: 2,
      cost: { gold: 0, wood: 80, stone: 0 },
      buildTime: 20,
      trainableUnits: [],
      passiveIncome: { type: 'FOOD', amount: 2, interval: 10 },  // 2 food every 10 seconds
      description: 'Passively generates food for your army.'
    },

    LUMBER_MILL: {
      hp: 500,
      tileWidth: 2,
      tileHeight: 2,
      cost: { gold: 50, wood: 60, stone: 20 },
      buildTime: 22,
      trainableUnits: [],
      isDropOff: true,
      dropOffTypes: ['WOOD'],
      gatherBonus: 0.2,
      gatherBonusType: 'WOOD',
      gatherBonusRange: 6 * 32,  // 6 tiles
      description: 'Drop-off for wood. +20% wood gather rate for nearby peasants.'
    },

    STONE_QUARRY: {
      hp: 600,
      tileWidth: 2,
      tileHeight: 2,
      cost: { gold: 50, wood: 40, stone: 30 },
      buildTime: 24,
      trainableUnits: [],
      isDropOff: true,
      dropOffTypes: ['STONE'],
      gatherBonus: 0.2,
      gatherBonusType: 'STONE',
      gatherBonusRange: 6 * 32,
      description: 'Drop-off for stone. +20% stone gather rate for nearby peasants.'
    },

    WATCHTOWER: {
      hp: 500,
      tileWidth: 1,
      tileHeight: 1,
      cost: { gold: 80, wood: 60, stone: 60 },
      buildTime: 25,
      trainableUnits: [],
      attackDamage: 8,
      attackRange: 6 * 32,
      attackCooldown: 2.0,
      description: 'Defensive tower. Auto-attacks enemies in range.'
    }
  };

  /* ========================================================================
   *  FACTORY — createBuilding
   * ====================================================================== */

  function createBuilding(type, tileX, tileY, faction) {
    var def = BUILDING_DEFS[type];
    if (!def) {
      console.warn('CatWar.Buildings: Unknown building type "' + type + '"');
      return null;
    }

    var building = new CatWar.Building(type, tileX, tileY, faction);

    // Apply stats
    building.maxHp = def.hp;
    building.hp = def.hp;
    building.tileWidth = def.tileWidth;
    building.tileHeight = def.tileHeight;

    // Recalculate pixel size
    var tileSize = (CatWar.Sprites && CatWar.Sprites.TILE_SIZE) || 32;
    building.width = def.tileWidth * tileSize;
    building.height = def.tileHeight * tileSize;
    building.x = tileX * tileSize + building.width / 2;
    building.y = tileY * tileSize + building.height / 2;

    // Training
    building.trainableUnits = def.trainableUnits ? def.trainableUnits.slice() : [];
    building.trainTime = def.buildTime || 10; // fallback

    // Drop-off
    building.isDropOff = !!def.isDropOff;
    building.dropOffTypes = def.dropOffTypes ? def.dropOffTypes.slice() : [];

    // Passive income
    if (def.passiveIncome) {
      building.passiveIncome = {
        type: def.passiveIncome.type,
        amount: def.passiveIncome.amount,
        interval: def.passiveIncome.interval
      };
    }

    // Gather bonus
    building.gatherBonus = def.gatherBonus || 0;
    building.gatherBonusType = def.gatherBonusType || null;
    building.gatherBonusRange = def.gatherBonusRange || 0;

    // Watchtower combat
    building.attackDamage = def.attackDamage || 0;
    building.attackRange = def.attackRange || 0;
    building.attackCooldown = def.attackCooldown || 0;
    building.attackTimer = 0;

    // Construction state
    if (type === 'CASTLE_KEEP') {
      building.constructionProgress = 1;
      building.isComplete = true;
    } else {
      building.constructionProgress = 0;
      building.isComplete = false;
    }

    // Rally point default: to the right of the building
    building.rallyPoint = {
      x: building.x + building.width / 2 + tileSize,
      y: building.y
    };

    return building;
  }

  /* ========================================================================
   *  PLACEMENT VALIDATION
   * ====================================================================== */

  /**
   * Check if a building can be placed at the given tile position.
   *
   * @param {string} type — building type
   * @param {number} tileX — grid X
   * @param {number} tileY — grid Y
   * @param {object} gameMap — map object with getTile(tx, ty) method
   * @param {Array} buildings — existing buildings array
   * @returns {{ valid: boolean, reason: string }}
   */
  function canPlace(type, tileX, tileY, gameMap, buildings) {
    var def = BUILDING_DEFS[type];
    if (!def) return { valid: false, reason: 'Unknown building type' };

    var tw = def.tileWidth;
    var th = def.tileHeight;

    // 1. Check map bounds
    if (gameMap && gameMap.width && gameMap.height) {
      if (tileX < 0 || tileY < 0 ||
        tileX + tw > gameMap.width ||
        tileY + th > gameMap.height) {
        return { valid: false, reason: 'Out of map bounds' };
      }
    }

    // 2. Check terrain — must be buildable (grass, road, sand)
    if (gameMap && gameMap.getTile) {
      var BUILDABLE = { GRASS: true, ROAD: true, SAND: true };
      for (var ty = tileY; ty < tileY + th; ty++) {
        for (var tx = tileX; tx < tileX + tw; tx++) {
          var tile = gameMap.getTile(tx, ty);
          if (!tile || !BUILDABLE[tile.type]) {
            return { valid: false, reason: 'Terrain not suitable for building' };
          }
        }
      }
    }

    // 3. Check overlap with existing buildings
    if (buildings) {
      for (var i = 0; i < buildings.length; i++) {
        var b = buildings[i];
        if (!b.alive) continue;

        // Check tile overlap
        var bx1 = b.tileX, by1 = b.tileY;
        var bx2 = b.tileX + b.tileWidth;
        var by2 = b.tileY + b.tileHeight;
        var nx1 = tileX, ny1 = tileY;
        var nx2 = tileX + tw;
        var ny2 = tileY + th;

        if (!(nx2 <= bx1 || nx1 >= bx2 || ny2 <= by1 || ny1 >= by2)) {
          return { valid: false, reason: 'Overlaps with existing building' };
        }
      }
    }

    // 4. Check proximity to Castle Keep (within 15 tiles for non-castle buildings)
    if (type !== 'CASTLE_KEEP' && buildings) {
      var nearCastle = false;
      var tileSize = (CatWar.Sprites && CatWar.Sprites.TILE_SIZE) || 32;
      var cx = tileX * tileSize + (tw * tileSize) / 2;
      var cy = tileY * tileSize + (th * tileSize) / 2;

      for (var j = 0; j < buildings.length; j++) {
        var castle = buildings[j];
        if (!castle.alive || castle.type !== 'CASTLE_KEEP') continue;
        if (castle.faction !== undefined) {
          // Must be same faction castle nearby — we'll check generically
          var dx = castle.x - cx;
          var dy = castle.y - cy;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= 15 * tileSize) {
            nearCastle = true;
            break;
          }
        }
      }

      if (!nearCastle) {
        return { valid: false, reason: 'Must build near your Castle Keep' };
      }
    }

    return { valid: true, reason: '' };
  }

  /* ========================================================================
   *  CONSTRUCTION HELPERS
   * ====================================================================== */

  /**
   * Count peasants near a building site and calculate effective build speed.
   * More peasants = faster construction.
   *
   * @param {Building} building
   * @param {Array} units — all units
   * @returns {number} effective build rate
   */
  function getEffectiveBuildRate(building, units) {
    if (!building || building.isComplete) return 0;

    var baseBuildRate = 0.05; // progress per second per peasant
    var buildersNearby = 0;
    var builderRange = 48;

    for (var i = 0; i < units.length; i++) {
      var unit = units[i];
      if (!unit.alive) continue;
      if (unit.faction !== building.faction) continue;
      if (unit.type !== 'PEASANT' && unit.type !== 'HEAD_MINER') continue;
      if (unit.state !== CatWar.UnitState.BUILDING) continue;
      if (unit.buildTarget !== building) continue;

      var dx = unit.x - building.x;
      var dy = unit.y - building.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= builderRange + building.width / 2) {
        buildersNearby++;
      }
    }

    // Diminishing returns: first peasant full speed, each additional +50%
    if (buildersNearby === 0) return 0;
    var effectiveBuilders = 1;
    for (var b = 1; b < buildersNearby; b++) {
      effectiveBuilders += 0.5;
    }

    return baseBuildRate * effectiveBuilders;
  }

  /**
   * Process watchtower auto-targeting. Call each frame.
   *
   * @param {Array} buildings — all buildings
   * @param {Array} units — all units (enemies to target)
   */
  function processWatchtowers(buildings, units) {
    for (var i = 0; i < buildings.length; i++) {
      var tower = buildings[i];
      if (!tower.alive || !tower.isComplete) continue;
      if (tower.attackDamage <= 0 || tower.attackRange <= 0) continue;

      // Find nearest enemy in range
      var bestTarget = null;
      var bestDist = tower.attackRange;

      for (var j = 0; j < units.length; j++) {
        var enemy = units[j];
        if (!enemy.alive || enemy.faction === tower.faction) continue;

        var dist = tower.distanceTo(enemy);
        if (dist < bestDist) {
          bestDist = dist;
          bestTarget = enemy;
        }
      }

      tower.autoAttackTarget = bestTarget;
    }
  }

  /* ========================================================================
   *  UTILITY
   * ====================================================================== */

  function getBuildingCost(type) {
    var def = BUILDING_DEFS[type];
    if (!def) return null;
    return Object.assign({}, def.cost);
  }

  function getBuildingDef(type) {
    return BUILDING_DEFS[type] || null;
  }

  function getTrainableUnits(type) {
    var def = BUILDING_DEFS[type];
    return def ? (def.trainableUnits || []) : [];
  }

  function getAllBuildingTypes() {
    return Object.keys(BUILDING_DEFS);
  }

  /* ========================================================================
   *  PUBLIC API
   * ====================================================================== */

  return {
    createBuilding: createBuilding,
    canPlace: canPlace,
    getBuildingCost: getBuildingCost,
    getBuildingDef: getBuildingDef,
    getTrainableUnits: getTrainableUnits,
    getAllBuildingTypes: getAllBuildingTypes,
    getEffectiveBuildRate: getEffectiveBuildRate,
    processWatchtowers: processWatchtowers,
    BUILDING_DEFS: BUILDING_DEFS
  };

})();
