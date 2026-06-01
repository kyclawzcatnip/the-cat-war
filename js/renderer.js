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

        // Building hotbar
        if (game && game.state === 'PLAYING') {
            _renderBuildHotbar(w, h, game);
        }

        // Training panel (when a building is selected)
        if (game && game.state === 'PLAYING') {
            const inp = CatWar.Input;
            if (inp && inp.selectedBuilding) {
                _renderTrainingPanel(w, h, inp.selectedBuilding, game);
            } else {
                _trainPanel.visible = false;
                _trainPanel.buttons = [];
            }
        }

        // Miner panel (when a miner is selected and no building is selected)
        if (game && game.state === 'PLAYING') {
            const inp = CatWar.Input;
            const workers = inp && inp.selectedUnits ? inp.selectedUnits.filter(u => u.alive && u.faction === game.playerFaction && (u.type === 'PEASANT' || u.type === 'HEAD_MINER')) : [];
            if (inp && (!inp.selectedBuilding) && workers.length > 0) {
                _renderMinerPanel(w, h, inp.selectedUnits, game);
            } else {
                _minerPanel.visible = false;
                _minerPanel.buttons = [];
            }
        }

        // Scout Enemy Castle Popup
        if (game && game.state === 'PLAYING') {
            if (_scoutPopup.visible) {
                _renderScoutPopup(w, h);
            }
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
        const frame = Math.floor(Date.now() * 0.006); // for wave ripples animation
        for (let ty = range.startRow; ty <= range.endRow; ty++) {
            for (let tx = range.startCol; tx <= range.endCol; tx++) {
                const tileId  = map.grid[ty][tx];
                const tKey    = cfg.TERRAIN_BY_ID[tileId];
                if (!tKey) continue;

                if (CatWar.Sprites && CatWar.Sprites.drawTile) {
                    CatWar.Sprites.drawTile(ctx, tx * ts, ty * ts, tKey, tx + ty, frame);
                } else {
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

        const frame = Math.floor(Date.now() * 0.005);

        for (let ty = range.startRow; ty <= range.endRow; ty++) {
            for (let tx = range.startCol; tx <= range.endCol; tx++) {
                const tileId = map.grid[ty][tx];
                const rd     = map.resourceData ? map.resourceData[ty][tx] : null;
                const wx = tx * ts;
                const wy = ty * ts;

                if (tileId !== GOLD_ID && tileId !== STONE_ID && tileId !== FOREST_ID) continue;

                if (CatWar.Sprites && CatWar.Sprites.drawResourceNode) {
                    const typeKey = tileId === GOLD_ID ? 'GOLD' : (tileId === STONE_ID ? 'STONE' : 'WOOD');
                    const remaining = rd ? (rd.amount / rd.maxAmount) : 1.0;
                    const richness = rd ? rd.richness : 1.0;
                    CatWar.Sprites.drawResourceNode(
                        ctx,
                        wx + ts / 2,
                        wy + ts / 2,
                        typeKey,
                        remaining,
                        frame,
                        richness
                    );
                } else {
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

            if (b.buildingType === 'WALL' || b.buildingType === 'GATE') {
                // ── Wall / Gate rendering ──
                const bCfgW = cfg.BUILDINGS[b.buildingType];
                const isGate = b.buildingType === 'GATE';
                const wallColor = isGate ? '#5a4a3a' : '#8a8078';
                const topColor = isGate ? '#4a3a2a' : '#9a9088';

                // Main block
                ctx.fillStyle = wallColor;
                ctx.fillRect(b.x + 1, b.y + 1, b.width - 2, b.height - 2);

                // Top edge highlight
                ctx.fillStyle = topColor;
                ctx.fillRect(b.x + 1, b.y + 1, b.width - 2, 4);

                // Brick pattern for walls
                if (!isGate) {
                    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
                    ctx.lineWidth = 0.5;
                    const bw = b.width - 2;
                    const bh = b.height - 2;
                    for (let row = 0; row < 3; row++) {
                        const ry = b.y + 1 + row * (bh / 3);
                        ctx.beginPath();
                        ctx.moveTo(b.x + 1, ry);
                        ctx.lineTo(b.x + 1 + bw, ry);
                        ctx.stroke();
                        const offset = row % 2 === 0 ? 0 : bw / 4;
                        for (let col = 0; col < 3; col++) {
                            const cx = b.x + 1 + offset + col * (bw / 2);
                            if (cx > b.x + 1 && cx < b.x + 1 + bw) {
                                ctx.beginPath();
                                ctx.moveTo(cx, ry);
                                ctx.lineTo(cx, ry + bh / 3);
                                ctx.stroke();
                            }
                        }
                    }
                } else {
                    // Gate bars
                    ctx.strokeStyle = '#7a6a5a';
                    ctx.lineWidth = 2;
                    const gx = b.x + b.width / 2;
                    for (let i = -1; i <= 1; i++) {
                        ctx.beginPath();
                        ctx.moveTo(gx + i * 6, b.y + 5);
                        ctx.lineTo(gx + i * 6, b.y + b.height - 3);
                        ctx.stroke();
                    }
                }

                // Border
                ctx.strokeStyle = '#555';
                ctx.lineWidth = 1;
                ctx.strokeRect(b.x + 1, b.y + 1, b.width - 2, b.height - 2);

                // Faction tint on top
                ctx.fillStyle = primary + '33';
                ctx.fillRect(b.x + 1, b.y + 1, b.width - 2, b.height - 2);


            } else if (CatWar.Sprites && CatWar.Sprites.drawBuilding) {
                // Procedural sprite drawer from sprites.js
                CatWar.Sprites.drawBuilding(
                    ctx,
                    b.x + b.width / 2,
                    b.y + b.height / 2,
                    b.buildingType,
                    b.faction,
                    b.constructionProgress,
                    1.0
                );
            } else {
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
            }

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
            if (u.isFlyer) {
                // High-altitude shadow (offset further down, slightly smaller)
                ctx.ellipse(u.x, u.y + 15, 6, 2.5, 0, 0, Math.PI * 2);
            } else {
                ctx.ellipse(u.x, u.y + 8, 7, 3, 0, 0, Math.PI * 2);
            }
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

            if (CatWar.Sprites && CatWar.Sprites.drawCat) {
                const dir = u.facingAngle !== undefined ? (Math.cos(u.facingAngle) >= 0 ? 1 : -1) : 1;
                const drawY = u.isFlyer ? u.y - 20 : u.y;
                CatWar.Sprites.drawCat(
                    ctx,
                    u.x,
                    drawY,
                    u.type,
                    u.faction,
                    dir,
                    u.animFrame || 0,
                    1.0,
                    u.id,
                    u.state || 'IDLE'
                );
            } else {
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

                case 'bullet':
                    ctx.rotate(p.angle || 0);
                    ctx.strokeStyle = '#FFD700'; // shiny gold tracer
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(-10, 0);
                    ctx.lineTo(4, 0);
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

                case 'text':
                    ctx.fillStyle = p.color || '#fff';
                    ctx.font = p.size ? `bold ${p.size}px MedievalSharpCinzel, sans-serif` : 'bold 11px sans-serif';
                    ctx.fillText(p.text || '', p.x, p.y);
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
    //  Training Panel (selected building)
    // ═══════════════════════════════════════════════════════════════

    const UNIT_ICONS = {
        PEASANT:          { icon: '👷', label: 'Peasant' },
        HEAD_MINER:       { icon: '⛏️', label: 'Head Miner' },
        SCOUT:            { icon: '🐾', label: 'Scout' },
        SWORDSCAT:        { icon: '⚔️', label: 'Swordscat' },
        SPEARCAT:         { icon: '🔱', label: 'Spearcat' },
        KNIGHT:           { icon: '🛡️', label: 'Knight' },
        ARCHER:           { icon: '🏹', label: 'Archer' },
        CROSSBOW:         { icon: '🎯', label: 'Crossbow' },
        BIPLANE:          { icon: '🛩️', label: 'Biplane Cat' },
        CAVALRY:          { icon: '🐴', label: 'Cavalry' },
        CATAPULT:         { icon: '💥', label: 'Catapult' },
        HEALER:           { icon: '💚', label: 'Healer' },
        ROYAL_COMMANDER:  { icon: '👑', label: 'Commander' }
    };

    const _trainPanel = {
        buttons: [],    // { unitType, x, y, w, h }
        visible: false
    };

    const _minerPanel = {
        buttons: [],    // { pref, x, y, w, h }
        visible: false
    };

    const _scoutPopup = {
        visible: false,
        castle: null,
        buttons: []     // { label, x, y, w, h, callback }
    };

    function _renderTrainingPanel(w, h, building, game) {
        const cfg = CFG();
        const bCfg = cfg.BUILDINGS[building.buildingType];
        if (!bCfg) return;

        // Only show for player faction buildings
        if (building.faction !== game.playerFaction) return;

        const playerRes = game.playerResources || {};
        const trainable = bCfg.trains || [];
        _trainPanel.buttons = [];
        _trainPanel.visible = true;

        // Panel dimensions
        const panelH = 90;
        const panelW = Math.max(400, trainable.length * 80 + 180);
        const panelX = (w - panelW) / 2;
        const panelY = h - panelH - 8;

        // Panel background
        ctx.save();
        ctx.fillStyle = 'rgba(15, 10, 5, 0.88)';
        _drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 8);
        ctx.fill();

        // Panel border
        ctx.strokeStyle = '#8B6914';
        ctx.lineWidth = 2;
        _drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 8);
        ctx.stroke();
        ctx.restore();

        // Building name + HP
        ctx.save();
        ctx.font = 'bold 14px "Palatino Linotype", serif';
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'left';
        const iconInfo = BUILDING_ICONS[building.buildingType] || { icon: '🏠', label: building.buildingType };
        ctx.fillText(iconInfo.icon + ' ' + iconInfo.label, panelX + 12, panelY + 20);

        // HP bar
        const hpRatio = building.hp / building.maxHp;
        const hpBarW = 80;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(panelX + 12, panelY + 26, hpBarW, 6);
        ctx.fillStyle = hpRatio > 0.5 ? '#4CAF50' : hpRatio > 0.25 ? '#FF9800' : '#F44336';
        ctx.fillRect(panelX + 12, panelY + 26, hpBarW * hpRatio, 6);
        ctx.font = '10px monospace';
        ctx.fillStyle = '#aaa';
        ctx.fillText(building.hp + '/' + building.maxHp, panelX + 12 + hpBarW + 5, panelY + 32);

        // Training queue progress
        if (building.trainingQueue && building.trainingQueue.length > 0) {
            const trainType = building.trainingQueue[0];
            const trainCfg = cfg.UNITS[trainType];
            const progress = building.trainingProgress || 0;
            const trainIcon = UNIT_ICONS[trainType] || { icon: '🐱', label: trainType };

            ctx.font = '11px "Palatino Linotype", serif';
            ctx.fillStyle = '#C8B896';
            ctx.fillText('Training: ' + trainIcon.icon + ' ' + trainIcon.label, panelX + 12, panelY + 50);

            // Progress bar
            const progBarW = 100;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(panelX + 12, panelY + 55, progBarW, 8);
            ctx.fillStyle = '#4CAF50';
            ctx.fillRect(panelX + 12, panelY + 55, progBarW * progress, 8);

            // Queue count
            if (building.trainingQueue.length > 1) {
                ctx.fillStyle = '#aaa';
                ctx.fillText('+' + (building.trainingQueue.length - 1) + ' queued', panelX + 12 + progBarW + 8, panelY + 63);
            }
        }

        ctx.restore();

        // Train buttons
        if (trainable.length > 0) {
            const btnSize = 58;
            const btnPad = 8;
            const startX = panelX + 160;
            const btnY = panelY + 10;

            for (let i = 0; i < trainable.length; i++) {
                const unitType = trainable[i];
                const uCfg = cfg.UNITS[unitType];
                if (!uCfg) continue;
                const unitIcon = UNIT_ICONS[unitType] || { icon: '🐱', label: unitType };

                const bx = startX + i * (btnSize + btnPad);
                const by = btnY;

                const canAfford = uCfg.cost ? _canAffordBuilding(playerRes, uCfg.cost) : true;
                const isHovered = _isPointInRect(CatWar.Input.screenX, CatWar.Input.screenY, bx, by, btnSize, btnSize);

                ctx.save();

                // Button bg
                _drawRoundedRect(ctx, bx, by, btnSize, btnSize, 5);
                if (isHovered && canAfford) {
                    ctx.fillStyle = 'rgba(76, 175, 80, 0.35)';
                } else if (isHovered) {
                    ctx.fillStyle = 'rgba(204, 51, 51, 0.25)';
                } else {
                    ctx.fillStyle = 'rgba(60, 40, 25, 0.6)';
                }
                ctx.fill();

                // Button border
                _drawRoundedRect(ctx, bx, by, btnSize, btnSize, 5);
                ctx.strokeStyle = canAfford ? 'rgba(139, 105, 20, 0.7)' : 'rgba(100, 60, 60, 0.5)';
                ctx.lineWidth = isHovered ? 2 : 1;
                ctx.stroke();

                // Icon
                ctx.font = '18px serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = canAfford ? '#FFFFFF' : '#666';
                ctx.fillText(unitIcon.icon, bx + btnSize / 2, by + 20);

                // Label
                ctx.font = 'bold 8px "Palatino Linotype", serif';
                ctx.fillStyle = canAfford ? '#D4B896' : '#555';
                ctx.textBaseline = 'top';
                ctx.fillText(unitIcon.label, bx + btnSize / 2, by + 33);

                // Cost
                ctx.font = '8px monospace';
                ctx.fillStyle = canAfford ? '#80CC80' : '#CC5555';
                const costs = [];
                if (uCfg.cost) {
                    if (uCfg.cost.gold) costs.push('🪙' + uCfg.cost.gold);
                    if (uCfg.cost.wood) costs.push('🪵' + uCfg.cost.wood);
                    if (uCfg.cost.stone) costs.push('🪨' + uCfg.cost.stone);
                }
                ctx.fillText(costs.join(' '), bx + btnSize / 2, by + 44);

                ctx.textAlign = 'start';
                ctx.textBaseline = 'alphabetic';
                ctx.restore();

                // Register button
                _trainPanel.buttons.push({ unitType, x: bx, y: by, w: btnSize, h: btnSize });
            }
        }
    }

    function _isPointInRect(px, py, rx, ry, rw, rh) {
        return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
    }

    /**
     * Handle training panel click — queue unit training.
     * @returns {boolean} true if click was consumed.
     */
    function trainPanelHandleClick(screenX, screenY) {
        if (!_trainPanel.visible) return false;
        for (const btn of _trainPanel.buttons) {
            if (_isPointInRect(screenX, screenY, btn.x, btn.y, btn.w, btn.h)) {
                const inp = CatWar.Input;
                if (inp && inp.selectedBuilding) {
                    const result = CatWar.Game.trainUnit(inp.selectedBuilding, btn.unitType);
                    if (result) {
                        console.log('[UI] Queued training:', btn.unitType);
                    } else {
                        console.log('[UI] Cannot train:', btn.unitType, '(cost/pop?)');
                    }
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Check if screen point is over the training panel.
     */
    function isOverTrainPanel(screenX, screenY) {
        if (!_trainPanel.visible) return false;
        for (const btn of _trainPanel.buttons) {
            if (_isPointInRect(screenX, screenY, btn.x, btn.y, btn.w, btn.h)) {
                return true;
            }
        }
        return false;
    }

    function _drawMedievalButton(ctx, x, y, w, h, text, isHovered, isDisabled) {
        ctx.save();
        const r = 6;
        _drawRoundedRect(ctx, x, y, w, h, r);

        if (isDisabled) {
            ctx.fillStyle = '#444444';
        } else if (isHovered) {
            const grad = ctx.createLinearGradient(x, y, x, y + h);
            grad.addColorStop(0, '#FFE066');
            grad.addColorStop(1, '#B8860B');
            ctx.fillStyle = grad;
        } else {
            const grad = ctx.createLinearGradient(x, y, x, y + h);
            grad.addColorStop(0, '#DAA520');
            grad.addColorStop(1, '#8B6914');
            ctx.fillStyle = grad;
        }
        ctx.fill();

        // Border
        _drawRoundedRect(ctx, x, y, w, h, r);
        ctx.strokeStyle = isHovered ? '#FFD700' : '#2C1810';
        ctx.lineWidth = isHovered ? 2 : 1.5;
        ctx.stroke();

        // Text
        ctx.fillStyle = isDisabled ? '#777777' : '#2C1810';
        ctx.font = 'bold 13px "Palatino Linotype", "Book Antiqua", Palatino, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + w / 2, y + h / 2 + 1);

        ctx.restore();
    }

    function _renderMinerPanel(w, h, units, game) {
        const workers = units.filter(u => u.alive && u.faction === game.playerFaction && (u.type === 'PEASANT' || u.type === 'HEAD_MINER'));
        if (workers.length === 0) return;

        _minerPanel.buttons = [];
        _minerPanel.visible = true;
        _trainPanel.visible = false;

        const panelH = 90;
        const panelW = 420;
        const panelX = (w - panelW) / 2;
        const panelY = h - panelH - 8;

        // Panel background
        ctx.save();
        ctx.fillStyle = 'rgba(15, 10, 5, 0.88)';
        _drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 8);
        ctx.fill();

        // Panel border
        ctx.strokeStyle = '#8B6914';
        ctx.lineWidth = 2;
        _drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 8);
        ctx.stroke();
        ctx.restore();

        // Miner Title + Stats
        ctx.save();
        ctx.font = 'bold 14px "Palatino Linotype", serif';
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'left';

        const firstWorker = workers[0];
        const countText = workers.length > 1 ? ` (${workers.length} selected)` : '';
        const titleStr = firstWorker.type === 'HEAD_MINER' ? '⛏️ Head Miner' : '👷 Peasant';
        ctx.fillText(titleStr + countText, panelX + 12, panelY + 22);

        // Status text
        ctx.font = '11px "Palatino Linotype", serif';
        ctx.fillStyle = '#C8B896';
        let statusText = 'State: ' + firstWorker.state;
        if (firstWorker.carrying > 0 && firstWorker.carryResource) {
            statusText += ` (Carrying ${Math.round(firstWorker.carrying)} ${firstWorker.carryResource})`;
        }
        ctx.fillText(statusText, panelX + 12, panelY + 44);

        // Preference text
        const prefText = 'Mine Target: ' + (firstWorker.minePreference || 'auto').toUpperCase();
        ctx.fillStyle = '#DAA520';
        ctx.fillText(prefText, panelX + 12, panelY + 66);
        ctx.restore();

        // Mine Preference buttons: Auto, Gold, Stone, Wood
        const prefs = [
            { id: 'auto',  icon: '🔄', label: 'Auto',  color: '#D4B896' },
            { id: 'gold',  icon: '🪙', label: 'Gold',  color: '#FFD700' },
            { id: 'stone', icon: '🪨', label: 'Stone', color: '#aaaaaa' },
            { id: 'wood',  icon: '🪵', label: 'Wood',  color: '#8B4513' }
        ];

        const btnSize = 50;
        const btnPad = 8;
        const startX = panelX + 175;
        const btnY = panelY + 20;

        for (let i = 0; i < prefs.length; i++) {
            const p = prefs[i];
            const bx = startX + i * (btnSize + btnPad);
            const by = btnY;

            const isHovered = _isPointInRect(CatWar.Input.screenX, CatWar.Input.screenY, bx, by, btnSize, btnSize);
            const isSelected = workers.every(w => (w.minePreference || 'auto') === p.id);

            ctx.save();

            // Button bg
            _drawRoundedRect(ctx, bx, by, btnSize, btnSize, 5);
            if (isSelected) {
                ctx.fillStyle = 'rgba(218, 165, 32, 0.4)';
            } else if (isHovered) {
                ctx.fillStyle = 'rgba(76, 175, 80, 0.25)';
            } else {
                ctx.fillStyle = 'rgba(60, 40, 25, 0.6)';
            }
            ctx.fill();

            // Button border
            _drawRoundedRect(ctx, bx, by, btnSize, btnSize, 5);
            ctx.strokeStyle = isSelected ? '#FFD700' : (isHovered ? '#DAA520' : 'rgba(139, 105, 20, 0.7)');
            ctx.lineWidth = (isSelected || isHovered) ? 2 : 1;
            ctx.stroke();

            // Icon
            ctx.font = '16px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.icon, bx + btnSize / 2, by + 18);

            // Label
            ctx.font = 'bold 9px "Palatino Linotype", serif';
            ctx.fillStyle = p.color;
            ctx.fillText(p.label, bx + btnSize / 2, by + 36);

            ctx.restore();

            // Register button
            _minerPanel.buttons.push({ pref: p.id, x: bx, y: by, w: btnSize, h: btnSize });
        }
    }

    function minerPanelHandleClick(screenX, screenY) {
        if (!_minerPanel.visible) return false;
        for (const btn of _minerPanel.buttons) {
            if (_isPointInRect(screenX, screenY, btn.x, btn.y, btn.w, btn.h)) {
                const inp = CatWar.Input;
                if (inp && inp.selectedUnits.length > 0) {
                    const workers = inp.selectedUnits.filter(u => u.alive && u.faction === CatWar.Game.playerFaction && (u.type === 'PEASANT' || u.type === 'HEAD_MINER'));
                    for (const w of workers) {
                        w.minePreference = btn.pref;
                        
                        // Reset target and path if they don't match the new preference
                        if (btn.pref !== 'auto') {
                            let matches = false;
                            if (w.gatherTarget) {
                                const map = CatWar.Map;
                                const rd = map ? map.getResourceData(w.gatherTarget.tx, w.gatherTarget.ty) : null;
                                if (rd && rd.resource === btn.pref) {
                                    matches = true;
                                }
                            }
                            if (!matches) {
                                w.gatherTarget = null;
                                w.path = null;
                                if (w.carrying > 0) {
                                    w.state = 'RETURNING';
                                } else {
                                    w.state = 'IDLE';
                                }
                            }
                        } else {
                            if (w.carrying > 0 && w.state !== 'RETURNING') {
                                w.state = 'RETURNING';
                                w.path = null;
                            }
                        }
                    }
                    if (CatWar.Audio) {
                        CatWar.Audio.playSound('meow');
                    }
                    console.log('[UI] Set mine preference to:', btn.pref);
                }
                return true;
            }
        }
        return false;
    }

    function isOverMinerPanel(screenX, screenY) {
        if (!_minerPanel.visible) return false;
        for (const btn of _minerPanel.buttons) {
            if (_isPointInRect(screenX, screenY, btn.x, btn.y, btn.w, btn.h)) {
                return true;
            }
        }
        return false;
    }

    function _renderScoutPopup(w, h) {
        if (!_scoutPopup.visible || !_scoutPopup.castle) return;

        const panelW = 480;
        const panelH = 180;
        const panelX = (w - panelW) / 2;
        const panelY = (h - panelH) / 2 - 40;

        ctx.save();

        // Dark back-overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, w, h);

        // Parchment backing
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 15;
        _drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 10);
        const grad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
        grad.addColorStop(0, '#FFF8EE');
        grad.addColorStop(0.5, '#F5E6C8');
        grad.addColorStop(1, '#D4B896');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.shadowBlur = 0;

        // Gold border
        _drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 10);
        ctx.strokeStyle = '#DAA520';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Inner frame
        _drawRoundedRect(ctx, panelX + 5, panelY + 5, panelW - 10, panelH - 10, 8);
        ctx.strokeStyle = 'rgba(139, 105, 20, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Content — Title
        ctx.fillStyle = '#8B6914';
        ctx.font = 'bold 18px "Palatino Linotype", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('🐾 Scout Intel: Enemy Keep Found!', panelX + panelW / 2, panelY + 18);

        // Content — Subtext
        ctx.fillStyle = '#2C1810';
        ctx.font = 'bold italic 13px "Palatino Linotype", serif';
        const text1 = 'Our Scout Cat has discovered the enemy Castle Keep!';
        const text2 = 'Should we order all active military forces to attack?';
        ctx.fillText(text1, panelX + panelW / 2, panelY + 52);
        ctx.fillText(text2, panelX + panelW / 2, panelY + 72);

        ctx.restore();

        // Buttons
        _scoutPopup.buttons = [];

        const btnW = 160;
        const btnH = 38;
        const btnY = panelY + panelH - 54;

        // Yes Button
        const yesX = panelX + panelW / 2 - btnW - 15;
        const isYesHovered = _isPointInRect(CatWar.Input.screenX, CatWar.Input.screenY, yesX, btnY, btnW, btnH);
        _drawMedievalButton(ctx, yesX, btnY, btnW, btnH, '⚔️ Yes, Attack!', isYesHovered);

        _scoutPopup.buttons.push({
            label: 'Yes',
            x: yesX, y: btnY, w: btnW, h: btnH,
            callback: () => {
                const game = CatWar.Game;
                if (!game) return;
                const playerFaction = game.playerFaction;
                const military = game.units.filter(u => 
                    u.alive && 
                    u.faction === playerFaction && 
                    u.type !== 'PEASANT' && 
                    u.type !== 'HEAD_MINER' && 
                    u.type !== 'SCOUT' && 
                    u.type !== 'FARMER'
                );

                if (military.length > 0 && _scoutPopup.castle) {
                    CatWar.Input.pushCommand({
                        type: 'ATTACK',
                        units: military,
                        target: _scoutPopup.castle
                    });

                    // Add charge particles
                    for (const u of military) {
                        game.addParticle({
                            x: u.x, y: u.y - 12,
                            vx: (Math.random() - 0.5) * 6,
                            vy: -20 - Math.random() * 15,
                            life: 0.8,
                            alpha: 1,
                            type: 'text',
                            text: '⚔️',
                            color: '#ff4444',
                            size: 11
                        });
                    }

                    if (CatWar.Audio) {
                        CatWar.Audio.playSound('chargeSound');
                    }
                }
            }
        });

        // No Button
        const noX = panelX + panelW / 2 + 15;
        const isNoHovered = _isPointInRect(CatWar.Input.screenX, CatWar.Input.screenY, noX, btnY, btnW, btnH);
        _drawMedievalButton(ctx, noX, btnY, btnW, btnH, '❌ No, Hold', isNoHovered);

        _scoutPopup.buttons.push({
            label: 'No',
            x: noX, y: btnY, w: btnW, h: btnH,
            callback: () => {}
        });
    }

    function showScoutPopup(castle) {
        _scoutPopup.castle = castle;
        _scoutPopup.visible = true;
    }

    function scoutPopupHandleClick(screenX, screenY) {
        if (!_scoutPopup.visible) return false;
        for (const btn of _scoutPopup.buttons) {
            if (_isPointInRect(screenX, screenY, btn.x, btn.y, btn.w, btn.h)) {
                if (btn.callback) btn.callback();
                _scoutPopup.visible = false;
                if (CatWar.Audio) {
                    CatWar.Audio.playSound('buttonClick');
                }
                return true;
            }
        }
        return true; // block other clicks
    }

    function isOverScoutPopup(screenX, screenY) {
        return _scoutPopup.visible;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Building Hotbar
    // ═══════════════════════════════════════════════════════════════

    // Hotbar state
    const _hotbar = {
        buttons: [],         // { key, x, y, w, h }
        hoveredKey: null,
        tooltipKey: null,
        tooltipX: 0,
        tooltipY: 0
    };

    // Building display info (icons drawn procedurally)
    const BUILDING_ICONS = {
        CASTLE_KEEP:    { icon: '🏰', label: 'Castle',       shortcut: '' },
        BARRACKS:       { icon: '⚔️',  label: 'Barracks',     shortcut: 'B' },
        ARCHERY_RANGE:  { icon: '🏹', label: 'Archery',      shortcut: 'R' },
        BLACKSMITH:     { icon: '🔨', label: 'Blacksmith',   shortcut: 'K' },
        STABLE:         { icon: '🐴', label: 'Stable',       shortcut: 'S' },
        SIEGE_WORKSHOP: { icon: '💣', label: 'Siege',        shortcut: 'I' },
        FARM:           { icon: '🌾', label: 'Farm',         shortcut: 'F' },
        LUMBER_MILL:    { icon: '🪵', label: 'Lumber',       shortcut: 'L' },
        STONE_QUARRY:   { icon: '⛏️',  label: 'Quarry',       shortcut: 'Q' },
        WATCHTOWER:     { icon: '🗼', label: 'Tower',        shortcut: 'T' },
        WALL:           { icon: '🧱', label: 'Wall',         shortcut: 'W' },
        GATE:           { icon: '🚪', label: 'Gate',         shortcut: 'G' }
    };

    function _renderBuildHotbar(w, h, game) {
        const cfg = CFG();
        const inp = CatWar.Input;
        const buildings = cfg.BUILDINGS;
        const keys = Object.keys(buildings).filter(k => k !== 'CASTLE_KEEP');

        const btnSize = 56;
        const btnPad = 6;
        const panelPad = 10;
        const totalBtns = keys.length;
        const panelH = totalBtns * (btnSize + btnPad) + panelPad * 2 - btnPad;
        const panelW = btnSize + panelPad * 2 + 2;
        const panelX = w - panelW - 8;
        const panelY = Math.max(40, (h - panelH) / 2);

        // Panel background
        ctx.save();
        ctx.fillStyle = 'rgba(15, 10, 5, 0.82)';
        _drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 8);
        ctx.fill();

        // Panel border
        ctx.strokeStyle = '#8B6914';
        ctx.lineWidth = 2;
        _drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 8);
        ctx.stroke();

        // Inner gold accent
        ctx.strokeStyle = 'rgba(218, 165, 32, 0.25)';
        ctx.lineWidth = 1;
        _drawRoundedRect(ctx, panelX + 3, panelY + 3, panelW - 6, panelH - 6, 6);
        ctx.stroke();

        // Header label
        ctx.font = 'bold 10px "Palatino Linotype", serif';
        ctx.fillStyle = '#DAA520';
        ctx.textAlign = 'center';
        ctx.fillText('BUILD', panelX + panelW / 2, panelY - 3);
        ctx.textAlign = 'start';

        ctx.restore();

        // Clear button list
        _hotbar.buttons = [];

        const playerRes = game.playerResources || {};

        for (let i = 0; i < totalBtns; i++) {
            const key = keys[i];
            const bCfg = buildings[key];
            const iconInfo = BUILDING_ICONS[key] || { icon: '🏠', label: key, shortcut: '' };

            const bx = panelX + panelPad + 1;
            const by = panelY + panelPad + i * (btnSize + btnPad);

            const isHovered = _hotbar.hoveredKey === key;
            const isActive = inp && inp.buildMode && inp.buildType === key;
            const canAfford = bCfg.cost ? _canAffordBuilding(playerRes, bCfg.cost) : false;

            // Button background
            ctx.save();
            _drawRoundedRect(ctx, bx, by, btnSize, btnSize, 5);

            if (isActive) {
                // Active build mode — gold highlight
                const grad = ctx.createLinearGradient(bx, by, bx, by + btnSize);
                grad.addColorStop(0, 'rgba(255, 215, 0, 0.5)');
                grad.addColorStop(1, 'rgba(184, 134, 11, 0.4)');
                ctx.fillStyle = grad;
            } else if (isHovered && canAfford) {
                ctx.fillStyle = 'rgba(218, 165, 32, 0.3)';
            } else if (isHovered && !canAfford) {
                ctx.fillStyle = 'rgba(204, 51, 51, 0.25)';
            } else {
                ctx.fillStyle = 'rgba(60, 40, 25, 0.6)';
            }
            ctx.fill();

            // Button border
            _drawRoundedRect(ctx, bx, by, btnSize, btnSize, 5);
            if (isActive) {
                ctx.strokeStyle = '#FFD700';
                ctx.lineWidth = 2;
            } else if (isHovered) {
                ctx.strokeStyle = '#DAA520';
                ctx.lineWidth = 1.5;
            } else {
                ctx.strokeStyle = canAfford ? 'rgba(139, 105, 20, 0.6)' : 'rgba(100, 60, 60, 0.5)';
                ctx.lineWidth = 1;
            }
            ctx.stroke();

            // Icon (emoji)
            ctx.font = '20px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = canAfford ? '#FFFFFF' : '#666666';
            ctx.fillText(iconInfo.icon, bx + btnSize / 2, by + btnSize / 2 - 6);

            // Label
            ctx.font = 'bold 9px "Palatino Linotype", serif';
            ctx.fillStyle = canAfford ? '#D4B896' : '#555';
            ctx.textBaseline = 'bottom';
            ctx.fillText(iconInfo.label, bx + btnSize / 2, by + btnSize - 3);

            // Shortcut key indicator (top-right corner)
            if (iconInfo.shortcut) {
                ctx.font = 'bold 8px monospace';
                ctx.fillStyle = 'rgba(218, 165, 32, 0.6)';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'top';
                ctx.fillText(iconInfo.shortcut, bx + btnSize - 4, by + 3);
            }

            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
            ctx.restore();

            // Register button for click detection
            _hotbar.buttons.push({ key, x: bx, y: by, w: btnSize, h: btnSize });
        }

        // Draw tooltip if hovering
        if (_hotbar.tooltipKey) {
            _renderBuildTooltip(_hotbar.tooltipKey, _hotbar.tooltipX, _hotbar.tooltipY, playerRes);
        }
    }

    function _renderBuildTooltip(key, mx, my, playerRes) {
        const cfg = CFG();
        const bCfg = cfg.BUILDINGS[key];
        if (!bCfg) return;
        const iconInfo = BUILDING_ICONS[key] || { icon: '🏠', label: key };

        ctx.save();

        // Gather tooltip lines
        const title = iconInfo.label;
        const desc = bCfg.description || '';
        const lines = [title];
        if (desc) lines.push(desc);

        // Cost line
        const costParts = [];
        if (bCfg.cost) {
            if (bCfg.cost.gold)  costParts.push(`🪙${bCfg.cost.gold}`);
            if (bCfg.cost.wood)  costParts.push(`🪵${bCfg.cost.wood}`);
            if (bCfg.cost.stone) costParts.push(`🪨${bCfg.cost.stone}`);
        }
        if (costParts.length > 0) lines.push('Cost: ' + costParts.join('  '));

        // Stats
        lines.push(`HP: ${bCfg.hp}  |  Size: ${bCfg.size.w}×${bCfg.size.h}`);
        if (bCfg.trains && bCfg.trains.length > 0) {
            lines.push('Trains: ' + bCfg.trains.map(t => t.replace(/_/g, ' ').toLowerCase()).join(', '));
        }
        if (bCfg.popProvided > 0) lines.push(`+${bCfg.popProvided} Population`);
        if (bCfg.foodPerMin) lines.push(`Produces ${bCfg.foodPerMin} food/min`);
        if (bCfg.gatherBonus) lines.push(`+${Math.round(bCfg.gatherBonus * 100)}% gather speed`);
        if (bCfg.attackDamage) lines.push(`Tower Dmg: ${bCfg.attackDamage}  Range: ${bCfg.attackRange}`);

        // Measure tooltip
        ctx.font = '13px "Palatino Linotype", serif';
        let maxW = 0;
        for (const line of lines) {
            maxW = Math.max(maxW, ctx.measureText(line).width);
        }
        const ttW = maxW + 20;
        const ttH = lines.length * 18 + 14;

        // Position (to the left of the cursor/panel)
        let tx = mx - ttW - 12;
        let ty = my - ttH / 2;
        if (tx < 4) tx = mx + 12;
        if (ty < 4) ty = 4;
        if (ty + ttH > canvas.height - 4) ty = canvas.height - ttH - 4;

        // Background
        ctx.fillStyle = 'rgba(15, 10, 5, 0.94)';
        _drawRoundedRect(ctx, tx, ty, ttW, ttH, 5);
        ctx.fill();

        // Border
        ctx.strokeStyle = '#DAA520';
        ctx.lineWidth = 1.5;
        _drawRoundedRect(ctx, tx, ty, ttW, ttH, 5);
        ctx.stroke();

        // Text
        let textY = ty + 16;
        ctx.textAlign = 'left';

        // Title (gold)
        ctx.font = 'bold 13px "Palatino Linotype", serif';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(lines[0], tx + 10, textY);
        textY += 18;

        // Remaining lines
        ctx.font = '12px "Palatino Linotype", serif';
        for (let i = 1; i < lines.length; i++) {
            // Color cost line differently
            if (lines[i].startsWith('Cost:')) {
                const canAfford = _canAffordBuilding(playerRes, bCfg.cost);
                ctx.fillStyle = canAfford ? '#80CC80' : '#CC5555';
            } else {
                ctx.fillStyle = '#C8B896';
            }
            ctx.fillText(lines[i], tx + 10, textY);
            textY += 17;
        }

        ctx.restore();
    }

    function _canAffordBuilding(res, cost) {
        if (!cost) return true;
        if (cost.gold  && (res.gold  || 0) < cost.gold)  return false;
        if (cost.wood  && (res.wood  || 0) < cost.wood)  return false;
        if (cost.stone && (res.stone || 0) < cost.stone) return false;
        return true;
    }

    function _drawRoundedRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    /**
     * Handle hotbar mouse move — update hover state.
     * Call from input system each frame.
     */
    function hotbarHandleHover(screenX, screenY) {
        _hotbar.hoveredKey = null;
        _hotbar.tooltipKey = null;

        for (const btn of _hotbar.buttons) {
            if (screenX >= btn.x && screenX <= btn.x + btn.w &&
                screenY >= btn.y && screenY <= btn.y + btn.h) {
                _hotbar.hoveredKey = btn.key;
                _hotbar.tooltipKey = btn.key;
                _hotbar.tooltipX = btn.x;
                _hotbar.tooltipY = btn.y + btn.h / 2;
                return true;
            }
        }
        return false;
    }

    /**
     * Handle hotbar click — enter build mode for clicked building.
     * @returns {boolean} true if click was consumed by the hotbar.
     */
    function hotbarHandleClick(screenX, screenY) {
        for (const btn of _hotbar.buttons) {
            if (screenX >= btn.x && screenX <= btn.x + btn.w &&
                screenY >= btn.y && screenY <= btn.y + btn.h) {
                const inp = CatWar.Input;
                if (inp) {
                    // Toggle: if already in build mode for this type, cancel
                    if (inp.buildMode && inp.buildType === btn.key) {
                        inp.cancelBuildMode();
                    } else {
                        inp.enterBuildMode(btn.key);
                    }
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Check if a screen point is over the hotbar panel.
     */
    function isOverHotbar(screenX, screenY) {
        for (const btn of _hotbar.buttons) {
            if (screenX >= btn.x && screenX <= btn.x + btn.w &&
                screenY >= btn.y && screenY <= btn.y + btn.h) {
                return true;
            }
        }
        // Also check if we're within the panel bounds (slightly wider check)
        if (_hotbar.buttons.length > 0) {
            const first = _hotbar.buttons[0];
            const last = _hotbar.buttons[_hotbar.buttons.length - 1];
            const panelX = first.x - 11;
            const panelY = first.y - 10;
            const panelW = first.w + 22;
            const panelH = (last.y + last.h) - first.y + 20;
            if (screenX >= panelX && screenX <= panelX + panelW &&
                screenY >= panelY && screenY <= panelY + panelH) {
                return true;
            }
        }
        return false;
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
        invalidateFog,
        hotbarHandleHover,
        hotbarHandleClick,
        isOverHotbar,
        trainPanelHandleClick,
        isOverTrainPanel,
        minerPanelHandleClick,
        isOverMinerPanel,
        showScoutPopup,
        scoutPopupHandleClick,
        isOverScoutPopup
    };
})();
