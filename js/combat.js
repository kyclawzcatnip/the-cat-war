/*******************************************************************************
 * combat.js — The Cat War: Combat System
 *
 * Handles damage calculation, projectiles, type bonuses, auto-attack,
 * focus-fire, and death processing.
 *
 * Provides:
 *   CatWar.Combat.applyDamage(attacker, target, baseDamage)
 *   CatWar.Combat.createProjectile(source, target, type, damage, aoe)
 *   CatWar.Combat.update(dt) — tick all projectiles
 *   CatWar.Combat.draw(ctx, camera) — render projectiles
 *   CatWar.Combat.processDeaths(units) — cleanup dead units
 *
 * Depends on: entities.js, particles.js (optional)
 ******************************************************************************/

window.CatWar = window.CatWar || {};

CatWar.Combat = (function () {
  'use strict';

  /* ========================================================================
   *  TYPE BONUS TABLE
   * ====================================================================== */

  // bonusTable[attackerType][defenderType] = multiplier
  var bonusTable = {
    SPEARCAT: { CAVALRY: 2.0 },
    KNIGHT: { ARCHER: 1.3, CROSSBOW: 1.3 },
    CAVALRY: { ARCHER: 1.5, CROSSBOW: 1.3, CATAPULT: 1.5 },
    SWORDSCAT: { SPEARCAT: 1.2 },
    CATAPULT: { CASTLE_KEEP: 2.0, BARRACKS: 1.5, WATCHTOWER: 1.5 }
  };

  /* ========================================================================
   *  DAMAGE CALCULATION
   * ====================================================================== */

  /**
   * Calculate and apply damage from attacker to target.
   *
   * Formula: effectiveDamage = baseDamage * typeBonus * (1 + auraBonus) - targetArmor * 0.3
   * Minimum damage is always 1.
   *
   * @param {Entity} attacker
   * @param {Entity} target
   * @param {number} baseDamage
   * @returns {number} actual damage dealt
   */
  function applyDamage(attacker, target, baseDamage) {
    if (!target || !target.alive) return 0;

    var dmg = baseDamage;

    // Type bonus
    if (attacker && attacker.type && target.type) {
      var bonuses = bonusTable[attacker.type];
      if (bonuses && bonuses[target.type]) {
        dmg *= bonuses[target.type];
      }
    }

    // Attacker's per-unit bonus vs table
    if (attacker && attacker.bonusDamageVs && target.type) {
      if (attacker.bonusDamageVs[target.type]) {
        dmg *= attacker.bonusDamageVs[target.type];
      }
    }

    // Commander aura bonus (applied by units.js processAuras)
    if (attacker && attacker._auraDamageBonus) {
      dmg *= (1 + attacker._auraDamageBonus);
    }

    // Cavalry charge bonus
    if (attacker && attacker.chargeBonus && attacker.chargeDistance >= 3 * 32) {
      dmg *= 2;
      attacker.chargeDistance = 0;
    }

    // Armor reduction
    var armor = target.armor || 0;
    dmg = dmg - armor * 0.3;

    // Minimum 1 damage
    dmg = Math.max(1, Math.round(dmg));

    // Apply
    target.takeDamage(dmg, attacker);

    // Spawn hit particles
    if (CatWar.Particles) {
      if (baseDamage > 0) {
        CatWar.Particles.bloodSplash(target.x, target.y);
        if (!attacker || !attacker.isRanged) {
          CatWar.Particles.swordSpark(target.x, target.y);
        }
      }
    }

    return dmg;
  }

  /* ========================================================================
   *  PROJECTILE SYSTEM
   * ====================================================================== */

  var projectiles = [];

  var PROJECTILE_SPEEDS = {
    ARROW: 350,
    BOLT: 280,
    BOULDER: 180,
    HEALING_POTION: 200,
    CATNIP_POTION: 200
  };

  var PROJECTILE_COLORS = {
    ARROW: '#5c3a1e',
    BOLT: '#555555',
    BOULDER: '#808080',
    HEALING_POTION: '#44ff44',
    CATNIP_POTION: '#aa44ff'
  };

  /**
   * @constructor
   */
  function Projectile(source, target, type, damage, aoeRadius) {
    this.startX = source.x;
    this.startY = source.y;
    this.x = source.x;
    this.y = source.y;

    // Snapshot target position (for tracking)
    this.target = target;
    this.targetX = target.x;
    this.targetY = target.y;

    this.type = type || 'ARROW';
    this.speed = PROJECTILE_SPEEDS[this.type] || 300;
    this.damage = damage || 0;
    this.aoeRadius = aoeRadius || 0;
    this.sourceFaction = source.faction;
    this.source = source;

    this.alive = true;
    this.trailTimer = 0;

    // For arcing projectiles (boulders, potions)
    this.isArcing = (this.type === 'BOULDER' || this.type === 'HEALING_POTION' || this.type === 'CATNIP_POTION');
    if (this.isArcing) {
      var dx = this.targetX - this.startX;
      var dy = this.targetY - this.startY;
      this.totalDist = Math.sqrt(dx * dx + dy * dy);
      this.traveled = 0;
    }
  }

  Projectile.prototype.update = function (dt) {
    if (!this.alive) return;

    // Update target tracking for homing projectiles (arrows, bolts, potions)
    if (this.target && this.target.alive && this.type !== 'BOULDER') {
      this.targetX = this.target.x;
      this.targetY = this.target.y;
    }

    var dx = this.targetX - this.x;
    var dy = this.targetY - this.y;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.speed * dt + 4) {
      // Hit!
      this.x = this.targetX;
      this.y = this.targetY;
      this._onHit();
      return;
    }

    // Move toward target
    var nx = dx / dist;
    var ny = dy / dist;
    this.x += nx * this.speed * dt;
    this.y += ny * this.speed * dt;

    if (this.isArcing) {
      this.traveled += this.speed * dt;
    }

    // Arrow trail particles
    this.trailTimer += dt;
    if (this.trailTimer >= 0.05 && CatWar.Particles) {
      this.trailTimer = 0;
      if (this.type === 'ARROW' || this.type === 'BOLT') {
        CatWar.Particles.arrowTrail(this.x, this.y);
      }
    }
  };

  Projectile.prototype._onHit = function () {
    this.alive = false;

    // Healing/buff potions
    if (this.type === 'HEALING_POTION') {
      if (this.target && this.target.alive) {
        this.target.hp = Math.min(this.target.maxHp, this.target.hp + this.damage);
      }
      if (CatWar.Particles) {
        CatWar.Particles.healingGlow(this.targetX, this.targetY);
      }
      return;
    }

    if (this.type === 'CATNIP_POTION') {
      if (this.target && this.target.alive) {
        this.target.catnipBuff.active = true;
        this.target.catnipBuff.timeRemaining = 12;
      }
      if (CatWar.Particles) {
        // Purple sparkles for catnip
        CatWar.Particles.catnipBurst(this.targetX, this.targetY);
      }
      return;
    }

    // Damage projectiles
    if (this.aoeRadius > 0) {
      // AoE damage (boulders)
      this._applyAoeDamage();
      if (CatWar.Particles) {
        CatWar.Particles.constructionDust(this.targetX, this.targetY);
        CatWar.Particles.fireDamage(this.targetX, this.targetY);
      }
    } else {
      // Single target
      if (this.target && this.target.alive) {
        applyDamage(this.source, this.target, this.damage);
      }
    }
  };

  Projectile.prototype._applyAoeDamage = function () {
    // Get all entities in AoE radius (game manager should provide this)
    if (CatWar.GameManager && CatWar.GameManager.getEntitiesInRange) {
      var targets = CatWar.GameManager.getEntitiesInRange(this.targetX, this.targetY, this.aoeRadius);
      for (var i = 0; i < targets.length; i++) {
        var t = targets[i];
        if (t.faction === this.sourceFaction) continue; // don't damage own units
        applyDamage(this.source, t, this.damage);
      }
    } else if (this.target && this.target.alive) {
      // Fallback: just hit the primary target
      applyDamage(this.source, this.target, this.damage);
    }
  };

  Projectile.prototype.draw = function (ctx, camera) {
    if (!this.alive) return;

    var sx = this.x - (camera ? camera.x : 0);
    var sy = this.y - (camera ? camera.y : 0);
    var col = PROJECTILE_COLORS[this.type] || '#fff';

    ctx.save();

    if (this.type === 'ARROW') {
      // Arrow — thin line with arrowhead
      var dx = this.targetX - this.x;
      var dy = this.targetY - this.y;
      var angle = Math.atan2(dy, dx);
      ctx.translate(sx, sy);
      ctx.rotate(angle);
      // Shaft
      ctx.fillStyle = col;
      ctx.fillRect(-8, -0.5, 16, 1);
      // Head
      ctx.fillStyle = '#a0a0a0';
      ctx.beginPath();
      ctx.moveTo(8, -2);
      ctx.lineTo(11, 0);
      ctx.lineTo(8, 2);
      ctx.closePath();
      ctx.fill();
      // Fletching
      ctx.fillStyle = '#cc6644';
      ctx.beginPath();
      ctx.moveTo(-8, -2);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-8, 2);
      ctx.closePath();
      ctx.fill();
    } else if (this.type === 'BOLT') {
      // Bolt — thicker, shorter
      var dx2 = this.targetX - this.x;
      var dy2 = this.targetY - this.y;
      var angle2 = Math.atan2(dy2, dx2);
      ctx.translate(sx, sy);
      ctx.rotate(angle2);
      ctx.fillStyle = col;
      ctx.fillRect(-6, -1, 12, 2);
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.moveTo(6, -2.5);
      ctx.lineTo(10, 0);
      ctx.lineTo(6, 2.5);
      ctx.closePath();
      ctx.fill();
    } else if (this.type === 'BOULDER') {
      // Boulder — arc trajectory
      var arcHeight = 0;
      if (this.totalDist > 0) {
        var progress = this.traveled / this.totalDist;
        arcHeight = Math.sin(progress * Math.PI) * (this.totalDist * 0.25);
      }

      var drawY = sy - arcHeight;
      // Shadow below
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + 2, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Boulder
      ctx.fillStyle = '#808080';
      ctx.beginPath();
      ctx.arc(sx, drawY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#a0a0a0';
      ctx.beginPath();
      ctx.arc(sx - 1, drawY - 1, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'HEALING_POTION') {
      // Small green bottle arcing
      var hArc = 0;
      if (this.totalDist > 0) {
        var hProg = this.traveled / this.totalDist;
        hArc = Math.sin(hProg * Math.PI) * 30;
      }
      var hDrawY = sy - hArc;

      // Bottle body
      ctx.fillStyle = '#44ff44';
      ctx.beginPath();
      ctx.arc(sx, hDrawY, 3, 0, Math.PI * 2);
      ctx.fill();
      // Bottle neck
      ctx.fillStyle = '#339933';
      ctx.fillRect(sx - 1, hDrawY - 5, 2, 3);
      // Cork
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(sx - 1.5, hDrawY - 6, 3, 2);
      // Glow
      ctx.fillStyle = 'rgba(100, 255, 100, 0.3)';
      ctx.beginPath();
      ctx.arc(sx, hDrawY, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'CATNIP_POTION') {
      // Purple bottle arcing
      var cArc = 0;
      if (this.totalDist > 0) {
        var cProg = this.traveled / this.totalDist;
        cArc = Math.sin(cProg * Math.PI) * 30;
      }
      var cDrawY = sy - cArc;

      // Bottle body
      ctx.fillStyle = '#aa44ff';
      ctx.beginPath();
      ctx.arc(sx, cDrawY, 3, 0, Math.PI * 2);
      ctx.fill();
      // Neck
      ctx.fillStyle = '#7722cc';
      ctx.fillRect(sx - 1, cDrawY - 5, 2, 3);
      // Cork
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(sx - 1.5, cDrawY - 6, 3, 2);
      // Purple glow
      ctx.fillStyle = 'rgba(170, 68, 255, 0.3)';
      ctx.beginPath();
      ctx.arc(sx, cDrawY, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  };

  /* ========================================================================
   *  PROJECTILE MANAGEMENT
   * ====================================================================== */

  function createProjectile(source, target, type, damage, aoeRadius) {
    var proj = new Projectile(source, target, type, damage, aoeRadius || 0);
    projectiles.push(proj);
    return proj;
  }

  function update(dt) {
    for (var i = projectiles.length - 1; i >= 0; i--) {
      projectiles[i].update(dt);
      if (!projectiles[i].alive) {
        projectiles.splice(i, 1);
      }
    }
  }

  function draw(ctx, camera) {
    for (var i = 0; i < projectiles.length; i++) {
      projectiles[i].draw(ctx, camera);
    }
  }

  function getProjectileCount() {
    return projectiles.length;
  }

  /* ========================================================================
   *  DEATH PROCESSING
   * ====================================================================== */

  /**
   * Process dead units: play death animation, remove after timer.
   * Returns array of units that should be removed from the game.
   *
   * @param {Array} units
   * @returns {Array} units to remove
   */
  function processDeaths(units) {
    var toRemove = [];
    for (var i = 0; i < units.length; i++) {
      var unit = units[i];
      if (!unit.alive && unit.shouldRemove && unit.shouldRemove()) {
        toRemove.push(unit);
      }
    }
    return toRemove;
  }

  /* ========================================================================
   *  FOCUS FIRE
   * ====================================================================== */

  /**
   * When a unit's target dies, find the nearest low-HP enemy to switch to.
   *
   * @param {Unit} unit — the attacking unit whose target just died
   * @param {Array} enemies — array of enemy units
   */
  function focusFire(unit, enemies) {
    if (!unit.alive || unit.state !== CatWar.UnitState.ATTACKING) return;

    var bestTarget = null;
    var bestScore = Infinity;

    for (var i = 0; i < enemies.length; i++) {
      var enemy = enemies[i];
      if (!enemy.alive || enemy.faction === unit.faction) continue;

      var dist = unit.distanceTo(enemy);
      if (dist > unit.aggroRange) continue;

      // Score: prefer low HP and close distance
      var score = (enemy.hp / enemy.maxHp) * 100 + dist;
      if (score < bestScore) {
        bestScore = score;
        bestTarget = enemy;
      }
    }

    if (bestTarget) {
      unit.attackTarget(bestTarget);
    } else {
      unit.state = CatWar.UnitState.IDLE;
      unit.target = null;
    }
  }

  /* ========================================================================
   *  SCOUT STEALTH DETECTION
   * ====================================================================== */

  /**
   * Process scout stealth detection.
   * Scouts reveal stealthed enemy units within their vision range.
   *
   * @param {Array} units — all units
   */
  function processStealthDetection(units) {
    for (var i = 0; i < units.length; i++) {
      var scout = units[i];
      if (!scout.alive || !scout.canDetectStealth) continue;

      var visionRange = scout.visionRange || 8 * 32;

      for (var j = 0; j < units.length; j++) {
        var enemy = units[j];
        if (!enemy.alive || enemy.faction === scout.faction) continue;
        if (!enemy.isStealthed) continue;

        var dist = scout.distanceTo(enemy);
        if (dist <= visionRange) {
          enemy.isRevealed = true;
          enemy.revealTimer = 3; // stay revealed for 3 seconds after leaving scout range
        }
      }
    }
  }

  /* ========================================================================
   *  PUBLIC API
   * ====================================================================== */

  return {
    applyDamage: applyDamage,
    createProjectile: createProjectile,
    update: update,
    draw: draw,
    getProjectileCount: getProjectileCount,
    processDeaths: processDeaths,
    focusFire: focusFire,
    processStealthDetection: processStealthDetection,
    bonusTable: bonusTable,
    Projectile: Projectile
  };

})();
