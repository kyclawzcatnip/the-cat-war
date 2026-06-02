/*******************************************************************************
 * entities.js — The Cat War: Base Entity Classes
 *
 * Provides the entity hierarchy:
 *   CatWar.Entity   — base for everything on the map
 *   CatWar.Unit     — mobile cat soldiers, peasants, healers, etc.
 *   CatWar.Building  — structures that produce units and provide benefits
 *
 * Uses CatWar namespace. Depends on: sprites.js (for drawing)
 ******************************************************************************/

window.CatWar = window.CatWar || {};

(function () {
  'use strict';

  var _nextId = 1;

  /* ========================================================================
   *  ENTITY — base class
   * ====================================================================== */

  function Entity(x, y, width, height, faction) {
    this.id = _nextId++;
    this.x = x || 0;
    this.y = y || 0;
    this.hp = 1;
    this.maxHp = 1;
    this.faction = faction !== undefined ? faction : 0;
    this.selected = false;
    this.alive = true;
    this.width = width || 24;
    this.height = height || 24;
    this.removalTimer = 0; // countdown after death before cleanup
  }

  Entity.prototype.update = function (dt) {
    // Virtual — override in subclasses
  };

  Entity.prototype.draw = function (ctx, camera) {
    // Virtual — override in subclasses
  };

  Entity.prototype.takeDamage = function (amount, attacker) {
    if (!this.alive) return;
    var effectiveAmount = Math.max(1, amount);
    this.hp -= effectiveAmount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.onDeath(attacker);
    }
  };

  Entity.prototype.onDeath = function (killer) {
    // Override in subclasses for death effects
  };

  Entity.prototype.isInRange = function (target, range) {
    if (!target) return false;
    return this.distanceTo(target) <= range;
  };

  Entity.prototype.distanceTo = function (target) {
    if (!target) return Infinity;
    var dx = this.x - target.x;
    var dy = this.y - target.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  Entity.prototype.getBounds = function () {
    return {
      left: this.x - this.width / 2,
      top: this.y - this.height / 2,
      right: this.x + this.width / 2,
      bottom: this.y + this.height / 2,
      width: this.width,
      height: this.height
    };
  };

  Entity.prototype.containsPoint = function (px, py) {
    var b = this.getBounds();
    return px >= b.left && px <= b.right && py >= b.top && py <= b.bottom;
  };

  CatWar.Entity = Entity;

  /* ========================================================================
   *  UNIT STATES
   * ====================================================================== */

  var UnitState = {
    IDLE: 'IDLE',
    MOVING: 'MOVING',
    ATTACKING: 'ATTACKING',
    GATHERING: 'GATHERING',
    BUILDING: 'BUILDING',
    RETURNING: 'RETURNING',   // returning gathered resources to drop-off
    DEAD: 'DEAD'
  };
  CatWar.UnitState = UnitState;

  /* ========================================================================
   *  UNIT — mobile entities (cats!)
   * ====================================================================== */

  function Unit(type, x, y, faction) {
    Entity.call(this, x, y, 24, 24, faction);

    // Unit identity
    this.type = type || 'PEASANT';

    // State machine
    this.state = UnitState.IDLE;
    this.previousState = UnitState.IDLE;

    // Stats (set by factory in units.js)
    this.speed = 60;          // pixels per second
    this.damage = 5;
    this.range = 32;          // pixels (1 tile = 32)
    this.armor = 0;
    this.attackCooldown = 1.0; // seconds between attacks
    this.maxHp = 30;
    this.hp = 30;
    this.aggroRange = 5 * 32; // 5 tiles, auto-attack range

    // Pathfinding
    this.path = [];           // array of {x, y} waypoints
    this.pathIndex = 0;
    this.targetX = 0;
    this.targetY = 0;

    // Combat
    this.target = null;       // entity being attacked
    this.attackTimer = 0;     // current cooldown timer

    // Gathering (for peasants / head miners)
    this.gatherTarget = null; // resource node entity
    this.carryAmount = 0;
    this.carryCapacity = 10;
    this.carryType = null;    // 'GOLD', 'WOOD', 'STONE'
    this.gatherTimer = 0;
    this.gatherDuration = 3;  // seconds to mine
    this.dropOffTarget = null;// building to return resources to

    // Construction (for peasants)
    this.buildTarget = null;  // building being constructed
    this.buildRate = 0.1;     // construction progress per second

    // Visuals
    this.direction = 1;       // 1 = right, -1 = left
    this.animFrame = 0;
    this.animTimer = 0;
    this.animSpeed = 0.15;    // seconds per frame

    // Idle animation
    this.idleTimer = 0;
    this.idleTailFlickTime = 3 + Math.random() * 2; // random interval

    // Command queue
    this.commands = [];

    // Death
    this.deathTimer = 0;
    this.deathDuration = 3;   // seconds before removal

    // Type-specific bonuses (set by factory)
    this.gatherRateMultiplier = 1.0;
    this.damageAura = 0;         // multiplier bonus for nearby allies
    this.auraRange = 0;          // range of aura effect
    this.chargeBonus = false;    // cavalry charge flag
    this.chargeDistance = 0;     // distance moved since last stop
    this.isRanged = false;
    this.projectileType = null;  // 'ARROW', 'BOLT', 'BOULDER', 'HEALING_POTION', 'CATNIP_POTION'
    this.minimumRange = 0;       // minimum attack range (catapults)
    this.aoeRadius = 0;          // area of effect

    // Healer-specific
    this.isHealer = false;
    this.healAmount = 8;
    this.healCooldown = 3;
    this.healTimer = 0;

    // Catnip buff system
    this.catnipBuff = {
      active: false,
      timeRemaining: 0,
      attackSpeedMod: 1.3,
      moveSpeedMod: 1.2
    };
    this.catnipAbilityCooldown = 30; // seconds
    this.catnipAbilityTimer = 0;

    // Bonus damage vs specific types
    this.bonusDamageVs = {};    // e.g. { CAVALRY: 2.0 }

    // Starvation
    this.starving = false;
    this.starvationTimer = 0;
  }

  // Inherit from Entity
  Unit.prototype = Object.create(Entity.prototype);
  Unit.prototype.constructor = Unit;

  /* ----- MAIN UPDATE LOOP ----- */

  Unit.prototype.update = function (dt) {
    if (!this.alive) {
      this.deathTimer += dt;
      return;
    }

    // Update catnip buff timer
    if (this.catnipBuff.active) {
      this.catnipBuff.timeRemaining -= dt;
      if (this.catnipBuff.timeRemaining <= 0) {
        this.catnipBuff.active = false;
        this.catnipBuff.timeRemaining = 0;
      }
    }

    // Catnip ability cooldown
    if (this.catnipAbilityTimer > 0) {
      this.catnipAbilityTimer -= dt;
    }

    // Starvation damage
    if (this.starving) {
      this.starvationTimer += dt;
      if (this.starvationTimer >= 5) { // 1 HP per 5 seconds
        this.starvationTimer -= 5;
        this.takeDamage(1, null);
      }
    }

    // Animation
    this.animTimer += dt;
    if (this.animTimer >= this.animSpeed) {
      this.animTimer -= this.animSpeed;
      this.animFrame = (this.animFrame + 1) % 4;
    }

    // Attack cooldown
    if (this.attackTimer > 0) {
      var atkSpeedMod = this.catnipBuff.active ? (1 / this.catnipBuff.attackSpeedMod) : 1;
      this.attackTimer -= dt * (1 / atkSpeedMod);
    }

    // Heal cooldown
    if (this.healTimer > 0) {
      this.healTimer -= dt;
    }

    // State machine
    switch (this.state) {
      case UnitState.IDLE:
        this._updateIdle(dt);
        break;
      case UnitState.MOVING:
        this._updateMoving(dt);
        break;
      case UnitState.ATTACKING:
        this._updateAttacking(dt);
        break;
      case UnitState.GATHERING:
        this._updateGathering(dt);
        break;
      case UnitState.RETURNING:
        this._updateReturning(dt);
        break;
      case UnitState.BUILDING:
        this._updateBuilding(dt);
        break;
    }

    // Track charge distance for cavalry
    if (this.chargeBonus && this.state === UnitState.MOVING) {
      this.chargeDistance += this.getEffectiveSpeed() * dt;
    } else if (this.state !== UnitState.MOVING) {
      // Reset charge distance after first attack
    }
  };

  /* ----- STATE HANDLERS ----- */

  Unit.prototype._updateIdle = function (dt) {
    // Idle animation (tail flick, ear twitch)
    this.idleTimer += dt;
    if (this.idleTimer >= this.idleTailFlickTime) {
      this.idleTimer = 0;
      this.idleTailFlickTime = 3 + Math.random() * 2;
      // Trigger tail flick frame
      this.animFrame = 0;
    }

    // Healer auto-heal
    if (this.isHealer && this.healTimer <= 0) {
      this._tryAutoHeal();
    }

    // Auto-attack: find nearest enemy in aggro range
    // (This will be called by the game loop passing nearby entities)
    // Placeholder — actual aggro scanning happens in the game manager
  };

  Unit.prototype._updateMoving = function (dt) {
    if (this.path.length === 0) {
      this._arriveAtDestination();
      return;
    }

    var waypoint = this.path[this.pathIndex];
    if (!waypoint) {
      this._arriveAtDestination();
      return;
    }

    var dx = waypoint.x - this.x;
    var dy = waypoint.y - this.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var moveSpeed = this.getEffectiveSpeed();

    if (dist < moveSpeed * dt) {
      // Arrived at waypoint
      this.x = waypoint.x;
      this.y = waypoint.y;
      this.pathIndex++;

      if (this.pathIndex >= this.path.length) {
        this._arriveAtDestination();
      }
    } else {
      // Move toward waypoint
      var nx = dx / dist;
      var ny = dy / dist;
      this.x += nx * moveSpeed * dt;
      this.y += ny * moveSpeed * dt;

      // Update direction
      if (Math.abs(dx) > 0.1) {
        this.direction = dx > 0 ? 1 : -1;
      }
    }
  };

  Unit.prototype._arriveAtDestination = function () {
    this.path = [];
    this.pathIndex = 0;

    // Check if we have a pending action
    if (this.target && this.target.alive) {
      this.state = UnitState.ATTACKING;
    } else if (this.gatherTarget) {
      this.state = UnitState.GATHERING;
      this.gatherTimer = 0;
    } else if (this.dropOffTarget) {
      this._depositResources();
    } else if (this.buildTarget) {
      this.state = UnitState.BUILDING;
    } else {
      this.state = UnitState.IDLE;
    }
  };

  Unit.prototype._updateAttacking = function (dt) {
    if (!this.target || !this.target.alive) {
      this.target = null;
      this.state = UnitState.IDLE;
      return;
    }

    var dist = this.distanceTo(this.target);

    // Check minimum range (catapults)
    if (this.minimumRange > 0 && dist < this.minimumRange) {
      // Too close — can't fire, move away or idle
      this.state = UnitState.IDLE;
      this.target = null;
      return;
    }

    if (dist > this.range) {
      // Chase target
      this.moveTo(this.target.x, this.target.y);
      return;
    }

    // Face target
    if (this.target.x !== this.x) {
      this.direction = this.target.x > this.x ? 1 : -1;
    }

    // Attack when cooldown ready
    if (this.attackTimer <= 0) {
      this._performAttack();
    }
  };

  Unit.prototype._performAttack = function () {
    if (!this.target || !this.target.alive) return;

    var effectiveCooldown = this.attackCooldown;
    if (this.catnipBuff.active) {
      effectiveCooldown /= this.catnipBuff.attackSpeedMod;
    }
    this.attackTimer = effectiveCooldown;

    // Calculate damage
    var dmg = this.damage;

    // Cavalry charge bonus
    if (this.chargeBonus && this.chargeDistance >= 3 * 32) {
      dmg *= 2;
      this.chargeDistance = 0; // Reset after charge hit
    }

    // Type bonuses
    if (this.target.type && this.bonusDamageVs[this.target.type]) {
      dmg *= this.bonusDamageVs[this.target.type];
    }

    // Commander aura (checked by game manager, but we signal it here)
    // Actual aura application is in the game loop

    if (this.isRanged && this.projectileType) {
      // Create projectile — handled by combat system
      // Emit event for combat.js to create projectile
      if (CatWar.Combat) {
        CatWar.Combat.createProjectile(this, this.target, this.projectileType, dmg, this.aoeRadius);
      }
    } else {
      // Melee — direct damage
      if (CatWar.Combat) {
        CatWar.Combat.applyDamage(this, this.target, dmg);
      } else {
        this.target.takeDamage(dmg, this);
      }
    }

    // Set attack animation
    this.animFrame = 0;
  };

  Unit.prototype._updateGathering = function (dt) {
    if (!this.gatherTarget) {
      this.state = UnitState.IDLE;
      return;
    }

    // Check if in range of resource
    if (!this.isInRange(this.gatherTarget, 40)) {
      this.moveTo(this.gatherTarget.x, this.gatherTarget.y);
      return;
    }

    // Face resource
    if (this.gatherTarget.x !== this.x) {
      this.direction = this.gatherTarget.x > this.x ? 1 : -1;
    }

    // Mine timer
    this.gatherTimer += dt * this.gatherRateMultiplier;
    if (this.gatherTimer >= this.gatherDuration) {
      this.gatherTimer = 0;

      // Determine gather amount, factoring in richness
      var gatherAmount = this.carryCapacity;
      if (this.gatherTarget.richness) {
        gatherAmount = Math.round(gatherAmount * this.gatherTarget.richness);
      }

      // Collect resources
      this.carryAmount = gatherAmount;
      this.carryType = this.gatherTarget.resourceType || 'GOLD';

      // Deplete resource node
      if (this.gatherTarget.remaining !== undefined) {
        this.gatherTarget.remaining -= gatherAmount;
        if (this.gatherTarget.remaining <= 0) {
          this.gatherTarget.remaining = 0;
          this.gatherTarget.alive = false;
          this.gatherTarget = null;
        }
      }

      // Go return resources to drop-off
      this.state = UnitState.RETURNING;
      this._findDropOff();
    }
  };

  Unit.prototype._findDropOff = function () {
    // Find nearest drop-off building
    // This will be resolved by the game manager which has the entity list
    if (CatWar.Resources && CatWar.Resources.findDropOff) {
      this.dropOffTarget = CatWar.Resources.findDropOff(this);
    }
    if (this.dropOffTarget) {
      this.moveTo(this.dropOffTarget.x, this.dropOffTarget.y);
    } else {
      // No drop-off available — stay idle
      this.state = UnitState.IDLE;
    }
  };

  Unit.prototype._updateReturning = function (dt) {
    if (!this.dropOffTarget) {
      this._findDropOff();
      return;
    }

    // Walk toward drop-off (handled by MOVING state via path)
    if (this.path.length > 0) {
      this._updateMoving(dt);
      return;
    }

    // Check if close enough to deposit
    if (this.isInRange(this.dropOffTarget, 48)) {
      this._depositResources();
    } else {
      this.moveTo(this.dropOffTarget.x, this.dropOffTarget.y);
    }
  };

  Unit.prototype._depositResources = function () {
    if (this.carryAmount > 0 && this.carryType) {
      if (CatWar.Resources) {
        CatWar.Resources.deposit(this.faction, this.carryType, this.carryAmount);
      }
      this.carryAmount = 0;
      this.carryType = null;
    }
    this.dropOffTarget = null;

    // Go back to gathering
    if (this.gatherTarget && this.gatherTarget.alive) {
      this.state = UnitState.GATHERING;
      this.moveTo(this.gatherTarget.x, this.gatherTarget.y);
    } else {
      this.state = UnitState.IDLE;
    }
  };

  Unit.prototype._updateBuilding = function (dt) {
    if (!this.buildTarget || !this.buildTarget.alive) {
      this.buildTarget = null;
      this.state = UnitState.IDLE;
      return;
    }

    if (!this.isInRange(this.buildTarget, 48)) {
      this.moveTo(this.buildTarget.x, this.buildTarget.y);
      return;
    }

    // Face building
    if (this.buildTarget.x !== this.x) {
      this.direction = this.buildTarget.x > this.x ? 1 : -1;
    }

    // Increment construction
    if (this.buildTarget.constructionProgress < 1) {
      this.buildTarget.constructionProgress += this.buildRate * dt;
      if (this.buildTarget.constructionProgress >= 1) {
        this.buildTarget.constructionProgress = 1;
        this.buildTarget.isComplete = true;
        this.buildTarget = null;
        this.state = UnitState.IDLE;
      }
    } else {
      this.buildTarget = null;
      this.state = UnitState.IDLE;
    }
  };

  /* ----- HEALER METHODS ----- */

  Unit.prototype._tryAutoHeal = function () {
    // This will be called by game manager with nearby allies
    // Placeholder: the game manager will call healTarget() directly
  };

  Unit.prototype.healTarget = function (target) {
    if (!this.isHealer || this.healTimer > 0) return false;
    if (!target || !target.alive || target.hp >= target.maxHp) return false;

    this.healTimer = this.healCooldown;

    // Create healing potion projectile
    if (CatWar.Combat) {
      CatWar.Combat.createProjectile(this, target, 'HEALING_POTION', this.healAmount, 0);
    } else {
      target.hp = Math.min(target.maxHp, target.hp + this.healAmount);
    }
    return true;
  };

  Unit.prototype.throwCatnipPotion = function (target) {
    if (!this.isHealer) return false;
    if (this.catnipAbilityTimer > 0) return false;
    if (!target || !target.alive || target === this) return false;
    if (target.faction !== this.faction) return false;

    // Check gold cost
    if (CatWar.Resources && !CatWar.Resources.canAfford(this.faction, { gold: 10 })) {
      return false;
    }

    // Spend gold
    if (CatWar.Resources) {
      CatWar.Resources.spend(this.faction, { gold: 10 });
    }

    this.catnipAbilityTimer = this.catnipAbilityCooldown;

    // Create catnip potion projectile
    if (CatWar.Combat) {
      CatWar.Combat.createProjectile(this, target, 'CATNIP_POTION', 0, 0);
    } else {
      // Apply buff directly
      target.catnipBuff.active = true;
      target.catnipBuff.timeRemaining = 12;
    }
    return true;
  };

  /* ----- MOVEMENT COMMANDS ----- */

  Unit.prototype.moveTo = function (x, y) {
    this.targetX = x;
    this.targetY = y;
    this.state = UnitState.MOVING;

    if (CatWar.Pathfinding && CatWar.Pathfinding.findPath && CatWar.Map) {
      const map = CatWar.Map;
      const startTile = map.worldToTile(this.x, this.y);
      const endTile = map.worldToTile(x, y);
      this.path = CatWar.Pathfinding.findPath(
        startTile.tx, startTile.ty, endTile.tx, endTile.ty,
        { ignoreThrottle: true, factionId: this.faction, isWaterOnly: this.isWaterOnly }
      );
    } else {
      this.path = [{ x: x, y: y }];
    }
    this.pathIndex = 0;
  };

  Unit.prototype.attackTarget = function (entity) {
    if (!entity || !entity.alive) return;
    this.target = entity;
    this.state = UnitState.ATTACKING;
    this.gatherTarget = null;
    this.buildTarget = null;

    // Move into range if needed
    if (!this.isInRange(entity, this.range)) {
      this.moveTo(entity.x, entity.y);
    }
  };

  Unit.prototype.gatherResource = function (node) {
    if (!node || !node.alive) return;
    this.gatherTarget = node;
    this.target = null;
    this.buildTarget = null;
    this.state = UnitState.GATHERING;

    // Move to resource if not in range
    if (!this.isInRange(node, 40)) {
      this.moveTo(node.x, node.y);
    }
  };

  Unit.prototype.constructBuilding = function (building) {
    if (!building) return;
    this.buildTarget = building;
    this.target = null;
    this.gatherTarget = null;
    this.state = UnitState.BUILDING;

    if (!this.isInRange(building, 48)) {
      this.moveTo(building.x, building.y);
    }
  };

  Unit.prototype.stop = function () {
    this.state = UnitState.IDLE;
    this.path = [];
    this.pathIndex = 0;
    this.target = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.dropOffTarget = null;
    this.commands = [];
  };

  Unit.prototype.getEffectiveSpeed = function () {
    var spd = this.speed;
    if (this.catnipBuff.active) {
      spd *= this.catnipBuff.moveSpeedMod;
    }
    return spd;
  };

  Unit.prototype.getEffectiveDamage = function () {
    return this.damage;
  };

  /* ----- DEATH ----- */

  Unit.prototype.onDeath = function (killer) {
    this.state = UnitState.DEAD;
    this.path = [];
    this.target = null;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.deathTimer = 0;
    this.catnipBuff.active = false;

    // Emit death particles
    if (CatWar.Particles) {
      CatWar.Particles.deathPoof(this.x, this.y);
    }
  };

  Unit.prototype.shouldRemove = function () {
    return !this.alive && this.deathTimer >= this.deathDuration;
  };

  /* ----- DRAW ----- */

  Unit.prototype.draw = function (ctx, camera) {
    if (!CatWar.Sprites) return;

    var screenX = this.x - (camera ? camera.x : 0);
    var screenY = this.y - (camera ? camera.y : 0);
    var drawState = this.state;

    // Draw shadow / selection first
    if (this.selected) {
      CatWar.Sprites.drawSelection(ctx, screenX, screenY, this.width, this.height, this.faction);
    }

    // Draw the cat sprite
    CatWar.Sprites.drawCat(
      ctx, screenX, screenY,
      this.type, this.faction, this.direction,
      this.animFrame, 1, this.id, drawState
    );

    // Draw catnip buff glow
    if (this.catnipBuff.active) {
      ctx.save();
      ctx.globalAlpha = 0.25 + Math.sin(Date.now() * 0.005) * 0.1;
      ctx.fillStyle = '#88ff88';
      ctx.beginPath();
      ctx.arc(screenX, screenY, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Health bar (only if damaged)
    if (this.hp < this.maxHp && this.alive) {
      CatWar.Sprites.drawHealthBar(ctx, screenX, screenY - this.height / 2 - 6, this.width, this.hp / this.maxHp);
    }

    // Carry indicator
    if (this.carryAmount > 0 && this.carryType) {
      var carryCol = this.carryType === 'GOLD' ? '#ffd700' : (this.carryType === 'WOOD' ? '#8B4513' : '#808080');
      ctx.fillStyle = carryCol;
      ctx.beginPath();
      ctx.arc(screenX + this.direction * 8, screenY - 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Starvation indicator
    if (this.starving && this.alive) {
      ctx.fillStyle = '#ff4444';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🍖', screenX, screenY - this.height / 2 - 10);
    }

    // Death fade
    if (!this.alive) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - this.deathTimer / this.deathDuration);
      // Draw fallen cat (rotated)
      ctx.translate(screenX, screenY);
      ctx.rotate(Math.PI / 2 * Math.min(1, this.deathTimer * 2));
      ctx.translate(-screenX, -screenY);
      CatWar.Sprites.drawCat(
        ctx, screenX, screenY,
        this.type, this.faction, this.direction,
        0, 1, this.id, 'DEAD'
      );
      ctx.restore();
    }
  };

  CatWar.Unit = Unit;

  /* ========================================================================
   *  BUILDING — static structures
   * ====================================================================== */

  function Building(type, tileX, tileY, faction) {
    var tileSize = (CatWar.Sprites && CatWar.Sprites.TILE_SIZE) || 32;
    var tw = 2; // default tile width
    var th = 2;

    // Set size based on building type
    var sizes = {
      CASTLE_KEEP: [3, 3],
      BARRACKS: [2, 2],
      ARCHERY_RANGE: [2, 2],
      BLACKSMITH: [2, 2],
      STABLE: [2, 2],
      SIEGE_WORKSHOP: [3, 2],
      FARM: [2, 2],
      LUMBER_MILL: [2, 2],
      STONE_QUARRY: [2, 2],
      WATCHTOWER: [1, 1]
    };

    if (sizes[type]) {
      tw = sizes[type][0];
      th = sizes[type][1];
    }

    var pixelW = tw * tileSize;
    var pixelH = th * tileSize;
    var centerX = tileX * tileSize + pixelW / 2;
    var centerY = tileY * tileSize + pixelH / 2;

    Entity.call(this, centerX, centerY, pixelW, pixelH, faction);

    this.type = type || 'BARRACKS';
    this.tileX = tileX;
    this.tileY = tileY;
    this.tileWidth = tw;
    this.tileHeight = th;

    // Construction
    this.constructionProgress = 0; // 0 to 1
    this.isComplete = false;

    // Training
    this.trainQueue = [];     // array of unit type strings
    this.trainProgress = 0;
    this.trainTimer = 0;
    this.trainTime = 10;      // seconds per unit (set by buildings.js)

    // Rally point
    this.rallyPoint = { x: centerX + pixelW, y: centerY + pixelH / 2 };

    // Stats (set by factory in buildings.js)
    this.maxHp = 500;
    this.hp = 500;

    // Building-specific
    this.passiveIncome = null;  // { type: 'FOOD', amount: 2, interval: 10 }
    this.passiveTimer = 0;
    this.gatherBonus = 0;       // e.g. 0.2 for +20%
    this.gatherBonusType = null; // 'WOOD', 'STONE'
    this.isDropOff = false;     // can units deposit here?
    this.dropOffTypes = [];     // which resource types accepted
    this.attackDamage = 0;      // watchtower
    this.attackRange = 0;
    this.attackCooldown = 0;
    this.attackTimer = 0;
    this.autoAttackTarget = null;
  }

  Building.prototype = Object.create(Entity.prototype);
  Building.prototype.constructor = Building;

  Building.prototype.update = function (dt) {
    if (!this.alive) return;

    // Construction not complete — nothing else to do
    if (!this.isComplete) return;

    // Train units
    if (this.trainQueue.length > 0) {
      this.trainTimer += dt;
      this.trainProgress = this.trainTimer / this.trainTime;

      if (this.trainTimer >= this.trainTime) {
        this.trainTimer = 0;
        this.trainProgress = 0;
        var unitType = this.trainQueue.shift();
        this._spawnUnit(unitType);
      }
    }

    // Passive income (farms)
    if (this.passiveIncome) {
      this.passiveTimer += dt;
      if (this.passiveTimer >= this.passiveIncome.interval) {
        this.passiveTimer -= this.passiveIncome.interval;
        if (CatWar.Resources) {
          var income = {};
          income[this.passiveIncome.type.toLowerCase()] = this.passiveIncome.amount;
          CatWar.Resources.deposit(this.faction, this.passiveIncome.type, this.passiveIncome.amount);
        }
      }
    }

    // Watchtower auto-attack
    if (this.attackDamage > 0 && this.attackRange > 0) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0 && this.autoAttackTarget && this.autoAttackTarget.alive) {
        if (this.isInRange(this.autoAttackTarget, this.attackRange)) {
          if (CatWar.Combat) {
            CatWar.Combat.createProjectile(this, this.autoAttackTarget, 'ARROW', this.attackDamage, 0);
          }
          this.attackTimer = this.attackCooldown;
        }
      }
    }
  };

  Building.prototype._spawnUnit = function (unitType) {
    // Spawn at rally point
    if (CatWar.Units && CatWar.Units.createUnit) {
      var unit = CatWar.Units.createUnit(unitType, this.rallyPoint.x, this.rallyPoint.y, this.faction);
      // Emit spawn event for game manager to add to entity list
      if (CatWar.Events) {
        CatWar.Events.emit('unitSpawned', { unit: unit, building: this });
      }
      return unit;
    }
    return null;
  };

  Building.prototype.trainUnit = function (unitType) {
    if (!this.isComplete) return false;

    // Check queue limit
    if (this.trainQueue.length >= 5) return false;

    // Check resources (done by game manager / UI layer)
    this.trainQueue.push(unitType);
    return true;
  };

  Building.prototype.cancelTrain = function () {
    if (this.trainQueue.length === 0) return;
    this.trainQueue.pop();
    // Refund resources would happen in game manager
  };

  Building.prototype.setRallyPoint = function (x, y) {
    this.rallyPoint.x = x;
    this.rallyPoint.y = y;
  };

  Building.prototype.onDeath = function (killer) {
    // Building destroyed effects
    if (CatWar.Particles) {
      CatWar.Particles.fireDamage(this.x, this.y);
      CatWar.Particles.constructionDust(this.x, this.y);
    }
  };

  Building.prototype.draw = function (ctx, camera) {
    if (!CatWar.Sprites) return;

    var screenX = this.x - (camera ? camera.x : 0);
    var screenY = this.y - (camera ? camera.y : 0);

    // Selection
    if (this.selected) {
      CatWar.Sprites.drawSelection(ctx, screenX, screenY, this.width, this.height, this.faction);
    }

    // Draw building
    CatWar.Sprites.drawBuilding(
      ctx, screenX, screenY,
      this.type, this.faction,
      this.constructionProgress, 1
    );

    // Health bar (if damaged and complete)
    if (this.hp < this.maxHp && this.alive) {
      CatWar.Sprites.drawHealthBar(ctx, screenX, screenY - this.height / 2 - 8, this.width * 0.8, this.hp / this.maxHp);
    }

    // Construction progress bar
    if (!this.isComplete) {
      var barW = this.width * 0.6;
      var barH = 4;
      var barX = screenX - barW / 2;
      var barY = screenY + this.height / 2 + 4;
      ctx.fillStyle = '#333';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = '#ffc107';
      ctx.fillRect(barX, barY, barW * this.constructionProgress, barH);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(barX, barY, barW, barH);
    }

    // Training progress indicator
    if (this.isComplete && this.trainQueue.length > 0) {
      var tBarW = this.width * 0.5;
      var tBarH = 3;
      var tBarX = screenX - tBarW / 2;
      var tBarY = screenY + this.height / 2 + 10;
      ctx.fillStyle = '#222';
      ctx.fillRect(tBarX, tBarY, tBarW, tBarH);
      ctx.fillStyle = '#2196F3';
      ctx.fillRect(tBarX, tBarY, tBarW * this.trainProgress, tBarH);
    }

    // Rally point flag
    if (this.selected && this.isComplete) {
      var rpx = this.rallyPoint.x - (camera ? camera.x : 0);
      var rpy = this.rallyPoint.y - (camera ? camera.y : 0);
      // Small flag icon
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rpx, rpy);
      ctx.lineTo(rpx, rpy - 10);
      ctx.stroke();
      ctx.fillStyle = CatWar.Sprites.FACTION_COLORS[this.faction] ?
        CatWar.Sprites.FACTION_COLORS[this.faction].primary : '#fff';
      ctx.beginPath();
      ctx.moveTo(rpx, rpy - 10);
      ctx.lineTo(rpx + 6, rpy - 7);
      ctx.lineTo(rpx, rpy - 4);
      ctx.closePath();
      ctx.fill();
    }
  };

  CatWar.Building = Building;

})();
