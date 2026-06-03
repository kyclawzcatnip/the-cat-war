/*******************************************************************************
 * particles.js — The Cat War: Visual Effects System
 *
 * Lightweight particle engine for making combat and interactions feel alive.
 * All effects are purely visual — no gameplay impact.
 *
 * Provides:
 *   CatWar.Particles.update(dt)
 *   CatWar.Particles.draw(ctx, camera)
 *   CatWar.Particles.<emitterName>(x, y)
 *
 * No dependencies (draws primitives directly).
 ******************************************************************************/

window.CatWar = window.CatWar || {};

CatWar.Particles = (function () {
  'use strict';

  /* ========================================================================
   *  PARTICLE POOL
   * ====================================================================== */

  var MAX_PARTICLES = 400;
  var particles = [];

  function Particle(x, y, vx, vy, life, color, size, shape, gravity, fadeStart) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.size = size;
    this.shape = shape || 'circle';  // 'circle', 'square', 'star', 'line'
    this.alpha = 1;
    this.gravity = gravity || 0;
    this.fadeStart = fadeStart !== undefined ? fadeStart : 0.5; // fraction of life when fade begins
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 4;
    this.alive = true;
  }

  Particle.prototype.update = function (dt) {
    if (!this.alive) return;

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += this.gravity * dt;
    this.rotation += this.rotationSpeed * dt;
    this.life -= dt;

    // Fade out
    var lifeRatio = this.life / this.maxLife;
    if (lifeRatio < this.fadeStart) {
      this.alpha = lifeRatio / this.fadeStart;
    }

    if (this.life <= 0) {
      this.alive = false;
    }
  };

  Particle.prototype.draw = function (ctx, camera) {
    if (!this.alive || this.alpha <= 0) return;

    var sx = this.x - (camera ? camera.x : 0);
    var sy = this.y - (camera ? camera.y : 0);

    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);

    switch (this.shape) {
      case 'circle':
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(sx, sy, this.size, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'square':
        ctx.fillStyle = this.color;
        ctx.translate(sx, sy);
        ctx.rotate(this.rotation);
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        break;

      case 'star':
        ctx.fillStyle = this.color;
        ctx.translate(sx, sy);
        ctx.rotate(this.rotation);
        drawStar(ctx, 0, 0, this.size);
        break;

      case 'line':
        ctx.strokeStyle = this.color;
        ctx.lineWidth = Math.max(0.5, this.size * 0.5);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - this.vx * 0.03, sy - this.vy * 0.03);
        ctx.stroke();
        break;
    }

    ctx.restore();
  };

  function drawStar(ctx, cx, cy, size) {
    ctx.beginPath();
    for (var i = 0; i < 4; i++) {
      var angle = (i / 4) * Math.PI * 2 - Math.PI / 4;
      var px = cx + Math.cos(angle) * size;
      var py = cy + Math.sin(angle) * size;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
      // Inner point
      var innerAngle = ((i + 0.5) / 4) * Math.PI * 2 - Math.PI / 4;
      var ipx = cx + Math.cos(innerAngle) * size * 0.4;
      var ipy = cy + Math.sin(innerAngle) * size * 0.4;
      ctx.lineTo(ipx, ipy);
    }
    ctx.closePath();
    ctx.fill();
  }

  /* ========================================================================
   *  ADD PARTICLE (with pool limit)
   * ====================================================================== */

  function addParticle(p) {
    if (particles.length >= MAX_PARTICLES) {
      // Replace oldest dead particle, or skip
      for (var i = 0; i < particles.length; i++) {
        if (!particles[i].alive) {
          particles[i] = p;
          return;
        }
      }
      // All alive — drop this particle
      return;
    }
    particles.push(p);
  }

  function emit(x, y, count, config) {
    for (var i = 0; i < count; i++) {
      var vx = (config.vx || 0) + (Math.random() - 0.5) * (config.spread || 50);
      var vy = (config.vy || 0) + (Math.random() - 0.5) * (config.spread || 50);
      var life = (config.life || 0.5) + Math.random() * (config.lifeVar || 0.3);
      var size = (config.size || 2) + Math.random() * (config.sizeVar || 1);
      var color = config.colors
        ? config.colors[Math.floor(Math.random() * config.colors.length)]
        : (config.color || '#ffffff');

      addParticle(new Particle(
        x + (Math.random() - 0.5) * (config.posSpread || 4),
        y + (Math.random() - 0.5) * (config.posSpread || 4),
        vx, vy, life, color, size,
        config.shape || 'circle',
        config.gravity || 0,
        config.fadeStart
      ));
    }
  }

  /* ========================================================================
   *  EMITTER PRESETS — each is a named particle burst
   * ====================================================================== */

  /**
   * Brown dust when units move on dirt/sand.
   */
  function dustCloud(x, y) {
    emit(x, y, 5, {
      vx: 0, vy: -15,
      spread: 30,
      life: 0.4, lifeVar: 0.2,
      size: 2, sizeVar: 1.5,
      colors: ['#c4a070', '#a08860', '#d4b080', '#8a7050'],
      shape: 'circle',
      gravity: 10,
      posSpread: 8
    });
  }

  /**
   * Orange/yellow sparks on melee hit.
   */
  function swordSpark(x, y) {
    emit(x, y, 8, {
      vx: 0, vy: -30,
      spread: 80,
      life: 0.25, lifeVar: 0.15,
      size: 1.5, sizeVar: 1,
      colors: ['#ffcc00', '#ff9900', '#ffff66', '#ffdd44', '#ffffff'],
      shape: 'star',
      gravity: 60,
      posSpread: 6
    });
  }

  /**
   * Faint trail line behind arrows.
   */
  function arrowTrail(x, y) {
    addParticle(new Particle(
      x, y,
      (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 5,
      0.15, 'rgba(200, 180, 150, 0.5)', 1,
      'circle', 0, 0.8
    ));
  }

  /**
   * Green sparkles rising upward (healing).
   */
  function healingGlow(x, y) {
    emit(x, y, 12, {
      vx: 0, vy: -40,
      spread: 25,
      life: 0.8, lifeVar: 0.4,
      size: 2, sizeVar: 1,
      colors: ['#44ff44', '#88ff88', '#aaffaa', '#22cc22', '#66ff66'],
      shape: 'star',
      gravity: -20,
      posSpread: 12,
      fadeStart: 0.4
    });
  }

  /**
   * Purple sparkles for catnip potion burst.
   */
  function catnipBurst(x, y) {
    emit(x, y, 15, {
      vx: 0, vy: -35,
      spread: 40,
      life: 0.9, lifeVar: 0.3,
      size: 2.5, sizeVar: 1.5,
      colors: ['#aa44ff', '#cc66ff', '#dd88ff', '#8822dd', '#bb55ee'],
      shape: 'star',
      gravity: -15,
      posSpread: 14,
      fadeStart: 0.35
    });
  }

  /**
   * Grey dust during building construction.
   */
  function constructionDust(x, y) {
    emit(x, y, 6, {
      vx: 0, vy: -20,
      spread: 40,
      life: 0.6, lifeVar: 0.3,
      size: 2.5, sizeVar: 2,
      colors: ['#a0a0a0', '#808080', '#b0b0b0', '#c0c0c0'],
      shape: 'circle',
      gravity: 15,
      posSpread: 16
    });
  }

  /**
   * Yellow/gold sparkles at gold mines.
   */
  function goldSparkle(x, y) {
    emit(x, y, 4, {
      vx: 0, vy: -25,
      spread: 20,
      life: 0.6, lifeVar: 0.3,
      size: 1.5, sizeVar: 1,
      colors: ['#ffd700', '#ffec8b', '#fff8dc', '#daa520'],
      shape: 'star',
      gravity: -5,
      posSpread: 10,
      fadeStart: 0.3
    });
  }

  /**
   * Grey puff when unit dies.
   */
  function deathPoof(x, y) {
    emit(x, y, 10, {
      vx: 0, vy: -20,
      spread: 50,
      life: 0.7, lifeVar: 0.3,
      size: 3, sizeVar: 2,
      colors: ['#888888', '#aaaaaa', '#666666', '#cccccc'],
      shape: 'circle',
      gravity: -10,
      posSpread: 10,
      fadeStart: 0.5
    });
  }

  /**
   * Orange/red flames on damaged buildings.
   */
  function fireDamage(x, y) {
    emit(x, y, 10, {
      vx: 0, vy: -50,
      spread: 30,
      life: 0.5, lifeVar: 0.3,
      size: 3, sizeVar: 2,
      colors: ['#ff4400', '#ff6600', '#ff8800', '#ffaa00', '#ffcc00'],
      shape: 'circle',
      gravity: -30,
      posSpread: 12,
      fadeStart: 0.4
    });
    // Smoke on top
    emit(x, y - 10, 4, {
      vx: 0, vy: -30,
      spread: 15,
      life: 0.8, lifeVar: 0.3,
      size: 4, sizeVar: 2,
      colors: ['#333333', '#555555', '#444444'],
      shape: 'circle',
      gravity: -15,
      posSpread: 8,
      fadeStart: 0.5
    });
  }

  /**
   * Multicolored confetti burst — victory celebration!
   */
  function victoryConfetti(x, y) {
    emit(x, y, 30, {
      vx: 0, vy: -80,
      spread: 120,
      life: 2.0, lifeVar: 1.0,
      size: 3, sizeVar: 2,
      colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff',
        '#00ffff', '#ff8800', '#ff0088', '#88ff00', '#ffffff'],
      shape: 'square',
      gravity: 80,
      posSpread: 20,
      fadeStart: 0.3
    });
  }

  /**
   * Small red particles on hit — subtle, cat-friendly blood.
   */
  function bloodSplash(x, y) {
    emit(x, y, 4, {
      vx: 0, vy: -10,
      spread: 40,
      life: 0.3, lifeVar: 0.15,
      size: 1.5, sizeVar: 0.5,
      colors: ['#cc3333', '#ff4444', '#aa2222'],
      shape: 'circle',
      gravity: 50,
      posSpread: 6,
      fadeStart: 0.6
    });
  }

  /**
   * Gathering effect — pickaxe sparks.
   */
  function gatherSpark(x, y) {
    emit(x, y, 3, {
      vx: 0, vy: -15,
      spread: 25,
      life: 0.2, lifeVar: 0.1,
      size: 1, sizeVar: 0.5,
      colors: ['#ffcc00', '#cccccc', '#ffffff'],
      shape: 'star',
      gravity: 40,
      posSpread: 4
    });
  }

  /**
   * Building placement preview particles.
   */
  function placementGlow(x, y) {
    emit(x, y, 2, {
      vx: 0, vy: -10,
      spread: 10,
      life: 0.5, lifeVar: 0.2,
      size: 2, sizeVar: 1,
      colors: ['rgba(100, 200, 255, 0.5)', 'rgba(150, 220, 255, 0.4)'],
      shape: 'circle',
      gravity: -5,
      posSpread: 20
    });
  }

  /**
   * Selection ring particles.
   */
  function selectionRing(x, y) {
    for (var i = 0; i < 4; i++) {
      var angle = (i / 4) * Math.PI * 2 + Date.now() * 0.002;
      var px = x + Math.cos(angle) * 14;
      var py = y + Math.sin(angle) * 14;
      addParticle(new Particle(
        px, py, 0, -10, 0.3,
        'rgba(255, 255, 255, 0.6)', 1.5,
        'circle', 0, 0.5
      ));
    }
  }

  /* ========================================================================
   *  UPDATE & DRAW
   * ====================================================================== */

  function update(dt) {
    // Swap-and-pop removal: O(1) per dead particle instead of O(n) splice
    for (var i = particles.length - 1; i >= 0; i--) {
      particles[i].update(dt);
      if (!particles[i].alive) {
        particles[i] = particles[particles.length - 1];
        particles.pop();
      }
    }
  }

  function draw(ctx, camera) {
    for (var i = 0; i < particles.length; i++) {
      particles[i].draw(ctx, camera);
    }
  }

  function getParticleCount() {
    return particles.length;
  }

  function clear() {
    particles.length = 0;
  }

  /* ========================================================================
   *  PUBLIC API
   * ====================================================================== */

  return {
    update: update,
    draw: draw,
    getParticleCount: getParticleCount,
    clear: clear,

    // Emitters
    dustCloud: dustCloud,
    swordSpark: swordSpark,
    arrowTrail: arrowTrail,
    healingGlow: healingGlow,
    catnipBurst: catnipBurst,
    constructionDust: constructionDust,
    goldSparkle: goldSparkle,
    deathPoof: deathPoof,
    fireDamage: fireDamage,
    victoryConfetti: victoryConfetti,
    bloodSplash: bloodSplash,
    gatherSpark: gatherSpark,
    placementGlow: placementGlow,
    selectionRing: selectionRing,

    // Low-level (for custom effects)
    emit: emit,
    addParticle: addParticle,
    Particle: Particle
  };

})();
