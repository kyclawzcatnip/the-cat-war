/**
 * THE CAT WAR - AI Opponent Controller
 * FSM-based AI with faction-specific behaviors, build orders, army management,
 * and strategic decision-making. Ticks every 2 seconds for performance.
 */
window.CatWar = window.CatWar || {};

(function () {
    'use strict';

    // ── Constants ────────────────────────────────────────────────────────
    const AI_TICK_INTERVAL = 2000;  // ms between AI decisions
    const SCOUT_TICK_BASE = 15000;  // ms base between scout attempts
    const DEFAULT_VISION_RANGE = 192; // pixels — default unit sight range
    const SCOUT_VISION_RANGE = 320;   // pixels — scout unit sight range

    const STATE = {
        EARLY_GAME: 'EARLY_GAME',
        EXPANDING: 'EXPANDING',
        ATTACKING: 'ATTACKING',
        DEFENDING: 'DEFENDING',
        LATE_GAME: 'LATE_GAME'
    };

    const DIFFICULTY_MODIFIERS = {
        easy: {
            gatherMultiplier: 0.7,
            buildSpeedMultiplier: 0.7,
            decisionDelay: 4000,        // Slower decisions
            armyThresholdMultiplier: 1.5,
            retreatThresholdMultiplier: 1.3
        },
        normal: {
            gatherMultiplier: 1.0,
            buildSpeedMultiplier: 1.0,
            decisionDelay: 2000,
            armyThresholdMultiplier: 1.0,
            retreatThresholdMultiplier: 1.0
        },
        hard: {
            gatherMultiplier: 1.3,
            buildSpeedMultiplier: 1.3,
            decisionDelay: 1500,
            armyThresholdMultiplier: 0.7,
            retreatThresholdMultiplier: 0.8
        }
    };

    // Build order templates per faction personality
    const BUILD_ORDERS = {
        aggressive: [
            { type: 'peasant', count: 3 },
            { type: 'scout', count: 1 },            // Train 1 scout early
            { type: 'farm', count: 1 },
            { type: 'lumberMill', count: 1 },
            { type: 'peasant', count: 2 },
            { type: 'barracks', count: 1 },
            { type: 'military', priority: 'melee' },
            { type: 'attack_when_ready' }
        ],
        harasser: [
            { type: 'peasant', count: 3 },
            { type: 'scout', count: 2 },             // Siamese: 2-3 scouts (+ free one)
            { type: 'farm', count: 1 },
            { type: 'lumberMill', count: 1 },
            { type: 'archeryRange', count: 1 },
            { type: 'scout', count: 3 },             // Train a 3rd scout mid-game
            { type: 'peasant', count: 2 },
            { type: 'military', priority: 'ranged' },
            { type: 'harass_when_ready' }
        ],
        defensive: [
            { type: 'peasant', count: 5 },
            { type: 'scout', count: 1 },             // 1 scout for awareness
            { type: 'farm', count: 2 },
            { type: 'lumberMill', count: 1 },
            { type: 'mineShaft', count: 1 },
            { type: 'barracks', count: 1 },
            { type: 'wall', count: 4 },
            { type: 'tower', count: 2 },
            { type: 'siegeWorkshop', count: 1 },
            { type: 'military', priority: 'siege' }
        ],
        sneaky: [
            { type: 'peasant', count: 4 },
            { type: 'scout', count: 2 },             // 2 scouts for intelligence
            { type: 'farm', count: 1 },
            { type: 'lumberMill', count: 1 },
            { type: 'barracks', count: 1 },
            { type: 'archeryRange', count: 1 },
            { type: 'military', priority: 'mixed' },
            { type: 'raid_when_ready' }
        ],
        economic: [
            { type: 'peasant', count: 6 },
            { type: 'scout', count: 1 },             // 1 scout for map control
            { type: 'farm', count: 2 },
            { type: 'lumberMill', count: 1 },
            { type: 'mineShaft', count: 1 },
            { type: 'peasant', count: 4 },
            { type: 'farm', count: 2 },
            { type: 'barracks', count: 2 },
            { type: 'archeryRange', count: 1 },
            { type: 'military', priority: 'mass' }
        ]
    };

    // ── AIController Class ───────────────────────────────────────────────

    class AIController {
        /**
         * @param {string} playerId - Unique player/AI identifier.
         * @param {string} factionId - Faction identifier (e.g., 'lion').
         * @param {string} difficulty - 'easy', 'normal', or 'hard'.
         */
        constructor(playerId, factionId, difficulty = 'normal') {
            this.playerId = playerId;
            this.factionId = factionId;
            this.difficulty = difficulty;
            this.difficultyMod = DIFFICULTY_MODIFIERS[difficulty] || DIFFICULTY_MODIFIERS.normal;

            // Load faction personality
            const Factions = CatWar.Factions;
            this.personality = Factions ? Factions.getFactionPersonality(factionId) : null;
            this.factionInfo = Factions ? Factions.getFactionInfo(factionId) : null;

            // State machine
            this.state = STATE.EARLY_GAME;
            this.previousState = null;

            // Timing
            this.tickTimer = 0;
            this.tickInterval = this.difficultyMod.decisionDelay;
            this.gameTime = 0;
            this.lastScoutTime = 0;
            this.lastAttackTime = 0;
            this.lastHarassTime = 0;

            // Tracking
            this.buildOrderIndex = 0;
            this.buildQueue = [];
            this.trainQueue = [];

            // Known map info (fog of war)
            this.knownEnemyPositions = [];     // {x, y, type, lastSeen}
            this.scoutedAreas = new Set();
            this.threatLevel = 0;              // 0-1 scale

            // Army management
            this.armyGroup = [];               // unit IDs in main army
            this.raidGroup = [];               // unit IDs in raid party
            this.defendGroup = [];             // unit IDs defending base
            this.stagingPoint = null;           // {x, y} rally point
            this.attackTarget = null;           // {x, y, buildingId}

            // Economy tracking
            this.peasantCount = 0;
            this.desiredPeasants = this.personality ? this.personality.economyTarget : 5;
            this.farmCount = 0;
            this.militaryBuildingCount = 0;

            // Scout management
            this.scoutCount = 0;
            this.desiredScouts = this._getDesiredScoutCount();
            this.scoutUnits = [];               // IDs of active scout units
            this.scoutRevealedTargets = [];      // Targets found by scouts

            // Stats for AI evaluation
            this.totalUnitsLost = 0;
            this.totalUnitsKilled = 0;
            this.attacksLaunched = 0;

            // Select build order based on personality
            this._selectBuildOrder();
        }

        /**
         * Get desired scout count based on faction personality.
         * Siamese gets extra scouts.
         * @returns {number}
         */
        _getDesiredScoutCount() {
            if (!this.personality) return 1;
            switch (this.personality.type) {
                case 'harasser':  return 3;   // Siamese: scout-heavy
                case 'sneaky':    return 2;   // Black Cat: intel-focused
                case 'aggressive': return 1;
                case 'defensive': return 1;
                case 'economic':  return 1;
                default:          return 1;
            }
        }

        // ── Main Update Loop ─────────────────────────────────────────────

        /**
         * Main AI update — called every frame but only processes logic on tick interval.
         * @param {number} dt - Delta time in milliseconds.
         * @param {object} gameState - Global game state reference.
         */
        update(dt, gameState) {
            this.gameTime += dt;
            this.tickTimer += dt;

            if (this.tickTimer < this.tickInterval) return;
            this.tickTimer = 0;

            // Refresh known state from game
            this._gatherIntelligence(gameState);

            // Evaluate and potentially change strategic state
            this.evaluateState(gameState);

            // Execute current strategy
            switch (this.state) {
                case STATE.EARLY_GAME:
                    this._executeEarlyGame(gameState);
                    break;
                case STATE.EXPANDING:
                    this._executeExpanding(gameState);
                    break;
                case STATE.ATTACKING:
                    this.executeAttack(gameState);
                    break;
                case STATE.DEFENDING:
                    this.executeDefense(gameState);
                    break;
                case STATE.LATE_GAME:
                    this._executeLateGame(gameState);
                    break;
            }

            // Periodic scouting
            this._tryScout(gameState);
        }

        // ── State Evaluation ─────────────────────────────────────────────

        /**
         * Evaluate current situation and determine strategic state.
         * @param {object} gameState
         */
        evaluateState(gameState) {
            this.previousState = this.state;

            const myUnits = this._getMyUnits(gameState);
            const myBuildings = this._getMyBuildings(gameState);
            // Exclude scouts from army count — they're recon, not fighters
            const armyUnits = myUnits.filter(u => u.type !== 'peasant' && u.type !== 'miner' && u.type !== 'scout');
            const armySize = armyUnits.length;
            const armyThreshold = Math.round(
                (this.personality ? this.personality.armyThreshold : 10) *
                this.difficultyMod.armyThresholdMultiplier
            );

            // Priority 1: Defend if base is under attack
            if (this._isBaseUnderAttack(gameState)) {
                this.state = STATE.DEFENDING;
                return;
            }

            // Priority 2: Attack if army is large enough
            if (armySize >= armyThreshold && this.state !== STATE.ATTACKING) {
                this.state = STATE.ATTACKING;
                return;
            }

            // Check game phase by elapsed time
            const gameMinutes = this.gameTime / 60000;

            // Faction-specific rush timings
            const rushTiming = this.personality ? this.personality.rushTiming : 'mid';
            let earlyGameEnd = 4;   // minutes
            let lateGameStart = 12;

            switch (rushTiming) {
                case 'early':
                    earlyGameEnd = 3;
                    lateGameStart = 8;
                    break;
                case 'mid':
                    earlyGameEnd = 5;
                    lateGameStart = 10;
                    break;
                case 'late':
                    earlyGameEnd = 6;
                    lateGameStart = 14;
                    break;
            }

            if (gameMinutes < earlyGameEnd) {
                // Stay in early game unless already attacking/defending
                if (this.state !== STATE.ATTACKING && this.state !== STATE.DEFENDING) {
                    this.state = STATE.EARLY_GAME;
                }
            } else if (gameMinutes < lateGameStart) {
                if (this.state !== STATE.ATTACKING && this.state !== STATE.DEFENDING) {
                    this.state = STATE.EXPANDING;
                }
            } else {
                if (this.state !== STATE.ATTACKING && this.state !== STATE.DEFENDING) {
                    this.state = STATE.LATE_GAME;
                }
            }

            // If we were defending and the threat is gone, resume previous strategy
            if (this.previousState === STATE.DEFENDING && !this._isBaseUnderAttack(gameState)) {
                this.state = this.gameTime / 60000 > lateGameStart ? STATE.LATE_GAME : STATE.EXPANDING;
            }
        }

        // ── Build & Train Orders ─────────────────────────────────────────

        /**
         * Execute the next step in the build order.
         * @param {object} gameState
         */
        executeBuildOrder(gameState) {
            if (this.buildOrderIndex >= this.buildQueue.length) return;

            const step = this.buildQueue[this.buildOrderIndex];
            const resources = this._getMyResources(gameState);
            const myBuildings = this._getMyBuildings(gameState);

            switch (step.type) {
                case 'peasant': {
                    const peasants = this._getMyUnits(gameState).filter(u => u.type === 'peasant');
                    if (peasants.length >= step.count) {
                        this.buildOrderIndex++;
                        return;
                    }
                    this._trainUnit('peasant', gameState);
                    break;
                }

                case 'scout': {
                    const scouts = this._getMyUnits(gameState).filter(u => u.type === 'scout');
                    if (scouts.length >= step.count) {
                        this.buildOrderIndex++;
                        return;
                    }
                    this._trainUnit('scout', gameState);
                    break;
                }

                case 'farm':
                case 'lumberMill':
                case 'mineShaft':
                case 'barracks':
                case 'archeryRange':
                case 'siegeWorkshop':
                case 'wall':
                case 'tower': {
                    const existing = myBuildings.filter(b => b.type === step.type);
                    if (existing.length >= step.count) {
                        this.buildOrderIndex++;
                        return;
                    }
                    this._buildStructure(step.type, gameState);
                    break;
                }

                case 'military': {
                    // Switch to continuous military production
                    this.buildOrderIndex++;
                    break;
                }

                case 'attack_when_ready':
                case 'harass_when_ready':
                case 'raid_when_ready': {
                    this.buildOrderIndex++;
                    break;
                }

                default:
                    this.buildOrderIndex++;
                    break;
            }
        }

        /**
         * Decide what units to train based on current state and faction preference.
         * @param {object} gameState
         */
        executeTrainOrder(gameState) {
            const myUnits = this._getMyUnits(gameState);
            const peasants = myUnits.filter(u => u.type === 'peasant' || u.type === 'miner');
            const scouts = myUnits.filter(u => u.type === 'scout');
            const army = myUnits.filter(u => u.type !== 'peasant' && u.type !== 'miner' && u.type !== 'scout');

            // Always maintain peasant production until desired count
            if (peasants.length < this.desiredPeasants) {
                this._trainUnit('peasant', gameState);
                return;
            }

            // Maintain scout count — train scouts if below desired
            if (scouts.length < this.desiredScouts) {
                this._trainUnit('scout', gameState);
                return;
            }

            // Train army based on faction personality
            if (!this.personality) {
                this._trainUnit('swordsman', gameState);
                return;
            }

            const preferred = this.personality.preferredUnits;
            if (preferred && preferred.length > 0) {
                // Weighted random selection from preferred units
                const unitType = preferred[Math.floor(Math.random() * preferred.length)];
                this._trainUnit(unitType, gameState);
            }
        }

        // ── Attack Logic ─────────────────────────────────────────────────

        /**
         * Coordinate army attack on a target.
         * @param {object} gameState
         */
        executeAttack(gameState) {
            const army = this._getArmyUnits(gameState);

            if (army.length === 0) {
                // No army left, fall back to building
                this.state = STATE.EXPANDING;
                return;
            }

            // Check average army HP — retreat if too low
            const avgHpRatio = this._getAverageArmyHPRatio(army);
            const retreatThreshold = (this.personality ? this.personality.retreatThreshold : 0.30) *
                this.difficultyMod.retreatThresholdMultiplier;

            if (avgHpRatio < retreatThreshold) {
                this._retreatArmy(gameState);
                this.state = STATE.EXPANDING; // Rebuild
                return;
            }

            // Find or update target
            if (!this.attackTarget || this._isTargetDestroyed(this.attackTarget, gameState)) {
                this.attackTarget = this.findTarget(gameState);
            }

            if (!this.attackTarget) {
                // No targets found (maybe we won?)
                this.state = STATE.EXPANDING;
                return;
            }

            // Check if army is grouped before attacking
            if (!this._isArmyGrouped(army)) {
                this._rallyArmyToStaging(army, gameState);
                return;
            }

            // Command all army units to attack target
            this._commandArmyAttack(army, this.attackTarget, gameState);
            this.lastAttackTime = this.gameTime;
            this.attacksLaunched++;

            // Continue training while attacking
            this.executeTrainOrder(gameState);
        }

        /**
         * Execute faction-specific harassment tactics.
         * @param {object} gameState
         */
        _executeHarass(gameState) {
            const army = this._getArmyUnits(gameState);
            const rangedUnits = army.filter(u => u.damageType === 'ranged');

            if (rangedUnits.length < 3) return;

            // Send ranged units to attack enemy workers
            const enemyWorkers = this._findEnemyWorkers(gameState);
            if (enemyWorkers.length > 0) {
                const target = enemyWorkers[0];
                for (const unit of rangedUnits) {
                    this._commandUnit(unit, 'attack', target, gameState);
                }
                this.lastHarassTime = this.gameTime;
            }
        }

        /**
         * Execute stealth raid (Black Cat style).
         * @param {object} gameState
         */
        _executeRaid(gameState) {
            const army = this._getArmyUnits(gameState);
            if (army.length < 3) return;

            // Send small group to raid enemy economy
            const raidSize = Math.min(5, army.length);
            const raiders = army.slice(0, raidSize);

            const enemyWorkers = this._findEnemyWorkers(gameState);
            const enemyResBuildings = this._findEnemyResourceBuildings(gameState);

            const targets = [...enemyWorkers, ...enemyResBuildings];
            if (targets.length > 0) {
                const target = targets[Math.floor(Math.random() * targets.length)];
                for (const unit of raiders) {
                    this._commandUnit(unit, 'attack', target, gameState);
                }
            }
        }

        // ── Defense Logic ────────────────────────────────────────────────

        /**
         * Defend base from incoming attack.
         * @param {object} gameState
         */
        executeDefense(gameState) {
            const myBuildings = this._getMyBuildings(gameState);
            const castle = myBuildings.find(b => b.type === 'castle' || b.type === 'townCenter');
            if (!castle) return;

            const allUnits = this._getMyUnits(gameState);
            const threats = this._getThreatsNearBase(gameState);

            if (threats.length === 0) {
                // Threat resolved, go back to normal
                this.state = this.previousState !== STATE.DEFENDING ?
                    this.previousState : STATE.EXPANDING;
                return;
            }

            // Rally all combat units to the base
            const combatUnits = allUnits.filter(u => u.type !== 'peasant' && u.type !== 'miner');
            for (const unit of combatUnits) {
                // Attack the nearest threat
                const nearest = this._findNearestEntity(unit, threats);
                if (nearest) {
                    this._commandUnit(unit, 'attack', nearest, gameState);
                }
            }

            // Also pull idle peasants into garrison if possible
            const idlePeasants = allUnits.filter(u =>
                (u.type === 'peasant' || u.type === 'miner') && u.state === 'idle'
            );
            for (const peasant of idlePeasants) {
                this._commandUnit(peasant, 'move', { x: castle.x, y: castle.y }, gameState);
            }

            // Keep training defenders
            this._trainUnit(this.personality ? this.personality.preferredUnits[0] : 'swordsman', gameState);
        }

        // ── Target Selection ─────────────────────────────────────────────

        /**
         * Pick the best attack target.
         * @param {object} gameState
         * @returns {{ x: number, y: number, id: string, type: string }|null}
         */
        findTarget(gameState) {
            const myBuildings = this._getMyBuildings(gameState);
            const castle = myBuildings.find(b => b.type === 'castle' || b.type === 'townCenter');
            const myPos = castle ? { x: castle.x, y: castle.y } : { x: 0, y: 0 };

            // Gather all KNOWN enemy entities (fog-of-war aware)
            const enemyBuildings = this._getVisibleEnemyBuildings(gameState);
            const enemyUnits = this._getVisibleEnemyUnits(gameState);

            // Faction-specific target priority
            const personalityType = this.personality ? this.personality.type : 'aggressive';

            // Incorporate scout intelligence — add recently scouted enemy positions
            // that may not be in direct vision anymore but are remembered
            for (const intel of this.knownEnemyPositions) {
                const isAlreadyVisible = enemyBuildings.some(b => b.id === intel.id) ||
                                         enemyUnits.some(u => u.id === intel.id);
                if (!isAlreadyVisible && this.gameTime - intel.lastSeen < 30000) {
                    // Use stale scout intel as a potential target location
                    if (intel.entityType === 'building') {
                        enemyBuildings.push({ ...intel, isScoutIntel: true });
                    } else if (intel.type !== 'peasant' && intel.type !== 'miner') {
                        enemyUnits.push({ ...intel, isScoutIntel: true });
                    }
                }
            }

            // If AI has NO knowledge of any enemy, it cannot attack — send scouts instead
            if (enemyBuildings.length === 0 && enemyUnits.length === 0) {
                this._urgentScout(gameState);
                return null;
            }

            let targets = [];

            switch (personalityType) {
                case 'sneaky':
                    // Prioritize workers and economy buildings
                    targets = [
                        ...this._findEnemyWorkers(gameState).map(w => ({ ...w, priority: 3 })),
                        ...this._findEnemyResourceBuildings(gameState).map(b => ({ ...b, priority: 2 })),
                        ...enemyBuildings.map(b => ({ ...b, priority: 1 }))
                    ];
                    break;

                case 'harasser':
                    // Prioritize ranged attacks on exposed units
                    targets = [
                        ...enemyUnits.filter(u => u.type === 'peasant').map(u => ({ ...u, priority: 3 })),
                        ...enemyUnits.map(u => ({ ...u, priority: 1 })),
                        ...enemyBuildings.map(b => ({ ...b, priority: 1 }))
                    ];
                    break;

                default:
                    // Standard: attack nearest building or unit cluster
                    targets = [
                        ...enemyBuildings.map(b => {
                            const isCastle = b.type === 'castle' || b.type === 'townCenter';
                            return { ...b, priority: isCastle ? 3 : 1 };
                        }),
                        ...enemyUnits.map(u => ({ ...u, priority: 1 }))
                    ];
                    break;
            }

            if (targets.length === 0) return null;

            // Score targets: higher priority + closer = better
            let bestTarget = null;
            let bestScore = -Infinity;

            for (const t of targets) {
                const dist = this._distance(myPos, t);
                const score = (t.priority * 1000) - dist;
                if (score > bestScore) {
                    bestScore = score;
                    bestTarget = t;
                }
            }

            return bestTarget;
        }

        // ── Phase Executors ──────────────────────────────────────────────

        _executeEarlyGame(gameState) {
            this.executeBuildOrder(gameState);
            this.executeTrainOrder(gameState);

            // Aggressive factions: check if we can rush early
            if (this.personality && this.personality.type === 'aggressive') {
                const army = this._getArmyUnits(gameState);
                if (army.length >= 4 && this.gameTime > 120000) { // 2 min minimum
                    this.state = STATE.ATTACKING;
                }
            }
        }

        _executeExpanding(gameState) {
            this.executeBuildOrder(gameState);
            this.executeTrainOrder(gameState);

            // Build additional economy
            const resources = this._getMyResources(gameState);
            const myBuildings = this._getMyBuildings(gameState);

            // Ensure adequate food production
            const farms = myBuildings.filter(b => b.type === 'farm');
            if (farms.length < Math.ceil(this.desiredPeasants / 3)) {
                this._buildStructure('farm', gameState);
            }

            // Build military buildings if we have enough economy
            if (resources.gold > 200 && resources.wood > 150) {
                const barracks = myBuildings.filter(b => b.type === 'barracks');
                if (barracks.length < 2) {
                    this._buildStructure('barracks', gameState);
                }
            }

            // Faction-specific expanding behavior
            if (this.personality) {
                switch (this.personality.type) {
                    case 'harasser':
                        if (this.gameTime - this.lastHarassTime > 20000) {
                            this._executeHarass(gameState);
                        }
                        break;
                    case 'sneaky':
                        if (this.gameTime - this.lastHarassTime > 25000) {
                            this._executeRaid(gameState);
                        }
                        break;
                    case 'defensive':
                        this._buildDefenses(gameState);
                        break;
                }
            }
        }

        _executeLateGame(gameState) {
            this.executeTrainOrder(gameState);

            // Build advanced structures
            const myBuildings = this._getMyBuildings(gameState);
            const hasSiegeWorkshop = myBuildings.some(b => b.type === 'siegeWorkshop');

            if (!hasSiegeWorkshop) {
                this._buildStructure('siegeWorkshop', gameState);
            }

            // Increase desired peasants for late-game economy
            if (this.personality && this.personality.type === 'economic') {
                this.desiredPeasants = 15;
            }

            // Continuously train army and siege
            const army = this._getArmyUnits(gameState);
            const armyThreshold = Math.round(
                (this.personality ? this.personality.armyThreshold : 10) *
                this.difficultyMod.armyThresholdMultiplier
            );

            if (army.length >= armyThreshold) {
                this.state = STATE.ATTACKING;
            }

            // Train siege units
            if (hasSiegeWorkshop) {
                const catapults = army.filter(u => u.type === 'catapult');
                if (catapults.length < 3) {
                    this._trainUnit('catapult', gameState);
                }
            }
        }

        // ── Intelligence Gathering ───────────────────────────────────────

        _gatherIntelligence(gameState) {
            if (!gameState || !gameState.entities) return;

            // Update peasant and scout counts
            const myUnits = this._getMyUnits(gameState);
            this.peasantCount = myUnits.filter(u =>
                u.type === 'peasant' || u.type === 'miner'
            ).length;
            this.scoutCount = myUnits.filter(u => u.type === 'scout').length;

            // Clean up dead scouts from tracking list
            this.scoutUnits = this.scoutUnits.filter(id =>
                gameState.entities[id] != null
            );

            // Update known enemy positions — only record enemies we can actually SEE
            // (within our units'/buildings' vision range)
            const enemyEntities = Object.values(gameState.entities).filter(
                e => e.playerId && e.playerId !== this.playerId
            );

            // Update/add enemy positions — fog-of-war enforced
            for (const enemy of enemyEntities) {
                // Only record if within our vision range (AI plays fair!)
                if (!this._isEntityVisible(enemy, gameState)) continue;

                const existing = this.knownEnemyPositions.find(
                    k => k.id === enemy.id
                );
                if (existing) {
                    existing.x = enemy.x;
                    existing.y = enemy.y;
                    existing.lastSeen = this.gameTime;
                } else {
                    this.knownEnemyPositions.push({
                        id: enemy.id,
                        x: enemy.x,
                        y: enemy.y,
                        type: enemy.type,
                        lastSeen: this.gameTime
                    });
                }
            }

            // Expire old intel (remove entries not seen for > 60 seconds)
            this.knownEnemyPositions = this.knownEnemyPositions.filter(
                k => this.gameTime - k.lastSeen < 60000
            );

            // Calculate threat level
            this.threatLevel = this._calculateThreatLevel(gameState);
        }

        _calculateThreatLevel(gameState) {
            const myUnits = this._getMyUnits(gameState);
            const threats = this._getThreatsNearBase(gameState);

            if (threats.length === 0) return 0;

            const myArmy = myUnits.filter(u => u.type !== 'peasant' && u.type !== 'miner');
            const ratio = threats.length / Math.max(1, myArmy.length);
            return Math.min(1.0, ratio);
        }

        // ── Scouting ─────────────────────────────────────────────────────

        _tryScout(gameState) {
            const scoutInterval = this.personality ?
                this.personality.scoutFrequency : SCOUT_TICK_BASE;

            if (this.gameTime - this.lastScoutTime < scoutInterval) return;

            const myUnits = this._getMyUnits(gameState);

            // Priority 1: Use dedicated Scout Cat units (idle or between assignments)
            let scout = myUnits.find(u =>
                u.type === 'scout' && (u.state === 'idle' || u.state === 'completed_move')
            );

            // Priority 2: Any idle scout even if not fully idle
            if (!scout) {
                scout = myUnits.find(u => u.type === 'scout');
            }

            // Priority 3: Any fast idle military unit
            if (!scout) {
                scout = myUnits.find(u =>
                    u.state === 'idle' && u.type !== 'peasant' &&
                    u.type !== 'miner' && u.type !== 'catapult'
                );
            }

            // Priority 4: Idle peasant as last resort
            if (!scout) {
                scout = myUnits.find(u => u.state === 'idle' && u.type === 'peasant');
            }

            if (!scout) return;

            // Pick a smart scout destination — prefer unexplored areas
            const mapWidth = gameState.mapWidth || 2048;
            const mapHeight = gameState.mapHeight || 2048;
            const scoutTarget = this._pickScoutDestination(mapWidth, mapHeight);

            this._commandUnit(scout, 'move', scoutTarget, gameState);
            this.lastScoutTime = this.gameTime;

            // Track active scout units
            if (scout.type === 'scout' && !this.scoutUnits.includes(scout.id)) {
                this.scoutUnits.push(scout.id);
            }
        }

        /**
         * Pick an intelligent scout destination, preferring unexplored quadrants.
         * @param {number} mapWidth
         * @param {number} mapHeight
         * @returns {{ x: number, y: number }}
         */
        _pickScoutDestination(mapWidth, mapHeight) {
            // Divide map into a 4x4 grid, track which cells we've scouted
            const gridCols = 4;
            const gridRows = 4;
            const cellW = mapWidth / gridCols;
            const cellH = mapHeight / gridRows;

            // Find unvisited cells
            const unvisited = [];
            for (let r = 0; r < gridRows; r++) {
                for (let c = 0; c < gridCols; c++) {
                    const key = `${c},${r}`;
                    if (!this.scoutedAreas.has(key)) {
                        unvisited.push({ c, r });
                    }
                }
            }

            let targetCell;
            if (unvisited.length > 0) {
                // Pick a random unvisited cell
                targetCell = unvisited[Math.floor(Math.random() * unvisited.length)];
                this.scoutedAreas.add(`${targetCell.c},${targetCell.r}`);
            } else {
                // All areas scouted — revisit a random area (intel expires)
                const c = Math.floor(Math.random() * gridCols);
                const r = Math.floor(Math.random() * gridRows);
                targetCell = { c, r };
            }

            return {
                x: (targetCell.c + 0.5) * cellW,
                y: (targetCell.r + 0.5) * cellH
            };
        }

        // ── Defense Structures ───────────────────────────────────────────

        _buildDefenses(gameState) {
            const myBuildings = this._getMyBuildings(gameState);
            const towers = myBuildings.filter(b => b.type === 'tower');
            const walls = myBuildings.filter(b => b.type === 'wall');

            if (towers.length < 3) {
                this._buildStructure('tower', gameState);
            }

            if (walls.length < 8) {
                this._buildStructure('wall', gameState);
            }
        }

        // ── Army Management ──────────────────────────────────────────────

        _getArmyUnits(gameState) {
            return this._getMyUnits(gameState).filter(
                u => u.type !== 'peasant' && u.type !== 'miner' && u.type !== 'scout'
            );
        }

        _getAverageArmyHPRatio(army) {
            if (army.length === 0) return 1.0;
            let totalRatio = 0;
            for (const unit of army) {
                totalRatio += (unit.hp || 0) / (unit.maxHp || 1);
            }
            return totalRatio / army.length;
        }

        _isArmyGrouped(army) {
            if (army.length <= 1) return true;

            // Check if most units are within a reasonable distance of each other
            let cx = 0, cy = 0;
            for (const u of army) {
                cx += u.x || 0;
                cy += u.y || 0;
            }
            cx /= army.length;
            cy /= army.length;

            let groupedCount = 0;
            const groupRadius = 200; // pixels
            for (const u of army) {
                if (this._distance(u, { x: cx, y: cy }) < groupRadius) {
                    groupedCount++;
                }
            }

            return groupedCount / army.length >= 0.6; // 60% grouped is good enough
        }

        _rallyArmyToStaging(army, gameState) {
            // Calculate staging point near own base, towards enemy
            const myBuildings = this._getMyBuildings(gameState);
            const castle = myBuildings.find(b => b.type === 'castle' || b.type === 'townCenter');

            if (!castle) return;

            if (!this.stagingPoint) {
                const target = this.attackTarget || { x: castle.x + 200, y: castle.y + 200 };
                // Staging point is between base and target, closer to base
                this.stagingPoint = {
                    x: castle.x + (target.x - castle.x) * 0.3,
                    y: castle.y + (target.y - castle.y) * 0.3
                };
            }

            for (const unit of army) {
                if (this._distance(unit, this.stagingPoint) > 150) {
                    this._commandUnit(unit, 'move', this.stagingPoint, gameState);
                }
            }
        }

        _retreatArmy(gameState) {
            const myBuildings = this._getMyBuildings(gameState);
            const castle = myBuildings.find(b => b.type === 'castle' || b.type === 'townCenter');
            if (!castle) return;

            const army = this._getArmyUnits(gameState);
            for (const unit of army) {
                this._commandUnit(unit, 'move', { x: castle.x, y: castle.y }, gameState);
            }

            this.attackTarget = null;
            this.stagingPoint = null;
        }

        _commandArmyAttack(army, target, gameState) {
            for (const unit of army) {
                this._commandUnit(unit, 'attack', target, gameState);
            }
        }

        // ── Helpers: Entity Queries ──────────────────────────────────────

        _getMyUnits(gameState) {
            if (!gameState || !gameState.entities) return [];
            return Object.values(gameState.entities).filter(
                e => e.playerId === this.playerId && e.entityType === 'unit'
            );
        }

        _getMyBuildings(gameState) {
            if (!gameState || !gameState.entities) return [];
            return Object.values(gameState.entities).filter(
                e => e.playerId === this.playerId && e.entityType === 'building'
            );
        }

        _getMyResources(gameState) {
            if (!gameState || !gameState.players) {
                return { gold: 0, wood: 0, stone: 0, food: 0 };
            }
            const player = gameState.players[this.playerId];
            return player ? player.resources : { gold: 0, wood: 0, stone: 0, food: 0 };
        }

        /**
         * Check if an enemy entity is within vision range of any of our units/buildings.
         * This enforces fog-of-war: the AI can only "see" what its units can see.
         * @param {object} enemy - The enemy entity with x, y.
         * @param {object} gameState
         * @returns {boolean}
         */
        _isEntityVisible(enemy, gameState) {
            const myUnits = this._getMyUnits(gameState);
            const myBuildings = this._getMyBuildings(gameState);

            // Check against all our units
            for (const unit of myUnits) {
                const visionRange = unit.type === 'scout'
                    ? (unit.visionRange || SCOUT_VISION_RANGE)
                    : (unit.visionRange || DEFAULT_VISION_RANGE);
                if (this._distance(unit, enemy) <= visionRange) {
                    return true;
                }
            }

            // Buildings also provide vision in their vicinity
            for (const building of myBuildings) {
                const buildingVision = building.visionRange || DEFAULT_VISION_RANGE;
                if (this._distance(building, enemy) <= buildingVision) {
                    return true;
                }
            }

            return false;
        }

        /**
         * Get enemy buildings currently visible to our units (fog-of-war aware).
         * AI does NOT have omniscient knowledge — only sees what its units can see.
         */
        _getVisibleEnemyBuildings(gameState) {
            if (!gameState || !gameState.entities) return [];
            return Object.values(gameState.entities).filter(
                e => e.playerId && e.playerId !== this.playerId &&
                     e.entityType === 'building' &&
                     this._isEntityVisible(e, gameState)
            );
        }

        /**
         * Get enemy units currently visible to our units (fog-of-war aware).
         * AI does NOT have omniscient knowledge — only sees what its units can see.
         */
        _getVisibleEnemyUnits(gameState) {
            if (!gameState || !gameState.entities) return [];
            return Object.values(gameState.entities).filter(
                e => e.playerId && e.playerId !== this.playerId &&
                     e.entityType === 'unit' &&
                     this._isEntityVisible(e, gameState)
            );
        }

        /**
         * Legacy methods that now delegate to fog-of-war aware versions.
         * Kept for backward compatibility with internal methods.
         */
        _getEnemyBuildings(gameState) {
            return this._getVisibleEnemyBuildings(gameState);
        }

        _getEnemyUnits(gameState) {
            return this._getVisibleEnemyUnits(gameState);
        }

        _findEnemyWorkers(gameState) {
            return this._getVisibleEnemyUnits(gameState).filter(
                u => u.type === 'peasant' || u.type === 'miner'
            );
        }

        _findEnemyResourceBuildings(gameState) {
            return this._getVisibleEnemyBuildings(gameState).filter(
                b => b.type === 'farm' || b.type === 'lumberMill' || b.type === 'mineShaft'
            );
        }

        /**
         * Urgent scouting — called when AI has no enemy intel and needs to find enemies.
         * Sends all available scouts in different directions immediately.
         * @param {object} gameState
         */
        _urgentScout(gameState) {
            const myUnits = this._getMyUnits(gameState);
            const scouts = myUnits.filter(u => u.type === 'scout');
            const mapWidth = gameState.mapWidth || 2048;
            const mapHeight = gameState.mapHeight || 2048;

            if (scouts.length > 0) {
                // Send each scout to a different quadrant
                const quadrants = [
                    { x: mapWidth * 0.25, y: mapHeight * 0.25 },
                    { x: mapWidth * 0.75, y: mapHeight * 0.25 },
                    { x: mapWidth * 0.25, y: mapHeight * 0.75 },
                    { x: mapWidth * 0.75, y: mapHeight * 0.75 }
                ];
                for (let i = 0; i < scouts.length; i++) {
                    const dest = quadrants[i % quadrants.length];
                    this._commandUnit(scouts[i], 'move', dest, gameState);
                }
            } else {
                // No scouts — train one urgently and send any idle military unit
                this._trainUnit('scout', gameState);
                const idleMilitary = myUnits.find(u =>
                    u.state === 'idle' && u.type !== 'peasant' &&
                    u.type !== 'miner' && u.type !== 'catapult'
                );
                if (idleMilitary) {
                    const dest = this._pickScoutDestination(mapWidth, mapHeight);
                    this._commandUnit(idleMilitary, 'move', dest, gameState);
                }
            }
        }

        _isBaseUnderAttack(gameState) {
            return this._getThreatsNearBase(gameState).length > 0;
        }

        _getThreatsNearBase(gameState) {
            const myBuildings = this._getMyBuildings(gameState);
            const castle = myBuildings.find(b => b.type === 'castle' || b.type === 'townCenter');
            if (!castle) return [];

            const baseRadius = 300; // pixels
            const enemies = this._getEnemyUnits(gameState);
            return enemies.filter(e => this._distance(e, castle) < baseRadius);
        }

        _isTargetDestroyed(target, gameState) {
            if (!target || !target.id) return true;
            if (!gameState || !gameState.entities) return true;
            return !gameState.entities[target.id];
        }

        // ── Helpers: Commands ────────────────────────────────────────────

        _commandUnit(unit, action, target, gameState) {
            // Issue command through the game's command system
            if (gameState && gameState.issueCommand) {
                gameState.issueCommand({
                    playerId: this.playerId,
                    unitId: unit.id,
                    action: action,
                    target: target
                });
            }
        }

        _trainUnit(unitType, gameState) {
            if (gameState && gameState.issueCommand) {
                gameState.issueCommand({
                    playerId: this.playerId,
                    action: 'train',
                    unitType: unitType
                });
            }
        }

        _buildStructure(buildingType, gameState) {
            if (gameState && gameState.issueCommand) {
                // Find suitable build position near base
                const pos = this._findBuildPosition(buildingType, gameState);
                if (pos) {
                    gameState.issueCommand({
                        playerId: this.playerId,
                        action: 'build',
                        buildingType: buildingType,
                        x: pos.x,
                        y: pos.y
                    });
                }
            }
        }

        _findBuildPosition(buildingType, gameState) {
            const myBuildings = this._getMyBuildings(gameState);
            const castle = myBuildings.find(b => b.type === 'castle' || b.type === 'townCenter');
            if (!castle) return null;

            // Spiral outward from castle to find open position
            const spacing = 64;  // tile size
            const maxRadius = 8; // tiles

            for (let radius = 1; radius <= maxRadius; radius++) {
                for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
                    const x = castle.x + Math.cos(angle) * radius * spacing;
                    const y = castle.y + Math.sin(angle) * radius * spacing;

                    // Check if position is free (no overlap with existing buildings)
                    const blocked = myBuildings.some(b =>
                        Math.abs(b.x - x) < spacing && Math.abs(b.y - y) < spacing
                    );

                    if (!blocked) {
                        // For defensive structures, build closer to enemy direction
                        if (buildingType === 'tower' || buildingType === 'wall') {
                            const enemies = this._getEnemyBuildings(gameState);
                            if (enemies.length > 0) {
                                const enemyDir = Math.atan2(
                                    enemies[0].y - castle.y,
                                    enemies[0].x - castle.x
                                );
                                const angleDiff = Math.abs(angle - enemyDir);
                                if (angleDiff < Math.PI / 2) {
                                    return { x, y };
                                }
                            }
                        }
                        return { x, y };
                    }
                }
            }

            // Fallback: just offset from castle
            return {
                x: castle.x + (Math.random() - 0.5) * 300,
                y: castle.y + (Math.random() - 0.5) * 300
            };
        }

        // ── Helpers: Math ────────────────────────────────────────────────

        _distance(a, b) {
            const dx = (a.x || 0) - (b.x || 0);
            const dy = (a.y || 0) - (b.y || 0);
            return Math.sqrt(dx * dx + dy * dy);
        }

        _findNearestEntity(origin, entities) {
            let nearest = null;
            let nearestDist = Infinity;
            for (const e of entities) {
                const dist = this._distance(origin, e);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearest = e;
                }
            }
            return nearest;
        }

        // ── Build Order Selection ────────────────────────────────────────

        _selectBuildOrder() {
            const personalityType = this.personality ? this.personality.type : 'aggressive';
            const orderTemplate = BUILD_ORDERS[personalityType] || BUILD_ORDERS.aggressive;
            this.buildQueue = JSON.parse(JSON.stringify(orderTemplate));
            this.buildOrderIndex = 0;
        }

        // ── Serialization ────────────────────────────────────────────────

        /**
         * Get debug info about the AI state.
         * @returns {object}
         */
        getDebugInfo() {
            return {
                playerId: this.playerId,
                factionId: this.factionId,
                state: this.state,
                gameTimeMin: (this.gameTime / 60000).toFixed(1),
                peasantCount: this.peasantCount,
                armySize: this.armyGroup.length,
                threatLevel: this.threatLevel.toFixed(2),
                buildOrderIndex: this.buildOrderIndex,
                attackTarget: this.attackTarget,
                attacksLaunched: this.attacksLaunched
            };
        }
    }

    // ── AI Manager ───────────────────────────────────────────────────────

    /**
     * Manages multiple AI controllers.
     */
    class AIManager {
        constructor() {
            this.controllers = {};
        }

        /**
         * Add a new AI opponent.
         * @param {string} playerId
         * @param {string} factionId
         * @param {string} difficulty
         * @returns {AIController}
         */
        addAI(playerId, factionId, difficulty) {
            const controller = new AIController(playerId, factionId, difficulty);
            this.controllers[playerId] = controller;
            return controller;
        }

        /**
         * Remove an AI opponent.
         * @param {string} playerId
         */
        removeAI(playerId) {
            delete this.controllers[playerId];
        }

        /**
         * Update all AI controllers.
         * @param {number} dt - Delta time in ms.
         * @param {object} gameState
         */
        update(dt, gameState) {
            for (const id in this.controllers) {
                this.controllers[id].update(dt, gameState);
            }
        }

        /**
         * Get debug info for all AIs.
         * @returns {object[]}
         */
        getDebugInfo() {
            const info = [];
            for (const id in this.controllers) {
                info.push(this.controllers[id].getDebugInfo());
            }
            return info;
        }

        /**
         * Get a specific AI controller.
         * @param {string} playerId
         * @returns {AIController|null}
         */
        getController(playerId) {
            return this.controllers[playerId] || null;
        }
    }

    // ── Export ────────────────────────────────────────────────────────────
    CatWar.AI = {
        AIController,
        AIManager,
        STATE,
        DIFFICULTY_MODIFIERS
    };

})();
