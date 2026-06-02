/**
 * The Cat War - Camera System
 * ===========================
 * Orthographic camera with smooth scrolling, zoom, coordinate transforms,
 * frustum culling, and minimap rendering.
 *
 * Depends on: CatWar.Config
 */
window.CatWar = window.CatWar || {};

CatWar.Camera = (function () {
    'use strict';

    const CFG = () => CatWar.Config;

    // ─── State ───────────────────────────────────────────────────────
    let x = 0;               // world-space center of viewport
    let y = 0;
    let targetX = 0;         // smooth-move target
    let targetY = 0;
    let zoom = 1.0;
    let targetZoom = 1.0;

    let viewportW = 800;     // canvas pixel dimensions (updated on resize)
    let viewportH = 600;

    // Middle-mouse panning
    let isPanning = false;
    let panStartScreenX = 0;
    let panStartScreenY = 0;
    let panStartWorldX  = 0;
    let panStartWorldY  = 0;

    // ─── Initialisation ─────────────────────────────────────────────
    function init(canvasWidth, canvasHeight) {
        viewportW = canvasWidth;
        viewportH = canvasHeight;

        // Start camera at world centre
        const cfg = CFG();
        x = targetX = cfg.WORLD_WIDTH  / 2;
        y = targetY = cfg.WORLD_HEIGHT / 2;
        zoom = targetZoom = 1.0;
    }

    /** Call when the browser window / canvas resizes. */
    function resize(canvasWidth, canvasHeight) {
        viewportW = canvasWidth;
        viewportH = canvasHeight;
    }

    // ─── Update (call once per tick) ─────────────────────────────────
    function update(input) {
        const cfg = CFG();

        // --- Keyboard scrolling (WASD) ---
        let dx = 0, dy = 0;
        if (input && input.keys) {
            if (input.keys['w'] || input.keys['arrowup'])    dy -= cfg.CAMERA_SPEED;
            if (input.keys['s'] || input.keys['arrowdown'])  dy += cfg.CAMERA_SPEED;
            if (input.keys['a'] || input.keys['arrowleft'])  dx -= cfg.CAMERA_SPEED;
            if (input.keys['d'] || input.keys['arrowright']) dx += cfg.CAMERA_SPEED;
        }

        // --- Edge scrolling ---
        if (input && !isPanning) {
            const mx = input.screenX;
            const my = input.screenY;
            const zone = cfg.CAMERA_EDGE_SCROLL_ZONE;

            if (mx >= 0 && my >= 0) {
                if (mx < zone)              dx -= cfg.CAMERA_SPEED;
                if (mx > viewportW - zone)  dx += cfg.CAMERA_SPEED;
                if (my < zone)              dy -= cfg.CAMERA_SPEED;
                if (my > viewportH - zone)  dy += cfg.CAMERA_SPEED;
            }
        }

        // Apply scroll at current zoom level (scroll feels consistent
        // regardless of zoom by dividing by zoom)
        targetX += dx / zoom;
        targetY += dy / zoom;

        // --- Middle mouse panning ---
        if (isPanning && input) {
            const worldMouse = screenToWorld(input.screenX, input.screenY);
            // Counterintuitively we don't use worldMouse directly because
            // the camera is what we are moving.  Instead, keep the world
            // point that was under the mouse at pan-start pinned:
            targetX = panStartWorldX - (input.screenX - panStartScreenX) / zoom;
            targetY = panStartWorldY - (input.screenY - panStartScreenY) / zoom;
        }

        // --- Zoom interpolation ---
        zoom += (targetZoom - zoom) * 0.2;
        if (Math.abs(zoom - targetZoom) < 0.001) zoom = targetZoom;

        // --- Smooth position interpolation ---
        const lerp = cfg.CAMERA_LERP_FACTOR;
        x += (targetX - x) * lerp;
        y += (targetY - y) * lerp;

        // --- Clamp to world bounds ---
        _clamp();
    }

    function _clamp() {
        const cfg = CFG();
        const halfW = (viewportW / zoom) / 2;
        const halfH = (viewportH / zoom) / 2;

        // Don't let camera expose space outside map
        const minX = halfW;
        const minY = halfH;
        const maxX = cfg.WORLD_WIDTH  - halfW;
        const maxY = cfg.WORLD_HEIGHT - halfH;

        // If viewport is larger than world, center it
        if (minX > maxX) {
            x = targetX = cfg.WORLD_WIDTH / 2;
        } else {
            x      = Math.max(minX, Math.min(maxX, x));
            targetX = Math.max(minX, Math.min(maxX, targetX));
        }
        if (minY > maxY) {
            y = targetY = cfg.WORLD_HEIGHT / 2;
        } else {
            y      = Math.max(minY, Math.min(maxY, y));
            targetY = Math.max(minY, Math.min(maxY, targetY));
        }
    }

    // ─── Zoom controls ──────────────────────────────────────────────
    function zoomIn() {
        const cfg = CFG();
        targetZoom = Math.min(cfg.ZOOM_MAX, targetZoom + cfg.ZOOM_STEP);
    }

    function zoomOut() {
        const cfg = CFG();
        targetZoom = Math.max(cfg.ZOOM_MIN, targetZoom - cfg.ZOOM_STEP);
    }

    function setZoom(z) {
        const cfg = CFG();
        targetZoom = Math.max(cfg.ZOOM_MIN, Math.min(cfg.ZOOM_MAX, z));
    }

    // ─── Pan (middle-mouse) ─────────────────────────────────────────
    function startPan(screenMX, screenMY) {
        isPanning = true;
        panStartScreenX = screenMX;
        panStartScreenY = screenMY;
        panStartWorldX  = x;
        panStartWorldY  = y;
    }

    function stopPan() {
        isPanning = false;
    }

    // ─── Coordinate transforms ──────────────────────────────────────

    /** Convert screen (canvas) pixel position → world position. */
    function screenToWorld(sx, sy) {
        return {
            x: (sx - viewportW / 2) / zoom + x,
            y: (sy - viewportH / 2) / zoom + y
        };
    }

    /** Convert world position → screen (canvas) pixel position. */
    function worldToScreen(wx, wy) {
        return {
            x: (wx - x) * zoom + viewportW / 2,
            y: (wy - y) * zoom + viewportH / 2
        };
    }

    // ─── Culling ─────────────────────────────────────────────────────

    /**
     * Check if a world-space AABB is at least partially inside the viewport.
     * @param {number} wx   World X of the object's top-left
     * @param {number} wy   World Y of the object's top-left
     * @param {number} w    Width in world pixels
     * @param {number} h    Height in world pixels
     * @returns {boolean}
     */
    function isVisible(wx, wy, w, h) {
        const halfVW = viewportW / (2 * zoom);
        const halfVH = viewportH / (2 * zoom);

        const left   = x - halfVW;
        const right  = x + halfVW;
        const top    = y - halfVH;
        const bottom = y + halfVH;

        return (wx + w > left && wx < right && wy + h > top && wy < bottom);
    }

    /**
     * Return the visible tile range (inclusive).
     * Useful for rendering only the on-screen portion of the map.
     */
    function getVisibleTileRange() {
        const cfg = CFG();
        const halfVW = viewportW / (2 * zoom);
        const halfVH = viewportH / (2 * zoom);

        const startCol = Math.max(0, Math.floor((x - halfVW) / cfg.TILE_SIZE) - 1);
        const endCol   = Math.min(cfg.MAP_WIDTH  - 1, Math.ceil((x + halfVW) / cfg.TILE_SIZE) + 1);
        const startRow = Math.max(0, Math.floor((y - halfVH) / cfg.TILE_SIZE) - 1);
        const endRow   = Math.min(cfg.MAP_HEIGHT - 1, Math.ceil((y + halfVH) / cfg.TILE_SIZE) + 1);

        return { startCol, endCol, startRow, endRow };
    }

    // ─── Camera jump (for minimap click) ─────────────────────────────
    function jumpTo(worldX, worldY) {
        targetX = worldX;
        targetY = worldY;
        // Also snap current position close to avoid long lerp
        x = worldX;
        y = worldY;
        _clamp();
    }

    /** Center on a position with smooth movement. */
    function panTo(worldX, worldY) {
        targetX = worldX;
        targetY = worldY;
    }

    // ─── Apply transform to canvas context ──────────────────────────
    /**
     * Push the camera transform onto the canvas context.
     * Call ctx.save() before this and ctx.restore() after rendering world.
     */
    function applyTransform(ctx) {
        ctx.translate(viewportW / 2, viewportH / 2);
        ctx.scale(zoom, zoom);
        ctx.translate(-x, -y);
    }

    // ─── Minimap ─────────────────────────────────────────────────────

    /**
     * Render the minimap onto the given context.
     * @param {CanvasRenderingContext2D} ctx  The HUD / overlay context
     * @param {object} map   CatWar.Map instance (needs getTile, fogGrid)
     * @param {Array}  units Array of unit entities
     * @param {Array}  buildings Array of building entities
     * @param {string} playerFaction  Current player's faction id
     */
    function renderMinimap(ctx, map, units, buildings, playerFaction) {
        const cfg = CFG();
        const ui  = cfg.UI;
        const mmSize = ui.MINIMAP_SIZE;
        const mmPad  = ui.MINIMAP_PADDING;

        const mmX = mmPad;
        const mmY = viewportH - mmSize - mmPad;

        const scaleX = mmSize / cfg.MAP_WIDTH;
        const scaleY = mmSize / cfg.MAP_HEIGHT;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(mmX - 2, mmY - 2, mmSize + 4, mmSize + 4);

        // Terrain tiles
        if (map && map.grid) {
            for (let ty = 0; ty < cfg.MAP_HEIGHT; ty++) {
                for (let tx = 0; tx < cfg.MAP_WIDTH; tx++) {
                    const tileId  = map.grid[ty][tx];
                    const tKey    = cfg.TERRAIN_BY_ID[tileId];
                    const terrain = cfg.TERRAIN[tKey];

                    // Apply fog dimming
                    let alpha = 1;

                    ctx.globalAlpha = alpha;
                    ctx.fillStyle = terrain ? terrain.color : '#000';
                    ctx.fillRect(
                        mmX + tx * scaleX,
                        mmY + ty * scaleY,
                        Math.ceil(scaleX),
                        Math.ceil(scaleY)
                    );
                }
            }
            ctx.globalAlpha = 1;
        }

        // Buildings
        if (buildings) {
            for (let i = 0; i < buildings.length; i++) {
                const b = buildings[i];
                const bTile = map ? map.worldToTile(b.x, b.y) : { tx: b.x / cfg.TILE_SIZE, ty: b.y / cfg.TILE_SIZE };
                const faction = cfg.FACTIONS[b.faction];
                ctx.fillStyle = faction ? faction.primary : '#fff';
                ctx.fillRect(
                    mmX + bTile.tx * scaleX,
                    mmY + bTile.ty * scaleY,
                    Math.max(2, scaleX * 2),
                    Math.max(2, scaleY * 2)
                );
            }
        }

        // Units (small dots)
        if (units) {
            for (let i = 0; i < units.length; i++) {
                const u = units[i];
                const uTile = map ? map.worldToTile(u.x, u.y) : { tx: u.x / cfg.TILE_SIZE, ty: u.y / cfg.TILE_SIZE };
                const faction = cfg.FACTIONS[u.faction];
                ctx.fillStyle = faction ? faction.primary : '#fff';
                ctx.fillRect(
                    mmX + uTile.tx * scaleX,
                    mmY + uTile.ty * scaleY,
                    Math.max(1, scaleX),
                    Math.max(1, scaleY)
                );
            }
        }

        // Viewport rectangle
        const halfVW = viewportW / (2 * zoom);
        const halfVH = viewportH / (2 * zoom);
        const vpLeft   = ((x - halfVW) / cfg.TILE_SIZE) * scaleX;
        const vpTop    = ((y - halfVH) / cfg.TILE_SIZE) * scaleY;
        const vpWidth  = (viewportW / (zoom * cfg.TILE_SIZE)) * scaleX;
        const vpHeight = (viewportH / (zoom * cfg.TILE_SIZE)) * scaleY;

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mmX + vpLeft, mmY + vpTop, vpWidth, vpHeight);

        // Border
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.strokeRect(mmX - 2, mmY - 2, mmSize + 4, mmSize + 4);
    }

    /**
     * Handle a click on the minimap.  Returns true if the click was
     * within the minimap area and the camera was jumped.
     */
    function handleMinimapClick(screenMX, screenMY) {
        const cfg = CFG();
        const ui  = cfg.UI;
        const mmSize = ui.MINIMAP_SIZE;
        const mmPad  = ui.MINIMAP_PADDING;
        const mmX = mmPad;
        const mmY = viewportH - mmSize - mmPad;

        if (screenMX >= mmX && screenMX <= mmX + mmSize &&
            screenMY >= mmY && screenMY <= mmY + mmSize) {
            const relX = (screenMX - mmX) / mmSize;
            const relY = (screenMY - mmY) / mmSize;
            jumpTo(relX * cfg.WORLD_WIDTH, relY * cfg.WORLD_HEIGHT);
            return true;
        }
        return false;
    }

    // ─── Getters ────────────────────────────────────────────────────
    function getX()      { return x; }
    function getY()      { return y; }
    function getZoom()   { return zoom; }
    function getViewportWidth()  { return viewportW; }
    function getViewportHeight() { return viewportH; }

    // ─── Public API ──────────────────────────────────────────────────
    return {
        init,
        resize,
        update,

        zoomIn,
        zoomOut,
        setZoom,

        startPan,
        stopPan,

        screenToWorld,
        worldToScreen,
        isVisible,
        getVisibleTileRange,

        jumpTo,
        panTo,
        applyTransform,

        renderMinimap,
        handleMinimapClick,

        getX,
        getY,
        getZoom,
        getViewportWidth,
        getViewportHeight
    };
})();
