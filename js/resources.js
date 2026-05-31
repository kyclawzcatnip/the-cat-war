/*******************************************************************************
 * resources.js — The Cat War: Resource & Economy System
 *
 * Manages:
 *   - Resource tracking per faction (gold, wood, stone, food)
 *   - Gathering loop helpers
 *   - Food consumption & starvation
 *   - Population cap
 *   - Drop-off finding
 *   - Resource richness integration
 *
 * Provides: CatWar.Resources
 * Depends on: entities.js
 ******************************************************************************/

window.CatWar = window.CatWar || {};

CatWar.Resources = (function () {
  'use strict';

  /* ========================================================================
   *  CONSTANTS
   * ====================================================================== */

  var RESOURCE_TYPES = ['GOLD', 'WOOD', 'STONE', 'FOOD'];

  var STARTING_RESOURCES = {
    gold: 0,
    wood: 200,
    stone: 100,
    food: 0
  };

  var POPULATION_CAP = 50;

  // Richness chance per resource type (used when spawning nodes)
  var RICHNESS_CHANCE = {
    GOLD: 0.10,   // 10% chance of being rich
    STONE: 0.25,  // 25% chance
    WOOD: 0.35    // 35% chance
  };

  // Rich multiplier
  var RICH_MULTIPLIER = 2.0;  // 2x gather yield for rich tiles

  // Food consumption rate: 1 food per unit per 60 seconds
  var FOOD_CONSUMPTION_INTERVAL = 60;

  // Starvation: 1 HP per 5 seconds when no food
  var STARVATION_DAMAGE_INTERVAL = 5;

  /* ========================================================================
   *  FACTION RESOURCE MANAGER
   * ====================================================================== */

  /**
   * Tracks resources for a single faction.
   */
  function FactionResources(factionId) {
    this.factionId = factionId;
    this.gold = STARTING_RESOURCES.gold;
    this.wood = STARTING_RESOURCES.wood;
    this.stone = STARTING_RESOURCES.stone;
    this.food = STARTING_RESOURCES.food;
    this.population = 0;
    this.populationCap = POPULATION_CAP;
    this.foodTimer = 0;
  }

  FactionResources.prototype.getAmount = function (type) {
    switch (type) {
      case 'GOLD': return this.gold;
      case 'WOOD': return this.wood;
      case 'STONE': return this.stone;
      case 'FOOD': return this.food;
      default: return 0;
    }
  };

  FactionResources.prototype.add = function (type, amount) {
    switch (type) {
      case 'GOLD': this.gold += amount; break;
      case 'WOOD': this.wood += amount; break;
      case 'STONE': this.stone += amount; break;
      case 'FOOD': this.food += amount; break;
    }
  };

  FactionResources.prototype.subtract = function (type, amount) {
    switch (type) {
      case 'GOLD': this.gold = Math.max(0, this.gold - amount); break;
      case 'WOOD': this.wood = Math.max(0, this.wood - amount); break;
      case 'STONE': this.stone = Math.max(0, this.stone - amount); break;
      case 'FOOD': this.food = Math.max(0, this.food - amount); break;
    }
  };

  FactionResources.prototype.toObject = function () {
    return {
      gold: this.gold,
      wood: this.wood,
      stone: this.stone,
      food: this.food,
      population: this.population,
      populationCap: this.populationCap
    };
  };

  /* ========================================================================
   *  RESOURCE NODE
   * ====================================================================== */

  /**
   * A resource node on the map (gold mine, tree, stone deposit).
   * Not a full Entity — lightweight data object managed by the resource system.
   */
  function ResourceNode(type, x, y, amount, richness) {
    this.id = ResourceNode._nextId++;
    this.resourceType = type;  // 'GOLD', 'WOOD', 'STONE'
    this.x = x;
    this.y = y;
    this.maxAmount = amount;
    this.remaining = amount;
    this.alive = true;
    this.richness = richness || 1.0; // 1.0 = normal, 2.0 = rich
    this.width = 24;
    this.height = 24;
  }
  ResourceNode._nextId = 1;

  ResourceNode.prototype.getRemainingRatio = function () {
    return this.maxAmount > 0 ? this.remaining / this.maxAmount : 0;
  };

  ResourceNode.prototype.deplete = function (amount) {
    this.remaining = Math.max(0, this.remaining - amount);
    if (this.remaining <= 0) {
      this.alive = false;
    }
    return this.remaining;
  };

  ResourceNode.prototype.draw = function (ctx, camera) {
    if (!this.alive) return;
    if (!CatWar.Sprites) return;

    var sx = this.x - (camera ? camera.x : 0);
    var sy = this.y - (camera ? camera.y : 0);

    CatWar.Sprites.drawResourceNode(
      ctx, sx, sy,
      this.resourceType,
      this.getRemainingRatio(),
      (Date.now() * 0.003) % 100, // simple frame counter
      this.richness
    );
  };

  /* ========================================================================
   *  RESOURCE NODE DEFAULTS
   * ====================================================================== */

  var NODE_DEFAULTS = {
    GOLD: { amount: 500, richAmount: 1000 },
    WOOD: { amount: 300, richAmount: 600 },
    STONE: { amount: 400, richAmount: 800 }
  };

  /**
   * Create a resource node, randomly determining if it's rich.
   */
  function createResourceNode(type, x, y) {
    var defaults = NODE_DEFAULTS[type] || { amount: 300, richAmount: 600 };
    var chance = RICHNESS_CHANCE[type] || 0;
    var isRich = Math.random() < chance;
    var richness = isRich ? RICH_MULTIPLIER : 1.0;
    var amount = isRich ? defaults.richAmount : defaults.amount;

    return new ResourceNode(type, x, y, amount, richness);
  }

  /**
   * Create a resource node with explicit richness.
   */
  function createResourceNodeExplicit(type, x, y, amount, richness) {
    return new ResourceNode(type, x, y, amount, richness);
  }

  /* ========================================================================
   *  GLOBAL RESOURCE TRACKER
   * ====================================================================== */

  var factionResources = {};
  var resourceNodes = [];

  function init(factionIds) {
    factionResources = {};
    for (var i = 0; i < factionIds.length; i++) {
      factionResources[factionIds[i]] = new FactionResources(factionIds[i]);
    }
    resourceNodes = [];
  }

  function getFactionResources(factionId) {
    if (!factionResources[factionId]) {
      factionResources[factionId] = new FactionResources(factionId);
    }
    return factionResources[factionId];
  }

  /* ========================================================================
   *  CORE API
   * ====================================================================== */

  /**
   * Deposit resources from a gatherer to their faction pool.
   */
  function deposit(factionId, resourceType, amount) {
    var fr = getFactionResources(factionId);
    fr.add(resourceType, amount);
  }

  /**
   * Check if a faction can afford a cost object.
   * @param {number} factionId
   * @param {object} cost — { gold, wood, stone, food }
   * @returns {boolean}
   */
  function canAfford(factionId, cost) {
    var fr = getFactionResources(factionId);
    if (cost.gold && fr.gold < cost.gold) return false;
    if (cost.wood && fr.wood < cost.wood) return false;
    if (cost.stone && fr.stone < cost.stone) return false;
    if (cost.food && fr.food < cost.food) return false;
    return true;
  }

  /**
   * Spend resources. Returns false if can't afford.
   */
  function spend(factionId, cost) {
    if (!canAfford(factionId, cost)) return false;
    var fr = getFactionResources(factionId);
    if (cost.gold) fr.subtract('GOLD', cost.gold);
    if (cost.wood) fr.subtract('WOOD', cost.wood);
    if (cost.stone) fr.subtract('STONE', cost.stone);
    if (cost.food) fr.subtract('FOOD', cost.food);
    return true;
  }

  /**
   * Refund resources.
   */
  function refund(factionId, cost) {
    var fr = getFactionResources(factionId);
    if (cost.gold) fr.add('GOLD', cost.gold);
    if (cost.wood) fr.add('WOOD', cost.wood);
    if (cost.stone) fr.add('STONE', cost.stone);
    if (cost.food) fr.add('FOOD', cost.food);
  }

  /* ========================================================================
   *  DROP-OFF FINDING
   * ====================================================================== */

  /**
   * Find the nearest drop-off building for a unit carrying resources.
   *
   * @param {Unit} unit — the gathering unit
   * @returns {Building|null}
   */
  function findDropOff(unit) {
    if (!unit || !unit.carryType) return null;

    // Need access to all buildings — via game manager or passed in
    var buildings = [];
    if (CatWar.GameManager && CatWar.GameManager.getBuildings) {
      buildings = CatWar.GameManager.getBuildings(unit.faction);
    } else if (CatWar._buildings) {
      buildings = CatWar._buildings;
    }

    var best = null;
    var bestDist = Infinity;

    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      if (!b.alive || !b.isComplete) continue;
      if (b.faction !== unit.faction) continue;
      if (!b.isDropOff) continue;

      // Check if this building accepts this resource type
      if (b.dropOffTypes && b.dropOffTypes.length > 0) {
        if (b.dropOffTypes.indexOf(unit.carryType) === -1) continue;
      }

      var dx = b.x - unit.x;
      var dy = b.y - unit.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = b;
      }
    }

    return best;
  }

  /* ========================================================================
   *  GATHER RATE WITH BUILDING BONUSES
   * ====================================================================== */

  /**
   * Calculate effective gather amount for a unit, factoring in:
   * - Node richness
   * - Nearby bonus buildings (lumber mill, stone quarry)
   *
   * @param {Unit} unit
   * @param {ResourceNode} node
   * @returns {number} gather amount per trip
   */
  function calculateGatherAmount(unit, node) {
    var baseAmount = unit.carryCapacity || 10;

    // Richness multiplier
    if (node.richness) {
      baseAmount = Math.round(baseAmount * node.richness);
    }

    // Building gather bonus
    var buildings = [];
    if (CatWar.GameManager && CatWar.GameManager.getBuildings) {
      buildings = CatWar.GameManager.getBuildings(unit.faction);
    } else if (CatWar._buildings) {
      buildings = CatWar._buildings;
    }

    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      if (!b.alive || !b.isComplete) continue;
      if (b.faction !== unit.faction) continue;
      if (!b.gatherBonus || !b.gatherBonusType) continue;
      if (b.gatherBonusType !== node.resourceType) continue;

      var dx = b.x - node.x;
      var dy = b.y - node.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= (b.gatherBonusRange || 6 * 32)) {
        baseAmount = Math.round(baseAmount * (1 + b.gatherBonus));
        break; // Only one bonus building applies
      }
    }

    return baseAmount;
  }

  /* ========================================================================
   *  FOOD CONSUMPTION & STARVATION
   * ====================================================================== */

  /**
   * Process food consumption for all factions.
   * Call once per frame with dt.
   *
   * @param {number} dt — delta time in seconds
   * @param {Array} allUnits — all alive units in the game
   */
  function processFoodConsumption(dt, allUnits) {
    // Group units by faction
    var factionUnits = {};
    for (var i = 0; i < allUnits.length; i++) {
      var u = allUnits[i];
      if (!u.alive) continue;
      if (!factionUnits[u.faction]) {
        factionUnits[u.faction] = [];
      }
      factionUnits[u.faction].push(u);
    }

    // Process each faction
    for (var fid in factionResources) {
      if (!factionResources.hasOwnProperty(fid)) continue;
      var fr = factionResources[fid];
      var units = factionUnits[fid] || [];

      // Update population count
      fr.population = units.length;

      // Food timer
      fr.foodTimer += dt;
      if (fr.foodTimer >= FOOD_CONSUMPTION_INTERVAL) {
        fr.foodTimer -= FOOD_CONSUMPTION_INTERVAL;

        // Consume 1 food per unit
        var foodNeeded = units.length;
        if (fr.food >= foodNeeded) {
          fr.food -= foodNeeded;
          // Everyone is fed — clear starvation
          for (var j = 0; j < units.length; j++) {
            units[j].starving = false;
            units[j].starvationTimer = 0;
          }
        } else {
          // Not enough food!
          fr.food = 0;
          for (var k = 0; k < units.length; k++) {
            units[k].starving = true;
          }
        }
      }
    }
  }

  /* ========================================================================
   *  POPULATION CHECK
   * ====================================================================== */

  /**
   * Check if a faction has room for more units.
   */
  function hasPopulationRoom(factionId) {
    var fr = getFactionResources(factionId);
    return fr.population < fr.populationCap;
  }

  function getPopulation(factionId) {
    var fr = getFactionResources(factionId);
    return { current: fr.population, cap: fr.populationCap };
  }

  /* ========================================================================
   *  RESOURCE NODE MANAGEMENT
   * ====================================================================== */

  function addNode(node) {
    resourceNodes.push(node);
  }

  function removeDepletedNodes() {
    for (var i = resourceNodes.length - 1; i >= 0; i--) {
      if (!resourceNodes[i].alive) {
        resourceNodes.splice(i, 1);
      }
    }
  }

  function findNearestNode(x, y, resourceType) {
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < resourceNodes.length; i++) {
      var node = resourceNodes[i];
      if (!node.alive) continue;
      if (resourceType && node.resourceType !== resourceType) continue;
      var dx = node.x - x;
      var dy = node.y - y;
      var dist = dx * dx + dy * dy; // squared for comparison
      if (dist < bestDist) {
        bestDist = dist;
        best = node;
      }
    }
    return best;
  }

  function getNodes() {
    return resourceNodes;
  }

  function drawNodes(ctx, camera) {
    for (var i = 0; i < resourceNodes.length; i++) {
      resourceNodes[i].draw(ctx, camera);
    }
  }

  /* ========================================================================
   *  PUBLIC API
   * ====================================================================== */

  return {
    // Initialization
    init: init,

    // Core economy
    deposit: deposit,
    canAfford: canAfford,
    spend: spend,
    refund: refund,
    getFactionResources: getFactionResources,

    // Gathering
    findDropOff: findDropOff,
    calculateGatherAmount: calculateGatherAmount,

    // Food & population
    processFoodConsumption: processFoodConsumption,
    hasPopulationRoom: hasPopulationRoom,
    getPopulation: getPopulation,

    // Resource nodes
    ResourceNode: ResourceNode,
    createResourceNode: createResourceNode,
    createResourceNodeExplicit: createResourceNodeExplicit,
    addNode: addNode,
    removeDepletedNodes: removeDepletedNodes,
    findNearestNode: findNearestNode,
    getNodes: getNodes,
    drawNodes: drawNodes,

    // Constants
    RESOURCE_TYPES: RESOURCE_TYPES,
    STARTING_RESOURCES: STARTING_RESOURCES,
    POPULATION_CAP: POPULATION_CAP,
    RICHNESS_CHANCE: RICHNESS_CHANCE,
    RICH_MULTIPLIER: RICH_MULTIPLIER,
    NODE_DEFAULTS: NODE_DEFAULTS
  };

})();
