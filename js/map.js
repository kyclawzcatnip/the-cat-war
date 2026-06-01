/**
 * The Cat War - Map System
 * ========================
 * Procedural 80×80 tile map generation with value noise,
 * terrain layering, resource nodes with richness, fog of war,
 * and coordinate utilities.
 *
 * Depends on: CatWar.Config
 */
window.CatWar = window.CatWar || {};

CatWar.Map = (function () {
    'use strict';

    const CFG = () => CatWar.Config;

    // ─── Map data ────────────────────────────────────────────────────
    let grid          = null;   // 2D array [row][col] of terrain IDs
    let fogGrids      = {};     // factionId → 2D array [row][col] of FOG values (0/1/2)
    let fogGrid       = null;   // alias for the current player's fog grid (set during updateVisibility)
    let resourceData  = null;   // 2D array [row][col] of { amount, richness } or null
    let decorations   = null;   // sparse array of procedural decorations
    let spawnPositions = [];    // [{tx, ty}] — castle spawn locations (tile coords)

    // RNG seed for deterministic generation
    let _seed = 1;
    function _rand() {
        _seed = (_seed * 16807 + 0) % 2147483647;
        return (_seed - 1) / 2147483646;
    }
    function _seedRng(s) { _seed = s % 2147483647; if (_seed <= 0) _seed += 2147483646; }

    // ═══════════════════════════════════════════════════════════════
    //  Value Noise (simple Perlin-like)
    // ═══════════════════════════════════════════════════════════════

    let _noiseGrid = null;
    let _noiseSize = 0;

    function _initNoise(size) {
        _noiseSize = size;
        _noiseGrid = [];
        for (let y = 0; y <= size; y++) {
            _noiseGrid[y] = [];
            for (let x = 0; x <= size; x++) {
                _noiseGrid[y][x] = _rand();
            }
        }
    }

    /** Smooth cosine interpolation. */
    function _cosInterp(a, b, t) {
        const f = (1 - Math.cos(t * Math.PI)) * 0.5;
        return a * (1 - f) + b * f;
    }

    /** Sample noise at fractional coordinates (0–size). */
    function _noise(x, y) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const fx = x - ix;
        const fy = y - iy;

        const v00 = _noiseGrid[iy    % (_noiseSize + 1)][ix    % (_noiseSize + 1)];
        const v10 = _noiseGrid[iy    % (_noiseSize + 1)][(ix+1)% (_noiseSize + 1)];
        const v01 = _noiseGrid[(iy+1)% (_noiseSize + 1)][ix    % (_noiseSize + 1)];
        const v11 = _noiseGrid[(iy+1)% (_noiseSize + 1)][(ix+1)% (_noiseSize + 1)];

        const top = _cosInterp(v00, v10, fx);
        const bot = _cosInterp(v01, v11, fx);
        return _cosInterp(top, bot, fy);
    }

    /**
     * Multi-octave noise for richer terrain.
     * @param {number} x  Tile X
     * @param {number} y  Tile Y
     * @param {number} freq   Base frequency divisor
     * @param {number} octaves  Number of octaves
     */
    function _fbm(x, y, freq, octaves) {
        let value = 0;
        let amp   = 1;
        let totalAmp = 0;
        let f = freq;
        for (let o = 0; o < octaves; o++) {
            value += _noise(x / f, y / f) * amp;
            totalAmp += amp;
            amp *= 0.5;
            f *= 0.5;
        }
        return value / totalAmp;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Map Generation
    // ═══════════════════════════════════════════════════════════════

    /**
     * Generate a new procedural map.
     * @param {number} [seed]  Optional seed for deterministic maps
     * @param {number} [numFactions]  How many factions to place (2-5)
     */
    function generate(seed, numFactions) {
        const cfg = CFG();
        const W = cfg.MAP_WIDTH;
        const H = cfg.MAP_HEIGHT;

        numFactions = Math.max(2, Math.min(5, numFactions || 4));
        _seedRng(seed || (Date.now() % 100000));
        _initNoise(16);

        // Allocate grids
        grid         = [];
        fogGrids     = {};
        resourceData = [];
        decorations  = [];

        for (let y = 0; y < H; y++) {
            grid[y]         = new Uint8Array(W);
            resourceData[y] = new Array(W).fill(null);
        }

        // Initialize per-faction fog grids (all hidden = 0)
        const factionOrder = cfg.FACTION_ORDER;
        for (let fi = 0; fi < numFactions && fi < factionOrder.length; fi++) {
            const fk = factionOrder[fi];
            fogGrids[fk] = [];
            for (let y = 0; y < H; y++) {
                fogGrids[fk][y] = new Uint8Array(W); // all 0 = HIDDEN
            }
        }
        fogGrid = null; // will be set when updateVisibility is called

        // ── Pass 1: base terrain from noise ──────────────────────
        const GRASS_ID    = cfg.TERRAIN.GRASS.id;
        const WATER_ID    = cfg.TERRAIN.WATER.id;
        const MOUNTAIN_ID = cfg.TERRAIN.MOUNTAIN.id;
        const FOREST_ID   = cfg.TERRAIN.FOREST.id;
        const SAND_ID     = cfg.TERRAIN.SAND.id;

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const elevation = _fbm(x, y, 20, 4);
                const moisture  = _fbm(x + 100, y + 100, 18, 3);

                if (elevation < 0.28) {
                    grid[y][x] = WATER_ID;
                } else if (elevation < 0.32) {
                    grid[y][x] = SAND_ID;
                } else if (elevation > 0.78) {
                    grid[y][x] = MOUNTAIN_ID;
                } else if (moisture > 0.60 && elevation < 0.65) {
                    grid[y][x] = FOREST_ID;
                } else {
                    grid[y][x] = GRASS_ID;
                }
            }
        }

        // ── Pass 2: force mountains toward edges/corners ─────────
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const edgeDistX = Math.min(x, W - 1 - x);
                const edgeDistY = Math.min(y, H - 1 - y);
                const edgeDist  = Math.min(edgeDistX, edgeDistY);

                // Add mountains near edges (but not too close to corners
                // where spawns will be)
                if (edgeDist <= 2 && _rand() > 0.4) {
                    grid[y][x] = MOUNTAIN_ID;
                }
            }
        }

        // ── Spawn positions ──────────────────────────────────────
        spawnPositions = _calculateSpawnPositions(numFactions, W, H);

        // Clear area around each spawn (ensure walkable)
        const CLEAR_RADIUS = 7;
        for (const sp of spawnPositions) {
            for (let dy = -CLEAR_RADIUS; dy <= CLEAR_RADIUS; dy++) {
                for (let dx = -CLEAR_RADIUS; dx <= CLEAR_RADIUS; dx++) {
                    const tx = sp.tx + dx;
                    const ty = sp.ty + dy;
                    if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue;
                    const dist = Math.hypot(dx, dy);
                    if (dist <= CLEAR_RADIUS) {
                        grid[ty][tx] = GRASS_ID;
                    }
                }
            }
        }

        // ── Pass 3: farmland near spawns ─────────────────────────
        const FARMLAND_ID = cfg.TERRAIN.FARMLAND.id;
        for (const sp of spawnPositions) {
            for (let dy = -5; dy <= 5; dy++) {
                for (let dx = -5; dx <= 5; dx++) {
                    const tx = sp.tx + dx;
                    const ty = sp.ty + dy;
                    if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue;
                    const dist = Math.hypot(dx, dy);
                    if (dist >= 4 && dist <= 5.5 && _rand() > 0.5) {
                        grid[ty][tx] = FARMLAND_ID;
                    }
                }
            }
        }

        // ── Pass 4: resource deposits ────────────────────────────
        _placeResourceDeposits(W, H, numFactions);

        // ── Pass 5: roads between spawn positions ────────────────
        _generateRoads(W, H);

        // ── Pass 6: assign resource amounts + richness ───────────
        _assignResourceAmounts(W, H);

        // ── Pass 7: decorations ──────────────────────────────────
        _generateDecorations(W, H);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Spawn positions
    // ═══════════════════════════════════════════════════════════════

    function _calculateSpawnPositions(numFactions, W, H) {
        const margin = 10;  // tiles from edge
        const positions = [
            { tx: margin,     ty: margin },         // top-left
            { tx: W - margin, ty: H - margin },     // bottom-right
            { tx: W - margin, ty: margin },         // top-right
            { tx: margin,     ty: H - margin },     // bottom-left
            { tx: Math.floor(W / 2), ty: Math.floor(H / 2) }  // center
        ];
        return positions.slice(0, numFactions);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Resource deposit placement
    // ═══════════════════════════════════════════════════════════════

    function _placeResourceDeposits(W, H, numFactions) {
        const cfg = CFG();
        const GOLD_ID  = cfg.TERRAIN.GOLD_DEPOSIT.id;
        const STONE_ID = cfg.TERRAIN.STONE_DEPOSIT.id;
        const FOREST_ID = cfg.TERRAIN.FOREST.id;
        const GRASS_ID  = cfg.TERRAIN.GRASS.id;

        // Place gold near each spawn (1 per spawn, close-ish)
        for (const sp of spawnPositions) {
            const angle = _rand() * Math.PI * 2;
            const dist  = 8 + _rand() * 4;
            const cx = Math.round(sp.tx + Math.cos(angle) * dist);
            const cy = Math.round(sp.ty + Math.sin(angle) * dist);
            _placeCluster(cx, cy, GOLD_ID, 2, W, H);
        }

        // Extra gold deposits (2-3 in unclaimed middle areas)
        const extraGold = 2 + Math.floor(_rand() * 2);
        for (let i = 0; i < extraGold; i++) {
            const cx = 15 + Math.floor(_rand() * (W - 30));
            const cy = 15 + Math.floor(_rand() * (H - 30));
            if (_farFromSpawns(cx, cy, 12)) {
                _placeCluster(cx, cy, GOLD_ID, 2, W, H);
            }
        }

        // Stone near each spawn
        for (const sp of spawnPositions) {
            const angle = _rand() * Math.PI * 2 + Math.PI;
            const dist  = 6 + _rand() * 5;
            const cx = Math.round(sp.tx + Math.cos(angle) * dist);
            const cy = Math.round(sp.ty + Math.sin(angle) * dist);
            _placeCluster(cx, cy, STONE_ID, 3, W, H);
        }

        // Extra stone
        const extraStone = 2 + Math.floor(_rand() * 2);
        for (let i = 0; i < extraStone; i++) {
            const cx = 15 + Math.floor(_rand() * (W - 30));
            const cy = 15 + Math.floor(_rand() * (H - 30));
            if (_farFromSpawns(cx, cy, 10)) {
                _placeCluster(cx, cy, STONE_ID, 3, W, H);
            }
        }

        // Dense forest clusters for lumber (mixed with regular forest)
        for (const sp of spawnPositions) {
            const angle = _rand() * Math.PI * 2 + Math.PI / 2;
            const dist  = 5 + _rand() * 4;
            const cx = Math.round(sp.tx + Math.cos(angle) * dist);
            const cy = Math.round(sp.ty + Math.sin(angle) * dist);
            _placeCluster(cx, cy, FOREST_ID, 4, W, H);
        }
    }

    /** Place a small cluster of tiles of the given type. */
    function _placeCluster(cx, cy, tileId, radius, W, H) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const tx = cx + dx;
                const ty = cy + dy;
                if (tx < 1 || tx >= W - 1 || ty < 1 || ty >= H - 1) continue;
                if (Math.hypot(dx, dy) > radius) continue;
                if (_rand() > 0.65) continue;
                // Don't overwrite water or mountains
                const existing = grid[ty][tx];
                const cfg = CFG();
                if (existing === cfg.TERRAIN.WATER.id ||
                    existing === cfg.TERRAIN.MOUNTAIN.id) continue;
                grid[ty][tx] = tileId;
            }
        }
    }

    function _farFromSpawns(tx, ty, minDist) {
        for (const sp of spawnPositions) {
            if (Math.hypot(tx - sp.tx, ty - sp.ty) < minDist) return false;
        }
        return true;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Resource amounts & richness
    // ═══════════════════════════════════════════════════════════════

    function _assignResourceAmounts(W, H) {
        const cfg = CFG();
        const GOLD_ID   = cfg.TERRAIN.GOLD_DEPOSIT.id;
        const STONE_ID  = cfg.TERRAIN.STONE_DEPOSIT.id;
        const FOREST_ID = cfg.TERRAIN.FOREST.id;

        // Richness chance per resource type (from main agent's update):
        // GOLD: 10% chance rich, STONE: 25%, FOREST: 35%
        const RICHNESS_CHANCE = {
            [GOLD_ID]:   0.10,
            [STONE_ID]:  0.25,
            [FOREST_ID]: 0.35
        };

        // Base amounts
        const BASE_AMOUNTS = {
            [GOLD_ID]:   cfg.RESOURCE_NODES.GOLD_DEPOSIT.amount,  // 800
            [STONE_ID]:  cfg.RESOURCE_NODES.STONE_DEPOSIT.amount, // 600
            [FOREST_ID]: cfg.RESOURCE_NODES.FOREST.amount          // 400
        };

        // Rich tile multiplier range
        const RICH_MULTIPLIER_MIN = 1.5;
        const RICH_MULTIPLIER_MAX = 2.0;

        // Track which spawns have a nearby rich deposit
        const spawnHasRich = new Array(spawnPositions.length).fill(false);
        const NEAR_SPAWN_RADIUS = 15; // tiles

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const tileId = grid[y][x];
                if (tileId !== GOLD_ID && tileId !== STONE_ID && tileId !== FOREST_ID) continue;

                const chance = RICHNESS_CHANCE[tileId] || 0;
                const isRich = _rand() < chance;
                const richness = isRich
                    ? RICH_MULTIPLIER_MIN + _rand() * (RICH_MULTIPLIER_MAX - RICH_MULTIPLIER_MIN)
                    : 1.0;

                const baseAmount = BASE_AMOUNTS[tileId] || 400;
                const amount = Math.round(baseAmount * richness);

                resourceData[y][x] = {
                    amount:    amount,
                    maxAmount: amount,
                    richness:  Math.round(richness * 100) / 100, // 2 decimal places
                    resource:  tileId === GOLD_ID ? 'gold' : (tileId === STONE_ID ? 'stone' : 'wood')
                };

                // Track spawn proximity for rich deposits
                if (isRich) {
                    for (let si = 0; si < spawnPositions.length; si++) {
                        const sp = spawnPositions[si];
                        if (Math.hypot(x - sp.tx, y - sp.ty) <= NEAR_SPAWN_RADIUS) {
                            spawnHasRich[si] = true;
                        }
                    }
                }
            }
        }

        // Ensure each spawn area has at least 1 rich deposit nearby
        for (let si = 0; si < spawnPositions.length; si++) {
            if (spawnHasRich[si]) continue;

            const sp = spawnPositions[si];
            // Find the nearest resource tile and make it rich
            let bestDist = Infinity;
            let bestX = -1, bestY = -1;

            for (let dy = -NEAR_SPAWN_RADIUS; dy <= NEAR_SPAWN_RADIUS; dy++) {
                for (let dx = -NEAR_SPAWN_RADIUS; dx <= NEAR_SPAWN_RADIUS; dx++) {
                    const tx = sp.tx + dx;
                    const ty = sp.ty + dy;
                    if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue;
                    if (!resourceData[ty][tx]) continue;
                    const dist = Math.hypot(dx, dy);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestX = tx;
                        bestY = ty;
                    }
                }
            }

            if (bestX >= 0 && bestY >= 0) {
                const rd = resourceData[bestY][bestX];
                const richMult = RICH_MULTIPLIER_MIN + _rand() * (RICH_MULTIPLIER_MAX - RICH_MULTIPLIER_MIN);
                rd.richness  = Math.round(richMult * 100) / 100;
                rd.amount    = Math.round(BASE_AMOUNTS[grid[bestY][bestX]] * richMult);
                rd.maxAmount = rd.amount;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Roads
    // ═══════════════════════════════════════════════════════════════

    function _generateRoads(W, H) {
        const cfg = CFG();
        const ROAD_ID = cfg.TERRAIN.ROAD.id;

        // Connect adjacent spawns with roads
        for (let i = 0; i < spawnPositions.length; i++) {
            for (let j = i + 1; j < spawnPositions.length; j++) {
                const a = spawnPositions[i];
                const b = spawnPositions[j];
                const dist = Math.hypot(a.tx - b.tx, a.ty - b.ty);
                // Only connect nearby pairs (not cross-map)
                if (dist > 55) continue;
                _drawRoad(a.tx, a.ty, b.tx, b.ty, W, H, ROAD_ID);
            }
        }
    }

    /** Draw a wobbly road between two points using midpoint displacement. */
    function _drawRoad(x0, y0, x1, y1, W, H, ROAD_ID) {
        const cfg = CFG();
        const WATER_ID    = cfg.TERRAIN.WATER.id;
        const MOUNTAIN_ID = cfg.TERRAIN.MOUNTAIN.id;

        // Simple Bresenham with wobble
        const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        if (steps === 0) return;

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            let tx = Math.round(x0 + (x1 - x0) * t + (_rand() - 0.5) * 2);
            let ty = Math.round(y0 + (y1 - y0) * t + (_rand() - 0.5) * 2);

            tx = Math.max(0, Math.min(W - 1, tx));
            ty = Math.max(0, Math.min(H - 1, ty));

            // Don't road over water or mountains
            if (grid[ty][tx] !== WATER_ID && grid[ty][tx] !== MOUNTAIN_ID) {
                grid[ty][tx] = ROAD_ID;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Decorations (procedural cosmetic details)
    // ═══════════════════════════════════════════════════════════════

    function _generateDecorations(W, H) {
        const cfg = CFG();
        const GRASS_ID = cfg.TERRAIN.GRASS.id;
        decorations = [];

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                if (grid[y][x] !== GRASS_ID) continue;
                if (_rand() > 0.15) continue; // ~15% of grass tiles get a decoration

                const r = _rand();
                let type;
                if (r < 0.5)      type = 'grass_tuft';
                else if (r < 0.8) type = 'flower';
                else              type = 'small_rock';

                decorations.push({
                    tx: x,
                    ty: y,
                    type: type,
                    offsetX: (_rand() - 0.5) * cfg.TILE_SIZE * 0.6,
                    offsetY: (_rand() - 0.5) * cfg.TILE_SIZE * 0.6,
                    scale:   0.5 + _rand() * 0.5,
                    color:   type === 'flower'
                        ? ['#ff69b4', '#ff6347', '#ffd700', '#ee82ee'][Math.floor(_rand() * 4)]
                        : null
                });
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Query methods
    // ═══════════════════════════════════════════════════════════════

    /** Get the terrain ID at tile coordinates. Returns -1 if out of bounds. */
    function getTile(tx, ty) {
        const cfg = CFG();
        if (tx < 0 || tx >= cfg.MAP_WIDTH || ty < 0 || ty >= cfg.MAP_HEIGHT) return -1;
        return grid[ty][tx];
    }

    /** Set a tile's terrain type. */
    function setTile(tx, ty, terrainId) {
        const cfg = CFG();
        if (tx < 0 || tx >= cfg.MAP_WIDTH || ty < 0 || ty >= cfg.MAP_HEIGHT) return;
        grid[ty][tx] = terrainId;
    }

    /** Check if a tile is walkable. */
    function isWalkable(tx, ty) {
        const cfg = CFG();
        if (tx < 0 || tx >= cfg.MAP_WIDTH || ty < 0 || ty >= cfg.MAP_HEIGHT) return false;
        const tileId  = grid[ty][tx];
        const tKey    = cfg.TERRAIN_BY_ID[tileId];
        const terrain = cfg.TERRAIN[tKey];
        return terrain ? terrain.walkable : false;
    }

    /** Get movement cost for a tile. Returns Infinity for unwalkable. */
    function getMovementCost(tx, ty) {
        const cfg = CFG();
        if (tx < 0 || tx >= cfg.MAP_WIDTH || ty < 0 || ty >= cfg.MAP_HEIGHT) return Infinity;
        const tileId  = grid[ty][tx];
        const tKey    = cfg.TERRAIN_BY_ID[tileId];
        const terrain = cfg.TERRAIN[tKey];
        return terrain ? terrain.moveCost : Infinity;
    }

    /** Convert world pixel coordinates to tile coordinates. */
    function worldToTile(wx, wy) {
        const ts = CFG().TILE_SIZE;
        return {
            tx: Math.floor(wx / ts),
            ty: Math.floor(wy / ts)
        };
    }

    /** Convert tile coordinates to world pixel coordinates (top-left corner). */
    function tileToWorld(tx, ty) {
        const ts = CFG().TILE_SIZE;
        return {
            x: tx * ts,
            y: ty * ts
        };
    }

    /** Get resource data for a tile. Returns null if not a resource tile. */
    function getResourceData(tx, ty) {
        const cfg = CFG();
        if (tx < 0 || tx >= cfg.MAP_WIDTH || ty < 0 || ty >= cfg.MAP_HEIGHT) return null;
        return resourceData[ty][tx];
    }

    /** Get the richness multiplier for a resource tile (1.0 = normal). */
    function getResourceRichness(tx, ty) {
        const rd = getResourceData(tx, ty);
        return rd ? rd.richness : 1.0;
    }

    /**
     * Harvest resources from a tile.
     * @returns {number} Amount actually harvested (may be less if deposit is nearly empty)
     */
    function harvestResource(tx, ty, amount) {
        const rd = getResourceData(tx, ty);
        if (!rd || rd.amount <= 0) return 0;
        const taken = Math.min(amount, rd.amount);
        rd.amount -= taken;

        // If depleted, convert to grass
        if (rd.amount <= 0) {
            rd.amount = 0;
            const cfg = CFG();
            grid[ty][tx] = cfg.TERRAIN.GRASS.id;
        }
        return taken;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Fog of War (per-faction)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Update claimed tiles based on building positions.
     * Buildings permanently reveal tiles within their claim radius.
     * @param {Array} buildings  All buildings in the game
     * @param {string} faction   Faction ID to update for
     */
    function updateClaimedTiles(buildings, faction) {
        const cfg = CFG();
        const W = cfg.MAP_WIDTH;
        const H = cfg.MAP_HEIGHT;
        const fGrid = fogGrids[faction];
        if (!fGrid) return;

        const DEFAULT_CLAIM = 4; // default building claim radius

        for (const b of buildings) {
            if (b.faction !== faction) continue;
            if (b.hp <= 0) continue;
            if (b.constructionProgress !== undefined && b.constructionProgress < 1.0) continue;

            const bCfg = cfg.BUILDINGS[b.buildingType];
            const claimRadius = (bCfg && bCfg.claimRadius) || DEFAULT_CLAIM;

            // Building center in tiles
            const bcx = Math.floor((b.x + b.width / 2) / cfg.TILE_SIZE);
            const bcy = Math.floor((b.y + b.height / 2) / cfg.TILE_SIZE);

            for (let dy = -claimRadius; dy <= claimRadius; dy++) {
                for (let dx = -claimRadius; dx <= claimRadius; dx++) {
                    const tx = bcx + dx;
                    const ty = bcy + dy;
                    if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue;
                    if (dx * dx + dy * dy <= claimRadius * claimRadius) {
                        fGrid[ty][tx] = cfg.FOG.VISIBLE;
                    }
                }
            }
        }
    }

    /**
     * Update fog of war visibility for a specific faction.
     * Call once per frame (or every N frames for performance).
     *
     * Steps:
     *  1. Demote all VISIBLE tiles to EXPLORED (they were visible last frame)
     *  2. Apply claimed tiles from buildings (permanent vision)
     *  3. Apply unit vision (temporary, based on current positions)
     *
     * @param {Array} entities   All units + buildings
     * @param {string} faction   Faction ID to update visibility for
     */
    function updateVisibility(entities, faction) {
        const cfg = CFG();
        const W = cfg.MAP_WIDTH;
        const H = cfg.MAP_HEIGHT;
        const fGrid = fogGrids[faction];
        if (!fGrid) return;

        // Step 1: Demote visible → explored
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                if (fGrid[y][x] === cfg.FOG.VISIBLE) {
                    fGrid[y][x] = cfg.FOG.EXPLORED;
                }
            }
        }

        // Step 2: Apply building claimed tiles
        const buildings = entities.filter(e => e.isBuilding);
        updateClaimedTiles(buildings, faction);

        // Step 3: Apply unit vision
        for (const ent of entities) {
            if (ent.faction !== faction) continue;
            if (ent.isBuilding) continue; // buildings handled via claimed tiles
            if (!ent.alive) continue;

            const tile = worldToTile(ent.x, ent.y);
            // Use unit-specific vision range, or unit config vision, or default 6
            const uCfg = cfg.UNITS[ent.type];
            const vision = ent.visionRange || (uCfg && uCfg.visionRange) || 6;

            for (let dy = -vision; dy <= vision; dy++) {
                for (let dx = -vision; dx <= vision; dx++) {
                    const tx = tile.tx + dx;
                    const ty = tile.ty + dy;
                    if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue;
                    if (dx * dx + dy * dy <= vision * vision) {
                        fGrid[ty][tx] = cfg.FOG.VISIBLE;
                    }
                }
            }
        }

    }

    /** Reveal entire map for a faction (debug / cheat). */
    function revealAll(faction) {
        const cfg = CFG();
        const game = window.CatWar && window.CatWar.Game;
        const pf = game ? game.playerFaction : 'LION';
        const fGrid = faction ? fogGrids[faction] : (fogGrids[pf] || fogGrids['LION']);
        if (!fGrid) return;
        for (let y = 0; y < cfg.MAP_HEIGHT; y++) {
            for (let x = 0; x < cfg.MAP_WIDTH; x++) {
                fGrid[y][x] = cfg.FOG.VISIBLE;
            }
        }
    }

    /** Get fog state for a tile (uses the current player's fog grid). */
    function getFog(tx, ty) {
        const cfg = CFG();
        if (tx < 0 || tx >= cfg.MAP_WIDTH || ty < 0 || ty >= cfg.MAP_HEIGHT) return cfg.FOG.HIDDEN;
        const game = window.CatWar && window.CatWar.Game;
        const pf = game ? game.playerFaction : 'LION';
        const fGrid = fogGrids[pf] || fogGrids['LION'];
        if (!fGrid) return cfg.FOG.HIDDEN;
        return fGrid[ty][tx];
    }

    /** Get fog state for a specific faction. */
    function getFogForFaction(tx, ty, faction) {
        const cfg = CFG();
        if (tx < 0 || tx >= cfg.MAP_WIDTH || ty < 0 || ty >= cfg.MAP_HEIGHT) return cfg.FOG.HIDDEN;
        const fGrid = fogGrids[faction];
        if (!fGrid) return cfg.FOG.HIDDEN;
        return fGrid[ty][tx];
    }

    /** Check if a tile is currently visible to a faction. */
    function isTileVisible(tx, ty, faction) {
        const cfg = CFG();
        return getFogForFaction(tx, ty, faction) === cfg.FOG.VISIBLE;
    }

    /** Check if a tile has ever been explored by a faction. */
    function isTileExplored(tx, ty, faction) {
        const fogVal = getFogForFaction(tx, ty, faction);
        const cfg = CFG();
        return fogVal === cfg.FOG.EXPLORED || fogVal === cfg.FOG.VISIBLE;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Public API
    // ═══════════════════════════════════════════════════════════════

    return {
        // Generation
        generate,

        // Data access (direct references for renderers)
        get grid()           { return grid; },
        get fogGrid()        {
            const game = window.CatWar && window.CatWar.Game;
            const pf = game ? game.playerFaction : 'LION';
            return fogGrids[pf] || fogGrids['LION'] || null;
        },
        get fogGrids()       { return fogGrids; },
        get resourceData()   { return resourceData; },
        get decorations()    { return decorations; },
        get spawnPositions() { return spawnPositions; },

        // Tile queries
        getTile,
        setTile,
        isWalkable,
        getMovementCost,

        // Coordinate conversion
        worldToTile,
        tileToWorld,

        // Resources
        getResourceData,
        getResourceRichness,
        harvestResource,

        // Fog of war
        updateClaimedTiles,
        updateVisibility,
        revealAll,
        getFog,
        getFogForFaction,
        isTileVisible,
        isTileExplored
    };
})();

