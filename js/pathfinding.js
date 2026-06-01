/**
 * The Cat War - Pathfinding (A*)
 * ==============================
 * Efficient A* pathfinding on the 80×80 tile grid with:
 *  - Binary-heap open list
 *  - 8-directional movement
 *  - Terrain movement costs
 *  - Path smoothing
 *  - Per-frame request throttling
 *  - Path caching
 *  - Group / formation offsets
 *
 * Depends on: CatWar.Config, CatWar.Map
 */
window.CatWar = window.CatWar || {};

CatWar.Pathfinding = (function () {
    'use strict';

    const CFG = () => CatWar.Config;

    // ═══════════════════════════════════════════════════════════════
    //  Binary Min-Heap (priority queue on f-cost)
    // ═══════════════════════════════════════════════════════════════

    class BinaryHeap {
        constructor() { this.data = []; }

        get size() { return this.data.length; }

        push(node) {
            this.data.push(node);
            this._bubbleUp(this.data.length - 1);
        }

        pop() {
            const top = this.data[0];
            const last = this.data.pop();
            if (this.data.length > 0) {
                this.data[0] = last;
                this._sinkDown(0);
            }
            return top;
        }

        /** Re-sort a node whose f cost decreased. */
        decreaseKey(node) {
            const idx = this.data.indexOf(node);
            if (idx >= 0) this._bubbleUp(idx);
        }

        _bubbleUp(i) {
            const d = this.data;
            while (i > 0) {
                const parent = (i - 1) >> 1;
                if (d[i].f < d[parent].f) {
                    [d[i], d[parent]] = [d[parent], d[i]];
                    i = parent;
                } else break;
            }
        }

        _sinkDown(i) {
            const d = this.data;
            const len = d.length;
            while (true) {
                let smallest = i;
                const l = 2 * i + 1;
                const r = 2 * i + 2;
                if (l < len && d[l].f < d[smallest].f) smallest = l;
                if (r < len && d[r].f < d[smallest].f) smallest = r;
                if (smallest !== i) {
                    [d[i], d[smallest]] = [d[smallest], d[i]];
                    i = smallest;
                } else break;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Direction vectors (8-directional)
    // ═══════════════════════════════════════════════════════════════

    const DIRS = [
        { dx:  0, dy: -1 },  // N
        { dx:  1, dy: -1 },  // NE
        { dx:  1, dy:  0 },  // E
        { dx:  1, dy:  1 },  // SE
        { dx:  0, dy:  1 },  // S
        { dx: -1, dy:  1 },  // SW
        { dx: -1, dy:  0 },  // W
        { dx: -1, dy: -1 }   // NW
    ];

    // ═══════════════════════════════════════════════════════════════
    //  Request throttle state
    // ═══════════════════════════════════════════════════════════════

    let pathsThisFrame = 0;

    /** Call at the start of each game tick to reset throttle counter. */
    function resetFrameCounter() {
        pathsThisFrame = 0;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Core A* implementation
    // ═══════════════════════════════════════════════════════════════

    /**
     * Find a path from (sx,sy) to (ex,ey) in tile coordinates.
     *
     * @param {number} sx  Start tile X
     * @param {number} sy  Start tile Y
     * @param {number} ex  End tile X
     * @param {number} ey  End tile Y
     * @param {object} [opts]  Optional overrides:
     *     - ignoreThrottle {boolean} bypass per-frame limit
     *     - maxNodes {number}  override max search nodes
     * @returns {Array|null} Array of {x, y} tile waypoints, or null if no path
     */
    function findPath(sx, sy, ex, ey, opts) {
        opts = opts || {};
        const cfg = CFG();
        const map = CatWar.Map;
        if (!map) return null;

        const factionId = opts.factionId;

        // Throttle check
        if (!opts.ignoreThrottle) {
            if (pathsThisFrame >= cfg.PATHFINDING.MAX_PER_FRAME) return null;
            pathsThisFrame++;
        }

        // Snap to integers
        sx = Math.round(sx);
        sy = Math.round(sy);
        ex = Math.round(ex);
        ey = Math.round(ey);

        // Trivial case
        if (sx === ex && sy === ey) return [{ x: ex, y: ey }];

        // If destination is unwalkable, find the closest walkable neighbour
        if (!map.isWalkable(ex, ey, factionId)) {
            const alt = _nearestWalkable(ex, ey, factionId);
            if (!alt) return null;
            ex = alt.x;
            ey = alt.y;
        }

        const maxNodes = opts.maxNodes || cfg.PATHFINDING.MAX_SEARCH_NODES;
        const W = cfg.MAP_WIDTH;
        const H = cfg.MAP_HEIGHT;
        const DIAG = cfg.PATHFINDING.DIAGONAL_COST;

        // Node pool (flat arrays for speed)
        const gCost  = new Float32Array(W * H);
        const fCost  = new Float32Array(W * H);
        const closed = new Uint8Array(W * H);
        const parentX = new Int16Array(W * H).fill(-1);
        const parentY = new Int16Array(W * H).fill(-1);

        const key = (tx, ty) => ty * W + tx;

        // Heuristic: octile distance
        function heuristic(ax, ay) {
            const dx = Math.abs(ax - ex);
            const dy = Math.abs(ay - ey);
            return (dx + dy) + (DIAG - 2) * Math.min(dx, dy);
        }

        const open = new BinaryHeap();
        const startKey = key(sx, sy);
        gCost[startKey] = 0;
        fCost[startKey] = heuristic(sx, sy);

        const startNode = { x: sx, y: sy, f: fCost[startKey] };
        open.push(startNode);

        // Map from key→node for decrease-key operations
        const nodeMap = new Map();
        nodeMap.set(startKey, startNode);

        let nodesExplored = 0;

        while (open.size > 0 && nodesExplored < maxNodes) {
            const current = open.pop();
            const cx = current.x;
            const cy = current.y;
            const ck = key(cx, cy);

            // Goal reached?
            if (cx === ex && cy === ey) {
                return _reconstructPath(parentX, parentY, sx, sy, ex, ey, W);
            }

            if (closed[ck]) continue;
            closed[ck] = 1;
            nodesExplored++;

            // Explore neighbours
            for (let d = 0; d < 8; d++) {
                const nx = cx + DIRS[d].dx;
                const ny = cy + DIRS[d].dy;

                // Bounds check
                if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;

                const nk = key(nx, ny);
                if (closed[nk]) continue;

                // Walkable check
                if (!map.isWalkable(nx, ny, factionId)) continue;

                // For diagonal movement, ensure both adjacent cardinal tiles
                // are walkable (no corner-cutting through walls)
                if (DIRS[d].dx !== 0 && DIRS[d].dy !== 0) {
                    if (!map.isWalkable(cx + DIRS[d].dx, cy, factionId) ||
                        !map.isWalkable(cx, cy + DIRS[d].dy, factionId)) {
                        continue;
                    }
                }

                const moveCost = map.getMovementCost(nx, ny, factionId);
                if (moveCost >= 100) continue; // effectively impassable

                const stepCost = (d % 2 === 0) ? moveCost : moveCost * DIAG;
                const tentG = gCost[ck] + stepCost;

                const existingNode = nodeMap.get(nk);

                if (!existingNode) {
                    // New node
                    gCost[nk] = tentG;
                    fCost[nk] = tentG + heuristic(nx, ny);
                    parentX[nk] = cx;
                    parentY[nk] = cy;

                    const nn = { x: nx, y: ny, f: fCost[nk] };
                    open.push(nn);
                    nodeMap.set(nk, nn);
                } else if (tentG < gCost[nk]) {
                    // Found a shorter route
                    gCost[nk] = tentG;
                    fCost[nk] = tentG + heuristic(nx, ny);
                    parentX[nk] = cx;
                    parentY[nk] = cy;
                    existingNode.f = fCost[nk];
                    open.decreaseKey(existingNode);
                }
            }
        }

        // No path found — try to get as close as possible
        return _closestApproachPath(parentX, parentY, closed, gCost,
                                     sx, sy, ex, ey, W, H);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Path reconstruction & smoothing
    // ═══════════════════════════════════════════════════════════════

    function _reconstructPath(parentX, parentY, sx, sy, ex, ey, W) {
        const path = [];
        let cx = ex, cy = ey;
        const key = (tx, ty) => ty * W + tx;

        // Safety: limit iterations to prevent infinite loop on corrupt data
        let maxIter = W * W;
        while (maxIter-- > 0) {
            path.push({ x: cx, y: cy });
            if (cx === sx && cy === sy) break;
            const k = key(cx, cy);
            const px = parentX[k];
            const py = parentY[k];
            if (px === -1 && py === -1) break;
            cx = px;
            cy = py;
        }

        path.reverse();
        return _smoothPath(path);
    }

    /**
     * When no path to the goal was found, walk to the closed node
     * nearest to the target instead.
     */
    function _closestApproachPath(parentX, parentY, closed, gCost,
                                   sx, sy, ex, ey, W, H) {
        let bestDist = Infinity;
        let bestX = sx, bestY = sy;

        for (let ty = 0; ty < H; ty++) {
            for (let tx = 0; tx < W; tx++) {
                const k = ty * W + tx;
                if (!closed[k]) continue;
                const dist = Math.hypot(tx - ex, ty - ey);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestX = tx;
                    bestY = ty;
                }
            }
        }

        if (bestX === sx && bestY === sy) return null;
        return _reconstructPath(parentX, parentY, sx, sy, bestX, bestY, W);
    }

    /**
     * Remove unnecessary intermediate waypoints on straight lines.
     */
    function _smoothPath(path) {
        if (path.length <= 2) return path;

        const smoothed = [path[0]];
        for (let i = 1; i < path.length - 1; i++) {
            const prev = path[i - 1];
            const curr = path[i];
            const next = path[i + 1];

            // Keep the waypoint if the direction changes
            const dx1 = curr.x - prev.x;
            const dy1 = curr.y - prev.y;
            const dx2 = next.x - curr.x;
            const dy2 = next.y - curr.y;

            if (dx1 !== dx2 || dy1 !== dy2) {
                smoothed.push(curr);
            }
        }
        smoothed.push(path[path.length - 1]);
        return smoothed;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Nearest walkable tile (for unwalkable destinations)
    // ═══════════════════════════════════════════════════════════════

    function _nearestWalkable(tx, ty, factionId) {
        const map = CatWar.Map;
        const cfg = CFG();

        // BFS outward in expanding rings
        for (let r = 1; r <= 10; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const nx = tx + dx;
                    const ny = ty + dy;
                    if (nx >= 0 && nx < cfg.MAP_WIDTH &&
                        ny >= 0 && ny < cfg.MAP_HEIGHT &&
                        map.isWalkable(nx, ny, factionId)) {
                        return { x: nx, y: ny };
                    }
                }
            }
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Group / Formation pathfinding
    // ═══════════════════════════════════════════════════════════════

    /**
     * Calculate paths for a group of units to a destination.
     * The leader follows the primary path; others get offset positions.
     *
     * @param {Array} units   Array of unit objects with {x, y} world positions
     * @param {number} destX  Target world X
     * @param {number} destY  Target world Y
     * @returns {Map<unit, Array>}  Map from unit reference to path waypoints
     */
    function findGroupPaths(units, destX, destY) {
        const cfg   = CFG();
        const map   = CatWar.Map;
        const ts    = cfg.TILE_SIZE;
        const space = cfg.PATHFINDING.FORMATION_SPACING;

        if (!map || units.length === 0) return new Map();

        const results = new Map();

        // Leader = unit closest to destination
        let leader = units[0];
        let bestDist = Infinity;
        for (const u of units) {
            const d = Math.hypot(u.x - destX, u.y - destY);
            if (d < bestDist) { bestDist = d; leader = u; }
        }

        // Convert destination to tiles
        const destTile = map.worldToTile(destX, destY);

        // Leader path
        const leaderTile = map.worldToTile(leader.x, leader.y);
        const leaderPath = findPath(leaderTile.tx, leaderTile.ty,
                                     destTile.tx, destTile.ty,
                                     { ignoreThrottle: true, factionId: leader.faction });
        results.set(leader, leaderPath);

        // Formation: arrange other units in a grid around the destination
        const others = units.filter(u => u !== leader);
        const cols   = Math.ceil(Math.sqrt(others.length + 1));
        let idx      = 0;

        for (const u of others) {
            idx++;
            const row = Math.floor(idx / cols);
            const col = idx % cols;
            const offsetX = (col - Math.floor(cols / 2)) * space;
            const offsetY = (row + 1) * space;  // behind the leader

            let targetTX = Math.round(destTile.tx + offsetX);
            let targetTY = Math.round(destTile.ty + offsetY);

            // Clamp to map
            targetTX = Math.max(0, Math.min(cfg.MAP_WIDTH  - 1, targetTX));
            targetTY = Math.max(0, Math.min(cfg.MAP_HEIGHT - 1, targetTY));

            // If not walkable, find nearby walkable
            if (!map.isWalkable(targetTX, targetTY, u.faction)) {
                const alt = _nearestWalkable(targetTX, targetTY, u.faction);
                if (alt) { targetTX = alt.x; targetTY = alt.y; }
            }

            const uTile = map.worldToTile(u.x, u.y);
            const uPath = findPath(uTile.tx, uTile.ty,
                                    targetTX, targetTY,
                                    { ignoreThrottle: true, factionId: u.faction });
            results.set(u, uPath);
        }

        return results;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Path caching helpers
    // ═══════════════════════════════════════════════════════════════

    /**
     * Check if a unit's cached path is still valid for the given destination.
     * @param {object} unit  Unit with .pathCache { destX, destY, path }
     * @param {number} destTX  Target tile X
     * @param {number} destTY  Target tile Y
     * @returns {boolean}
     */
    function isCacheValid(unit, destTX, destTY) {
        if (!unit.pathCache) return false;
        return unit.pathCache.destX === destTX && unit.pathCache.destY === destTY;
    }

    /**
     * Store a computed path on the unit for later reuse.
     */
    function cachePath(unit, destTX, destTY, path) {
        unit.pathCache = { destX: destTX, destY: destTY, path: path };
    }

    // ═══════════════════════════════════════════════════════════════
    //  Line-of-sight check (for advanced path smoothing / ranged)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Bresenham-based line-of-sight check between two tiles.
     * Returns true if there's a clear, walkable line.
     */
    function hasLineOfSight(x0, y0, x1, y1) {
        const map = CatWar.Map;
        if (!map) return false;

        let dx = Math.abs(x1 - x0);
        let dy = Math.abs(y1 - y0);
        let sx = x0 < x1 ? 1 : -1;
        let sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            if (!map.isWalkable(x0, y0)) return false;
            if (x0 === x1 && y0 === y1) return true;

            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 <  dx) { err += dx; y0 += sy; }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Distance utilities
    // ═══════════════════════════════════════════════════════════════

    /** Tile distance (octile). */
    function tileDistance(ax, ay, bx, by) {
        const dx = Math.abs(ax - bx);
        const dy = Math.abs(ay - by);
        const DIAG = CFG().PATHFINDING.DIAGONAL_COST;
        return (dx + dy) + (DIAG - 2) * Math.min(dx, dy);
    }

    /** World-pixel Euclidean distance. */
    function worldDistance(ax, ay, bx, by) {
        return Math.hypot(ax - bx, ay - by);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Public API
    // ═══════════════════════════════════════════════════════════════

    return {
        findPath,
        findGroupPaths,
        resetFrameCounter,

        isCacheValid,
        cachePath,
        hasLineOfSight,

        tileDistance,
        worldDistance
    };
})();
