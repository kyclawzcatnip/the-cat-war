/*******************************************************************************
 * sprites.js — The Cat War: Programmatic Pixel-Art Sprite Renderer
 *
 * Every visual in the game is drawn procedurally on a <canvas> using
 * arcs, rects, paths, fills, and strokes — NO external images.
 *
 * Public API (all hang off CatWar.Sprites):
 *   drawCat(ctx, x, y, unitType, faction, direction, animFrame, scale)
 *   drawBuilding(ctx, x, y, buildingType, faction, constructionProgress, scale)
 *   drawTile(ctx, x, y, tileType, variation, animFrame)
 *   drawResourceNode(ctx, x, y, resourceType, remaining, animFrame, richness)
 ******************************************************************************/

window.CatWar = window.CatWar || {};

CatWar.Sprites = (function () {
  'use strict';

  /* ========================================================================
   *  COLOUR PALETTES
   * ====================================================================== */

  // Faction colour sets — every faction has primary, secondary, accent, trim
  var FACTION_COLORS = {
    // Game faction IDs mapped to custom premium colors
    LION:       { primary: '#DAA520', secondary: '#8B0000', accent: '#8B0000', trim: '#FFD700', banner: '#DAA520' },
    SIAMESE:    { primary: '#4682B4', secondary: '#C0C0C0', accent: '#708090', trim: '#F0F8FF', banner: '#4682B4' },
    MAINE_COON: { primary: '#2E8B57', secondary: '#8B4513', accent: '#556B2F', trim: '#8FBC8F', banner: '#2E8B57' },
    BLACK_CAT:  { primary: '#6A0DAD', secondary: '#1C1C1C', accent: '#4B0082', trim: '#E6E6FA', banner: '#6A0DAD' },
    PERSIAN:    { primary: '#FFFFF0', secondary: '#FFD700', accent: '#CD853F', trim: '#FFF8DC', banner: '#FFD700' },

    // Fallbacks
    0: { primary: '#3b7dd8', secondary: '#5a9cf0', accent: '#1b4f8a', trim: '#c0d8f8', banner: '#2a6abf' },  // Blue
    1: { primary: '#d83b3b', secondary: '#f05a5a', accent: '#8a1b1b', trim: '#f8c0c0', banner: '#bf2a2a' },  // Red
    2: { primary: '#3bd84a', secondary: '#5af06a', accent: '#1b8a2a', trim: '#c0f8c8', banner: '#2abf3a' },  // Green
    3: { primary: '#d8c43b', secondary: '#f0dc5a', accent: '#8a7a1b', trim: '#f8f0c0', banner: '#bfaa2a' },  // Yellow
  };

  // Cat fur palette (warm, inviting)
  var FUR_COLORS = ['#f4a460', '#d2691e', '#8b4513', '#c0c0c0', '#3a3a3a', '#f5deb3', '#ff8c00'];

  // Get deterministic fur colour from entity id
  function furColor(id) { return FUR_COLORS[(id || 0) % FUR_COLORS.length]; }

  // Faction helpers
  function fac(faction) { return FACTION_COLORS[faction] || FACTION_COLORS[0]; }

  /* ========================================================================
   *  TINY DRAWING HELPERS
   * ====================================================================== */

  function px(ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  function circle(ctx, cx, cy, r, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function oval(ctx, cx, cy, rx, ry, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function ovalStroke(ctx, cx, cy, rx, ry, col, lw) {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw || 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function line(ctx, x1, y1, x2, y2, col, lw) {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw || 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function triangle(ctx, x1, y1, x2, y2, x3, y3, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();
  }

  function roundRect(ctx, x, y, w, h, r, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function roundRectStroke(ctx, x, y, w, h, r, col, lw) {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw || 1;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.stroke();
  }

  /* ========================================================================
   *  CAT BASE BODY — shared between all unit types
   * ====================================================================== */

  // dir: -1 = left, 1 = right
  // frame: 0-3 walk, or idle
  // returns nothing; draws in place assuming ctx is translated to cat center
  function drawCatBase(ctx, dir, frame, fur, factionCols, scale) {
    var s = scale || 1;
    var d = dir || 1;
    var bob = 0;
    if (frame !== undefined && frame >= 0) {
      bob = Math.sin(frame * Math.PI / 2) * 1.5 * s; // slight bounce
    }

    ctx.save();
    ctx.scale(d, 1); // flip for direction

    // --- Shadow ---
    oval(ctx, 0, 10 * s, 8 * s, 2 * s, 'rgba(0,0,0,0.18)');

    // --- Tail ---
    ctx.strokeStyle = fur;
    ctx.lineWidth = 2.5 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    var tailWag = Math.sin((frame || 0) * 0.8) * 3 * s;
    ctx.moveTo(-6 * s, 2 * s + bob);
    ctx.quadraticCurveTo(-12 * s, -4 * s + tailWag + bob, -10 * s, -10 * s + tailWag + bob);
    ctx.stroke();
    // Tail tip
    circle(ctx, -10 * s, -10 * s + tailWag + bob, 1.5 * s, fur);

    // --- Hind legs ---
    var legOff1 = Math.sin(frame * Math.PI / 2) * 2 * s;
    var legOff2 = Math.sin((frame + 2) * Math.PI / 2) * 2 * s;
    px(ctx, -4 * s, 6 * s + bob, 3 * s, 5 * s + legOff1, fur);
    px(ctx, 2 * s, 6 * s + bob, 3 * s, 5 * s + legOff2, fur);
    // Paws
    oval(ctx, -2.5 * s, 11 * s + bob + legOff1, 2 * s, 1.2 * s, '#e8c4a0');
    oval(ctx, 3.5 * s, 11 * s + bob + legOff2, 2 * s, 1.2 * s, '#e8c4a0');

    // --- Body ---
    oval(ctx, 0, 2 * s + bob, 7 * s, 6 * s, fur);

    // --- Belly highlight ---
    oval(ctx, 0, 3 * s + bob, 4.5 * s, 3.5 * s, lighten(fur, 30));

    // --- Front legs ---
    var flegOff1 = Math.sin((frame + 1) * Math.PI / 2) * 2 * s;
    var flegOff2 = Math.sin((frame + 3) * Math.PI / 2) * 2 * s;
    px(ctx, 3 * s, 5 * s + bob, 2.5 * s, 5 * s + flegOff1, fur);
    px(ctx, 6 * s, 5 * s + bob, 2.5 * s, 5 * s + flegOff2, fur);
    oval(ctx, 4.2 * s, 10 * s + bob + flegOff1, 1.8 * s, 1 * s, '#e8c4a0');
    oval(ctx, 7.2 * s, 10 * s + bob + flegOff2, 1.8 * s, 1 * s, '#e8c4a0');

    // --- Head ---
    var headY = -5 * s + bob;
    circle(ctx, 4 * s, headY, 5.5 * s, fur);

    // --- Ears ---
    triangle(ctx, 1 * s, headY - 4 * s, 0 * s, headY - 9 * s, 4 * s, headY - 6 * s, fur);
    triangle(ctx, 7 * s, headY - 4 * s, 8 * s, headY - 9 * s, 4 * s, headY - 6 * s, fur);
    // Inner ear
    triangle(ctx, 1.5 * s, headY - 4.5 * s, 1 * s, headY - 7.5 * s, 3.5 * s, headY - 5.5 * s, '#ffb6c1');
    triangle(ctx, 6.5 * s, headY - 4.5 * s, 7 * s, headY - 7.5 * s, 4.5 * s, headY - 5.5 * s, '#ffb6c1');

    // --- Eyes ---
    var eyeY = headY - 0.5 * s;
    // Whites
    oval(ctx, 2 * s, eyeY, 2 * s, 1.8 * s, '#ffffff');
    oval(ctx, 6 * s, eyeY, 2 * s, 1.8 * s, '#ffffff');
    // Pupils (follow direction slightly)
    circle(ctx, 2.5 * s, eyeY, 1 * s, '#222222');
    circle(ctx, 6.5 * s, eyeY, 1 * s, '#222222');
    // Eye shine
    circle(ctx, 2 * s, eyeY - 0.5 * s, 0.4 * s, '#ffffff');
    circle(ctx, 6 * s, eyeY - 0.5 * s, 0.4 * s, '#ffffff');

    // --- Nose ---
    triangle(ctx, 3.5 * s, headY + 2 * s, 4.5 * s, headY + 2 * s, 4 * s, headY + 3 * s, '#ff69b4');

    // --- Mouth ---
    ctx.strokeStyle = '#4a2a1a';
    ctx.lineWidth = 0.6 * s;
    ctx.beginPath();
    ctx.moveTo(4 * s, headY + 3 * s);
    ctx.lineTo(3 * s, headY + 4 * s);
    ctx.moveTo(4 * s, headY + 3 * s);
    ctx.lineTo(5 * s, headY + 4 * s);
    ctx.stroke();

    // --- Whiskers ---
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 0.5 * s;
    // Left whiskers
    line(ctx, 1 * s, headY + 1.5 * s, -4 * s, headY + 0.5 * s, '#3a2a1a', 0.5 * s);
    line(ctx, 1 * s, headY + 2.5 * s, -4 * s, headY + 3 * s, '#3a2a1a', 0.5 * s);
    // Right whiskers
    line(ctx, 7 * s, headY + 1.5 * s, 12 * s, headY + 0.5 * s, '#3a2a1a', 0.5 * s);
    line(ctx, 7 * s, headY + 2.5 * s, 12 * s, headY + 3 * s, '#3a2a1a', 0.5 * s);

    ctx.restore();
  }

  /* Lighten / darken helpers */
  function lighten(hex, amt) {
    var num = parseInt(hex.replace('#', ''), 16);
    var r = Math.min(255, ((num >> 16) & 0xff) + amt);
    var g = Math.min(255, ((num >> 8) & 0xff) + amt);
    var b = Math.min(255, (num & 0xff) + amt);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function darken(hex, amt) { return lighten(hex, -amt); }

  function withAlpha(hex, a) {
    var num = parseInt(hex.replace('#', ''), 16);
    var r = (num >> 16) & 0xff;
    var g = (num >> 8) & 0xff;
    var b = num & 0xff;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ========================================================================
   *  UNIT-SPECIFIC OVERLAYS — armour, weapons, headgear
   * ====================================================================== */

  var unitDrawers = {};

  // ----------- HEAD MINER -----------
  unitDrawers.HEAD_MINER = function (ctx, dir, frame, fur, fc, s, state) {
    drawCatBase(ctx, dir, frame, fur, fc, s);
    var d = dir || 1;
    var bob = Math.sin((frame || 0) * Math.PI / 2) * 1.5 * s;
    ctx.save();
    ctx.scale(d, 1);

    // Golden headband / small crown
    px(ctx, 0 * s, -11 * s + bob, 8 * s, 2 * s, '#ffd700');
    // Crown points
    triangle(ctx, 1 * s, -11 * s + bob, 2 * s, -14 * s + bob, 3 * s, -11 * s + bob, '#ffd700');
    triangle(ctx, 3.5 * s, -11 * s + bob, 4.5 * s, -13 * s + bob, 5.5 * s, -11 * s + bob, '#ffd700');
    triangle(ctx, 5.5 * s, -11 * s + bob, 6.5 * s, -14 * s + bob, 7.5 * s, -11 * s + bob, '#ffd700');
    // Jewel on crown
    circle(ctx, 4.5 * s, -12 * s + bob, 0.7 * s, '#ff4444');

    // Tunic
    roundRect(ctx, -3 * s, 0 * s + bob, 12 * s, 6 * s, 1, fc.primary);

    // Golden pickaxe
    var atkAngle = state === 'GATHERING' ? Math.sin(frame * Math.PI) * 0.7 : 0.2;
    ctx.save();
    ctx.translate(10 * s, -2 * s + bob);
    ctx.rotate(atkAngle);
    // Handle
    px(ctx, 0, 0, 1.5 * s, 10 * s, '#8B4513');
    // Axe head - golden
    px(ctx, -3 * s, -1 * s, 7 * s, 3 * s, '#ffd700');
    px(ctx, -2 * s, -2 * s, 5 * s, 1 * s, '#ffec8b');
    // Sparkle
    circle(ctx, -1 * s, -1 * s, 1 * s, '#fff8dc');
    ctx.restore();

    // Sparkle effect on the cat
    if (frame % 4 < 2) {
      circle(ctx, (Math.sin(frame * 1.3) * 5) * s, (-3 + Math.cos(frame * 0.9) * 4) * s + bob, 1 * s, '#ffd700');
    }

    ctx.restore();
  };

  // ----------- PEASANT -----------
  unitDrawers.PEASANT = function (ctx, dir, frame, fur, fc, s, state) {
    drawCatBase(ctx, dir, frame, fur, fc, s);
    var d = dir || 1;
    var bob = Math.sin((frame || 0) * Math.PI / 2) * 1.5 * s;
    ctx.save();
    ctx.scale(d, 1);

    // Simple tunic
    roundRect(ctx, -3 * s, 0 * s + bob, 12 * s, 6 * s, 1, fc.primary);
    // Belt
    px(ctx, -3 * s, 4 * s + bob, 12 * s, 1.5 * s, darken(fc.primary, 40));

    // Pickaxe
    var swing = state === 'GATHERING' ? Math.sin(frame * Math.PI) * 0.8 : 0.3;
    ctx.save();
    ctx.translate(10 * s, -2 * s + bob);
    ctx.rotate(swing);
    px(ctx, 0, 0, 1.2 * s, 9 * s, '#8B4513');
    px(ctx, -2.5 * s, -1 * s, 6 * s, 2.5 * s, '#808080');
    px(ctx, -1.5 * s, -2 * s, 4 * s, 1 * s, '#a0a0a0');
    ctx.restore();

    ctx.restore();
  };

  // ----------- SWORDSCAT -----------
  unitDrawers.SWORDSCAT = function (ctx, dir, frame, fur, fc, s, state) {
    drawCatBase(ctx, dir, frame, fur, fc, s);
    var d = dir || 1;
    var bob = Math.sin((frame || 0) * Math.PI / 2) * 1.5 * s;
    ctx.save();
    ctx.scale(d, 1);

    // Chest armor
    roundRect(ctx, -4 * s, -1 * s + bob, 14 * s, 7 * s, 2, fc.primary);
    roundRectStroke(ctx, -4 * s, -1 * s + bob, 14 * s, 7 * s, 2, fc.accent, 1);
    // Armor detail lines
    line(ctx, 3 * s, -1 * s + bob, 3 * s, 6 * s + bob, fc.accent, 0.8 * s);

    // Helmet piece
    ctx.fillStyle = fc.secondary;
    ctx.beginPath();
    ctx.arc(4 * s, -6 * s + bob, 3 * s, Math.PI, 0);
    ctx.fill();

    // Shield on back arm
    oval(ctx, -3 * s, 2 * s + bob, 4 * s, 5 * s, fc.secondary);
    ovalStroke(ctx, -3 * s, 2 * s + bob, 4 * s, 5 * s, fc.accent, 1);
    // Shield emblem (small circle)
    circle(ctx, -3 * s, 2 * s + bob, 1.5 * s, fc.trim);

    // Sword
    var swordAngle = state === 'ATTACKING' ? Math.sin(frame * Math.PI * 0.8) * 1.2 : -0.3;
    ctx.save();
    ctx.translate(10 * s, -2 * s + bob);
    ctx.rotate(swordAngle);
    // Blade
    px(ctx, -0.5 * s, -10 * s, 1.5 * s, 10 * s, '#d0d0d0');
    px(ctx, 0 * s, -10 * s, 0.5 * s, 9 * s, '#f0f0f0'); // highlight
    // Crossguard
    px(ctx, -2 * s, 0, 5 * s, 1.5 * s, '#ffd700');
    // Grip
    px(ctx, 0, 1 * s, 1 * s, 3 * s, '#5c3a1e');
    // Pommel
    circle(ctx, 0.5 * s, 4.5 * s, 1 * s, '#ffd700');
    ctx.restore();

    ctx.restore();
  };

  // ----------- SPEARCAT -----------
  unitDrawers.SPEARCAT = function (ctx, dir, frame, fur, fc, s, state) {
    drawCatBase(ctx, dir, frame, fur, fc, s);
    var d = dir || 1;
    var bob = Math.sin((frame || 0) * Math.PI / 2) * 1.5 * s;
    ctx.save();
    ctx.scale(d, 1);

    // Light leather armor
    roundRect(ctx, -3 * s, 0 * s + bob, 12 * s, 5 * s, 1, darken(fc.primary, 15));
    // Shoulder guards
    oval(ctx, -2 * s, -1 * s + bob, 3 * s, 2 * s, fc.primary);
    oval(ctx, 8 * s, -1 * s + bob, 3 * s, 2 * s, fc.primary);

    // Spear
    var thrustOff = state === 'ATTACKING' ? Math.sin(frame * Math.PI) * 4 * s : 0;
    ctx.save();
    ctx.translate(8 * s + thrustOff, -3 * s + bob);
    // Shaft
    px(ctx, 0, -8 * s, 1 * s, 18 * s, '#8B4513');
    // Spear head
    triangle(ctx, -1.5 * s, -11 * s, 0.5 * s, -15 * s, 2.5 * s, -11 * s, '#c0c0c0');
    px(ctx, 0 * s, -12 * s, 1 * s, 4 * s, '#d8d8d8');
    ctx.restore();

    ctx.restore();
  };

  // ----------- ARCHER -----------
  unitDrawers.ARCHER = function (ctx, dir, frame, fur, fc, s, state) {
    drawCatBase(ctx, dir, frame, fur, fc, s);
    var d = dir || 1;
    var bob = Math.sin((frame || 0) * Math.PI / 2) * 1.5 * s;
    ctx.save();
    ctx.scale(d, 1);

    // Hood / cloak
    ctx.fillStyle = fc.primary;
    ctx.beginPath();
    ctx.moveTo(0 * s, -6 * s + bob);
    ctx.quadraticCurveTo(4 * s, -14 * s + bob, 8 * s, -6 * s + bob);
    ctx.lineTo(9 * s, 5 * s + bob);
    ctx.lineTo(-1 * s, 5 * s + bob);
    ctx.closePath();
    ctx.fill();
    // Cloak edge
    ctx.strokeStyle = fc.accent;
    ctx.lineWidth = 0.8 * s;
    ctx.stroke();

    // Cape behind
    ctx.fillStyle = withAlpha(fc.primary, 0.6);
    ctx.beginPath();
    ctx.moveTo(-2 * s, 2 * s + bob);
    ctx.quadraticCurveTo(-6 * s, 8 * s + bob, -3 * s, 12 * s + bob);
    ctx.lineTo(0 * s, 5 * s + bob);
    ctx.closePath();
    ctx.fill();

    // Bow
    ctx.strokeStyle = '#6b3a1f';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.arc(10 * s, 0 + bob, 7 * s, -Math.PI * 0.6, Math.PI * 0.6, false);
    ctx.stroke();

    // Bowstring
    var drawPull = state === 'ATTACKING' ? (frame % 3) * 2 * s : 0;
    ctx.strokeStyle = '#c0a070';
    ctx.lineWidth = 0.5 * s;
    ctx.beginPath();
    ctx.moveTo(10 * s + Math.cos(-Math.PI * 0.6) * 7 * s, bob + Math.sin(-Math.PI * 0.6) * 7 * s);
    ctx.lineTo(10 * s - drawPull, 0 + bob);
    ctx.lineTo(10 * s + Math.cos(Math.PI * 0.6) * 7 * s, bob + Math.sin(Math.PI * 0.6) * 7 * s);
    ctx.stroke();

    // Arrow
    if (state === 'ATTACKING' && drawPull > 0) {
      line(ctx, 10 * s - drawPull, 0 + bob, 15 * s, 0 + bob, '#5c3a1e', 1 * s);
      triangle(ctx, 15 * s, -1 * s + bob, 17 * s, 0 + bob, 15 * s, 1 * s + bob, '#a0a0a0');
    }

    // Quiver on back
    px(ctx, -5 * s, -4 * s + bob, 2 * s, 8 * s, '#6b3a1f');
    line(ctx, -4 * s, -5 * s + bob, -4 * s, -7 * s + bob, '#c0c0c0', 0.5 * s);
    line(ctx, -4.5 * s, -5 * s + bob, -5 * s, -8 * s + bob, '#c0c0c0', 0.5 * s);

    ctx.restore();
  };

  // ----------- CROSSBOW -----------
  unitDrawers.CROSSBOW = function (ctx, dir, frame, fur, fc, s, state) {
    drawCatBase(ctx, dir, frame, fur, fc, s);
    var d = dir || 1;
    var bob = Math.sin((frame || 0) * Math.PI / 2) * 1.5 * s;
    ctx.save();
    ctx.scale(d, 1);

    // Heavy armor
    roundRect(ctx, -4 * s, -1 * s + bob, 14 * s, 7 * s, 2, fc.primary);
    roundRectStroke(ctx, -4 * s, -1 * s + bob, 14 * s, 7 * s, 2, fc.accent, 1.2);
    // Armor studs
    circle(ctx, -1 * s, 1 * s + bob, 0.7 * s, fc.trim);
    circle(ctx, 2 * s, 1 * s + bob, 0.7 * s, fc.trim);
    circle(ctx, 5 * s, 1 * s + bob, 0.7 * s, fc.trim);
    circle(ctx, 8 * s, 1 * s + bob, 0.7 * s, fc.trim);

    // Helmet
    roundRect(ctx, 1 * s, -9 * s + bob, 6 * s, 3 * s, 1, fc.secondary);

    // Crossbow
    ctx.save();
    ctx.translate(10 * s, 0 + bob);
    // Stock
    px(ctx, 0, -1 * s, 8 * s, 2 * s, '#6b3a1f');
    // Prod (bow part)
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(1 * s, -4 * s);
    ctx.lineTo(4 * s, -1 * s);
    ctx.lineTo(1 * s, 2 * s);
    ctx.stroke();
    // String
    ctx.strokeStyle = '#c0a070';
    ctx.lineWidth = 0.5 * s;
    line(ctx, 1 * s, -4 * s, 1 * s, 2 * s, '#c0a070', 0.5 * s);
    // Bolt
    if (state !== 'ATTACKING' || frame % 3 === 0) {
      line(ctx, 1 * s, 0, 8 * s, 0, '#5c3a1e', 0.8 * s);
      triangle(ctx, 8 * s, -1 * s, 10 * s, 0, 8 * s, 1 * s, '#808080');
    }
    ctx.restore();

    ctx.restore();
  };

  // ----------- KNIGHT -----------
  unitDrawers.KNIGHT = function (ctx, dir, frame, fur, fc, s, state) {
    drawCatBase(ctx, dir, frame, fur, fc, s);
    var d = dir || 1;
    var bob = Math.sin((frame || 0) * Math.PI / 2) * 1.5 * s;
    ctx.save();
    ctx.scale(d, 1);

    // Full plate armor body
    roundRect(ctx, -5 * s, -2 * s + bob, 16 * s, 9 * s, 2, '#a0a0b0');
    roundRectStroke(ctx, -5 * s, -2 * s + bob, 16 * s, 9 * s, 2, '#707080', 1);
    // Faction tabard over armor
    roundRect(ctx, -2 * s, 0 * s + bob, 10 * s, 7 * s, 1, fc.primary);
    // Tabard emblem
    circle(ctx, 3 * s, 3 * s + bob, 2 * s, fc.trim);
    circle(ctx, 3 * s, 3 * s + bob, 1 * s, fc.accent);

    // Full helmet with visor
    roundRect(ctx, 0 * s, -10 * s + bob, 8 * s, 5 * s, 2, '#a0a0b0');
    // Visor slit
    px(ctx, 1 * s, -8 * s + bob, 6 * s, 1 * s, '#222');
    // Plume on top
    ctx.fillStyle = fc.secondary;
    ctx.beginPath();
    ctx.moveTo(4 * s, -10 * s + bob);
    ctx.quadraticCurveTo(6 * s, -16 * s + bob, 0 * s, -14 * s + bob);
    ctx.quadraticCurveTo(2 * s, -12 * s + bob, 4 * s, -10 * s + bob);
    ctx.fill();

    // Great sword
    var swordRot = state === 'ATTACKING' ? Math.sin(frame * Math.PI * 0.7) * 1.5 : -0.4;
    ctx.save();
    ctx.translate(12 * s, -4 * s + bob);
    ctx.rotate(swordRot);
    // Large blade
    px(ctx, -1 * s, -14 * s, 2.5 * s, 14 * s, '#c8c8d0');
    px(ctx, -0.2 * s, -14 * s, 0.8 * s, 13 * s, '#e0e0e8'); // highlight
    // Crossguard
    px(ctx, -3 * s, 0, 7 * s, 2 * s, '#ffd700');
    // Grip
    px(ctx, 0, 2 * s, 1.5 * s, 4 * s, '#4a2a0e');
    // Pommel
    circle(ctx, 0.75 * s, 7 * s, 1.5 * s, '#ffd700');
    ctx.restore();

    // Pauldrons (shoulder armor)
    oval(ctx, -4 * s, -1 * s + bob, 4 * s, 3 * s, '#b0b0c0');
    oval(ctx, 10 * s, -1 * s + bob, 4 * s, 3 * s, '#b0b0c0');

    ctx.restore();
  };

  // ----------- CAVALRY -----------
  unitDrawers.CAVALRY = function (ctx, dir, frame, fur, fc, s, state) {
    var d = dir || 1;
    var bob = Math.sin((frame || 0) * Math.PI / 2) * 2 * s;

    ctx.save();
    ctx.scale(d, 1);

    // --- MOUNT (larger cat/lynx) ---
    var mountFur = '#c4a882';
    var mountBob = Math.sin((frame || 0) * Math.PI / 2 + 0.5) * 2 * s;

    // Mount shadow
    oval(ctx, 0, 14 * s, 12 * s, 3 * s, 'rgba(0,0,0,0.18)');

    // Mount tail
    ctx.strokeStyle = mountFur;
    ctx.lineWidth = 3 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    var mtailWag = Math.sin((frame || 0) * 0.7) * 3 * s;
    ctx.moveTo(-8 * s, 4 * s + mountBob);
    ctx.quadraticCurveTo(-14 * s, 0 + mtailWag + mountBob, -12 * s, -5 * s + mtailWag + mountBob);
    ctx.stroke();

    // Mount hind legs
    var mleg1 = Math.sin(frame * Math.PI / 2) * 3 * s;
    var mleg2 = Math.sin((frame + 2) * Math.PI / 2) * 3 * s;
    px(ctx, -6 * s, 8 * s + mountBob, 4 * s, 6 * s + mleg1, mountFur);
    px(ctx, -1 * s, 8 * s + mountBob, 4 * s, 6 * s + mleg2, mountFur);

    // Mount body (larger)
    oval(ctx, 0, 4 * s + mountBob, 10 * s, 7 * s, mountFur);
    oval(ctx, 0, 5 * s + mountBob, 7 * s, 4.5 * s, lighten(mountFur, 25));

    // Mount front legs
    var mfleg1 = Math.sin((frame + 1) * Math.PI / 2) * 3 * s;
    var mfleg2 = Math.sin((frame + 3) * Math.PI / 2) * 3 * s;
    px(ctx, 5 * s, 7 * s + mountBob, 4 * s, 7 * s + mfleg1, mountFur);
    px(ctx, 10 * s, 7 * s + mountBob, 4 * s, 7 * s + mfleg2, mountFur);

    // Mount head
    circle(ctx, 10 * s, -1 * s + mountBob, 5 * s, mountFur);
    // Mount ears (lynx tufts)
    triangle(ctx, 7 * s, -5 * s + mountBob, 7 * s, -10 * s + mountBob, 10 * s, -6 * s + mountBob, mountFur);
    triangle(ctx, 13 * s, -5 * s + mountBob, 13 * s, -10 * s + mountBob, 10 * s, -6 * s + mountBob, mountFur);
    // Ear tufts
    line(ctx, 7 * s, -10 * s + mountBob, 6 * s, -12 * s + mountBob, darken(mountFur, 30), 1 * s);
    line(ctx, 13 * s, -10 * s + mountBob, 14 * s, -12 * s + mountBob, darken(mountFur, 30), 1 * s);
    // Mount eyes
    oval(ctx, 8 * s, -2 * s + mountBob, 1.5 * s, 1.2 * s, '#ffcc00');
    oval(ctx, 12 * s, -2 * s + mountBob, 1.5 * s, 1.2 * s, '#ffcc00');
    circle(ctx, 8 * s, -2 * s + mountBob, 0.6 * s, '#111');
    circle(ctx, 12 * s, -2 * s + mountBob, 0.6 * s, '#111');

    // Saddle blanket
    roundRect(ctx, -3 * s, -1 * s + mountBob, 8 * s, 5 * s, 1, fc.primary);
    roundRectStroke(ctx, -3 * s, -1 * s + mountBob, 8 * s, 5 * s, 1, fc.accent, 0.8);

    // --- RIDER CAT (smaller, on top) ---
    ctx.save();
    ctx.translate(0, -8 * s + mountBob);
    // Rider body
    var riderFur = fur;
    oval(ctx, 1 * s, 2 * s, 5 * s, 4 * s, riderFur);
    // Rider head
    circle(ctx, 4 * s, -3 * s, 4 * s, riderFur);
    // Ears
    triangle(ctx, 1 * s, -5 * s, 1 * s, -9 * s, 4 * s, -6 * s, riderFur);
    triangle(ctx, 7 * s, -5 * s, 7 * s, -9 * s, 4 * s, -6 * s, riderFur);
    triangle(ctx, 1.5 * s, -5 * s, 1.5 * s, -8 * s, 3.5 * s, -5.5 * s, '#ffb6c1');
    triangle(ctx, 6.5 * s, -5 * s, 6.5 * s, -8 * s, 4.5 * s, -5.5 * s, '#ffb6c1');
    // Eyes
    oval(ctx, 2 * s, -3 * s, 1.5 * s, 1.3 * s, '#fff');
    oval(ctx, 5.5 * s, -3 * s, 1.5 * s, 1.3 * s, '#fff');
    circle(ctx, 2.5 * s, -3 * s, 0.7 * s, '#222');
    circle(ctx, 6 * s, -3 * s, 0.7 * s, '#222');
    // Nose
    triangle(ctx, 3.5 * s, -1 * s, 4.5 * s, -1 * s, 4 * s, 0, '#ff69b4');
    // Rider armor
    roundRect(ctx, -1 * s, 0, 8 * s, 4 * s, 1, fc.secondary);
    ctx.restore();

    // Lance
    var lanceOff = state === 'ATTACKING' ? Math.sin(frame * Math.PI) * 3 * s : 0;
    ctx.save();
    ctx.translate(12 * s + lanceOff, -8 * s + mountBob);
    px(ctx, 0, -10 * s, 1.2 * s, 22 * s, '#6b3a1f');
    triangle(ctx, -1.5 * s, -13 * s, 0.6 * s, -17 * s, 2.5 * s, -13 * s, '#c0c0c0');
    // Pennant
    ctx.fillStyle = fc.primary;
    ctx.beginPath();
    ctx.moveTo(0, -10 * s);
    ctx.lineTo(5 * s, -8 * s);
    ctx.lineTo(0, -7 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();
  };

  // ----------- HEALER -----------
  unitDrawers.HEALER = function (ctx, dir, frame, fur, fc, s, state) {
    drawCatBase(ctx, dir, frame, fur, fc, s);
    var d = dir || 1;
    var bob = Math.sin((frame || 0) * Math.PI / 2) * 1.5 * s;
    ctx.save();
    ctx.scale(d, 1);

    // Robes
    ctx.fillStyle = '#f0f0ff';
    ctx.beginPath();
    ctx.moveTo(-4 * s, -1 * s + bob);
    ctx.lineTo(10 * s, -1 * s + bob);
    ctx.lineTo(11 * s, 10 * s + bob);
    ctx.lineTo(-5 * s, 10 * s + bob);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = fc.primary;
    ctx.lineWidth = 0.8 * s;
    ctx.stroke();

    // Robe sash
    line(ctx, 3 * s, -1 * s + bob, 3 * s, 10 * s + bob, '#4caf50', 1.5 * s);

    // Hood
    ctx.fillStyle = '#e8e8f8';
    ctx.beginPath();
    ctx.moveTo(0 * s, -4 * s + bob);
    ctx.quadraticCurveTo(4 * s, -12 * s + bob, 8 * s, -4 * s + bob);
    ctx.closePath();
    ctx.fill();

    // Healing staff
    var staffGlow = (Math.sin(frame * 0.5) + 1) / 2;
    ctx.save();
    ctx.translate(10 * s, -4 * s + bob);
    // Shaft
    px(ctx, 0, -4 * s, 1.5 * s, 16 * s, '#8B6914');
    // Crystal top
    ctx.fillStyle = 'rgba(100, 255, 100, ' + (0.5 + staffGlow * 0.5) + ')';
    ctx.beginPath();
    ctx.moveTo(0.75 * s, -4 * s);
    ctx.lineTo(-2 * s, -7 * s);
    ctx.lineTo(0.75 * s, -10 * s);
    ctx.lineTo(3.5 * s, -7 * s);
    ctx.closePath();
    ctx.fill();
    // Glow effect
    ctx.fillStyle = 'rgba(100, 255, 100, ' + (staffGlow * 0.3) + ')';
    ctx.beginPath();
    ctx.arc(0.75 * s, -7 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();
    // Sparkles
    if (frame % 3 === 0) {
      circle(ctx, -2 * s, -9 * s + Math.sin(frame) * 2 * s, 0.8 * s, '#aaffaa');
    }
    if (frame % 3 === 1) {
      circle(ctx, 3 * s, -5 * s + Math.cos(frame) * 2 * s, 0.6 * s, '#88ff88');
    }
    ctx.restore();

    ctx.restore();
  };

  // ----------- CATAPULT -----------
  unitDrawers.CATAPULT = function (ctx, dir, frame, fur, fc, s, state) {
    var d = dir || 1;
    var bob = Math.sin((frame || 0) * Math.PI / 2) * 1 * s;

    ctx.save();
    ctx.scale(d, 1);

    // Shadow
    oval(ctx, 0, 12 * s, 14 * s, 3 * s, 'rgba(0,0,0,0.15)');

    // Wheels
    circle(ctx, -8 * s, 10 * s + bob, 3.5 * s, '#5c3a1e');
    circle(ctx, -8 * s, 10 * s + bob, 2 * s, '#3a2210');
    circle(ctx, 8 * s, 10 * s + bob, 3.5 * s, '#5c3a1e');
    circle(ctx, 8 * s, 10 * s + bob, 2 * s, '#3a2210');
    // Wheel spokes
    line(ctx, -8 * s, 7 * s + bob, -8 * s, 13 * s + bob, '#3a2210', 0.8 * s);
    line(ctx, -11 * s, 10 * s + bob, -5 * s, 10 * s + bob, '#3a2210', 0.8 * s);
    line(ctx, 8 * s, 7 * s + bob, 8 * s, 13 * s + bob, '#3a2210', 0.8 * s);
    line(ctx, 5 * s, 10 * s + bob, 11 * s, 10 * s + bob, '#3a2210', 0.8 * s);

    // Frame / chassis
    px(ctx, -10 * s, 3 * s + bob, 20 * s, 4 * s, '#6b3a1f');
    px(ctx, -10 * s, 3 * s + bob, 20 * s, 1 * s, '#8B5A2B');

    // Catapult arm
    var armAngle = state === 'ATTACKING' ? Math.sin(frame * Math.PI) * -1.2 : -0.3;
    ctx.save();
    ctx.translate(0, 3 * s + bob);
    ctx.rotate(armAngle);
    px(ctx, -1 * s, -14 * s, 2 * s, 14 * s, '#5c3a1e');
    // Sling/cup at end
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.arc(-0 * s, -15 * s, 3 * s, 0, Math.PI);
    ctx.stroke();
    // Boulder in cup
    if (state !== 'ATTACKING' || frame % 3 === 0) {
      circle(ctx, 0, -16 * s, 2.5 * s, '#808080');
      circle(ctx, -0.5 * s, -17 * s, 0.8 * s, '#a0a0a0');
    }
    ctx.restore();

    // Counterweight
    roundRect(ctx, -4 * s, 5 * s + bob, 4 * s, 3 * s, 1, '#555');

    // Two operator cats (small)
    var fur1 = '#f4a460', fur2 = '#d2691e';
    // Cat 1 (left)
    ctx.save();
    ctx.translate(-6 * s, -2 * s + bob);
    ctx.scale(0.6, 0.6);
    circle(ctx, 0, -2 * s, 3.5 * s, fur1);
    oval(ctx, 0, 3 * s, 3 * s, 3 * s, fur1);
    triangle(ctx, -2 * s, -4 * s, -2 * s, -7 * s, 0, -5 * s, fur1);
    triangle(ctx, 2 * s, -4 * s, 2 * s, -7 * s, 0, -5 * s, fur1);
    oval(ctx, -1 * s, -2 * s, 1.2 * s, 1 * s, '#fff');
    oval(ctx, 1.5 * s, -2 * s, 1.2 * s, 1 * s, '#fff');
    circle(ctx, -0.5 * s, -2 * s, 0.5 * s, '#222');
    circle(ctx, 2 * s, -2 * s, 0.5 * s, '#222');
    roundRect(ctx, -2 * s, 1 * s, 5 * s, 4 * s, 1, fc.primary);
    ctx.restore();

    // Cat 2 (right)
    ctx.save();
    ctx.translate(6 * s, -2 * s + bob);
    ctx.scale(0.6, 0.6);
    circle(ctx, 0, -2 * s, 3.5 * s, fur2);
    oval(ctx, 0, 3 * s, 3 * s, 3 * s, fur2);
    triangle(ctx, -2 * s, -4 * s, -2 * s, -7 * s, 0, -5 * s, fur2);
    triangle(ctx, 2 * s, -4 * s, 2 * s, -7 * s, 0, -5 * s, fur2);
    oval(ctx, -1 * s, -2 * s, 1.2 * s, 1 * s, '#fff');
    oval(ctx, 1.5 * s, -2 * s, 1.2 * s, 1 * s, '#fff');
    circle(ctx, -0.5 * s, -2 * s, 0.5 * s, '#222');
    circle(ctx, 2 * s, -2 * s, 0.5 * s, '#222');
    roundRect(ctx, -2 * s, 1 * s, 5 * s, 4 * s, 1, fc.primary);
    ctx.restore();

    ctx.restore();
  };

  // ----------- ROYAL COMMANDER -----------
  unitDrawers.ROYAL_COMMANDER = function (ctx, dir, frame, fur, fc, s, state) {
    drawCatBase(ctx, dir, frame, fur, fc, s);
    var d = dir || 1;
    var bob = Math.sin((frame || 0) * Math.PI / 2) * 1.5 * s;
    ctx.save();
    ctx.scale(d, 1);

    // Royal cape (flowing behind)
    ctx.fillStyle = fc.primary;
    ctx.beginPath();
    ctx.moveTo(-3 * s, -2 * s + bob);
    ctx.quadraticCurveTo(-10 * s, 4 * s + bob + Math.sin(frame * 0.5) * 2 * s, -8 * s, 14 * s + bob);
    ctx.lineTo(-2 * s, 14 * s + bob);
    ctx.quadraticCurveTo(-4 * s, 6 * s + bob, -1 * s, 0 + bob);
    ctx.closePath();
    ctx.fill();
    // Cape trim
    ctx.strokeStyle = fc.trim;
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(-8 * s, 14 * s + bob);
    ctx.lineTo(-2 * s, 14 * s + bob);
    ctx.stroke();
    // Ermine dots on cape
    circle(ctx, -6 * s, 8 * s + bob, 0.8 * s, '#fff');
    circle(ctx, -4 * s, 10 * s + bob, 0.8 * s, '#fff');
    circle(ctx, -6 * s, 12 * s + bob, 0.8 * s, '#fff');

    // Royal plate armor
    roundRect(ctx, -4 * s, -2 * s + bob, 14 * s, 8 * s, 2, '#d4af37');
    roundRectStroke(ctx, -4 * s, -2 * s + bob, 14 * s, 8 * s, 2, '#b8860b', 1.2);
    // Chest emblem
    ctx.fillStyle = fc.primary;
    ctx.beginPath();
    ctx.arc(3 * s, 2 * s + bob, 3 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fc.trim;
    ctx.beginPath();
    // Star emblem
    for (var i = 0; i < 5; i++) {
      var angle = (i * Math.PI * 2 / 5) - Math.PI / 2;
      var px2 = 3 * s + Math.cos(angle) * 2 * s;
      var py2 = 2 * s + bob + Math.sin(angle) * 2 * s;
      if (i === 0) ctx.moveTo(px2, py2);
      else ctx.lineTo(px2, py2);
    }
    ctx.fill();

    // Royal crown
    px(ctx, 0 * s, -12 * s + bob, 8 * s, 3 * s, '#ffd700');
    triangle(ctx, 0 * s, -12 * s + bob, 1 * s, -16 * s + bob, 2 * s, -12 * s + bob, '#ffd700');
    triangle(ctx, 2.5 * s, -12 * s + bob, 4 * s, -15 * s + bob, 5.5 * s, -12 * s + bob, '#ffd700');
    triangle(ctx, 5.5 * s, -12 * s + bob, 7 * s, -16 * s + bob, 8 * s, -12 * s + bob, '#ffd700');
    // Crown jewels
    circle(ctx, 1 * s, -13 * s + bob, 0.8 * s, '#ff0000');
    circle(ctx, 4 * s, -13 * s + bob, 0.8 * s, '#0066ff');
    circle(ctx, 7 * s, -13 * s + bob, 0.8 * s, '#00cc00');

    // Shield with faction emblem
    ctx.save();
    ctx.translate(-4 * s, 0 + bob);
    oval(ctx, 0, 2 * s, 5 * s, 6 * s, fc.primary);
    ovalStroke(ctx, 0, 2 * s, 5 * s, 6 * s, fc.accent, 1.2);
    // Emblem - cat face
    circle(ctx, 0, 1 * s, 2.5 * s, fc.trim);
    circle(ctx, -1 * s, 0.5 * s, 0.5 * s, fc.accent);
    circle(ctx, 1 * s, 0.5 * s, 0.5 * s, fc.accent);
    triangle(ctx, -0.3 * s, 1.5 * s, 0.3 * s, 1.5 * s, 0, 2 * s, '#ff69b4');
    ctx.restore();

    // Royal sword (larger)
    var swordRot = state === 'ATTACKING' ? Math.sin(frame * Math.PI * 0.6) * 1.3 : -0.2;
    ctx.save();
    ctx.translate(12 * s, -4 * s + bob);
    ctx.rotate(swordRot);
    px(ctx, -1.2 * s, -14 * s, 3 * s, 14 * s, '#e0e0e8');
    px(ctx, -0.3 * s, -14 * s, 1 * s, 13 * s, '#f8f8ff');
    // Ornate crossguard
    px(ctx, -4 * s, 0, 9 * s, 2 * s, '#ffd700');
    circle(ctx, -4 * s, 1 * s, 1 * s, '#ff4444');
    circle(ctx, 5 * s, 1 * s, 1 * s, '#ff4444');
    // Wrapped grip
    for (var g = 0; g < 3; g++) {
      px(ctx, -0.2 * s, 2 * s + g * 2 * s, 2 * s, 1 * s, '#8B0000');
    }
    circle(ctx, 0.75 * s, 9 * s, 1.8 * s, '#ffd700');
    circle(ctx, 0.75 * s, 9 * s, 0.8 * s, '#ff4444');
    ctx.restore();

    // Aura glow
    ctx.fillStyle = 'rgba(255, 215, 0, ' + (0.08 + Math.sin(frame * 0.3) * 0.05) + ')';
    ctx.beginPath();
    ctx.arc(3 * s, 0 + bob, 16 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  // ----------- SCOUT -----------
  unitDrawers.SCOUT = function (ctx, dir, frame, fur, fc, s, state) {
    // Scout has a lighter, thinner body — draw custom base instead of full drawCatBase
    var d = dir || 1;
    var bob = Math.sin((frame || 0) * Math.PI / 1.5) * 2 * s; // faster bounce for running

    ctx.save();
    ctx.scale(d, 1);

    // Shadow (smaller)
    oval(ctx, 0, 10 * s, 6 * s, 1.5 * s, 'rgba(0,0,0,0.15)');

    // Tail (alert, held high)
    ctx.strokeStyle = fur;
    ctx.lineWidth = 2 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    var tailWag = Math.sin((frame || 0) * 1.2) * 4 * s;
    ctx.moveTo(-5 * s, 1 * s + bob);
    ctx.quadraticCurveTo(-9 * s, -6 * s + tailWag + bob, -6 * s, -12 * s + tailWag + bob);
    ctx.stroke();
    circle(ctx, -6 * s, -12 * s + tailWag + bob, 1.2 * s, fur);

    // Hind legs (faster stride)
    var legOff1 = Math.sin(frame * Math.PI / 1.5) * 3 * s;
    var legOff2 = Math.sin((frame + 2) * Math.PI / 1.5) * 3 * s;
    px(ctx, -3 * s, 5 * s + bob, 2.5 * s, 5 * s + legOff1, fur);
    px(ctx, 1.5 * s, 5 * s + bob, 2.5 * s, 5 * s + legOff2, fur);
    oval(ctx, -1.8 * s, 10 * s + bob + legOff1, 1.5 * s, 1 * s, '#e8c4a0');
    oval(ctx, 2.8 * s, 10 * s + bob + legOff2, 1.5 * s, 1 * s, '#e8c4a0');

    // Slender body
    oval(ctx, 0, 1 * s + bob, 5.5 * s, 5 * s, fur);
    oval(ctx, 0, 2 * s + bob, 3.5 * s, 3 * s, lighten(fur, 30));

    // Front legs
    var flegOff1 = Math.sin((frame + 1) * Math.PI / 1.5) * 3 * s;
    var flegOff2 = Math.sin((frame + 3) * Math.PI / 1.5) * 3 * s;
    px(ctx, 3 * s, 4 * s + bob, 2 * s, 5 * s + flegOff1, fur);
    px(ctx, 5.5 * s, 4 * s + bob, 2 * s, 5 * s + flegOff2, fur);
    oval(ctx, 4 * s, 9 * s + bob + flegOff1, 1.5 * s, 1 * s, '#e8c4a0');
    oval(ctx, 6.5 * s, 9 * s + bob + flegOff2, 1.5 * s, 1 * s, '#e8c4a0');

    // Head (slightly smaller)
    var headY = -6 * s + bob;
    circle(ctx, 4 * s, headY, 4.5 * s, fur);

    // Big perked ears (taller than normal)
    triangle(ctx, 0.5 * s, headY - 3 * s, -0.5 * s, headY - 10 * s, 3.5 * s, headY - 5 * s, fur);
    triangle(ctx, 7.5 * s, headY - 3 * s, 8.5 * s, headY - 10 * s, 4.5 * s, headY - 5 * s, fur);
    // Inner ears (prominent pink)
    triangle(ctx, 1 * s, headY - 3.5 * s, 0 * s, headY - 8.5 * s, 3 * s, headY - 5 * s, '#ffb6c1');
    triangle(ctx, 7 * s, headY - 3.5 * s, 8 * s, headY - 8.5 * s, 5 * s, headY - 5 * s, '#ffb6c1');

    // Big alert eyes
    oval(ctx, 2 * s, headY, 1.8 * s, 2 * s, '#ffffff');
    oval(ctx, 6 * s, headY, 1.8 * s, 2 * s, '#ffffff');
    circle(ctx, 2.5 * s, headY - 0.3 * s, 1 * s, '#222222');
    circle(ctx, 6.5 * s, headY - 0.3 * s, 1 * s, '#222222');
    // Large eye shine
    circle(ctx, 2 * s, headY - 0.8 * s, 0.5 * s, '#ffffff');
    circle(ctx, 6 * s, headY - 0.8 * s, 0.5 * s, '#ffffff');

    // Nose
    triangle(ctx, 3.5 * s, headY + 2 * s, 4.5 * s, headY + 2 * s, 4 * s, headY + 2.8 * s, '#ff69b4');

    // Whiskers
    line(ctx, 1 * s, headY + 1.5 * s, -3 * s, headY + 0.5 * s, '#3a2a1a', 0.5 * s);
    line(ctx, 1 * s, headY + 2.5 * s, -3 * s, headY + 3 * s, '#3a2a1a', 0.5 * s);
    line(ctx, 7 * s, headY + 1.5 * s, 11 * s, headY + 0.5 * s, '#3a2a1a', 0.5 * s);
    line(ctx, 7 * s, headY + 2.5 * s, 11 * s, headY + 3 * s, '#3a2a1a', 0.5 * s);

    // Faction bandana/scarf (instead of armor)
    ctx.fillStyle = fc.primary;
    ctx.beginPath();
    ctx.moveTo(1 * s, headY + 3 * s);
    ctx.lineTo(7 * s, headY + 3 * s);
    ctx.lineTo(8 * s, headY + 5 * s);
    ctx.lineTo(0, headY + 5 * s);
    ctx.closePath();
    ctx.fill();
    // Scarf tails flowing behind
    ctx.beginPath();
    ctx.moveTo(0, headY + 4 * s);
    ctx.quadraticCurveTo(-3 * s, headY + 6 * s + Math.sin(frame * 0.8) * 2 * s,
                          -5 * s, headY + 8 * s + Math.sin(frame * 0.8) * 2 * s);
    ctx.lineTo(-4 * s, headY + 7 * s + Math.sin(frame * 0.8) * 2 * s);
    ctx.quadraticCurveTo(-2 * s, headY + 5 * s + Math.sin(frame * 0.8) * s,
                          1 * s, headY + 4 * s);
    ctx.closePath();
    ctx.fillStyle = fc.secondary;
    ctx.fill();

    // Messenger bag strap (diagonal across body)
    line(ctx, 6 * s, -2 * s + bob, -2 * s, 4 * s + bob, darken(fc.primary, 30), 1.2 * s);
    // Messenger bag
    roundRect(ctx, -3 * s, 2 * s + bob, 4 * s, 3 * s, 1, darken(fc.primary, 20));
    roundRectStroke(ctx, -3 * s, 2 * s + bob, 4 * s, 3 * s, 1, fc.accent, 0.6);
    // Bag buckle
    circle(ctx, -1 * s, 3.5 * s + bob, 0.6 * s, '#ffd700');

    // Spyglass (held in front paw when idle, stowed when running)
    if (state === 'IDLE') {
      ctx.save();
      ctx.translate(8 * s, -3 * s + bob);
      ctx.rotate(-0.3);
      // Tube
      px(ctx, 0, 0, 1.2 * s, 8 * s, '#8B6914');
      // Lens
      circle(ctx, 0.6 * s, -0.5 * s, 1.5 * s, '#4488aa');
      circle(ctx, 0.6 * s, -0.5 * s, 0.8 * s, '#88ccee');
      // Eyepiece
      px(ctx, -0.3 * s, 7 * s, 1.8 * s, 2 * s, '#5c3a1e');
      ctx.restore();
    } else {
      // Stowed on back/bag
      ctx.save();
      ctx.translate(-4 * s, 0 + bob);
      ctx.rotate(0.8);
      px(ctx, 0, 0, 0.8 * s, 5 * s, '#8B6914');
      ctx.restore();
    }

    ctx.restore();
  };

  /* ========================================================================
   *  DRAW CAT — public entry point
   * ====================================================================== */

  function drawCat(ctx, x, y, unitType, faction, direction, animFrame, scale, entityId, state) {
    var s = scale || 1;
    var fc = fac(faction);
    var fur = furColor(entityId);
    var dir = direction >= 0 ? 1 : -1;
    var frame = animFrame || 0;
    var drawer = unitDrawers[unitType] || unitDrawers.PEASANT;

    ctx.save();
    ctx.translate(x, y);
    drawer(ctx, dir, frame, fur, fc, s, state || 'IDLE');
    ctx.restore();
  }

  /* ========================================================================
   *  BUILDING SPRITES
   * ====================================================================== */

  var buildingDrawers = {};

  // Construction overlay: scaffolding, partial walls
  function drawConstruction(ctx, w, h, progress, s) {
    if (progress >= 1) return;

    // Grey-out the unbuilt portion
    var builtH = h * progress;
    ctx.fillStyle = 'rgba(120, 110, 100, 0.5)';
    ctx.fillRect(-w / 2, -h / 2, w, h - builtH);

    // Scaffolding poles
    ctx.strokeStyle = '#8B6914';
    ctx.lineWidth = 1.5 * s;
    // Left scaffold
    line(ctx, -w / 2 - 3 * s, -h / 2, -w / 2 - 3 * s, h / 2, '#8B6914', 1.5 * s);
    line(ctx, -w / 2 - 3 * s, -h / 4, -w / 2, -h / 4, '#8B6914', 1 * s);
    // Right scaffold
    line(ctx, w / 2 + 3 * s, -h / 2, w / 2 + 3 * s, h / 2, '#8B6914', 1.5 * s);
    line(ctx, w / 2, -h / 4, w / 2 + 3 * s, -h / 4, '#8B6914', 1 * s);
    // Cross-beam
    line(ctx, -w / 2 - 3 * s, 0, w / 2 + 3 * s, 0, '#8B6914', 1 * s);
  }

  // Faction banner helper
  function drawBanner(ctx, bx, by, fc, s) {
    // Pole
    line(ctx, bx, by, bx, by - 10 * s, '#5c3a1e', 1.5 * s);
    // Flag
    ctx.fillStyle = fc.banner;
    ctx.beginPath();
    ctx.moveTo(bx, by - 10 * s);
    ctx.lineTo(bx + 6 * s, by - 8 * s);
    ctx.lineTo(bx, by - 6 * s);
    ctx.closePath();
    ctx.fill();
    // Trim
    ctx.strokeStyle = fc.trim;
    ctx.lineWidth = 0.5 * s;
    ctx.stroke();
  }

  // ----------- CASTLE KEEP -----------
  buildingDrawers.CASTLE_KEEP = function (ctx, fc, progress, s) {
    var w = 64 * s, h = 64 * s;
    // Base walls
    roundRect(ctx, -w / 2, -h / 2, w, h, 3, '#b0a090');
    roundRectStroke(ctx, -w / 2, -h / 2, w, h, 3, '#706050', 1.5 * s);

    // Stone texture lines
    for (var row = 0; row < 5; row++) {
      var ry = -h / 2 + 6 * s + row * 12 * s;
      line(ctx, -w / 2 + 3 * s, ry, w / 2 - 3 * s, ry, '#908070', 0.5 * s);
      // Vertical joints (offset each row)
      var off = (row % 2) * 8 * s;
      for (var col = 0; col < 5; col++) {
        var cx = -w / 2 + 8 * s + col * 12 * s + off;
        if (cx < w / 2 - 3 * s) {
          line(ctx, cx, ry, cx, ry + 12 * s, '#908070', 0.5 * s);
        }
      }
    }

    // Corner towers
    var towers = [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]];
    for (var t = 0; t < 4; t++) {
      var tx = towers[t][0], ty = towers[t][1];
      circle(ctx, tx, ty, 7 * s, '#a09080');
      circle(ctx, tx, ty, 5 * s, '#c0b0a0');
      // Crenellations on towers
      for (var c = 0; c < 4; c++) {
        var ca = (c / 4) * Math.PI * 2;
        px(ctx, tx + Math.cos(ca) * 5 * s, ty + Math.sin(ca) * 5 * s, 2 * s, 2 * s, '#a09080');
      }
    }

    // Gate
    roundRect(ctx, -5 * s, h / 2 - 14 * s, 10 * s, 14 * s, 2, '#4a3520');
    // Gate arch
    ctx.fillStyle = '#3a2510';
    ctx.beginPath();
    ctx.arc(0, h / 2 - 14 * s, 5 * s, Math.PI, 0);
    ctx.fill();
    // Portcullis lines
    for (var p = 0; p < 4; p++) {
      line(ctx, -3 * s + p * 2 * s, h / 2 - 14 * s, -3 * s + p * 2 * s, h / 2, '#555', 0.5 * s);
    }

    // Central tower
    roundRect(ctx, -8 * s, -h / 2 - 8 * s, 16 * s, 16 * s, 2, '#c0b0a0');
    roundRectStroke(ctx, -8 * s, -h / 2 - 8 * s, 16 * s, 16 * s, 2, '#706050', 1);
    // Crenellations on central tower
    for (var cr = 0; cr < 5; cr++) {
      px(ctx, -8 * s + cr * 4 * s, -h / 2 - 10 * s, 2 * s, 2 * s, '#a09080');
    }

    // Faction banner on central tower
    drawBanner(ctx, 0, -h / 2 - 8 * s, fc, s);

    // Windows
    px(ctx, -4 * s, -h / 2 - 4 * s, 2 * s, 3 * s, '#1a1a2e');
    px(ctx, 2 * s, -h / 2 - 4 * s, 2 * s, 3 * s, '#1a1a2e');

    drawConstruction(ctx, w + 10 * s, h + 20 * s, progress, s);
  };

  // ----------- BARRACKS -----------
  buildingDrawers.BARRACKS = function (ctx, fc, progress, s) {
    var w = 48 * s, h = 40 * s;
    // Main building
    roundRect(ctx, -w / 2, -h / 2, w, h, 2, '#8B7355');
    roundRectStroke(ctx, -w / 2, -h / 2, w, h, 2, '#5c4a32', 1 * s);

    // Roof
    ctx.fillStyle = '#8B0000';
    ctx.beginPath();
    ctx.moveTo(-w / 2 - 3 * s, -h / 2);
    ctx.lineTo(0, -h / 2 - 12 * s);
    ctx.lineTo(w / 2 + 3 * s, -h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5a0000';
    ctx.lineWidth = 1 * s;
    ctx.stroke();

    // Door
    roundRect(ctx, -4 * s, h / 2 - 12 * s, 8 * s, 12 * s, 1, '#3a2510');
    ctx.fillStyle = '#2a1508';
    ctx.beginPath();
    ctx.arc(0, h / 2 - 12 * s, 4 * s, Math.PI, 0);
    ctx.fill();

    // Weapon rack (right side)
    px(ctx, w / 2 - 10 * s, -h / 2 + 4 * s, 8 * s, 1 * s, '#5c3a1e');
    // Swords on rack
    px(ctx, w / 2 - 9 * s, -h / 2 + 0 * s, 1 * s, 4 * s, '#c0c0c0');
    px(ctx, w / 2 - 7 * s, -h / 2 + 1 * s, 1 * s, 3 * s, '#c0c0c0');
    px(ctx, w / 2 - 5 * s, -h / 2 + 0 * s, 1 * s, 4 * s, '#c0c0c0');

    // Faction flag
    drawBanner(ctx, w / 2 - 2 * s, -h / 2, fc, s);

    // Shield on wall
    oval(ctx, -w / 2 + 8 * s, -h / 2 + 10 * s, 4 * s, 5 * s, fc.primary);
    ovalStroke(ctx, -w / 2 + 8 * s, -h / 2 + 10 * s, 4 * s, 5 * s, fc.accent, 0.8);

    drawConstruction(ctx, w + 10 * s, h + 14 * s, progress, s);
  };

  // ----------- ARCHERY RANGE -----------
  buildingDrawers.ARCHERY_RANGE = function (ctx, fc, progress, s) {
    var w = 48 * s, h = 40 * s;

    // Open-sided structure (posts + roof)
    // Roof
    ctx.fillStyle = '#556B2F';
    ctx.beginPath();
    ctx.moveTo(-w / 2 - 2 * s, -h / 2);
    ctx.lineTo(0, -h / 2 - 8 * s);
    ctx.lineTo(w / 2 + 2 * s, -h / 2);
    ctx.closePath();
    ctx.fill();

    // Posts
    px(ctx, -w / 2, -h / 2, 2 * s, h, '#5c3a1e');
    px(ctx, w / 2 - 2 * s, -h / 2, 2 * s, h, '#5c3a1e');
    px(ctx, -w / 2, -h / 2, w, 2 * s, '#5c3a1e');

    // Floor
    roundRect(ctx, -w / 2, h / 2 - 3 * s, w, 3 * s, 0, '#c4a882');

    // Targets on back wall
    for (var tgt = 0; tgt < 3; tgt++) {
      var tx2 = -14 * s + tgt * 14 * s;
      circle(ctx, tx2, -h / 2 + 14 * s, 5 * s, '#f5f5dc');
      circle(ctx, tx2, -h / 2 + 14 * s, 3.5 * s, '#2196F3');
      circle(ctx, tx2, -h / 2 + 14 * s, 2 * s, '#f44336');
      circle(ctx, tx2, -h / 2 + 14 * s, 0.8 * s, '#ffd700');
    }

    // Arrows stuck in targets
    line(ctx, -14 * s + 1 * s, -h / 2 + 13 * s, -14 * s + 1 * s, -h / 2 + 8 * s, '#5c3a1e', 0.8 * s);
    line(ctx, 0, -h / 2 + 15 * s, 0, -h / 2 + 10 * s, '#5c3a1e', 0.8 * s);

    drawBanner(ctx, w / 2 - 2 * s, -h / 2, fc, s);

    drawConstruction(ctx, w + 6 * s, h + 10 * s, progress, s);
  };

  // ----------- BLACKSMITH -----------
  buildingDrawers.BLACKSMITH = function (ctx, fc, progress, s) {
    var w = 44 * s, h = 40 * s;

    // Main building
    roundRect(ctx, -w / 2, -h / 2, w, h, 2, '#7a6a55');
    roundRectStroke(ctx, -w / 2, -h / 2, w, h, 2, '#4a3a2a', 1);

    // Roof
    ctx.fillStyle = '#4a4a4a';
    ctx.beginPath();
    ctx.moveTo(-w / 2 - 2 * s, -h / 2);
    ctx.lineTo(-5 * s, -h / 2 - 10 * s);
    ctx.lineTo(w / 2 + 2 * s, -h / 2);
    ctx.closePath();
    ctx.fill();

    // Chimney
    px(ctx, w / 2 - 8 * s, -h / 2 - 16 * s, 6 * s, 10 * s, '#555');
    px(ctx, w / 2 - 9 * s, -h / 2 - 16 * s, 8 * s, 2 * s, '#444');
    // Smoke (animated would be particles)
    circle(ctx, w / 2 - 5 * s, -h / 2 - 18 * s, 2 * s, 'rgba(150,150,150,0.4)');
    circle(ctx, w / 2 - 4 * s, -h / 2 - 21 * s, 2.5 * s, 'rgba(150,150,150,0.25)');

    // Anvil in front
    px(ctx, -6 * s, h / 2 - 6 * s, 12 * s, 3 * s, '#3a3a3a');
    px(ctx, -4 * s, h / 2 - 9 * s, 8 * s, 3 * s, '#555');
    px(ctx, -2 * s, h / 2 - 3 * s, 4 * s, 3 * s, '#3a3a3a');
    // Horn of anvil
    triangle(ctx, 6 * s, h / 2 - 8 * s, 10 * s, h / 2 - 7 * s, 6 * s, h / 2 - 6 * s, '#4a4a4a');

    // Forge glow (window / door)
    roundRect(ctx, -5 * s, -h / 2 + 10 * s, 10 * s, 10 * s, 1, '#ff6600');
    ctx.fillStyle = 'rgba(255, 100, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(0, -h / 2 + 15 * s, 8 * s, 0, Math.PI * 2);
    ctx.fill();

    drawBanner(ctx, -w / 2 + 2 * s, -h / 2, fc, s);
    drawConstruction(ctx, w + 6 * s, h + 18 * s, progress, s);
  };

  // ----------- STABLE -----------
  buildingDrawers.STABLE = function (ctx, fc, progress, s) {
    var w = 52 * s, h = 44 * s;

    // Barn body
    roundRect(ctx, -w / 2, -h / 2, w, h, 2, '#8B4513');
    roundRectStroke(ctx, -w / 2, -h / 2, w, h, 2, '#5c2d0e', 1);

    // Barn roof (peaked)
    ctx.fillStyle = '#A0522D';
    ctx.beginPath();
    ctx.moveTo(-w / 2 - 3 * s, -h / 2);
    ctx.lineTo(0, -h / 2 - 14 * s);
    ctx.lineTo(w / 2 + 3 * s, -h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6b3a1f';
    ctx.lineWidth = 1 * s;
    ctx.stroke();

    // Barn doors (double wide)
    px(ctx, -8 * s, h / 2 - 16 * s, 7 * s, 16 * s, '#5c2d0e');
    px(ctx, 1 * s, h / 2 - 16 * s, 7 * s, 16 * s, '#5c2d0e');
    // Door hardware
    circle(ctx, -2 * s, h / 2 - 8 * s, 1 * s, '#333');
    circle(ctx, 2 * s, h / 2 - 8 * s, 1 * s, '#333');

    // Hay bales
    oval(ctx, -w / 2 + 6 * s, h / 2 - 4 * s, 4 * s, 3 * s, '#daa520');
    oval(ctx, -w / 2 + 12 * s, h / 2 - 4 * s, 4 * s, 3 * s, '#daa520');
    // Hay texture
    line(ctx, -w / 2 + 4 * s, h / 2 - 4 * s, -w / 2 + 8 * s, h / 2 - 4 * s, '#c4960a', 0.5 * s);

    // Window
    px(ctx, -w / 2 + 4 * s, -h / 2 + 6 * s, 6 * s, 5 * s, '#1a1a2e');
    px(ctx, -w / 2 + 6.5 * s, -h / 2 + 6 * s, 1 * s, 5 * s, '#5c2d0e');

    drawBanner(ctx, w / 2 - 2 * s, -h / 2, fc, s);
    drawConstruction(ctx, w + 8 * s, h + 16 * s, progress, s);
  };

  // ----------- SIEGE WORKSHOP -----------
  buildingDrawers.SIEGE_WORKSHOP = function (ctx, fc, progress, s) {
    var w = 56 * s, h = 48 * s;

    // Large building
    roundRect(ctx, -w / 2, -h / 2, w, h, 3, '#6a5a4a');
    roundRectStroke(ctx, -w / 2, -h / 2, w, h, 3, '#3a2a1a', 1.2);

    // Flat workshop roof
    px(ctx, -w / 2 - 2 * s, -h / 2 - 2 * s, w + 4 * s, 4 * s, '#4a3a2a');

    // Large open front (workshop interior visible)
    roundRect(ctx, -w / 4, -h / 2 + 6 * s, w / 2, h - 10 * s, 2, '#3a2a1a');
    // Forge inside glow
    ctx.fillStyle = 'rgba(255, 100, 0, 0.15)';
    ctx.fillRect(-w / 4, -h / 2 + 6 * s, w / 2, h - 10 * s);

    // Catapult parts inside
    // Arm
    ctx.save();
    ctx.translate(-5 * s, 0);
    px(ctx, -1 * s, -6 * s, 2 * s, 12 * s, '#5c3a1e');
    ctx.restore();
    // Wheel
    circle(ctx, 8 * s, 8 * s, 4 * s, '#5c3a1e');
    circle(ctx, 8 * s, 8 * s, 2 * s, '#3a2210');
    // Planks
    px(ctx, -10 * s, 10 * s, 8 * s, 2 * s, '#8B6914');
    px(ctx, -10 * s, 13 * s, 8 * s, 2 * s, '#8B6914');

    // Logs outside
    for (var lo = 0; lo < 3; lo++) {
      oval(ctx, w / 2 + 4 * s, -5 * s + lo * 5 * s, 3 * s, 2 * s, '#6b3a1f');
      circle(ctx, w / 2 + 7 * s, -5 * s + lo * 5 * s, 2 * s, '#c4a882');
    }

    drawBanner(ctx, -w / 2 + 2 * s, -h / 2, fc, s);
    drawConstruction(ctx, w + 12 * s, h + 6 * s, progress, s);
  };

  // ----------- FARM -----------
  buildingDrawers.FARM = function (ctx, fc, progress, s) {
    var w = 48 * s, h = 48 * s;

    // Crop fields (around the farmhouse)
    ctx.fillStyle = '#6B8E23';
    ctx.fillRect(-w / 2, -h / 2, w, h);

    // Crop rows
    for (var row = 0; row < 6; row++) {
      for (var col = 0; col < 6; col++) {
        var cx2 = -w / 2 + 4 * s + col * 7 * s;
        var cy2 = -h / 2 + 4 * s + row * 7 * s;
        // Skip center area for farmhouse
        if (Math.abs(cx2) < 10 * s && Math.abs(cy2) < 8 * s) continue;
        // Wheat stalk
        line(ctx, cx2, cy2, cx2, cy2 - 3 * s, '#8B8B00', 0.8 * s);
        // Wheat head
        oval(ctx, cx2, cy2 - 4 * s, 1 * s, 1.5 * s, '#DAA520');
      }
    }

    // Small farmhouse in center
    roundRect(ctx, -8 * s, -6 * s, 16 * s, 12 * s, 1, '#DEB887');
    // Roof
    ctx.fillStyle = '#CD853F';
    ctx.beginPath();
    ctx.moveTo(-10 * s, -6 * s);
    ctx.lineTo(0, -12 * s);
    ctx.lineTo(10 * s, -6 * s);
    ctx.closePath();
    ctx.fill();
    // Door
    px(ctx, -2 * s, 1 * s, 4 * s, 5 * s, '#5c2d0e');
    // Window
    px(ctx, 3 * s, -3 * s, 3 * s, 3 * s, '#87CEEB');
    px(ctx, 4.2 * s, -3 * s, 0.6 * s, 3 * s, '#5c2d0e');

    // Fence sections
    for (var f = 0; f < 6; f++) {
      line(ctx, -w / 2 + f * 10 * s, h / 2, -w / 2 + f * 10 * s, h / 2 - 4 * s, '#8B6914', 1 * s);
    }
    line(ctx, -w / 2, h / 2 - 2 * s, w / 2, h / 2 - 2 * s, '#8B6914', 0.8 * s);

    drawConstruction(ctx, w + 4 * s, h + 4 * s, progress, s);
  };

  // ----------- LUMBER MILL -----------
  buildingDrawers.LUMBER_MILL = function (ctx, fc, progress, s) {
    var w = 44 * s, h = 40 * s;

    // Building
    roundRect(ctx, -w / 2, -h / 2, w, h, 2, '#8B7355');
    roundRectStroke(ctx, -w / 2, -h / 2, w, h, 2, '#5c4a32', 1);

    // Roof
    ctx.fillStyle = '#6b3a1f';
    ctx.beginPath();
    ctx.moveTo(-w / 2 - 2 * s, -h / 2);
    ctx.lineTo(0, -h / 2 - 10 * s);
    ctx.lineTo(w / 2 + 2 * s, -h / 2);
    ctx.closePath();
    ctx.fill();

    // Log piles (right side)
    for (var lp = 0; lp < 4; lp++) {
      for (var lr = 0; lr < 3 - lp; lr++) {
        oval(ctx, w / 2 + 6 * s, h / 2 - 3 * s - lp * 4 * s - lr * 0.5 * s, 3 * s, 2 * s, '#6b3a1f');
        circle(ctx, w / 2 + 9 * s, h / 2 - 3 * s - lp * 4 * s - lr * 0.5 * s, 2 * s, '#c4a882');
      }
    }

    // Saw blade on front
    ctx.save();
    ctx.translate(0, h / 2 - 8 * s);
    circle(ctx, 0, 0, 5 * s, '#909090');
    circle(ctx, 0, 0, 3 * s, '#b0b0b0');
    // Teeth
    for (var tooth = 0; tooth < 8; tooth++) {
      var ta = (tooth / 8) * Math.PI * 2;
      triangle(ctx,
        Math.cos(ta) * 4 * s, Math.sin(ta) * 4 * s,
        Math.cos(ta + 0.2) * 6 * s, Math.sin(ta + 0.2) * 6 * s,
        Math.cos(ta - 0.2) * 6 * s, Math.sin(ta - 0.2) * 6 * s,
        '#808080'
      );
    }
    ctx.restore();

    // Door
    px(ctx, -4 * s, h / 2 - 12 * s, 8 * s, 12 * s, '#3a2510');

    drawBanner(ctx, -w / 2 + 2 * s, -h / 2, fc, s);
    drawConstruction(ctx, w + 14 * s, h + 4 * s, progress, s);
  };

  // ----------- STONE QUARRY -----------
  buildingDrawers.STONE_QUARRY = function (ctx, fc, progress, s) {
    var w = 48 * s, h = 44 * s;

    // Open pit area (darker ground)
    ctx.fillStyle = '#8B8378';
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, -h / 2);
    ctx.lineTo(w / 2 - 4 * s, h / 2);
    ctx.lineTo(-w / 2 + 4 * s, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5a5248';
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();

    // Stone blocks scattered
    var stonePositions = [
      [-12, -8], [8, -10], [-6, 4], [12, 2], [0, -4], [-14, 6], [10, 10], [2, 8]
    ];
    for (var st = 0; st < stonePositions.length; st++) {
      var stx = stonePositions[st][0] * s;
      var sty = stonePositions[st][1] * s;
      var stSize = 3 + (st % 3) * 1.5;
      roundRect(ctx, stx - stSize * s, sty - stSize * 0.7 * s, stSize * 2 * s, stSize * 1.4 * s, 1, '#a0a098');
      roundRectStroke(ctx, stx - stSize * s, sty - stSize * 0.7 * s, stSize * 2 * s, stSize * 1.4 * s, 1, '#707068', 0.5);
    }

    // Small shed
    roundRect(ctx, -w / 2 + 2 * s, -h / 2 + 2 * s, 14 * s, 10 * s, 1, '#8B7355');
    px(ctx, -w / 2 + 2 * s, -h / 2 + 1 * s, 14 * s, 2 * s, '#5c3a1e');

    // Pickaxe leaning against shed
    ctx.save();
    ctx.translate(-w / 2 + 16 * s, -h / 2 + 4 * s);
    ctx.rotate(0.3);
    px(ctx, 0, 0, 1 * s, 8 * s, '#5c3a1e');
    px(ctx, -2 * s, -1 * s, 5 * s, 2 * s, '#808080');
    ctx.restore();

    drawBanner(ctx, w / 2 - 6 * s, -h / 2, fc, s);
    drawConstruction(ctx, w + 4 * s, h + 4 * s, progress, s);
  };

  // ----------- WATCHTOWER -----------
  buildingDrawers.WATCHTOWER = function (ctx, fc, progress, s) {
    var w = 24 * s, h = 56 * s;

    // Tower base (wider)
    ctx.fillStyle = '#a09080';
    ctx.beginPath();
    ctx.moveTo(-w / 2 - 4 * s, h / 2);
    ctx.lineTo(-w / 2, -h / 2 + 10 * s);
    ctx.lineTo(w / 2, -h / 2 + 10 * s);
    ctx.lineTo(w / 2 + 4 * s, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#706050';
    ctx.lineWidth = 1 * s;
    ctx.stroke();

    // Stone texture
    for (var tr = 0; tr < 6; tr++) {
      var try2 = -h / 2 + 14 * s + tr * 8 * s;
      line(ctx, -w / 2 + 1 * s, try2, w / 2 - 1 * s, try2, '#908070', 0.5 * s);
    }

    // Top platform (wider than tower)
    roundRect(ctx, -w / 2 - 4 * s, -h / 2, w + 8 * s, 12 * s, 2, '#b0a090');
    roundRectStroke(ctx, -w / 2 - 4 * s, -h / 2, w + 8 * s, 12 * s, 2, '#706050', 1);

    // Crenellations
    for (var cren = 0; cren < 4; cren++) {
      px(ctx, -w / 2 - 4 * s + cren * 9 * s, -h / 2 - 3 * s, 4 * s, 3 * s, '#b0a090');
    }

    // Archer on top (tiny cat)
    ctx.save();
    ctx.translate(0, -h / 2 + 4 * s);
    ctx.scale(0.5, 0.5);
    circle(ctx, 0, -4 * s, 3.5 * s, '#f4a460');
    oval(ctx, 0, 1 * s, 3 * s, 3 * s, '#f4a460');
    triangle(ctx, -2 * s, -6 * s, -2 * s, -9 * s, 0, -7 * s, '#f4a460');
    triangle(ctx, 2 * s, -6 * s, 2 * s, -9 * s, 0, -7 * s, '#f4a460');
    oval(ctx, -1 * s, -4 * s, 1 * s, 0.8 * s, '#fff');
    oval(ctx, 1 * s, -4 * s, 1 * s, 0.8 * s, '#fff');
    roundRect(ctx, -2 * s, -1 * s, 5 * s, 4 * s, 1, fc.primary);
    ctx.restore();

    // Banner
    drawBanner(ctx, 0, -h / 2, fc, s);

    // Arrow slit windows
    px(ctx, -1 * s, -h / 2 + 20 * s, 2 * s, 5 * s, '#1a1a2e');
    px(ctx, -1 * s, -h / 2 + 32 * s, 2 * s, 5 * s, '#1a1a2e');

    drawConstruction(ctx, w + 12 * s, h + 6 * s, progress, s);
  };

  /* ========================================================================
   *  DRAW BUILDING — public entry point
   * ====================================================================== */

  function drawBuilding(ctx, x, y, buildingType, faction, constructionProgress, scale) {
    var s = scale || 1;
    var fc = fac(faction);
    var progress = constructionProgress !== undefined ? constructionProgress : 1;
    var drawer = buildingDrawers[buildingType];
    if (!drawer) return;

    ctx.save();
    ctx.translate(x, y);
    drawer(ctx, fc, progress, s);
    ctx.restore();
  }

  /* ========================================================================
   *  TERRAIN TILES
   * ====================================================================== */

  var TILE_SIZE = 32;

  // Pseudo-random seeded from position for consistent variation
  function tileRand(x, y, seed) {
    var n = Math.sin(x * 127.1 + y * 311.7 + (seed || 0) * 53.3) * 43758.5453;
    return n - Math.floor(n);
  }

  var tileDrawers = {};

  // ----------- GRASS -----------
  tileDrawers.GRASS = function (ctx, x, y, variation, frame) {
    var ts = TILE_SIZE;
    // Base green
    var baseG = ['#5a8c2a', '#4f7d24', '#66993a', '#4a7020'];
    var v = variation % baseG.length;
    ctx.fillStyle = baseG[v];
    ctx.fillRect(x, y, ts, ts);

    // Subtle shade variation (patches)
    for (var p = 0; p < 3; p++) {
      var px2 = x + tileRand(x, y, p) * (ts - 6);
      var py2 = y + tileRand(y, x, p + 10) * (ts - 6);
      circle(ctx, px2 + 3, py2 + 3, 3 + tileRand(x, y, p + 5) * 4, lighten(baseG[v], 10 + p * 5));
    }

    // Occasional flowers
    if (tileRand(x, y, 99) > 0.75) {
      var fx = x + tileRand(x, y, 100) * (ts - 8) + 4;
      var fy = y + tileRand(x, y, 101) * (ts - 8) + 4;
      var flowerCols = ['#ff6b9d', '#ffeb3b', '#ff9800', '#e040fb', '#fff'];
      var fc2 = flowerCols[Math.floor(tileRand(x, y, 102) * flowerCols.length)];
      // Stem
      line(ctx, fx, fy, fx, fy + 4, '#3a7a1a', 0.8);
      // Petals
      circle(ctx, fx, fy, 2, fc2);
      circle(ctx, fx, fy, 1, '#ffeb3b');
    }

    // Blade details
    for (var b = 0; b < 4; b++) {
      var bx = x + tileRand(x, y, b + 30) * ts;
      var by = y + tileRand(x, y, b + 40) * ts;
      line(ctx, bx, by, bx + 1, by - 3, darken(baseG[v], 10), 0.5);
    }
  };

  // ----------- FOREST -----------
  tileDrawers.FOREST = function (ctx, x, y, variation, frame) {
    var ts = TILE_SIZE;
    // Dark grass base
    ctx.fillStyle = '#3a6618';
    ctx.fillRect(x, y, ts, ts);

    // Draw tree
    var treeType = variation % 2; // 0 = pine, 1 = deciduous
    var cx2 = x + ts / 2;
    var cy2 = y + ts / 2;

    if (treeType === 0) {
      // Pine tree
      // Trunk
      px(ctx, cx2 - 1.5, cy2 + 4, 3, 10, '#5c3a1e');
      // Layers (dark to light going up)
      triangle(ctx, cx2 - 10, cy2 + 6, cx2, cy2 - 10, cx2 + 10, cy2 + 6, '#1a5c0a');
      triangle(ctx, cx2 - 8, cy2 + 1, cx2, cy2 - 12, cx2 + 8, cy2 + 1, '#2a7a1a');
      triangle(ctx, cx2 - 6, cy2 - 4, cx2, cy2 - 14, cx2 + 6, cy2 - 4, '#3a8a2a');
    } else {
      // Deciduous / oak
      // Trunk
      px(ctx, cx2 - 2, cy2 + 2, 4, 12, '#6b3a1f');
      // Branch
      line(ctx, cx2 - 1, cy2 + 2, cx2 - 6, cy2 - 4, '#6b3a1f', 1.5);
      line(ctx, cx2 + 1, cy2 + 2, cx2 + 5, cy2 - 2, '#6b3a1f', 1.5);
      // Leafy canopy
      circle(ctx, cx2, cy2 - 4, 8, '#2d7a14');
      circle(ctx, cx2 - 5, cy2 - 2, 5, '#3a8c2a');
      circle(ctx, cx2 + 5, cy2 - 2, 5, '#3a8c2a');
      circle(ctx, cx2, cy2 - 8, 5, '#4a9c3a');
      // Leaf highlights
      circle(ctx, cx2 - 3, cy2 - 6, 2, '#5aac4a');
      circle(ctx, cx2 + 2, cy2 - 3, 2, '#5aac4a');
    }
  };

  // ----------- MOUNTAIN -----------
  tileDrawers.MOUNTAIN = function (ctx, x, y, variation, frame) {
    var ts = TILE_SIZE;
    // Rocky ground
    ctx.fillStyle = '#8a8070';
    ctx.fillRect(x, y, ts, ts);

    var cx2 = x + ts / 2;
    var cy2 = y + ts;

    // Rocky peak
    triangle(ctx, cx2 - 14, cy2, cx2 + (variation % 3 - 1) * 2, y + 2, cx2 + 14, cy2, '#9a9488');
    triangle(ctx, cx2 - 10, cy2, cx2 + (variation % 3 - 1) * 2, y + 4, cx2 + 6, cy2, '#a8a098');

    // Snow cap
    triangle(ctx, cx2 - 4, y + 8, cx2 + (variation % 3 - 1) * 2, y + 2, cx2 + 4, y + 8, '#f0f0f0');

    // Rock details
    line(ctx, cx2 - 6, y + 14, cx2 - 2, y + 10, '#706860', 0.8);
    line(ctx, cx2 + 3, y + 16, cx2 + 5, y + 12, '#706860', 0.8);

    // Scattered rocks at base
    roundRect(ctx, x + 2, cy2 - 6, 5, 3, 1, '#7a7268');
    roundRect(ctx, x + ts - 8, cy2 - 5, 4, 3, 1, '#7a7268');
  };

  // ----------- WATER -----------
  tileDrawers.WATER = function (ctx, x, y, variation, frame) {
    var ts = TILE_SIZE;
    var f = frame || 0;

    // Deep water base
    ctx.fillStyle = '#1e6ea1';
    ctx.fillRect(x, y, ts, ts);

    // Animated wave ripples
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.35)';
    ctx.lineWidth = 1;
    for (var w = 0; w < 3; w++) {
      var wy = y + 6 + w * 10 + Math.sin(f * 0.15 + w + variation) * 2;
      ctx.beginPath();
      ctx.moveTo(x, wy);
      for (var wx = 0; wx < ts; wx += 4) {
        ctx.lineTo(x + wx, wy + Math.sin((wx + f * 2 + w * 20) * 0.15) * 2);
      }
      ctx.stroke();
    }

    // Shimmer highlights
    if (tileRand(x, y, f % 8) > 0.6) {
      var sx = x + tileRand(x, y, 200) * ts;
      var sy = y + tileRand(x, y, 201) * ts;
      circle(ctx, sx, sy, 1, 'rgba(255,255,255,0.5)');
    }
  };

  // ----------- SAND -----------
  tileDrawers.SAND = function (ctx, x, y, variation, frame) {
    var ts = TILE_SIZE;
    var sandCols = ['#e8d5a3', '#dbc896', '#f0deb0'];
    ctx.fillStyle = sandCols[variation % sandCols.length];
    ctx.fillRect(x, y, ts, ts);

    // Sand texture dots
    for (var d = 0; d < 8; d++) {
      var dx = x + tileRand(x, y, d + 50) * ts;
      var dy = y + tileRand(x, y, d + 60) * ts;
      circle(ctx, dx, dy, 0.5 + tileRand(x, y, d + 70) * 0.5, darken(sandCols[variation % sandCols.length], 15));
    }

    // Occasional tiny rock
    if (tileRand(x, y, 88) > 0.8) {
      var rx = x + tileRand(x, y, 89) * (ts - 6) + 3;
      var ry = y + tileRand(x, y, 90) * (ts - 6) + 3;
      oval(ctx, rx, ry, 2, 1.5, '#b0a888');
    }
  };

  // ----------- ROAD -----------
  tileDrawers.ROAD = function (ctx, x, y, variation, frame) {
    var ts = TILE_SIZE;
    // Dirt path
    ctx.fillStyle = '#a08860';
    ctx.fillRect(x, y, ts, ts);

    // Path edges
    ctx.fillStyle = '#7a6a48';
    ctx.fillRect(x, y, ts, 3);
    ctx.fillRect(x, y + ts - 3, ts, 3);

    // Gravel/dirt texture
    for (var g = 0; g < 6; g++) {
      var gx = x + tileRand(x, y, g + 110) * (ts - 4) + 2;
      var gy = y + 3 + tileRand(x, y, g + 120) * (ts - 8);
      circle(ctx, gx, gy, 0.8, darken('#a08860', 20 + g * 5));
    }

    // Wheel ruts
    line(ctx, x + 8, y, x + 8, y + ts, '#8a7548', 0.8);
    line(ctx, x + ts - 8, y, x + ts - 8, y + ts, '#8a7548', 0.8);

    // Grass tufts at edges
    if (variation % 2 === 0) {
      line(ctx, x + 2, y + 2, x + 1, y - 1, '#5a8c2a', 0.6);
      line(ctx, x + ts - 2, y + ts - 1, x + ts - 1, y + ts + 2, '#5a8c2a', 0.6);
    }
  };

  // ----------- GOLD DEPOSIT -----------
  tileDrawers.GOLD_DEPOSIT = function (ctx, x, y, variation, frame) {
    var ts = TILE_SIZE;
    // Rocky ground base
    ctx.fillStyle = '#8a7a60';
    ctx.fillRect(x, y, ts, ts);

    // Gold veins in ground
    ctx.strokeStyle = '#daa520';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 8);
    ctx.quadraticCurveTo(x + 16, y + 12, x + 28, y + 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 22);
    ctx.quadraticCurveTo(x + 14, y + 18, x + 24, y + 24);
    ctx.stroke();

    // Gold nuggets
    oval(ctx, x + 10, y + 14, 4, 3, '#ffd700');
    oval(ctx, x + 20, y + 10, 3, 2.5, '#ffec8b');
    oval(ctx, x + 14, y + 22, 3.5, 2.5, '#daa520');
    oval(ctx, x + 24, y + 20, 2.5, 2, '#ffd700');
    // Nugget highlights
    circle(ctx, x + 9, y + 13, 1, '#fff8dc');
    circle(ctx, x + 19, y + 9, 0.8, '#fff8dc');

    // Sparkle effect (animated)
    var f = frame || 0;
    var sparklePhase = f * 0.2 + variation;
    for (var sp = 0; sp < 3; sp++) {
      var sx = x + 6 + tileRand(x, y, sp) * 20;
      var sy = y + 6 + tileRand(x, y, sp + 10) * 20;
      var sparkAlpha = (Math.sin(sparklePhase + sp * 2.1) + 1) / 2;
      if (sparkAlpha > 0.5) {
        var sparkSize = sparkAlpha * 2;
        ctx.fillStyle = 'rgba(255, 248, 220, ' + sparkAlpha + ')';
        // Star sparkle shape
        px(ctx, sx - sparkSize / 2, sy, sparkSize, 0.5, 'rgba(255, 248, 220, ' + sparkAlpha + ')');
        px(ctx, sx, sy - sparkSize / 2, 0.5, sparkSize, 'rgba(255, 248, 220, ' + sparkAlpha + ')');
      }
    }
  };

  // ----------- STONE DEPOSIT -----------
  tileDrawers.STONE_DEPOSIT = function (ctx, x, y, variation, frame) {
    var ts = TILE_SIZE;
    // Rocky ground
    ctx.fillStyle = '#7a7268';
    ctx.fillRect(x, y, ts, ts);

    // Large stone blocks
    roundRect(ctx, x + 2, y + 4, 10, 8, 1, '#a0a098');
    roundRectStroke(ctx, x + 2, y + 4, 10, 8, 1, '#808078', 0.8);
    roundRect(ctx, x + 14, y + 2, 12, 10, 2, '#b0b0a8');
    roundRectStroke(ctx, x + 14, y + 2, 12, 10, 2, '#909088', 0.8);
    roundRect(ctx, x + 6, y + 16, 14, 10, 1, '#989890');
    roundRectStroke(ctx, x + 6, y + 16, 14, 10, 1, '#787870', 0.8);
    roundRect(ctx, x + 22, y + 14, 8, 8, 1, '#a8a8a0');

    // Small scattered rocks
    circle(ctx, x + 4, y + 26, 2, '#8a8a82');
    circle(ctx, x + 28, y + 26, 2.5, '#9a9a92');
    circle(ctx, x + 26, y + 6, 1.5, '#8a8a82');

    // Rock texture detail
    line(ctx, x + 5, y + 7, x + 10, y + 9, '#808078', 0.5);
    line(ctx, x + 16, y + 5, x + 24, y + 4, '#808078', 0.5);
  };

  function drawTile(ctx, x, y, tileType, variation, animFrame) {
    var drawer = tileDrawers[tileType];
    if (drawer) {
      drawer(ctx, x, y, variation || 0, animFrame || 0);
    } else {
      // Fallback: plain green
      ctx.fillStyle = '#5a8c2a';
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    }
  }

  /* ========================================================================
   *  RESOURCE NODE SPRITES
   * ====================================================================== */

  function drawResourceNode(ctx, x, y, resourceType, remaining, animFrame, richness) {
    var f = animFrame || 0;
    var rem = remaining !== undefined ? remaining : 1; // 0..1 remaining ratio
    var rich = richness || 1;

    ctx.save();
    ctx.translate(x, y);

    if (resourceType === 'GOLD') {
      drawGoldMine(ctx, f, rem, rich);
    } else if (resourceType === 'WOOD') {
      drawTreeResource(ctx, f, rem, rich);
    } else if (resourceType === 'STONE') {
      drawStonePile(ctx, f, rem, rich);
    }

    ctx.restore();
  }

  function drawGoldMine(ctx, frame, remaining, richness) {
    var s = 1;
    var rich = richness || 1;

    // Ground patch
    oval(ctx, 0, 4 * s, 14 * s, 6 * s, '#8a7a60');

    // Gold nugget pile
    var nuggets = Math.max(2, Math.round(6 * remaining));
    var goldPositions = [
      [0, 0], [-4, 2], [4, 2], [-2, -2], [2, -2], [0, 3]
    ];
    for (var n = 0; n < nuggets; n++) {
      var gp = goldPositions[n];
      var size = (2.5 + (n % 2)) * s;
      if (rich >= 1.5) size *= 1.3; // Larger nuggets for rich tiles
      oval(ctx, gp[0] * s, gp[1] * s, size, size * 0.7, '#ffd700');
      // Highlight
      circle(ctx, gp[0] * s - 0.5, gp[1] * s - 0.5, size * 0.3, '#fff8dc');
    }

    // Sparkle effect (more sparkles for rich tiles)
    var sparkCount = rich >= 1.5 ? 5 : 3;
    for (var sp = 0; sp < sparkCount; sp++) {
      var sparkPhase = frame * 0.25 + sp * 1.8;
      var sparkAlpha = (Math.sin(sparkPhase) + 1) / 2;
      if (sparkAlpha > 0.4) {
        var sx = Math.sin(sp * 3.7) * 8 * s;
        var sy = Math.cos(sp * 2.3) * 5 * s - 2 * s;
        var sparkSize = sparkAlpha * 2 * s;
        // Cross sparkle
        ctx.fillStyle = 'rgba(255, 248, 220, ' + sparkAlpha + ')';
        ctx.fillRect(sx - sparkSize, sy, sparkSize * 2, 0.5 * s);
        ctx.fillRect(sx, sy - sparkSize, 0.5 * s, sparkSize * 2);
      }
    }

    // Rich glow effect
    if (rich >= 2.0) {
      ctx.fillStyle = 'rgba(255, 215, 0, ' + (0.08 + Math.sin(frame * 0.15) * 0.05) + ')';
      ctx.beginPath();
      ctx.arc(0, 0, 16 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTreeResource(ctx, frame, remaining, richness) {
    var s = 1;
    var rich = richness || 1;
    var trunkHeight = 12 * s;
    var canopyR = 8 * s;

    if (rich >= 1.5) {
      trunkHeight = 15 * s; // Taller trees
      canopyR = 10 * s;     // Lusher canopy
    }

    // Shadow
    oval(ctx, 0, 8 * s, 8 * s, 3 * s, 'rgba(0,0,0,0.15)');

    // Determine tree type pseudo-randomly
    var treeVariant = (frame * 7 + Math.round(remaining * 100)) % 2;

    // Scale down as resource depletes
    var treeScale = 0.4 + remaining * 0.6;

    if (treeVariant === 0) {
      // Pine tree
      px(ctx, -1.5 * s, 2 * s, 3 * s, trunkHeight * treeScale, '#5c3a1e');
      var layers = rich >= 1.5 ? 4 : 3;
      for (var l = 0; l < layers; l++) {
        var layerW = (canopyR - l * 2) * treeScale;
        var layerY = -2 * s - l * 5 * s * treeScale;
        var greenShade = ['#1a5c0a', '#2a7a1a', '#3a8a2a', '#4a9a3a'][l];
        triangle(ctx, -layerW, layerY + 4 * s, 0, layerY - 4 * s * treeScale, layerW, layerY + 4 * s, greenShade);
      }
    } else {
      // Deciduous
      px(ctx, -2 * s, 2 * s, 4 * s, trunkHeight * treeScale, '#6b3a1f');
      line(ctx, -1 * s, 2 * s, -5 * s, -4 * s * treeScale, '#6b3a1f', 1.5 * s);
      line(ctx, 1 * s, 2 * s, 4 * s, -2 * s * treeScale, '#6b3a1f', 1.5 * s);
      var cr = canopyR * treeScale;
      circle(ctx, 0, -4 * s * treeScale, cr, '#2d7a14');
      circle(ctx, -4 * s, -2 * s * treeScale, cr * 0.6, '#3a8c2a');
      circle(ctx, 4 * s, -2 * s * treeScale, cr * 0.6, '#3a8c2a');
      circle(ctx, 0, -7 * s * treeScale, cr * 0.6, '#4a9c3a');
      // Extra leaf density for rich
      if (rich >= 1.5) {
        circle(ctx, -3 * s, -6 * s * treeScale, cr * 0.5, '#5aac4a');
        circle(ctx, 3 * s, -5 * s * treeScale, cr * 0.4, '#5aac4a');
      }
    }

    // Subtle wind sway could be added via ctx.translate with sin(frame)
  }

  function drawStonePile(ctx, frame, remaining, richness) {
    var s = 1;
    var rich = richness || 1;
    var stoneCount = Math.max(2, Math.round(6 * remaining));

    // Ground patch
    oval(ctx, 0, 4 * s, 12 * s, 5 * s, '#706860');

    // Stone blocks
    var stones = [
      [-5, 2, 4, 3], [3, 1, 5, 3.5], [-1, -2, 4.5, 3],
      [5, -1, 3, 2.5], [-4, -3, 3.5, 2.5], [1, 3, 3, 2]
    ];
    for (var st = 0; st < stoneCount; st++) {
      var stDef = stones[st];
      var stW = stDef[2] * s;
      var stH = stDef[3] * s;
      if (rich >= 1.5) { stW *= 1.3; stH *= 1.3; } // Larger rocks for rich
      roundRect(ctx, stDef[0] * s - stW / 2, stDef[1] * s - stH / 2, stW, stH, 1, '#a0a098');
      roundRectStroke(ctx, stDef[0] * s - stW / 2, stDef[1] * s - stH / 2, stW, stH, 1, '#707068', 0.6);
    }

    // Crystal accents for rich tiles
    if (rich >= 1.5) {
      // Small gem-like highlights
      ctx.fillStyle = 'rgba(180, 200, 255, 0.6)';
      triangle(ctx, 2 * s, -3 * s, 3 * s, -6 * s, 4 * s, -3 * s, 'rgba(180, 200, 255, 0.7)');
      triangle(ctx, -3 * s, 0, -2 * s, -3 * s, -1 * s, 0, 'rgba(200, 210, 255, 0.6)');
      // Crystal glint
      if (Math.sin(frame * 0.2) > 0.5) {
        circle(ctx, 3 * s, -5 * s, 0.8 * s, 'rgba(255,255,255,0.7)');
      }
    }
  }

  /* ========================================================================
   *  HEALTH BAR (small utility for drawing over entities)
   * ====================================================================== */

  function drawHealthBar(ctx, x, y, width, hpRatio) {
    var barH = 3;
    var barW = width;
    // Background
    ctx.fillStyle = '#333';
    ctx.fillRect(x - barW / 2, y, barW, barH);
    // Health
    var col = hpRatio > 0.6 ? '#4caf50' : (hpRatio > 0.3 ? '#ff9800' : '#f44336');
    ctx.fillStyle = col;
    ctx.fillRect(x - barW / 2, y, barW * hpRatio, barH);
    // Border
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x - barW / 2, y, barW, barH);
  }

  /* ========================================================================
   *  SELECTION INDICATOR
   * ====================================================================== */

  function drawSelection(ctx, x, y, width, height, faction) {
    var fc2 = fac(faction);
    ctx.strokeStyle = fc2.trim;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x - width / 2, y - height / 2, width, height);
    ctx.setLineDash([]);
  }

  /* ========================================================================
   *  MINIMAP ICONS
   * ====================================================================== */

  function drawMinimapUnit(ctx, x, y, faction) {
    var fc2 = fac(faction);
    ctx.fillStyle = fc2.primary;
    ctx.fillRect(x - 1, y - 1, 3, 3);
  }

  function drawMinimapBuilding(ctx, x, y, faction) {
    var fc2 = fac(faction);
    ctx.fillStyle = fc2.secondary;
    ctx.fillRect(x - 2, y - 2, 5, 5);
    ctx.strokeStyle = fc2.accent;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x - 2, y - 2, 5, 5);
  }

  /* ========================================================================
   *  PUBLIC API
   * ====================================================================== */

  return {
    // Core drawing
    drawCat: drawCat,
    drawBuilding: drawBuilding,
    drawTile: drawTile,
    drawResourceNode: drawResourceNode,

    // Utilities
    drawHealthBar: drawHealthBar,
    drawSelection: drawSelection,
    drawMinimapUnit: drawMinimapUnit,
    drawMinimapBuilding: drawMinimapBuilding,

    // Constants
    TILE_SIZE: TILE_SIZE,
    FACTION_COLORS: FACTION_COLORS,

    // Expose for external use
    helpers: {
      lighten: lighten,
      darken: darken,
      withAlpha: withAlpha,
      circle: circle,
      oval: oval,
      line: line,
      triangle: triangle,
      roundRect: roundRect,
      px: px
    }
  };
})();
