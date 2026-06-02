/**
 * The Cat War - Configuration & Constants
 * ========================================
 * All game constants, balance values, unit stats, building stats,
 * terrain definitions, and faction data in one central location.
 *
 * Usage: CatWar.Config.TILE_SIZE, CatWar.Config.UNITS.SWORDSCAT, etc.
 */
window.CatWar = window.CatWar || {};

CatWar.Config = (function () {
    'use strict';

    // ─── Core Display & World ────────────────────────────────────────
    const TILE_SIZE    = 32;
    const MAP_WIDTH    = 150;   // tiles
    const MAP_HEIGHT   = 150;   // tiles
    const WORLD_WIDTH  = MAP_WIDTH  * TILE_SIZE;  // 4800 px
    const WORLD_HEIGHT = MAP_HEIGHT * TILE_SIZE;   // 4800 px

    // ─── Camera ──────────────────────────────────────────────────────
    const CAMERA_SPEED            = 8;     // px per frame when scrolling
    const CAMERA_EDGE_SCROLL_ZONE = 30;    // px from edge to trigger scroll
    const ZOOM_MIN                = 0.5;
    const ZOOM_MAX                = 2.0;
    const ZOOM_STEP               = 0.1;
    const CAMERA_LERP_FACTOR      = 0.12;  // smooth interpolation factor

    // ─── Timing ──────────────────────────────────────────────────────
    const FPS            = 60;
    const FRAME_DURATION = 1000 / FPS;  // ~16.667 ms

    // ─── Economy ─────────────────────────────────────────────────────
    const STARTING_RESOURCES = {
        gold:  0,
        wood:  200,
        stone: 100,
        food:  0
    };
    const POPULATION_CAP = 50;

    // ─── Resource Nodes ──────────────────────────────────────────────
    const RESOURCE_NODES = {
        GOLD_DEPOSIT:  { resource: 'gold',  amount: 800 },
        STONE_DEPOSIT: { resource: 'stone', amount: 600 },
        FOREST:        { resource: 'wood',  amount: 400 }
    };

    // ─── Pathfinding ─────────────────────────────────────────────────
    const PATHFINDING = {
        MAX_PER_FRAME:    5,     // max path calculations per update tick
        DIAGONAL_COST:    1.414, // √2
        MAX_SEARCH_NODES: 2000,  // hard cap to prevent lag
        FORMATION_SPACING: 1.2   // tiles between units in formation
    };

    // ─── Units ───────────────────────────────────────────────────────
    // HP and damage are intentionally halved from typical RTS values.
    // speed is in tiles/second, range is in tiles.
    const UNITS = {
        HEAD_MINER: {
            hp:         25,
            damage:     4,
            speed:      2.2,
            range:      0,
            cost:       { gold: 60 },
            trainTime:  15,      // seconds
            gatherRate: 1.5,     // resources per second
            popCost:    1,
            description: 'Elite peasant with 50% faster gathering speed'
        },
        PEASANT: {
            hp:         20,
            damage:     3,
            speed:      2.0,
            range:      0,
            cost:       { gold: 50 },
            trainTime:  15,
            gatherRate: 1.0,
            popCost:    1,
            description: 'Basic worker unit — gathers resources and constructs buildings'
        },
        FARMER: {
            hp:         20,
            damage:     2,
            speed:      2.0,
            range:      0,
            cost:       { gold: 40 },
            trainTime:  15,
            gatherRate: 1.0,
            popCost:    1,
            description: 'Farmer Cat — harvests food from farms and delivers it to the castle'
        },
        SWORDSCAT: {
            hp:         40,
            damage:     6,
            speed:      1.8,
            range:      0,
            cost:       { gold: 80, wood: 20 },
            trainTime:  20,
            popCost:    1,
            description: 'Reliable melee infantry with balanced stats'
        },
        SPEARCAT: {
            hp:         35,
            damage:     8,
            speed:      1.6,
            range:      0,
            cost:       { gold: 70, wood: 30 },
            trainTime:  22,
            bonusVsCavalry: 2.0,  // damage multiplier vs mounted units
            popCost:    1,
            description: 'Anti-cavalry specialist — double damage vs mounted units'
        },
        ARCHER: {
            hp:         25,
            damage:     5,
            speed:      1.9,
            range:      6,
            cost:       { gold: 60, wood: 40 },
            trainTime:  18,
            popCost:    1,
            description: 'Basic ranged unit with moderate range'
        },
        CROSSBOW: {
            hp:         30,
            damage:     9,
            speed:      1.5,
            range:      7,
            cost:       { gold: 80, wood: 50 },
            trainTime:  25,
            popCost:    1,
            description: 'Heavy ranged unit — slow but high damage and range'
        },
        BIPLANE: {
            hp:         35,
            damage:     6,
            speed:      3.5,
            range:      6,
            cost:       { gold: 120, wood: 80 },
            trainTime:  28,
            popCost:    2,
            isFlyer:    true,
            description: 'Biplane Cat — aerial fighter that flies over all terrain and strafes targets with rapid machine guns!'
        },
        KNIGHT: {
            hp:         75,
            damage:     10,
            speed:      1.4,
            range:      0,
            cost:       { gold: 150, wood: 60, stone: 40 },
            trainTime:  35,
            popCost:    2,
            description: 'Heavily armored melee fighter'
        },
        CAVALRY: {
            hp:         60,
            damage:     9,
            speed:      3.0,
            range:      0,
            cost:       { gold: 120, wood: 40 },
            trainTime:  30,
            isMounted:  true,
            popCost:    2,
            description: 'Fast mounted unit — vulnerable to spears'
        },
        HEALER: {
            hp:         22,
            damage:     2,
            speed:      1.7,
            range:      4,
            cost:       { gold: 100, wood: 30 },
            trainTime:  28,
            healRate:   3,       // HP per second healed on friendly units
            popCost:    1,
            description: 'Support unit that heals nearby allies'
        },
        CATAPULT: {
            hp:         40,
            damage:     20,
            speed:      0.8,
            range:      10,
            cost:       { gold: 200, wood: 100, stone: 80 },
            trainTime:  45,
            aoeRadius:  2,      // splash damage radius in tiles
            isSiege:    true,
            popCost:    3,
            description: 'Siege weapon with devastating area damage'
        },
        ROYAL_COMMANDER: {
            hp:         125,
            damage:     13,
            speed:      1.6,
            range:      0,
            cost:       { gold: 300, wood: 100, stone: 100 },
            trainTime:  60,
            popCost:    4,
            description: 'Powerful hero unit — inspires nearby allies'
        },
        SCOUT: {
            hp:         15,
            damage:     2,
            speed:      3.5,
            range:      0,
            cost:       { gold: 30 },
            trainTime:  10,
            visionRange: 8,
            canDetectStealth: true,
            popCost:    1,
            description: 'Fast scout — extended vision, detects stealth units'
        },
        TRANSPORT_SHIP: {
            hp:         150,
            damage:     0,
            speed:      4.5,
            range:      0,
            cost:       { gold: 80, wood: 120 },
            trainTime:  20,
            popCost:    2,
            isWaterOnly: true,
            description: 'Coastal transport — carries up to 10 land units across water!'
        },
        WARSHIP: {
            hp:         200,
            damage:     8,
            speed:      3.5,
            range:      8,
            cost:       { gold: 150, wood: 100 },
            trainTime:  30,
            popCost:    3,
            isWaterOnly: true,
            description: 'Reinforced warship — fires heavy arrow bolts at sea or land targets!'
        }
    };

    // ─── Buildings ───────────────────────────────────────────────────
    // buildTime is in seconds.  cost: null means unbuildable by player
    // (placed at game start only).  size is in tiles (width x height).
    const BUILDINGS = {
        CASTLE_KEEP: {
            hp:         2000,
            cost:       null,
            buildTime:  0,
            size:       { w: 3, h: 3 },
            trains:     ['PEASANT', 'HEAD_MINER', 'SCOUT'],
            claimRadius: 8,
            visionRange: 12,
            popProvided: 10,
            description: 'Main base — produces workers and provides population'
        },
        BARRACKS: {
            hp:         800,
            cost:       { wood: 100 },
            buildTime:  30,
            size:       { w: 2, h: 2 },
            trains:     ['SWORDSCAT', 'SPEARCAT', 'KNIGHT'],
            visionRange: 6,
            popProvided: 0,
            description: 'Trains melee infantry units'
        },
        ARCHERY_RANGE: {
            hp:         600,
            cost:       { wood: 80 },
            buildTime:  25,
            size:       { w: 2, h: 2 },
            trains:     ['ARCHER', 'CROSSBOW', 'BIPLANE'],
            visionRange: 6,
            popProvided: 0,
            description: 'Trains ranged units'
        },
        BLACKSMITH: {
            hp:         500,
            cost:       { stone: 150 },
            buildTime:  35,
            size:       { w: 2, h: 2 },
            trains:     [],
            visionRange: 5,
            popProvided: 0,
            description: 'Unlocks unit upgrades'
        },
        STABLE: {
            hp:         700,
            cost:       { wood: 100 },
            buildTime:  30,
            size:       { w: 2, h: 2 },
            trains:     ['CAVALRY'],
            visionRange: 6,
            popProvided: 0,
            description: 'Trains mounted units'
        },
        SIEGE_WORKSHOP: {
            hp:         600,
            cost:       { wood: 150, stone: 100 },
            buildTime:  40,
            size:       { w: 3, h: 2 },
            trains:     ['CATAPULT'],
            visionRange: 5,
            popProvided: 0,
            description: 'Constructs siege weapons'
        },
        FARM: {
            hp:         300,
            cost:       { wood: 50 },
            buildTime:  20,
            size:       { w: 2, h: 2 },
            trains:     [],
            foodPerMin: 10,
            visionRange: 4,
            popProvided: 20,
            description: 'Produces food and increases population cap'
        },
        LUMBER_MILL: {
            hp:         400,
            cost:       { wood: 30 },
            buildTime:  20,
            size:       { w: 2, h: 2 },
            trains:     [],
            gatherBonus: 0.2,   // +20% wood gather speed
            visionRange: 5,
            popProvided: 0,
            description: 'Increases wood gathering efficiency by 20%'
        },
        STONE_QUARRY: {
            hp:         400,
            cost:       { wood: 50 },
            buildTime:  25,
            size:       { w: 2, h: 2 },
            trains:     [],
            gatherBonus: 0.2,   // +20% stone gather speed
            visionRange: 5,
            popProvided: 0,
            description: 'Increases stone gathering efficiency by 20%'
        },
        WATCHTOWER: {
            hp:         350,
            cost:       { stone: 60 },
            buildTime:  20,
            size:       { w: 1, h: 1 },
            trains:     [],
            attackDamage: 5,
            attackRange:  7,
            visionRange:  10,
            claimRadius:  10,
            popProvided:  0,
            description: 'Defensive tower — attacks nearby enemies'
        },
        DOCK: {
            hp:         600,
            cost:       { wood: 150 },
            buildTime:  25,
            size:       { w: 2, h: 2 },
            trains:     ['TRANSPORT_SHIP', 'WARSHIP'],
            isDock:     true,
            isDropOff:  true,
            dropOffTypes: ['GOLD', 'WOOD', 'STONE'],
            visionRange: 6,
            popProvided: 0,
            description: 'Coastal shipyard — drop-off point for all resources and trains naval vessels!'
        },
        WALL: {
            hp:         500,
            cost:       { stone: 10 },
            buildTime:  5,
            size:       { w: 1, h: 1 },
            trains:     [],
            visionRange: 2,
            popProvided: 0,
            isWall:     true,
            description: 'Stone wall — cheap and tough, blocks enemy movement'
        },
        GATE: {
            hp:         400,
            cost:       { stone: 20, wood: 10 },
            buildTime:  8,
            size:       { w: 1, h: 1 },
            trains:     [],
            visionRange: 2,
            popProvided: 0,
            isWall:     true,
            isGate:     true,
            description: 'Gate — friendly units pass through, blocks enemies'
        },
        BRIDGE: {
            hp:         400,
            cost:       { wood: 40 },
            buildTime:  10,
            size:       { w: 1, h: 1 },
            trains:     [],
            visionRange: 3,
            popProvided: 0,
            isBridge:    true,
            description: 'Wooden bridge — allows land units to cross over water!'
        },
        DRAWBRIDGE: {
            hp:         600,
            cost:       { wood: 80, stone: 40 },
            buildTime:  15,
            size:       { w: 1, h: 1 },
            trains:     [],
            visionRange: 4,
            popProvided: 0,
            isDrawbridge: true,
            description: 'Drawbridge — opens to let friendly ships pass, closes to let ground units cross!'
        }
    };

    // ─── Terrain ─────────────────────────────────────────────────────
    const TERRAIN = {
        GRASS:         { id: 0, walkable: true,  moveCost: 1.0,      color: '#4a7c2e', name: 'Grass' },
        FOREST:        { id: 1, walkable: true,  moveCost: 2.0,      color: '#2d5a1e', name: 'Forest' },
        MOUNTAIN:      { id: 2, walkable: false, moveCost: Infinity,  color: '#8a8a8a', name: 'Mountain' },
        WATER:         { id: 3, walkable: false, moveCost: Infinity,  color: '#2c6fbb', name: 'Water' },
        SAND:          { id: 4, walkable: true,  moveCost: 1.5,      color: '#d4b96a', name: 'Sand' },
        ROAD:          { id: 5, walkable: true,  moveCost: 0.7,      color: '#9e8c6c', name: 'Road' },
        STONE_DEPOSIT: { id: 6, walkable: true,  moveCost: 1.0,      color: '#b0a090', name: 'Stone Deposit' },
        GOLD_DEPOSIT:  { id: 7, walkable: true,  moveCost: 1.0,      color: '#daa520', name: 'Gold Deposit' },
        FARMLAND:      { id: 8, walkable: true,  moveCost: 1.0,      color: '#6b8e23', name: 'Farmland' }
    };

    // Reverse lookup: id → terrain key
    const TERRAIN_BY_ID = {};
    for (const key in TERRAIN) {
        TERRAIN_BY_ID[TERRAIN[key].id] = key;
    }

    // ─── Factions ────────────────────────────────────────────────────
    const FACTIONS = {
        LION: {
            id:        'LION',
            primary:   '#DAA520',
            secondary: '#8B0000',
            name:      'Lion Cats'
        },
        SIAMESE: {
            id:        'SIAMESE',
            primary:   '#4682B4',
            secondary: '#C0C0C0',
            name:      'Siamese Cats'
        },
        MAINE_COON: {
            id:        'MAINE_COON',
            primary:   '#2E8B57',
            secondary: '#8B4513',
            name:      'Maine Coon Cats'
        },
        BLACK_CAT: {
            id:        'BLACK_CAT',
            primary:   '#6A0DAD',
            secondary: '#1C1C1C',
            name:      'Black Cat Kingdom'
        },
        PERSIAN: {
            id:        'PERSIAN',
            primary:   '#FFFFF0',
            secondary: '#FFD700',
            name:      'Persian Cat Empire'
        }
    };

    // Ordered faction keys for spawn position assignment
    const FACTION_ORDER = ['LION', 'SIAMESE', 'MAINE_COON', 'BLACK_CAT', 'PERSIAN'];

    // ─── Combat ──────────────────────────────────────────────────────
    const COMBAT = {
        ATTACK_COOLDOWN_BASE: 1.0,   // seconds between attacks
        AGGRO_RANGE:          8,     // tiles — units auto-engage enemies within this
        CHASE_LEASH_RANGE:    14,    // tiles — stop chasing if target moves beyond this
        PROJECTILE_SPEED:     8,     // tiles per second
        MIN_DAMAGE:           1      // minimum damage per hit
    };

    // ─── Selection & UI ──────────────────────────────────────────────
    const UI = {
        SELECTION_COLOR_FRIENDLY: '#00ff00',
        SELECTION_COLOR_ENEMY:    '#ff0000',
        SELECTION_COLOR_NEUTRAL:  '#ffff00',
        HEALTH_BAR_WIDTH:         28,
        HEALTH_BAR_HEIGHT:        4,
        HEALTH_BAR_OFFSET_Y:     -20,  // above the unit sprite
        MINIMAP_SIZE:             180,
        MINIMAP_PADDING:          10,
        MAX_SELECTION:            40
    };

    // ─── Fog of War ──────────────────────────────────────────────────
    const FOG = {
        HIDDEN:    0,
        EXPLORED:  1,
        VISIBLE:   2,
        HIDDEN_ALPHA:   0.85,   // darkness for never-seen tiles
        EXPLORED_ALPHA: 0.45    // darkness for previously-seen tiles
    };

    // ─── Public API ──────────────────────────────────────────────────
    return Object.freeze({
        TILE_SIZE,
        MAP_WIDTH,
        MAP_HEIGHT,
        WORLD_WIDTH,
        WORLD_HEIGHT,

        CAMERA_SPEED,
        CAMERA_EDGE_SCROLL_ZONE,
        ZOOM_MIN,
        ZOOM_MAX,
        ZOOM_STEP,
        CAMERA_LERP_FACTOR,

        FPS,
        FRAME_DURATION,

        STARTING_RESOURCES,
        POPULATION_CAP,
        RESOURCE_NODES,

        PATHFINDING,
        UNITS,
        BUILDINGS,
        TERRAIN,
        TERRAIN_BY_ID,
        FACTIONS,
        FACTION_ORDER,
        COMBAT,
        UI,
        FOG
    });
})();
