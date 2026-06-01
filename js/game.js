/**
 * The Cat War - Game Loop & State Machine
 * ========================================
 * Core game orchestration: fixed-timestep update loop at 60 UPS,
 * entity management, state machine, and game initialisation.
 *
 * Depends on: CatWar.Config, CatWar.Map, CatWar.Camera, CatWar.Input,
 *             CatWar.Pathfinding, CatWar.Renderer
 */
window.CatWar = window.CatWar || {};

CatWar.Game = (function () {
    'use strict';

    const CFG = () => CatWar.Config;

    // ─── Game states ─────────────────────────────────────────────
    const STATES = {
        MENU:           'MENU',
        FACTION_SELECT: 'FACTION_SELECT',
        LOADING:        'LOADING',
        PLAYING:        'PLAYING',
        PAUSED:         'PAUSED',
        VICTORY:        'VICTORY',
        DEFEAT:         'DEFEAT'
    };

    // ─── Core state ──────────────────────────────────────────────
    let state           = STATES.MENU;
    let playerFaction   = 'LION';
    let activeFactions  = [];

    // Entity arrays
    let units       = [];
    let buildings   = [];
    let projectiles = [];
    let particles   = [];

    // Player economy
    let playerResources = null;
    let population      = 0;
    let populationCap   = 0;

    // Per-faction resources (for AI factions too)
    let factionResources = {};

    // ─── Timing / Loop ───────────────────────────────────────────
    let canvas          = null;
    let rafId           = null;
    let lastTime        = 0;
    let accumulator     = 0;

    // FPS tracking
    let fps             = 0;
    let frameCount      = 0;
    let fpsTimer        = 0;

    // ─── Unique ID generator ────────────────────────────────────
    let _nextId = 1;
    function _uid() { return _nextId++; }

    // ═══════════════════════════════════════════════════════════════
    //  Public start / init
    // ═══════════════════════════════════════════════════════════════

    /**
     * Boot the game engine.
     * @param {HTMLCanvasElement} canvasEl  The game canvas
     */
    function boot(canvasEl) {
        canvas = canvasEl;

        // Auto-size canvas to window
        _resizeCanvas();
        window.addEventListener('resize', _resizeCanvas);

        // Initialise subsystems
        CatWar.Camera.init(canvas.width, canvas.height);
        CatWar.Input.init(canvas);
        CatWar.Renderer.init(canvas);

        state = STATES.MENU;

        // For now, auto-start a game (later: menu UI)
        startGame('LION', 4);
    }

    function _resizeCanvas() {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        CatWar.Camera.resize(canvas.width, canvas.height);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Game start / setup
    // ═══════════════════════════════════════════════════════════════

    /**
     * Start a new game.
     * @param {string} chosenFaction   Faction key the player controls
     * @param {number} numFactions     Total factions (2-5)
     * @param {number} [mapSeed]       Optional map seed
     */
    function startGame(chosenFaction, numFactions, mapSeed) {
        const cfg = CFG();

        state = STATES.LOADING;
        playerFaction  = chosenFaction;
        numFactions    = Math.max(2, Math.min(5, numFactions || 4));

        // Reset entity lists
        units       = [];
        buildings   = [];
        projectiles = [];
        particles   = [];
        _nextId     = 1;

        // Generate map
        CatWar.Map.generate(mapSeed, numFactions);

        // Pick active factions
        activeFactions = cfg.FACTION_ORDER.slice(0, numFactions);
        // Ensure player's faction is first
        const pi = activeFactions.indexOf(playerFaction);
        if (pi > 0) {
            [activeFactions[0], activeFactions[pi]] = [activeFactions[pi], activeFactions[0]];
        }

        // Initialise resources for each faction
        factionResources = {};
        for (const fk of activeFactions) {
            factionResources[fk] = {
                gold:  cfg.STARTING_RESOURCES.gold,
                wood:  cfg.STARTING_RESOURCES.wood,
                stone: cfg.STARTING_RESOURCES.stone,
                food:  cfg.STARTING_RESOURCES.food
            };
        }
        playerResources = factionResources[playerFaction];

        // Spawn starting units & buildings for each faction
        const spawns = CatWar.Map.spawnPositions;
        for (let i = 0; i < activeFactions.length && i < spawns.length; i++) {
            const fk   = activeFactions[i];
            const sp   = spawns[i];
            const ts   = cfg.TILE_SIZE;

            // Castle Keep (3×3 centered on spawn)
            const castle = _createBuilding('CASTLE_KEEP', fk,
                                            (sp.tx - 1) * ts,
                                            (sp.ty - 1) * ts);
            castle.constructionProgress = 1.0; // already built

            // 2 Head Miners near the castle
            const startMiners = [];
            for (let m = 0; m < 2; m++) {
                const miner = _createUnit('HEAD_MINER', fk,
                            sp.tx * ts + (m * 20 - 10),
                            (sp.ty + 2) * ts + m * 10);
                if (miner) startMiners.push(miner);
            }

            // Siamese bonus: 1 free Scout with +20% speed
            if (fk === 'SIAMESE') {
                const scout = _createUnit('SCOUT', fk,
                                          sp.tx * ts + 30,
                                          (sp.ty + 2) * ts + 20);
                if (scout) {
                    scout.speed = scout.speed * 1.2; // 3.5 * 1.2 = 4.2
                }
            }

            // Auto-assign miners to nearest resource nodes (strictly within 12 tiles of spawn)
            const map = CatWar.Map;
            if (map && startMiners.length > 0) {
                const usedTiles = new Set();
                for (const miner of startMiners) {
                    let bestDist = Infinity;
                    let bestTX = -1, bestTY = -1;
                    // Search nearby tiles for resources
                    for (let dy = -12; dy <= 12; dy++) {
                        for (let dx = -12; dx <= 12; dx++) {
                            if (Math.hypot(dx, dy) > 12) continue;
                            const rx = sp.tx + dx;
                            const ry = sp.ty + dy;
                            const tileKey = rx + ',' + ry;
                            if (usedTiles.has(tileKey)) continue;
                            const rd = map.getResourceData(rx, ry);
                            if (rd && rd.amount > 0) {
                                const dist = Math.hypot(dx, dy);
                                if (dist < bestDist) {
                                    bestDist = dist;
                                    bestTX = rx;
                                    bestTY = ry;
                                }
                            }
                        }
                    }
                    if (bestTX >= 0) {
                        usedTiles.add(bestTX + ',' + bestTY);
                        miner.gatherTarget = {
                            isResource: true,
                            tx: bestTX,
                            ty: bestTY,
                            resource: map.getResourceData(bestTX, bestTY).resource,
                            amount: map.getResourceData(bestTX, bestTY).amount
                        };
                        miner.state = 'GATHERING';
                    }
                }
            }
        }

        // Update population counts
        _recalcPopulation();

        // Center camera on player's castle
        const playerSpawn = spawns[0];
        if (playerSpawn) {
            CatWar.Camera.jumpTo(
                playerSpawn.tx * cfg.TILE_SIZE,
                playerSpawn.ty * cfg.TILE_SIZE
            );
        }

        // Reveal starting fog of war for all factions
        const allEntities = [...units, ...buildings];
        for (const fk of activeFactions) {
            CatWar.Map.updateVisibility(allEntities, fk);
        }
        CatWar.Renderer.invalidateFog();

        // Start loop
        state = STATES.PLAYING;
        lastTime    = performance.now();
        accumulator = 0;
        frameCount  = 0;
        fpsTimer    = 0;

        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(_loop);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Main loop (fixed timestep)
    // ═══════════════════════════════════════════════════════════════

    function _loop(timestamp) {
        rafId = requestAnimationFrame(_loop);

        const cfg     = CFG();
        const dt      = timestamp - lastTime;
        lastTime      = timestamp;
        accumulator  += dt;

        // FPS counter
        frameCount++;
        fpsTimer += dt;
        if (fpsTimer >= 1000) {
            fps = frameCount;
            frameCount = 0;
            fpsTimer -= 1000;
        }

        // Cap accumulator to prevent spiral of death
        if (accumulator > 200) accumulator = 200;

        // Fixed-timestep updates
        while (accumulator >= cfg.FRAME_DURATION) {
            accumulator -= cfg.FRAME_DURATION;

            if (state === STATES.PLAYING) {
                _update(cfg.FRAME_DURATION / 1000);  // delta in seconds
            }
        }

        // Render (once per frame regardless)
        _render();
    }

    // ═══════════════════════════════════════════════════════════════
    //  Update tick  (called at fixed 60 UPS)
    // ═══════════════════════════════════════════════════════════════

    function _update(dt) {
        const cfg = CFG();

        // 1. Input
        CatWar.Input.update();
        CatWar.Camera.update(CatWar.Input);

        // 2. Process player commands from input
        const commands = CatWar.Input.drainCommands();
        for (const cmd of commands) {
            _processCommand(cmd, dt);
        }

        // 3. Pathfinding throttle reset
        CatWar.Pathfinding.resetFrameCounter();

        // 4. Update units
        _updateUnits(dt);

        // 5. Update buildings (training queues, etc.)
        _updateBuildings(dt);

        // 6. Update projectiles
        _updateProjectiles(dt);

        // 7. Update particles
        _updateParticles(dt);

        // 8. Simple AI for non-player factions (every ~2 seconds)
        if (frameCount % 120 === 0) {
            _updateSimpleAI();
        }

        // 9. Update fog of war (every ~10 frames to save perf)
        if (frameCount % 10 === 0) {
            const allEntities = [...units, ...buildings];
            // Update fog for ALL factions (AI needs its own fog for decision-making)
            for (const fk of activeFactions) {
                CatWar.Map.updateVisibility(allEntities, fk);
            }
            CatWar.Renderer.invalidateFog();
        }

        // 10. Recalculate population
        _recalcPopulation();

        // 11. Check win/lose conditions
        _checkGameOver();
    }

    // ═══════════════════════════════════════════════════════════════
    //  Command processing
    // ═══════════════════════════════════════════════════════════════

    function _processCommand(cmd, dt) {
        const cfg = CFG();

        switch (cmd.type) {
            case 'MOVE': {
                const map = CatWar.Map;
                if (!map) break;
                console.log('[GAME] MOVE command:', cmd.units.length, 'units to', cmd.x, cmd.y);
                if (cmd.units.length === 1) {
                    const u = cmd.units[0];
                    const tile = map.worldToTile(cmd.x, cmd.y);
                    const uTile = map.worldToTile(u.x, u.y);
                    console.log('[GAME] Unit at tile', uTile.tx, uTile.ty, '→ target tile', tile.tx, tile.ty);
                    const path = CatWar.Pathfinding.findPath(
                        uTile.tx, uTile.ty, tile.tx, tile.ty,
                        { ignoreThrottle: true, factionId: u.faction }
                    );
                    console.log('[GAME] Path result:', path ? path.length + ' waypoints' : 'NULL');
                    u.path      = path;
                    u.pathIndex = 0;
                    u.state     = 'MOVING';
                    u.target    = null;
                    u.gatherTarget = null;
                } else if (cmd.units.length > 1) {
                    const paths = CatWar.Pathfinding.findGroupPaths(cmd.units, cmd.x, cmd.y);
                    for (const [unit, path] of paths) {
                        unit.path      = path;
                        unit.pathIndex = 0;
                        unit.state     = 'MOVING';
                        unit.target    = null;
                        unit.gatherTarget = null;
                    }
                }
                break;
            }

            case 'ATTACK': {
                for (const u of cmd.units) {
                    u.target = cmd.target;
                    u.state  = 'ATTACKING';
                }
                break;
            }

            case 'ATTACK_MOVE': {
                const map = CatWar.Map;
                if (!map) break;
                for (const u of cmd.units) {
                    const tile  = map.worldToTile(cmd.x, cmd.y);
                    const uTile = map.worldToTile(u.x, u.y);
                    const path  = CatWar.Pathfinding.findPath(
                        uTile.tx, uTile.ty, tile.tx, tile.ty,
                        { ignoreThrottle: true, factionId: u.faction }
                    );
                    u.path      = path;
                    u.pathIndex = 0;
                    u.state     = 'ATTACK_MOVING';
                    u.target    = null;
                }
                break;
            }

            case 'STOP': {
                for (const u of cmd.units) {
                    u.path   = null;
                    u.target = null;
                    u.state  = 'IDLE';
                }
                break;
            }

            case 'HOLD': {
                for (const u of cmd.units) {
                    u.path   = null;
                    u.target = null;
                    u.state  = 'HOLDING';
                }
                break;
            }

            case 'GATHER': {
                for (const u of cmd.units) {
                    if (u.type !== 'PEASANT' && u.type !== 'HEAD_MINER') continue;
                    u.gatherTarget = cmd.target;
                    u.state = 'GATHERING';
                    u.path  = null;
                    u.target = null;
                }
                break;
            }

            case 'SET_RALLY': {
                cmd.building.rallyX = cmd.x;
                cmd.building.rallyY = cmd.y;
                break;
            }

            case 'PLACE_BUILDING': {
                const bCfg = cfg.BUILDINGS[cmd.building];
                if (!bCfg || !bCfg.cost) break;

                // Check resources
                const res = factionResources[playerFaction];
                if (!_canAfford(res, bCfg.cost)) break;

                // Deduct cost
                _deductCost(res, bCfg.cost);

                const ts = cfg.TILE_SIZE;
                const b = _createBuilding(cmd.building, playerFaction,
                                           cmd.tileX * ts, cmd.tileY * ts);
                b.constructionProgress = 0;
                b.constructionTime     = bCfg.buildTime;
                break;
            }

            case 'DELETE_UNITS': {
                for (const u of cmd.units) {
                    if (u.faction === playerFaction) {
                        u.hp = 0;
                        u.alive = false;
                    }
                }
                break;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Entity updates
    // ═══════════════════════════════════════════════════════════════

    function _updateUnits(dt) {
        const cfg = CFG();
        const ts  = cfg.TILE_SIZE;
        const map = CatWar.Map;

        for (let i = units.length - 1; i >= 0; i--) {
            const u = units[i];

            // Remove dead units
            if (!u.alive || u.hp <= 0) {
                // Death particles
                for (let p = 0; p < 5; p++) {
                    addParticle({
                        x: u.x + (Math.random() - 0.5) * 10,
                        y: u.y + (Math.random() - 0.5) * 10,
                        vx: (Math.random() - 0.5) * 30,
                        vy: -Math.random() * 40,
                        type: 'dust',
                        size: 2 + Math.random() * 2,
                        life: 0.5 + Math.random() * 0.5,
                        alpha: 1
                    });
                }
                units.splice(i, 1);
                continue;
            }

            // Attack cooldown
            if (u.attackCooldown > 0) u.attackCooldown -= dt;

            // Farmer Cat behavior override
            if (u.type === 'FARMER') {
                _updateFarmerCat(u, dt);
                continue;
            }

            // State machine
            switch (u.state) {
                case 'IDLE':
                    // Auto-aggro nearby enemies
                    _autoAggro(u);
                    break;

                case 'MOVING':
                    _moveAlongPath(u, dt);
                    break;

                case 'ATTACK_MOVING':
                    // Move but scan for enemies
                    _autoAggro(u);
                    if (u.state === 'ATTACK_MOVING') {
                        _moveAlongPath(u, dt);
                    }
                    break;

                case 'ATTACKING':
                    _handleAttack(u, dt);
                    break;

                case 'GATHERING':
                    _handleGathering(u, dt);
                    break;

                case 'HOLDING':
                    _autoAggro(u);
                    break;

                case 'RETURNING':
                    // Returning gathered resources to nearest building
                    _handleReturn(u, dt);
                    break;
            }
        }
    }

    function _moveAlongPath(u, dt) {
        const cfg = CFG();
        const ts  = cfg.TILE_SIZE;
        if (!u.path || u.pathIndex >= u.path.length) {
            if (u.state === 'MOVING' || u.state === 'ATTACK_MOVING') {
                u.state = 'IDLE';
            }
            u.path  = null;
            return;
        }

        const target = u.path[u.pathIndex];
        const targetWX = (target.x + 0.5) * ts;
        const targetWY = (target.y + 0.5) * ts;
        const dx = targetWX - u.x;
        const dy = targetWY - u.y;
        const dist = Math.hypot(dx, dy);

        const speed = u.speed * ts * dt;  // pixels per tick

        if (dist <= speed) {
            u.x = targetWX;
            u.y = targetWY;
            u.pathIndex++;

            // Dust particle
            if (Math.random() < 0.3) {
                addParticle({
                    x: u.x, y: u.y + 6,
                    vx: (Math.random() - 0.5) * 10,
                    vy: -Math.random() * 8,
                    type: 'dust',
                    size: 1.5,
                    life: 0.3,
                    alpha: 0.5
                });
            }
        } else {
            u.x += (dx / dist) * speed;
            u.y += (dy / dist) * speed;
            // Face direction
            u.facingAngle = Math.atan2(dy, dx);
        }
    }

    function _autoAggro(u) {
        const cfg = CFG();
        const range = cfg.COMBAT.AGGRO_RANGE * cfg.TILE_SIZE;

        for (const enemy of units) {
            if (enemy.faction === u.faction) continue;
            if (!enemy.alive) continue;
            const dist = Math.hypot(enemy.x - u.x, enemy.y - u.y);
            if (dist <= range) {
                u.target = enemy;
                u.state  = 'ATTACKING';
                return;
            }
        }
    }

    function _handleAttack(u, dt) {
        const cfg = CFG();
        const ts  = cfg.TILE_SIZE;

        // Validate target
        if (!u.target || !u.target.alive || (u.target.hp !== undefined && u.target.hp <= 0)) {
            u.target = null;
            u.state  = 'IDLE';
            return;
        }

        const targetX = u.target.x !== undefined ? u.target.x : u.target.x;
        const targetY = u.target.y !== undefined ? u.target.y : u.target.y;
        const dist    = Math.hypot(targetX - u.x, targetY - u.y);
        const attackRange = (u.range || 1) * ts;

        if (dist <= attackRange + ts * 0.5) {
            // In range — attack if cooldown ready
            if (u.attackCooldown <= 0) {
                _performAttack(u, u.target);
                u.attackCooldown = cfg.COMBAT.ATTACK_COOLDOWN_BASE;
            }
        } else {
            // Chase target (leash check)
            const leash = cfg.COMBAT.CHASE_LEASH_RANGE * ts;
            if (dist > leash) {
                u.target = null;
                u.state  = 'IDLE';
                return;
            }

            // Move toward target
            const speed = u.speed * ts * dt;
            const dx = targetX - u.x;
            const dy = targetY - u.y;
            u.x += (dx / dist) * speed;
            u.y += (dy / dist) * speed;
            u.facingAngle = Math.atan2(dy, dx);
        }
    }

    function _performAttack(attacker, target) {
        const cfg    = CFG();
        const uStats = cfg.UNITS[attacker.type];
        if (!uStats) return;

        let damage = uStats.damage;

        // Bonus vs cavalry
        if (uStats.bonusVsCavalry && target.isMounted) {
            damage = Math.round(damage * uStats.bonusVsCavalry);
        }

        // Minimum damage
        damage = Math.max(cfg.COMBAT.MIN_DAMAGE, damage);

        // Ranged → spawn projectile
        if (uStats.range > 0) {
            addProjectile({
                x:      attacker.x,
                y:      attacker.y,
                target: target,
                damage: damage,
                speed:  cfg.COMBAT.PROJECTILE_SPEED * cfg.TILE_SIZE,
                type:   attacker.type === 'CATAPULT' ? 'boulder' :
                        (attacker.type === 'CROSSBOW' ? 'bolt' : 'arrow'),
                angle:  Math.atan2(target.y - attacker.y, target.x - attacker.x),
                aoeRadius: uStats.aoeRadius ? uStats.aoeRadius * cfg.TILE_SIZE : 0,
                faction: attacker.faction
            });
        } else {
            // Melee — direct damage
            _applyDamage(target, damage);
        }
    }

    function _applyDamage(target, damage) {
        target.hp -= damage;

        // Damage number particle
        addParticle({
            x:     target.x + (Math.random() - 0.5) * 8,
            y:     target.y - 12,
            vx:    (Math.random() - 0.5) * 10,
            vy:    -20,
            type:  'damage',
            text:  '-' + damage,
            life:  0.8,
            alpha: 1,
            size:  2
        });

        if (target.hp <= 0) {
            target.hp    = 0;
            target.alive = false;
        }
    }

    function _handleGathering(u, dt) {
        if (!u.gatherTarget) {
            u.state = 'IDLE';
            return;
        }

        const cfg = CFG();
        const ts  = cfg.TILE_SIZE;
        const map = CatWar.Map;
        if (!map) return;

        // Move to resource using pathfinding
        const tx = u.gatherTarget.tx !== undefined ? u.gatherTarget.tx : 0;
        const ty = u.gatherTarget.ty !== undefined ? u.gatherTarget.ty : 0;
        const targetWX = (tx + 0.5) * ts;
        const targetWY = (ty + 0.5) * ts;
        const dist = Math.hypot(targetWX - u.x, targetWY - u.y);

        if (dist > ts * 1.5) {
            // Use pathfinding if we don't have a path yet
            if (!u.path || u.path.length === 0) {
                const uTile = map.worldToTile(u.x, u.y);
                const path = CatWar.Pathfinding.findPath(
                    uTile.tx, uTile.ty, tx, ty,
                    { ignoreThrottle: true, factionId: u.faction }
                );
                if (path && path.length > 0) {
                    u.path = path;
                    u.pathIndex = 0;
                } else {
                    // Can't reach resource — give up
                    u.gatherTarget = null;
                    u.state = 'IDLE';
                    return;
                }
            }
            // Follow path
            _moveAlongPath(u, dt);
            // If path finished but still far, re-path
            if (!u.path && dist > ts * 1.5) {
                u.state = 'GATHERING'; // will re-path next frame
            }
        } else {
            // At resource — harvest
            u.path = null; // clear path
            const uStats    = cfg.UNITS[u.type];
            const gatherAmt = (uStats.gatherRate || 1.0) * dt;
            const rd        = map.getResourceData(tx, ty);

            if (rd && rd.amount > 0) {
                const harvested = map.harvestResource(tx, ty, gatherAmt);
                u.carrying      = (u.carrying || 0) + harvested;
                u.carryResource = rd.resource;

                // Spark particle
                if (Math.random() < 0.1) {
                    addParticle({
                        x: u.x + (Math.random() - 0.5) * 6,
                        y: u.y + (Math.random() - 0.5) * 6,
                        vx: (Math.random() - 0.5) * 15,
                        vy: -Math.random() * 15,
                        type: 'spark',
                        life: 0.4,
                        alpha: 1,
                        size: 1.5
                    });
                }

                // When carrying enough, return to drop off
                if (u.carrying >= 10) {
                    u.state = 'RETURNING';
                }
            } else {
                // Resource depleted
                u.gatherTarget = null;
                u.state = 'IDLE';
            }
        }
    }

    function _handleReturn(u, dt) {
        // Find nearest building of same faction to drop off
        const cfg = CFG();
        const ts  = cfg.TILE_SIZE;

        let nearest = null;
        let bestDist = Infinity;
        for (const b of buildings) {
            if (b.faction !== u.faction) continue;
            if (b.constructionProgress !== undefined && b.constructionProgress < 1) continue;
            const dist = Math.hypot((b.x + b.width / 2) - u.x, (b.y + b.height / 2) - u.y);
            if (dist < bestDist) {
                bestDist = dist;
                nearest  = b;
            }
        }

        if (!nearest) {
            u.state = 'IDLE';
            return;
        }

        const targetX = nearest.x + nearest.width / 2;
        const targetY = nearest.y + nearest.height / 2;
        const dist = Math.hypot(targetX - u.x, targetY - u.y);

        if (dist > ts * 2) {
            // Use pathfinding to return
            const map = CatWar.Map;
            if (!map) return;
            if (!u.path || u.path.length === 0) {
                const uTile = map.worldToTile(u.x, u.y);
                const bTile = map.worldToTile(targetX, targetY);
                const path = CatWar.Pathfinding.findPath(
                    uTile.tx, uTile.ty, bTile.tx, bTile.ty,
                    { ignoreThrottle: true, factionId: u.faction }
                );
                if (path && path.length > 0) {
                    u.path = path;
                    u.pathIndex = 0;
                } else {
                    // Direct walk as fallback
                    const speed = u.speed * ts * dt;
                    const dx = targetX - u.x;
                    const dy = targetY - u.y;
                    u.x += (dx / dist) * speed;
                    u.y += (dy / dist) * speed;
                    return;
                }
            }
            _moveAlongPath(u, dt);
        } else {
            // Drop off resources
            u.path = null;
            const res = factionResources[u.faction];
            if (res && u.carryResource) {
                res[u.carryResource] = (res[u.carryResource] || 0) + u.carrying;
            }
            u.carrying     = 0;
            u.carryResource = null;

            // Go back to gathering
            if (u.gatherTarget) {
                u.state = 'GATHERING';
            } else {
                u.state = 'IDLE';
            }
        }
    }

    function _updateFarmerCat(u, dt) {
        const cfg = CFG();
        const ts  = cfg.TILE_SIZE;
        const map = CatWar.Map;
        if (!map) return;

        // If the associated farm is destroyed, find a new friendly farm!
        if (!u.associatedFarm || !u.associatedFarm.alive || u.associatedFarm.hp <= 0) {
            const friendlyFarms = buildings.filter(b => b.alive && b.buildingType === 'FARM' && b.faction === u.faction);
            if (friendlyFarms.length > 0) {
                // Link to the farm that has no farmer, or just a random one
                const freeFarm = friendlyFarms.find(b => !b.farmer || !b.farmer.alive);
                u.associatedFarm = freeFarm || friendlyFarms[0];
                if (u.associatedFarm) u.associatedFarm.farmer = u;
            } else {
                // No farms left — walk back to castle and stand idle
                u.state = 'IDLE';
                _updateFarmerIdle(u, dt);
                return;
            }
        }

        const farm = u.associatedFarm;

        if (u.carrying === undefined) u.carrying = 0;

        if (u.state === 'IDLE') {
            u.state = 'GATHERING';
        }

        if (u.state === 'GATHERING') {
            // Move to farm
            const fx = farm.x + farm.width / 2;
            const fy = farm.y + farm.height / 2;
            const dist = Math.hypot(fx - u.x, fy - u.y);

            if (dist > ts * 2) {
                // Pathfind to farm
                if (!u.path || u.path.length === 0) {
                    const uTile = map.worldToTile(u.x, u.y);
                    const fTile = map.worldToTile(fx, fy);
                    u.path = CatWar.Pathfinding.findPath(
                        uTile.tx, uTile.ty, fTile.tx, fTile.ty,
                        { ignoreThrottle: true, factionId: u.faction }
                    );
                    u.pathIndex = 0;
                    if (!u.path) {
                        // fallback direct walk
                        const speed = u.speed * ts * dt;
                        u.x += ((fx - u.x) / dist) * speed;
                        u.y += ((fy - u.y) / dist) * speed;
                    }
                } else {
                    _moveAlongPath(u, dt);
                }
            } else {
                // At farm — harvest food
                u.path = null;
                const harvestRate = 4 * dt; // harvest up to 4 food per second
                const take = Math.min(harvestRate, farm.accumulatedFood || 0, 10 - u.carrying);

                if (take > 0) {
                    farm.accumulatedFood = (farm.accumulatedFood || 0) - take;
                    u.carrying += take;
                }

                if (u.carrying >= 10 || (u.carrying > 0 && (!farm.accumulatedFood || farm.accumulatedFood < 0.1))) {
                    u.state = 'RETURNING';
                }
            }
        } else if (u.state === 'RETURNING') {
            // Find nearest completed Castle Keep to drop off food
            let castle = null;
            let bestDist = Infinity;
            for (const b of buildings) {
                if (b.faction !== u.faction || b.hp <= 0) continue;
                if (b.buildingType !== 'CASTLE_KEEP') continue;
                const dist = Math.hypot((b.x + b.width / 2) - u.x, (b.y + b.height / 2) - u.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    castle = b;
                }
            }

            if (!castle) {
                // Castle destroyed! Just stand idle
                u.state = 'IDLE';
                return;
            }

            const cx = castle.x + castle.width / 2;
            const cy = castle.y + castle.height / 2;
            const dist = Math.hypot(cx - u.x, cy - u.y);

            if (dist > ts * 2.5) {
                // Pathfind to castle
                if (!u.path || u.path.length === 0) {
                    const uTile = map.worldToTile(u.x, u.y);
                    const cTile = map.worldToTile(cx, cy);
                    u.path = CatWar.Pathfinding.findPath(
                        uTile.tx, uTile.ty, cTile.tx, cTile.ty,
                        { ignoreThrottle: true, factionId: u.faction }
                    );
                    u.pathIndex = 0;
                    if (!u.path) {
                        // fallback direct walk
                        const speed = u.speed * ts * dt;
                        u.x += ((cx - u.x) / dist) * speed;
                        u.y += ((cy - u.y) / dist) * speed;
                    }
                } else {
                    _moveAlongPath(u, dt);
                }
            } else {
                // At Castle Keep — deposit food!
                u.path = null;
                const res = factionResources[u.faction];
                if (res) {
                    res.food = (res.food || 0) + u.carrying;
                }

                // Float text for food dropoff if it's the player faction
                if (u.faction === playerFaction && u.carrying >= 1) {
                    addParticle({
                        x: u.x, y: u.y - 12,
                        vx: 0, vy: -15,
                        life: 0.8,
                        alpha: 1,
                        type: 'text',
                        text: `+${Math.floor(u.carrying)} 🌾`,
                        color: '#9ACD32',
                        size: 13
                    });
                }

                u.carrying = 0;
                u.state = 'GATHERING';
            }
        }
    }

    function _updateFarmerIdle(u, dt) {
        // Walk back to the nearest castle
        const ts = CFG().TILE_SIZE;
        let castle = null;
        let bestDist = Infinity;
        for (const b of buildings) {
            if (b.faction !== u.faction || b.hp <= 0) continue;
            if (b.buildingType === 'CASTLE_KEEP') {
                const dist = Math.hypot((b.x + b.width / 2) - u.x, (b.y + b.height / 2) - u.y);
                if (dist < bestDist) { bestDist = dist; castle = b; }
            }
        }
        if (!castle) return;
        const cx = castle.x + castle.width / 2;
        const cy = castle.y + castle.height + 16;
        const dist = Math.hypot(cx - u.x, cy - u.y);
        if (dist > ts * 1.5) {
            const speed = u.speed * ts * dt;
            u.x += ((cx - u.x) / dist) * speed;
            u.y += ((cy - u.y) / dist) * speed;
        }
    }

    function _updateBuildings(dt) {
        const cfg = CFG();

        for (let i = buildings.length - 1; i >= 0; i--) {
            const b = buildings[i];

            // Remove destroyed buildings
            if (b.hp <= 0) {
                // Explosion particles
                for (let p = 0; p < 10; p++) {
                    addParticle({
                        x: b.x + Math.random() * b.width,
                        y: b.y + Math.random() * b.height,
                        vx: (Math.random() - 0.5) * 50,
                        vy: -Math.random() * 60,
                        type: 'dust',
                        size: 3 + Math.random() * 3,
                        life: 0.8 + Math.random() * 0.5,
                        alpha: 1
                    });
                }
                // Clear building tiles from pathfinding grid
                const map = CatWar.Map;
                const bCfgD = cfg.BUILDINGS[b.buildingType];
                if (map && map.clearBuilding && bCfgD) {
                    const ts = cfg.TILE_SIZE;
                    const tx = Math.floor(b.x / ts);
                    const ty = Math.floor(b.y / ts);
                    map.clearBuilding(tx, ty, bCfgD.size.w, bCfgD.size.h);
                }
                buildings.splice(i, 1);
                continue;
            }

            // Construction progress
            if (b.constructionProgress !== undefined && b.constructionProgress < 1.0) {
                b.constructionProgress += dt / (b.constructionTime || 30);
                if (b.constructionProgress >= 1.0) {
                    b.constructionProgress = 1.0;
                }
                continue; // can't train while building
            }

            // Training queue
            if (b.trainingQueue && b.trainingQueue.length > 0) {
                const unitType = b.trainingQueue[0];
                const uCfg     = cfg.UNITS[unitType];
                if (!uCfg) { b.trainingQueue.shift(); continue; }

                b.trainingProgress = (b.trainingProgress || 0) + dt / uCfg.trainTime;

                if (b.trainingProgress >= 1.0) {
                    // Spawn unit
                    const spawnX = b.rallyX !== undefined ? b.rallyX : b.x + b.width / 2;
                    const spawnY = b.rallyY !== undefined ? b.rallyY : b.y + b.height + 16;
                    const newlyTrained = _createUnit(unitType, b.faction, b.x + b.width / 2, b.y + b.height + 8);

                    // Siamese scout speed bonus (+20%)
                    if (newlyTrained && unitType === 'SCOUT' && b.faction === 'SIAMESE') {
                        newlyTrained.speed *= 1.2;
                    }

                    // If rally point, auto-move
                    if (b.rallyX !== undefined) {
                        const newUnit = units[units.length - 1];
                        const map = CatWar.Map;
                        if (map) {
                            const uTile = map.worldToTile(newUnit.x, newUnit.y);
                            const rTile = map.worldToTile(b.rallyX, b.rallyY);
                            newUnit.path = CatWar.Pathfinding.findPath(
                                uTile.tx, uTile.ty, rTile.tx, rTile.ty,
                                { ignoreThrottle: true, factionId: newUnit.faction }
                            );
                            newUnit.pathIndex = 0;
                            newUnit.state = 'MOVING';
                        }
                    }

                    b.trainingQueue.shift();
                    b.trainingProgress = 0;
                }
            }

            // Auto-train: every 30 seconds, spawn a unit automatically (instantly and for free!)
            const bCfgTrain = cfg.BUILDINGS[b.buildingType];
            if (bCfgTrain && bCfgTrain.trains && bCfgTrain.trains.length > 0 &&
                b.constructionProgress >= 1.0) {

                b.autoTrainTimer = (b.autoTrainTimer || 0) + dt;
                if (b.autoTrainTimer >= 30) {
                    b.autoTrainTimer = 0;

                    // Pick a random trainable unit
                    const trainList = bCfgTrain.trains;
                    const pick = trainList[Math.floor(Math.random() * trainList.length)];
                    const uCfgPick = cfg.UNITS[pick];

                    if (uCfgPick) {
                        const spawnX = b.x + b.width / 2;
                        const spawnY = b.y + b.height + 8;
                        const newlyTrained = _createUnit(pick, b.faction, spawnX, spawnY);

                        // Siamese scout speed bonus (+20%)
                        if (newlyTrained && pick === 'SCOUT' && b.faction === 'SIAMESE') {
                            newlyTrained.speed *= 1.2;
                        }

                        // If rally point, auto-move
                        if (newlyTrained && b.rallyX !== undefined) {
                            const map = CatWar.Map;
                            if (map) {
                                const uTile = map.worldToTile(newlyTrained.x, newlyTrained.y);
                                const rTile = map.worldToTile(b.rallyX, b.rallyY);
                                newlyTrained.path = CatWar.Pathfinding.findPath(
                                    uTile.tx, uTile.ty, rTile.tx, rTile.ty,
                                    { ignoreThrottle: true, factionId: newlyTrained.faction }
                                );
                                newlyTrained.pathIndex = 0;
                                newlyTrained.state = 'MOVING';
                            }
                        }
                    }
                }
            }

            // Farm food production (Farmer Cats carry and deliver the food)
            if (b.buildingType === 'FARM' && b.constructionProgress >= 1.0) {
                b.accumulatedFood = (b.accumulatedFood || 0) + (10 / 60) * dt; // 10 food per minute
                if (b.accumulatedFood > 50) b.accumulatedFood = 50; // cap local storage

                // Spawn a farmer cat if they are dead or missing!
                if (!b.farmer || !b.farmer.alive || b.farmer.hp <= 0) {
                    const spawnX = b.x + b.width / 2;
                    const spawnY = b.y + b.height + 8;
                    const farmer = _createUnit('FARMER', b.faction, spawnX, spawnY);
                    if (farmer) {
                        b.farmer = farmer;
                        farmer.associatedFarm = b;
                    }
                }
            }

            // Watchtower auto-attack
            if (bCfg && bCfg.attackDamage && b.constructionProgress >= 1.0) {
                if (b.attackCooldown > 0) {
                    b.attackCooldown -= dt;
                } else {
                    const range = (bCfg.attackRange || 7) * cfg.TILE_SIZE;
                    const bcx = b.x + b.width / 2;
                    const bcy = b.y + b.height / 2;

                    for (const enemy of units) {
                        if (enemy.faction === b.faction) continue;
                        if (!enemy.alive) continue;
                        const dist = Math.hypot(enemy.x - bcx, enemy.y - bcy);
                        if (dist <= range) {
                            addProjectile({
                                x: bcx, y: bcy,
                                target: enemy,
                                damage: bCfg.attackDamage,
                                speed: cfg.COMBAT.PROJECTILE_SPEED * cfg.TILE_SIZE,
                                type: 'arrow',
                                angle: Math.atan2(enemy.y - bcy, enemy.x - bcx),
                                aoeRadius: 0,
                                faction: b.faction
                            });
                            b.attackCooldown = cfg.COMBAT.ATTACK_COOLDOWN_BASE;

                            // Alert all friendly cats within 15 tiles to attack this intruder!
                            const alertRange = 15 * cfg.TILE_SIZE;
                            for (const friend of units) {
                                if (friend.faction !== b.faction || !friend.alive) continue;
                                if (friend.state !== 'IDLE' && friend.state !== 'MOVING' && friend.state !== 'GATHERING') continue;
                                if (friend.type === 'HEALER') continue;

                                const fDist = Math.hypot(friend.x - bcx, friend.y - bcy);
                                if (fDist <= alertRange) {
                                    friend.target = enemy;
                                    friend.state  = 'ATTACKING';
                                    friend.path   = null;
                                }
                            }
                            break;
                        }
                    }
                }
            }
        }
    }

    function _updateProjectiles(dt) {
        const cfg = CFG();
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];

            if (!p.target || !p.target.alive) {
                // Target died — remove projectile
                projectiles.splice(i, 1);
                continue;
            }

            // Move toward target
            const dx = p.target.x - p.x;
            const dy = p.target.y - p.y;
            const dist = Math.hypot(dx, dy);
            const step = p.speed * dt;

            p.angle = Math.atan2(dy, dx);

            if (dist <= step) {
                // Hit!
                if (p.aoeRadius > 0) {
                    // AOE damage
                    for (const u of units) {
                        if (u.faction === p.faction) continue;
                        if (!u.alive) continue;
                        const d = Math.hypot(u.x - p.target.x, u.y - p.target.y);
                        if (d <= p.aoeRadius) {
                            const falloff = 1 - (d / p.aoeRadius) * 0.5;
                            _applyDamage(u, Math.round(p.damage * falloff));
                        }
                    }
                    // AOE for buildings too
                    for (const b of buildings) {
                        if (b.faction === p.faction) continue;
                        const bcx = b.x + b.width / 2;
                        const bcy = b.y + b.height / 2;
                        const d = Math.hypot(bcx - p.target.x, bcy - p.target.y);
                        if (d <= p.aoeRadius) {
                            _applyDamage(b, Math.round(p.damage * 0.5));
                        }
                    }
                } else {
                    _applyDamage(p.target, p.damage);
                }

                projectiles.splice(i, 1);
            } else {
                p.x += (dx / dist) * step;
                p.y += (dy / dist) * step;
            }
        }
    }

    function _updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }

            p.x += (p.vx || 0) * dt;
            p.y += (p.vy || 0) * dt;
            p.vy = (p.vy || 0) + 30 * dt; // gravity
            p.alpha = Math.max(0, p.life / (p.maxLife || 1));
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Simple AI — lightweight opponent behavior
    // ═══════════════════════════════════════════════════════════════

    function _updateSimpleAI() {
        const cfg = CFG();
        const map = CatWar.Map;
        const ts  = cfg.TILE_SIZE;
        if (!map) return;

        for (const fk of activeFactions) {
            const isPlayer = (fk === playerFaction);

            const factionUnits = units.filter(u => u.alive && u.faction === fk);
            const factionBuildings = buildings.filter(b => b.hp > 0 && b.faction === fk);

            for (const u of factionUnits) {
                if (u.state !== 'IDLE') continue; // only manage idle units

                const isWorker = u.type === 'HEAD_MINER' || u.type === 'PEASANT';

                if (isWorker) {
                    // Auto-gather: find nearest resource within 12 tiles of Castle Keep
                    const castle = factionBuildings.find(b => b.buildingType === 'CASTLE_KEEP');
                    const castleTile = castle ? map.worldToTile(castle.x + castle.width / 2, castle.y + castle.height / 2) : null;
                    const maxDistFromCastle = 12; // strictly 12 tiles!

                    let bestDist = Infinity;
                    let bestTX = -1, bestTY = -1;
                    const uTile = map.worldToTile(u.x, u.y);

                    if (castleTile) {
                        for (let dy = -12; dy <= 12; dy++) {
                            for (let dx = -12; dx <= 12; dx++) {
                                if (Math.hypot(dx, dy) > maxDistFromCastle) continue;
                                const rx = castleTile.tx + dx;
                                const ry = castleTile.ty + dy;
                                if (rx < 0 || ry < 0 || rx >= cfg.MAP_WIDTH || ry >= cfg.MAP_HEIGHT) continue;

                                const rd = map.getResourceData(rx, ry);
                                if (rd && rd.amount > 0) {
                                    const dist = Math.hypot(rx - uTile.tx, ry - uTile.ty);
                                    if (dist < bestDist) {
                                        bestDist = dist;
                                        bestTX = rx;
                                        bestTY = ry;
                                    }
                                }
                            }
                        }
                    }

                    if (bestTX >= 0) {
                        u.gatherTarget = {
                            isResource: true,
                            tx: bestTX,
                            ty: bestTY,
                            resource: map.getResourceData(bestTX, bestTY).resource,
                            amount: map.getResourceData(bestTX, bestTY).amount
                        };
                        u.state = 'GATHERING';
                    }
                } else {
                    if (isPlayer) continue; // skip player military units

                    // Military unit: look for nearby enemies to attack
                    let closestEnemy = null;
                    let closestDist = cfg.COMBAT.AGGRO_RANGE * ts * 3; // wider scan range

                    for (const enemy of units) {
                        if (enemy.faction === fk || !enemy.alive) continue;
                        const dist = Math.hypot(enemy.x - u.x, enemy.y - u.y);
                        if (dist < closestDist) {
                            closestDist = dist;
                            closestEnemy = enemy;
                        }
                    }

                    if (closestEnemy) {
                        u.target = closestEnemy;
                        u.state = 'ATTACKING';
                    } else {
                        // No nearby enemy — patrol toward a random enemy building
                        const enemyBuildings = buildings.filter(
                            b => b.hp > 0 && b.faction !== fk
                        );
                        if (enemyBuildings.length > 0 && Math.random() < 0.70) {
                            const target = enemyBuildings[Math.floor(Math.random() * enemyBuildings.length)];
                            const tileFrom = map.worldToTile(u.x, u.y);
                            const tileTo = map.worldToTile(
                                target.x + target.width / 2,
                                target.y + target.height / 2
                            );
                            const path = CatWar.Pathfinding.findPath(
                                tileFrom.tx, tileFrom.ty,
                                tileTo.tx, tileTo.ty,
                                { ignoreThrottle: true, factionId: u.faction }
                            );
                            if (path) {
                                u.path = path;
                                u.pathIndex = 0;
                                u.state = 'ATTACK_MOVING';
                            }
                        }
                    }
                }
            }

            if (isPlayer) continue; // skip player buildings & training

            // AI building: auto-train units from buildings with training capabilities
            const res = factionResources[fk];
            if (!res) continue;

            for (const b of factionBuildings) {
                if (b.constructionProgress !== undefined && b.constructionProgress < 1.0) continue;
                const bCfg = cfg.BUILDINGS[b.buildingType];
                if (!bCfg || !bCfg.trains || bCfg.trains.length === 0) continue;
                if (!b.trainingQueue) continue;
                if (b.trainingQueue.length > 0) continue; // already training

                // Decide what to train
                const trainOptions = bCfg.trains;
                const unitType = trainOptions[Math.floor(Math.random() * trainOptions.length)];
                const uCfg = cfg.UNITS[unitType];
                if (!uCfg || !uCfg.cost) continue;

                // Check if faction can afford
                if (_canAfford(res, uCfg.cost)) {
                    _deductCost(res, uCfg.cost);
                    b.trainingQueue.push(unitType);
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Render
    // ═══════════════════════════════════════════════════════════════

    function _render() {
        CatWar.Renderer.render({
            units,
            buildings,
            projectiles,
            particles
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  Entity factories
    // ═══════════════════════════════════════════════════════════════

    function _createUnit(type, faction, worldX, worldY) {
        const cfg   = CFG();
        const uStats = cfg.UNITS[type];
        if (!uStats) {
            console.warn('Unknown unit type:', type);
            return null;
        }

        const unit = {
            id:             _uid(),
            isUnit:         true,
            type:           type,
            faction:        faction,
            x:              worldX,
            y:              worldY,
            hp:             uStats.hp,
            maxHp:          uStats.hp,
            damage:         uStats.damage,
            speed:          uStats.speed,
            range:          uStats.range || 0,
            isMounted:      uStats.isMounted || false,
            visionRange:    uStats.visionRange || 6,
            alive:          true,
            selected:       false,

            // Movement
            path:           null,
            pathIndex:      0,
            facingAngle:    0,

            // Combat
            target:         null,
            attackCooldown: 0,

            // Gathering
            gatherTarget:   null,
            carrying:       0,
            carryResource:  null,

            // State machine
            state:          'IDLE',    // IDLE, MOVING, ATTACKING, ATTACK_MOVING, GATHERING, RETURNING, HOLDING

            // Path cache
            pathCache:      null,

            // Population
            popCost:        uStats.popCost || 1
        };

        units.push(unit);
        return unit;
    }

    function _createBuilding(type, faction, worldX, worldY) {
        const cfg   = CFG();
        const bCfg  = cfg.BUILDINGS[type];
        if (!bCfg) {
            console.warn('Unknown building type:', type);
            return null;
        }

        const ts = cfg.TILE_SIZE;
        const tileX = Math.floor(worldX / ts);
        const tileY = Math.floor(worldY / ts);
        const building = {
            id:              _uid(),
            isBuilding:      true,
            buildingType:    type,
            faction:         faction,
            x:               worldX,
            y:               worldY,
            width:           bCfg.size.w * ts,
            height:          bCfg.size.h * ts,
            hp:              bCfg.hp,
            maxHp:           bCfg.hp,
            alive:           true,
            selected:        false,
            visionRange:     bCfg.visionRange || 6,

            // Construction
            constructionProgress: undefined,  // set by caller (1.0 = complete)
            constructionTime:     bCfg.buildTime || 0,

            // Training
            trainingQueue:    bCfg.trains && bCfg.trains.length > 0 ? [] : null,
            trainingProgress: 0,

            // Rally point
            rallyX:          undefined,
            rallyY:          undefined,

            // Tower combat
            attackCooldown:  0,

            // Population
            popProvided:     bCfg.popProvided || 0
        };

        buildings.push(building);

        // Mark tiles as occupied so pathfinding avoids them
        const map = CatWar.Map;
        if (map && map.markBuilding) {
            map.markBuilding(tileX, tileY, bCfg.size.w, bCfg.size.h, faction);
        }

        return building;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Entity queries
    // ═══════════════════════════════════════════════════════════════

    function addUnit(type, faction, x, y) {
        return _createUnit(type, faction, x, y);
    }

    function removeUnit(unit) {
        const idx = units.indexOf(unit);
        if (idx >= 0) units.splice(idx, 1);
    }

    function addBuilding(type, faction, x, y) {
        return _createBuilding(type, faction, x, y);
    }

    function removeBuilding(building) {
        const idx = buildings.indexOf(building);
        if (idx >= 0) buildings.splice(idx, 1);
    }

    function addProjectile(props) {
        props.id = _uid();
        props.maxLife = 5; // safety timeout
        props.life    = props.maxLife;
        projectiles.push(props);
        return props;
    }

    function addParticle(props) {
        props.maxLife = props.life || 1;
        if (props.alpha === undefined) props.alpha = 1;
        particles.push(props);
        return props;
    }

    /**
     * Get the top-most entity at a world point.
     * Units checked first (sorted by Y descending so front units picked first).
     */
    function getEntitiesAtPoint(wx, wy, opts) {
        opts = opts || {};
        const cfg = CFG();
        const ts  = cfg.TILE_SIZE;

        // Check units (top = highest Y first)
        const sortedUnits = units.slice().sort((a, b) => b.y - a.y);
        for (const u of sortedUnits) {
            if (!u.alive) continue;
            if (opts.ignoreFriendlyUnits && u.faction === playerFaction) continue;
            const dx = wx - u.x;
            const dy = wy - u.y;
            if (Math.abs(dx) < 16 && Math.abs(dy) < 16) {
                return u;
            }
        }

        // Check buildings
        for (const b of buildings) {
            if (wx >= b.x && wx <= b.x + b.width &&
                wy >= b.y && wy <= b.y + b.height) {
                return b;
            }
        }

        // Check resource tiles
        const map = CatWar.Map;
        if (map) {
            const tile = map.worldToTile(wx, wy);
            const rd = map.getResourceData(tile.tx, tile.ty);
            if (rd && rd.amount > 0) {
                return {
                    isResource: true,
                    tx: tile.tx,
                    ty: tile.ty,
                    resource: rd.resource,
                    amount: rd.amount
                };
            }
        }

        return null;
    }

    /**
     * Get all entities within a world-space rectangle.
     */
    function getEntitiesInRect(x, y, w, h) {
        const result = [];
        for (const u of units) {
            if (!u.alive) continue;
            if (u.x >= x && u.x <= x + w && u.y >= y && u.y <= y + h) {
                result.push(u);
            }
        }
        for (const b of buildings) {
            if (b.x + b.width >= x && b.x <= x + w &&
                b.y + b.height >= y && b.y <= y + h) {
                result.push(b);
            }
        }
        return result;
    }

    function getUnitsForFaction(factionId) {
        return units.filter(u => u.alive && u.faction === factionId);
    }

    function getBuildingsForFaction(factionId) {
        return buildings.filter(b => b.hp > 0 && b.faction === factionId);
    }

    function getBuildingAtTile(tx, ty) {
        const cfg = CFG();
        const ts  = cfg.TILE_SIZE;
        for (const b of buildings) {
            if (b.hp <= 0) continue;
            const btx = Math.floor(b.x / ts);
            const bty = Math.floor(b.y / ts);
            const btw = Math.round(b.width / ts);
            const bth = Math.round(b.height / ts);
            if (tx >= btx && tx < btx + btw && ty >= bty && ty < bty + bth) {
                return b;
            }
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Economy helpers
    // ═══════════════════════════════════════════════════════════════

    function _canAfford(resources, cost) {
        for (const key in cost) {
            if ((resources[key] || 0) < cost[key]) return false;
        }
        return true;
    }

    function _deductCost(resources, cost) {
        for (const key in cost) {
            resources[key] = (resources[key] || 0) - cost[key];
        }
    }

    function _recalcPopulation() {
        const cfg = CFG();
        // Calculate for player faction
        population = 0;
        for (const u of units) {
            if (u.faction === playerFaction && u.alive) {
                population += u.popCost || 1;
            }
        }

        populationCap = 0;
        for (const b of buildings) {
            if (b.faction === playerFaction && b.hp > 0) {
                populationCap += b.popProvided || 0;
            }
        }
        populationCap = Math.min(cfg.POPULATION_CAP, populationCap);
    }

    /**
     * Queue a unit to train at a building.
     */
    function trainUnit(building, unitType) {
        const cfg = CFG();
        const uCfg = cfg.UNITS[unitType];
        const bCfg = cfg.BUILDINGS[building.buildingType];
        if (!uCfg || !bCfg) return false;

        // Check building can train this type
        if (!bCfg.trains || bCfg.trains.indexOf(unitType) === -1) return false;

        // Check resources
        const res = factionResources[building.faction];
        if (!_canAfford(res, uCfg.cost)) return false;

        // Check population
        if (building.faction === playerFaction) {
            if (population + (uCfg.popCost || 1) > populationCap) return false;
        }

        _deductCost(res, uCfg.cost);
        building.trainingQueue.push(unitType);
        return true;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Game state / pause / win-lose
    // ═══════════════════════════════════════════════════════════════

    function togglePause() {
        if (state === STATES.PLAYING) {
            state = STATES.PAUSED;
        } else if (state === STATES.PAUSED) {
            state = STATES.PLAYING;
        }
    }

    function _checkGameOver() {
        // Player loses if they have no buildings
        const playerBuildings = getBuildingsForFaction(playerFaction);
        if (playerBuildings.length === 0 && state === STATES.PLAYING) {
            state = STATES.DEFEAT;
            return;
        }

        // Player wins if all enemy factions have no buildings
        let allEnemiesDead = true;
        for (const fk of activeFactions) {
            if (fk === playerFaction) continue;
            if (getBuildingsForFaction(fk).length > 0) {
                allEnemiesDead = false;
                break;
            }
        }
        if (allEnemiesDead && state === STATES.PLAYING) {
            state = STATES.VICTORY;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Public API
    // ═══════════════════════════════════════════════════════════════

    return {
        boot,
        startGame,
        togglePause,
        trainUnit,

        // State
        get state()           { return state; },
        get playerFaction()   { return playerFaction; },
        get playerResources() { return playerResources; },
        get population()      { return population; },
        get populationCap()   { return populationCap; },
        get fps()             { return fps; },
        get activeFactions()  { return activeFactions; },

        // Entity management
        addUnit,
        removeUnit,
        addBuilding,
        removeBuilding,
        addProjectile,
        addParticle,

        // Queries
        getEntitiesAtPoint,
        getEntitiesInRect,
        getUnitsForFaction,
        getBuildingsForFaction,
        getBuildingAtTile,

        // Constants
        STATES
    };
})();
