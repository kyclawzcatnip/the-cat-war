/**
 * The Cat War - Renderer
 * ======================
 * Main rendering pipeline. Draws all game visuals onto the HTML5 Canvas
 * in sorted layers with proper depth ordering and camera transforms.
 *
 * Depends on: CatWar.Config, CatWar.Camera, CatWar.Map, CatWar.Input, CatWar.Game
 */
window.CatWar = window.CatWar || {};

CatWar.Renderer = (function () {
    'use strict';

    const CFG = () => CatWar.Config;

    let canvas = null;
    let ctx    = null;

    // Off-screen fog overlay (redrawn only when fog changes)
    let fogCanvas = null;
    let fogCtx    = null;
    let fogDirty  = true;

    // ═══════════════════════════════════════════════════════════════
    //  Initialisation
    // ═══════════════════════════════════════════════════════════════

    function init(canvasElement) {
        canvas = canvasElement;
        ctx    = canvas.getContext('2d');

        // Disable image smoothing for crisp pixel art
        ctx.imageSmoothingEnabled = false;

        // Create fog overlay canvas
        fogCanvas = document.createElement('canvas');
        fogCtx    = fogCanvas.getContext('2d');
        _resizeFogCanvas();
    }

    function _resizeFogCanvas() {
        const cfg = CFG();
        fogCanvas.width  = cfg.MAP_WIDTH;
        fogCanvas.height = cfg.MAP_HEIGHT;
        fogDirty = true;
    }

    /** Mark fog as needing a redraw (call after visibility updates). */
    function invalidateFog() {
        fogDirty = true;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Main render call — invoked once per frame
    // ═══════════════════════════════════════════════════════════════

    function render(gameState) {
        const cfg  = CFG();
        const cam  = CatWar.Camera;
        const map  = CatWar.Map;
        const inp  = CatWar.Input;
        const game = CatWar.Game;

        if (!ctx || !map || !map.grid) return;

        const w = canvas.width;
        const h = canvas.height;

        // ── Clear ────────────────────────────────────────────────
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, w, h);

        // ── Begin world-space rendering ─────────────────────────
        ctx.save();
        cam.applyTransform(ctx);

        const visRange = cam.getVisibleTileRange();
        const ts = cfg.TILE_SIZE;

        // Layer 1: Terrain tiles
        _renderTerrain(map, visRange, ts, cfg);

        // Layer 2: Terrain decorations
        _renderDecorations(map, visRange, ts);

        // Layer 3: Resource nodes
        _renderResourceNodes(map, visRange, ts, cfg);

        // Layer 4-5: Building shadows + Buildings (sorted by Y)
        if (gameState && gameState.buildings) {
            _renderBuildingShadows(gameState.buildings, cam, ts);
            _renderBuildings(gameState.buildings, cam, ts, cfg);
        }

        // Layer 6-7: Unit shadows + Units (sorted by Y)
        if (gameState && gameState.units) {
            _renderUnitShadows(gameState.units, cam);
            _renderUnits(gameState.units, cam, cfg);
        }

        // Layer 8: Projectiles
        if (gameState && gameState.projectiles) {
            _renderProjectiles(gameState.projectiles, cam);
        }

        // Layer 9: Particles
        if (gameState && gameState.particles) {
            _renderParticles(gameState.particles, cam);
        }

        // Layer 10: Selection circles
        if (gameState) {
            _renderSelectionCircles(gameState.units, gameState.buildings, cam, cfg);
        }

        // Layer 11: Health bars
        if (gameState) {
            _renderHealthBars(gameState.units, gameState.buildings, cam, cfg);
        }

        // Building placement ghost (in world space)
        if (inp) {
            inp.drawBuildGhost(ctx);
        }

        // Layer 12: Fog of war overlay
        _renderFogOfWar(map, visRange, ts, cfg);

        ctx.restore();
        // ── End world-space rendering ───────────────────────────

        // ── HUD / Screen-space overlays ─────────────────────────

        // Layer 13: Selection drag box (screen space)
        if (inp) {
            inp.drawSelectionBox(ctx);
        }

        // Minimap
        if (map && gameState) {
            cam.renderMinimap(ctx, map,
                              gameState.units, gameState.buildings,
                              game ? game.playerFaction : null);
        }

        // FPS counter
        if (game) {
            _renderFPS(game.fps);
        }

        // Resource display
        if (game && game.playerResources) {
            _renderResourceBar(game.playerResources, game.population, game.populationCap);
        }

        // Pause overlay
        if (game && game.state === 'PAUSED') {
            _renderPauseOverlay(w, h);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Layer renderers
    // ═══════════════════════════════════════════════════════════════

    // ── 1. Terrain ──────────────────────────────────────────────

    function _renderTerrain(map, range, ts, cfg) {
        for (let ty = range.startRow; ty <= range.endRow; ty++) {
            for (let tx = range.startCol; tx <= range.endCol; tx++) {
                const tileId  = map.grid[ty][tx];
                const tKey    = cfg.TERRAIN_BY_ID[tileId];
                const terrain = cfg.TERRAIN[tKey];
                if (!terrain) continue;

                ctx.fillStyle = terrain.color;
                ctx.fillRect(tx * ts, ty * ts, ts, ts);

                // Subtle grid lines
                ctx.strokeStyle = 'rgba(0,0,0,0.08)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(tx * ts, ty * ts, ts, ts);
            }
        }
    }

    // ── 2. Decorations ──────────────────────────────────────────

    function _renderDecorations(map, range, ts) {
        if (!map.decorations) return;

        for (const dec of map.decorations) {
            if (dec.tx < range.startCol || dec.tx > range.endCol ||
                dec.ty < range.startRow || dec.ty > range.endRow) continue;

            const wx = dec.tx * ts + ts / 2 + dec.offsetX;
            const wy = dec.ty * ts + ts / 2 + dec.offsetY;

            ctx.save();
            ctx.translate(wx, wy);
            ctx.scale(dec.scale, dec.scale);

            switch (dec.type) {
                case 'grass_tuft':
                    ctx.strokeStyle = '#5a9e32';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(-2, 2); ctx.lineTo(0, -4);
                    ctx.moveTo(0, 2);  ctx.lineTo(1, -5);
                    ctx.moveTo(2, 2);  ctx.lineTo(3, -3);
                    ctx.stroke();
                    break;

                case 'flower':
                    ctx.fillStyle = dec.color || '#ff69b4';
                    ctx.beginPath();
                    ctx.arc(0, 0, 2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#ffff00';
                    ctx.beginPath();
                    ctx.arc(0, 0, 0.8, 0, Math.PI * 2);
                    ctx.fill();
                    break;

                case 'small_rock':
                    ctx.fillStyle = '#999';
                    ctx.beginPath();
                    ctx.ellipse(0, 0, 3, 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#777';
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                    break;
            }

            ctx.restore();
        }
    }

    // ── 3. Resource nodes ───────────────────────────────────────

    function _renderResourceNodes(map, range, ts, cfg) {
        const GOLD_ID   = cfg.TERRAIN.GOLD_DEPOSIT.id;
        const STONE_ID  = cfg.TERRAIN.STONE_DEPOSIT.id;
        const FOREST_ID = cfg.TERRAIN.FOREST.id;

        for (let ty = range.startRow; ty <= range.endRow; ty++) {
            for (let tx = range.startCol; tx <= range.endCol; tx++) {
                const tileId = map.grid[ty][tx];
                const rd     = map.resourceData ? map.resourceData[ty][tx] : null;
                const wx = tx * ts;
                const wy = ty * ts;

                if (tileId === FOREST_ID) {
                    _drawTree(wx, wy, ts, rd);
                } else if (tileId === GOLD_ID) {
                    _drawGoldDeposit(wx, wy, ts, rd);
                } else if (tileId === STONE_ID) {
                    _drawStoneDeposit(wx, wy, ts, rd);
                }
            }
        }
    }

    function _drawTree(wx, wy, ts, rd) {
        const cx = wx + ts / 2;
        const cy = wy + ts / 2;

        // Trunk
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(cx - 2, cy, 4, ts / 3);

        // Canopy (larger for rich tiles)
        const radius = rd && rd.richness > 1 ? ts * 0.45 : ts * 0.35;
        ctx.fillStyle = rd && rd.richness > 1 ? '#1a6b1a' : '#2d5a1e';
        ctx.beginPath();
        ctx.arc(cx, cy - 2, radius, 0, Math.PI * 2);
        ctx.fill();

        // Rich indicator: golden sparkle
        if (rd && rd.richness > 1) {
            ctx.fillStyle = '#90EE90';
            ctx.globalAlpha = 0.6 + Math.sin(Date.now() * 0.003 + wx) * 0.3;
            ctx.beginPath();
            ctx.arc(cx + 3, cy - 5, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    function _drawGoldDeposit(wx, wy, ts, rd) {
        const cx = wx + ts / 2;
        const cy = wy + ts / 2;

        // Rock base
        ctx.fillStyle = '#8a7a5a';
        ctx.beginPath();
        ctx.moveTo(cx - 8, cy + 6);
        ctx.lineTo(cx - 4, cy - 6);
        ctx.lineTo(cx + 5, cy - 5);
        ctx.lineTo(cx + 9, cy + 5);
        ctx.closePath();
        ctx.fill();

        // Gold veins
        const veinColor = rd && rd.richness > 1 ? '#FFD700' : '#DAA520';
        ctx.fillStyle = veinColor;
        ctx.beginPath();
        ctx.arc(cx - 2, cy - 1, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 3, cy + 1, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Sparkle animation for gold
        const t = Date.now() * 0.004 + wx * 0.1;
        ctx.fillStyle = '#FFFACD';
        ctx.globalAlpha = 0.5 + Math.sin(t) * 0.5;
        ctx.beginPath();
        ctx.arc(cx + Math.sin(t * 1.3) * 4, cy - 4 + Math.cos(t * 0.7) * 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Rich indicator: larger golden glow
        if (rd && rd.richness > 1) {
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.3 + Math.sin(t * 2) * 0.2;
            ctx.beginPath();
            ctx.arc(cx, cy, 10, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    function _drawStoneDeposit(wx, wy, ts, rd) {
        const cx = wx + ts / 2;
        const cy = wy + ts / 2;

        // Stone pile
        const stoneColor = rd && rd.richness > 1 ? '#c0b8a8' : '#a0a0a0';
        ctx.fillStyle = stoneColor;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 2, 9, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#b0b0b0';
        ctx.beginPath();
        ctx.ellipse(cx - 3, cy - 1, 5, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#909090';
        ctx.beginPath();
        ctx.ellipse(cx + 4, cy, 4, 3, 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Rich indicator: crystal glint
        if (rd && rd.richness > 1) {
            ctx.fillStyle = '#E0E0FF';
            ctx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.003 + wy) * 0.4;
            ctx.beginPath();
            ctx.arc(cx + 2, cy - 4, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    // ── 4. Building shadows ─────────────────────────────────────

    function _renderBuildingShadows(buildings, cam, ts) {
        const game = CatWar.Game;
        const map  = CatWar.Map;
        const pf   = game ? game.playerFaction : null;

        for (const b of buildings) {
            if (!cam.isVisible(b.x - 8, b.y - 8, b.width + 16, b.height + 16)) continue;

            // Hide enemy buildings in fog
            if (b.faction !== pf && map) {
                const tile = map.worldToTile(b.x + b.width / 2, b.y + b.height / 2);
                if (!map.isTileVisible(tile.tx, tile.ty, pf)) continue;
            }

            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.beginPath();
            ctx.ellipse(
                b.x + b.width / 2 + 4,
                b.y + b.height + 2,
                b.width / 2 + 4,
                b.height / 5 + 2,
                0, 0, Math.PI * 2
            );
            ctx.fill();
        }
    }

    // ── 5. Buildings (sorted by Y) ──────────────────────────────

    function _renderBuildings(buildings, cam, ts, cfg) {
        // Sort by Y for proper depth ordering
        const sorted = buildings.slice().sort((a, b) => a.y - b.y);

        const game = CatWar.Game;
        const map  = CatWar.Map;
        const pf   = game ? game.playerFaction : null;

        for (const b of sorted) {
            if (!cam.isVisible(b.x, b.y, b.width, b.height)) continue;

            // Hide enemy buildings in fog
            if (b.faction !== pf && map) {
                const tile = map.worldToTile(b.x + b.width / 2, b.y + b.height / 2);
                if (!map.isTileVisible(tile.tx, tile.ty, pf)) continue;
            }

            const faction = cfg.FACTIONS[b.faction];
            const primary   = faction ? faction.primary   : '#888';
            const secondary = faction ? faction.secondary : '#444';

            // Main building body
            ctx.fillStyle = primary;
            ctx.fillRect(b.x + 2, b.y + 2, b.width - 4, b.height - 4);

            // Roof / accent
            ctx.fillStyle = secondary;
            ctx.fillRect(b.x + 2, b.y + 2, b.width - 4, 6);

            // Door
            ctx.fillStyle = '#3a2a1a';
            const doorW = Math.min(8, b.width / 4);
            const doorH = Math.min(12, b.height / 3);
            ctx.fillRect(
                b.x + b.width / 2 - doorW / 2,
                b.y + b.height - doorH - 2,
                doorW, doorH
            );

            // Border
            ctx.strokeStyle = secondary;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(b.x + 1, b.y + 1, b.width - 2, b.height - 2);

            // Construction progress bar (if under construction)
            if (b.constructionProgress !== undefined && b.constructionProgress < 1.0) {
                const barY = b.y - 8;
                const barW = b.width - 4;
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(b.x + 2, barY, barW, 5);
                ctx.fillStyle = '#4488ff';
                ctx.fillRect(b.x + 2, barY, barW * b.constructionProgress, 5);
            }

            // Training progress indicator
            if (b.trainingQueue && b.trainingQueue.length > 0) {
                const barY = b.y + b.height + 3;
                const barW = b.width - 4;
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(b.x + 2, barY, barW, 4);
                ctx.fillStyle = '#ffaa00';
                ctx.fillRect(b.x + 2, barY, barW * (b.trainingProgress || 0), 4);
            }

            // Rally point line
            if (b.selected && b.rallyX !== undefined) {
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 3]);
                ctx.beginPath();
                ctx.moveTo(b.x + b.width / 2, b.y + b.height / 2);
                ctx.lineTo(b.rallyX, b.rallyY);
                ctx.stroke();
                ctx.setLineDash([]);

                // Rally flag
                ctx.fillStyle = '#ffff00';
                ctx.beginPath();
                ctx.moveTo(b.rallyX, b.rallyY);
                ctx.lineTo(b.rallyX, b.rallyY - 12);
                ctx.lineTo(b.rallyX + 8, b.rallyY - 8);
                ctx.lineTo(b.rallyX, b.rallyY - 4);
                ctx.fill();
            }
        }
    }

    // ── 6. Unit shadows ─────────────────────────────────────────

    function _renderUnitShadows(units, cam) {
        const game = CatWar.Game;
        const map  = CatWar.Map;
        const pf   = game ? game.playerFaction : null;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        for (const u of units) {
            if (!cam.isVisible(u.x - 16, u.y - 16, 32, 32)) continue;

            // Hide enemy units in fog
            if (u.faction !== pf && map) {
                const tile = map.worldToTile(u.x, u.y);
                if (!map.isTileVisible(tile.tx, tile.ty, pf)) continue;
            }
            ctx.beginPath();
            ctx.ellipse(u.x, u.y + 8, 7, 3, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── 7. Units (sorted by Y) ──────────────────────────────────

    function _renderUnits(units, cam, cfg) {
        const sorted = units.slice().sort((a, b) => a.y - b.y);
        const game = CatWar.Game;
        const map  = CatWar.Map;
        const pf   = game ? game.playerFaction : null;

        for (const u of sorted) {
            if (!cam.isVisible(u.x - 16, u.y - 16, 32, 32)) continue;

            // Hide enemy units in fog
            if (u.faction !== pf && map) {
                const tile = map.worldToTile(u.x, u.y);
                if (!map.isTileVisible(tile.tx, tile.ty, pf)) continue;
            }

            const faction = cfg.FACTIONS[u.faction];
            const primary   = faction ? faction.primary   : '#888';
            const secondary = faction ? faction.secondary : '#444';

            ctx.save();
            ctx.translate(u.x, u.y);

            // Body (circle/capsule shape)
            ctx.fillStyle = primary;
            ctx.beginPath();
            ctx.arc(0, 0, 7, 0, Math.PI * 2);
            ctx.fill();

            // Faction accent ring
            ctx.strokeStyle = secondary;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Head (small circle on top)
            ctx.fillStyle = _lightenColor(primary, 30);
            ctx.beginPath();
            ctx.arc(0, -5, 4, 0, Math.PI * 2);
            ctx.fill();

            // Cat ears!
            ctx.fillStyle = primary;
            ctx.beginPath();
            ctx.moveTo(-5, -7);
            ctx.lineTo(-3, -12);
            ctx.lineTo(-1, -7);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(1, -7);
            ctx.lineTo(3, -12);
            ctx.lineTo(5, -7);
            ctx.fill();

            // Inner ears
            ctx.fillStyle = '#ffb6c1';
            ctx.beginPath();
            ctx.moveTo(-4, -7);
            ctx.lineTo(-3, -10);
            ctx.lineTo(-2, -7);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(2, -7);
            ctx.lineTo(3, -10);
            ctx.lineTo(4, -7);
            ctx.fill();

            // Eyes
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(-2, -5, 1, 0, Math.PI * 2);
            ctx.arc(2, -5, 1, 0, Math.PI * 2);
            ctx.fill();

            // Weapon indicator based on unit type
            _drawUnitWeapon(u, secondary);

            ctx.restore();
        }
    }

    function _drawUnitWeapon(u, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;

        switch (u.type) {
            case 'SWORDSCAT':
            case 'KNIGHT':
            case 'ROYAL_COMMANDER':
                // Sword on right side
                ctx.beginPath();
                ctx.moveTo(8, -2);
                ctx.lineTo(14, -8);
                ctx.stroke();
                // Crossguard
                ctx.beginPath();
                ctx.moveTo(9, -4);
                ctx.lineTo(11, -2);
                ctx.stroke();
                break;

            case 'SPEARCAT':
                // Spear (vertical)
                ctx.beginPath();
                ctx.moveTo(8, 6);
                ctx.lineTo(8, -14);
                ctx.stroke();
                // Spearhead
                ctx.fillStyle = '#c0c0c0';
                ctx.beginPath();
                ctx.moveTo(6, -14);
                ctx.lineTo(8, -18);
                ctx.lineTo(10, -14);
                ctx.fill();
                break;

            case 'ARCHER':
            case 'CROSSBOW':
                // Bow
                ctx.beginPath();
                ctx.arc(10, 0, 8, -Math.PI * 0.6, Math.PI * 0.6);
                ctx.stroke();
                // String
                ctx.strokeStyle = '#ddd';
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(10 + 8 * Math.cos(-Math.PI * 0.6), 8 * Math.sin(-Math.PI * 0.6));
                ctx.lineTo(10 + 8 * Math.cos(Math.PI * 0.6), 8 * Math.sin(Math.PI * 0.6));
                ctx.stroke();
                break;

            case 'CAVALRY':
                // Larger body (horse shape hinted)
                ctx.fillStyle = '#8B4513';
                ctx.beginPath();
                ctx.ellipse(0, 4, 10, 5, 0, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'HEALER':
                // Staff with cross
                ctx.beginPath();
                ctx.moveTo(8, 6);
                ctx.lineTo(8, -12);
                ctx.stroke();
                ctx.strokeStyle = '#00ff88';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(5, -10);
                ctx.lineTo(11, -10);
                ctx.stroke();
                break;

            case 'CATAPULT':
                // Siege arm
                ctx.strokeStyle = '#8B4513';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(-6, 4);
                ctx.lineTo(8, -10);
                ctx.stroke();
                // Base
                ctx.fillStyle = '#654321';
                ctx.fillRect(-8, 3, 16, 6);
                break;

            case 'PEASANT':
            case 'HEAD_MINER':
                // Pickaxe
                ctx.beginPath();
                ctx.moveTo(6, 4);
                ctx.lineTo(12, -6);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(10, -6);
                ctx.lineTo(14, -4);
                ctx.stroke();
                break;

            case 'SCOUT':
                // Spyglass
                ctx.strokeStyle = '#B8860B';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(4, 2);
                ctx.lineTo(14, -6);
                ctx.stroke();
                // Lens
                ctx.fillStyle = '#87CEEB';
                ctx.beginPath();
                ctx.arc(15, -7, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#B8860B';
                ctx.lineWidth = 1;
                ctx.stroke();
                break;
        }
    }

    // ── 8. Projectiles ──────────────────────────────────────────

    function _renderProjectiles(projectiles, cam) {
        for (const p of projectiles) {
            if (!cam.isVisible(p.x - 4, p.y - 4, 8, 8)) continue;

            ctx.save();
            ctx.translate(p.x, p.y);

            switch (p.type) {
                case 'arrow':
                    ctx.rotate(p.angle || 0);
                    ctx.strokeStyle = '#8B4513';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(-6, 0);
                    ctx.lineTo(6, 0);
                    ctx.stroke();
                    // Arrowhead
                    ctx.fillStyle = '#c0c0c0';
                    ctx.beginPath();
                    ctx.moveTo(6, 0);
                    ctx.lineTo(4, -2);
                    ctx.lineTo(4, 2);
                    ctx.fill();
                    break;

                case 'bolt':
                    ctx.rotate(p.angle || 0);
                    ctx.strokeStyle = '#444';
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.moveTo(-5, 0);
                    ctx.lineTo(5, 0);
                    ctx.stroke();
                    break;

                case 'boulder':
                    ctx.fillStyle = '#777';
                    ctx.beginPath();
                    ctx.arc(0, 0, 5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#555';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    break;

                default:
                    ctx.fillStyle = '#ff0';
                    ctx.beginPath();
                    ctx.arc(0, 0, 3, 0, Math.PI * 2);
                    ctx.fill();
            }

            ctx.restore();
        }
    }

    // ── 9. Particles ────────────────────────────────────────────

    function _renderParticles(particles, cam) {
        for (const p of particles) {
            if (!cam.isVisible(p.x - 4, p.y - 4, 8, 8)) continue;

            ctx.globalAlpha = p.alpha !== undefined ? p.alpha : 1;

            switch (p.type) {
                case 'dust':
                    ctx.fillStyle = 'rgba(180, 160, 120, 0.6)';
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size || 2, 0, Math.PI * 2);
                    ctx.fill();
                    break;

                case 'spark':
                    ctx.fillStyle = '#FFD700';
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size || 1.5, 0, Math.PI * 2);
                    ctx.fill();
                    break;

                case 'heal':
                    ctx.fillStyle = '#00ff88';
                    ctx.font = 'bold 10px monospace';
                    ctx.fillText('+', p.x - 3, p.y);
                    break;

                case 'damage':
                    ctx.fillStyle = '#ff4444';
                    ctx.font = 'bold 10px monospace';
                    ctx.fillText(p.text || '!', p.x - 3, p.y);
                    break;

                case 'blood':
                    ctx.fillStyle = 'rgba(180, 20, 20, 0.7)';
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size || 1.5, 0, Math.PI * 2);
                    ctx.fill();
                    break;

                default:
                    ctx.fillStyle = p.color || '#fff';
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size || 2, 0, Math.PI * 2);
                    ctx.fill();
            }

            ctx.globalAlpha = 1;
        }
    }

    // ── 10. Selection circles ───────────────────────────────────

    function _renderSelectionCircles(units, buildings, cam, cfg) {
        const game = CatWar.Game;
        const playerFaction = game ? game.playerFaction : null;

        // Units
        if (units) {
            for (const u of units) {
                if (!u.selected) continue;
                if (!cam.isVisible(u.x - 16, u.y - 16, 32, 32)) continue;

                ctx.strokeStyle = (u.faction === playerFaction)
                    ? cfg.UI.SELECTION_COLOR_FRIENDLY
                    : cfg.UI.SELECTION_COLOR_ENEMY;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.ellipse(u.x, u.y + 6, 10, 5, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        // Buildings
        if (buildings) {
            for (const b of buildings) {
                if (!b.selected) continue;
                if (!cam.isVisible(b.x, b.y, b.width, b.height)) continue;

                ctx.strokeStyle = (b.faction === playerFaction)
                    ? cfg.UI.SELECTION_COLOR_FRIENDLY
                    : cfg.UI.SELECTION_COLOR_ENEMY;
                ctx.lineWidth = 2;
                ctx.strokeRect(b.x - 2, b.y - 2, b.width + 4, b.height + 4);
            }
        }
    }

    // ── 11. Health bars ─────────────────────────────────────────

    function _renderHealthBars(units, buildings, cam, cfg) {
        const barW = cfg.UI.HEALTH_BAR_WIDTH;
        const barH = cfg.UI.HEALTH_BAR_HEIGHT;
        const offY = cfg.UI.HEALTH_BAR_OFFSET_Y;

        // Units
        if (units) {
            for (const u of units) {
                if (!u.selected && u.hp >= u.maxHp) continue;
                if (!cam.isVisible(u.x - 16, u.y - 24, 32, 32)) continue;

                const ratio = Math.max(0, u.hp / u.maxHp);
                const barX = u.x - barW / 2;
                const barY = u.y + offY;

                // Background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

                // Health (green → yellow → red)
                ctx.fillStyle = ratio > 0.6 ? '#44cc44' : (ratio > 0.3 ? '#cccc44' : '#cc4444');
                ctx.fillRect(barX, barY, barW * ratio, barH);
            }
        }

        // Buildings
        if (buildings) {
            for (const b of buildings) {
                if (!b.selected && b.hp >= b.maxHp) continue;
                if (!cam.isVisible(b.x, b.y, b.width, b.height)) continue;

                const ratio = Math.max(0, b.hp / b.maxHp);
                const bBarW = b.width - 4;
                const barX  = b.x + 2;
                const barY  = b.y - 8;

                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(barX - 1, barY - 1, bBarW + 2, barH + 2);
                ctx.fillStyle = ratio > 0.6 ? '#44cc44' : (ratio > 0.3 ? '#cccc44' : '#cc4444');
                ctx.fillRect(barX, barY, bBarW * ratio, barH);
            }
        }
    }

    // ── 12. Fog of war ──────────────────────────────────────────

    function _renderFogOfWar(map, range, ts, cfg) {
        if (!map.fogGrid) return;

        for (let ty = range.startRow; ty <= range.endRow; ty++) {
            for (let tx = range.startCol; tx <= range.endCol; tx++) {
                const fogVal = map.fogGrid[ty][tx];
                if (fogVal === cfg.FOG.VISIBLE) continue;

                ctx.fillStyle = fogVal === cfg.FOG.HIDDEN
                    ? `rgba(0, 0, 0, ${cfg.FOG.HIDDEN_ALPHA})`
                    : `rgba(0, 0, 0, ${cfg.FOG.EXPLORED_ALPHA})`;
                ctx.fillRect(tx * ts, ty * ts, ts, ts);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  HUD elements (screen-space)
    // ═══════════════════════════════════════════════════════════════

    function _renderFPS(fps) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(canvas.width - 70, 5, 65, 22);
        ctx.fillStyle = '#00ff00';
        ctx.font = '12px monospace';
        ctx.fillText(`FPS: ${fps}`, canvas.width - 65, 20);
    }

    function _renderResourceBar(resources, pop, popCap) {
        const barY = 5;
        const barH = 28;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(5, barY, 500, barH);

        ctx.font = 'bold 13px monospace';
        const items = [
            { label: '🪙', value: Math.floor(resources.gold),  color: '#FFD700' },
            { label: '🪵', value: Math.floor(resources.wood),  color: '#8B4513' },
            { label: '🪨', value: Math.floor(resources.stone), color: '#A0A0A0' },
            { label: '🌾', value: Math.floor(resources.food),  color: '#9ACD32' }
        ];

        let xOff = 15;
        for (const item of items) {
            ctx.fillStyle = item.color;
            ctx.fillText(`${item.label} ${item.value}`, xOff, barY + 19);
            xOff += 100;
        }

        // Population
        ctx.fillStyle = pop >= popCap ? '#ff4444' : '#ffffff';
        ctx.fillText(`👤 ${pop}/${popCap}`, xOff, barY + 19);
    }

    function _renderPauseOverlay(w, h) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', w / 2, h / 2);
        ctx.font = '18px sans-serif';
        ctx.fillText('Press Escape to resume', w / 2, h / 2 + 40);
        ctx.textAlign = 'start';
    }

    // ═══════════════════════════════════════════════════════════════
    //  Color utilities
    // ═══════════════════════════════════════════════════════════════

    function _lightenColor(hex, amount) {
        const num = parseInt(hex.replace('#', ''), 16);
        let r = Math.min(255, ((num >> 16) & 0xff) + amount);
        let g = Math.min(255, ((num >>  8) & 0xff) + amount);
        let b = Math.min(255, ( num        & 0xff) + amount);
        return `rgb(${r}, ${g}, ${b})`;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Public API
    // ═══════════════════════════════════════════════════════════════

    return {
        init,
        render,
        invalidateFog
    };
})();
