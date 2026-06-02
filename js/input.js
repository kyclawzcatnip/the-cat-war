/**
 * The Cat War - Input System
 * ==========================
 * Handles mouse, keyboard, selection, commands, control groups,
 * and building placement mode.
 *
 * Depends on: CatWar.Config, CatWar.Camera, CatWar.Game (soft dep)
 */
window.CatWar = window.CatWar || {};

CatWar.Input = (function () {
    'use strict';

    const CFG = () => CatWar.Config;

    // ─── Raw state ──────────────────────────────────────────────────
    const keys         = {};     // key name (lowercase) → boolean
    let screenX        = -1;     // canvas-relative mouse position
    let screenY        = -1;
    let worldX         = 0;      // world-space mouse position
    let worldY         = 0;

    let leftDown       = false;
    let rightDown      = false;
    let middleDown     = false;

    // ─── Selection state ─────────────────────────────────────────────
    let selectedUnits     = [];     // references to selected unit objects
    let selectedBuilding  = null;   // at most one building selected
    let isDragging        = false;
    let dragStartX        = 0;      // screen coords of drag origin
    let dragStartY        = 0;
    let dragEndX          = 0;
    let dragEndY          = 0;
    const MIN_DRAG_DIST   = 5;      // px before we consider it a drag

    // ─── Command modes ──────────────────────────────────────────────
    let attackMoveMode    = false;  // 'A'-key attack-move cursor

    // ─── Building placement ─────────────────────────────────────────
    let buildMode         = false;
    let buildType         = null;   // string key into Config.BUILDINGS
    let buildValid        = false;  // current ghost position is valid

    // ─── Control groups ─────────────────────────────────────────────
    const controlGroups   = {};     // number → [unit refs]

    // ─── Event queue (consumed each tick by Game) ────────────────────
    // Commands produced this frame for the game loop to process.
    let commandQueue = [];

    // ═══════════════════════════════════════════════════════════════
    //  Initialisation
    // ═══════════════════════════════════════════════════════════════

    /** Bind DOM listeners to the supplied canvas element. */
    function init(canvas) {
        // --- Keyboard ---
        window.addEventListener('keydown', _onKeyDown);
        window.addEventListener('keyup',   _onKeyUp);

        // --- Mouse ---
        canvas.addEventListener('mousemove',   _onMouseMove);
        canvas.addEventListener('mousedown',   _onMouseDown);
        canvas.addEventListener('mouseup',     _onMouseUp);
        canvas.addEventListener('wheel',       _onWheel, { passive: false });
        canvas.addEventListener('contextmenu', e => e.preventDefault());

        // Track when the mouse leaves the canvas (stop edge scroll)
        canvas.addEventListener('mouseleave', () => {
            screenX = -1;
            screenY = -1;
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  Per-frame update — call early in the game loop
    // ═══════════════════════════════════════════════════════════════

    function update() {
        // Keep world coords in sync with camera each frame
        if (screenX >= 0 && screenY >= 0) {
            const w = CatWar.Camera.screenToWorld(screenX, screenY);
            worldX = w.x;
            worldY = w.y;
        }
    }

    /** Drain and return the command queue; game loop consumes these. */
    function drainCommands() {
        const cmds = commandQueue;
        commandQueue = [];
        return cmds;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Keyboard handlers
    // ═══════════════════════════════════════════════════════════════

    function _onKeyDown(e) {
        const key = e.key.toLowerCase();
        if (keys[key]) return; // ignore repeat
        keys[key] = true;

        const game = CatWar.Game;

        // --- Global shortcuts ---
        switch (key) {
            case 'escape':
                if (buildMode) {
                    cancelBuildMode();
                } else if (selectedUnits.length || selectedBuilding) {
                    deselectAll();
                } else if (game && game.state === 'PLAYING') {
                    game.togglePause();
                }
                return;

            case 'delete':
                // Kill selected units (player only)
                if (selectedUnits.length) {
                    _pushCommand({ type: 'DELETE_UNITS', units: [...selectedUnits] });
                }
                return;
        }

        // --- In-game only shortcuts (when playing) ---
        if (!game || game.state !== 'PLAYING') return;

        switch (key) {
            // Attack-move mode
            case 'a':
                attackMoveMode = true;
                break;

            // Stop
            case 's':
                if (!e.ctrlKey) {
                    _pushCommand({ type: 'STOP', units: [...selectedUnits] });
                }
                break;

            // Hold position
            case 'h':
                _pushCommand({ type: 'HOLD', units: [...selectedUnits] });
                break;

            // Quick-build shortcuts (1-5 → building types)
            case '1': case '2': case '3': case '4': case '5':
                if (e.ctrlKey && selectedUnits.length) {
                    // Ctrl+number → assign control group
                    controlGroups[key] = [...selectedUnits];
                } else if (!buildMode && selectedUnits.length === 0 && selectedBuilding === null) {
                    // Number with nothing selected → recall control group
                    _recallControlGroup(key);
                }
                break;

            case '6': case '7': case '8': case '9':
                if (e.ctrlKey && selectedUnits.length) {
                    controlGroups[key] = [...selectedUnits];
                } else {
                    _recallControlGroup(key);
                }
                break;
        }
    }

    function _onKeyUp(e) {
        keys[e.key.toLowerCase()] = false;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Mouse handlers
    // ═══════════════════════════════════════════════════════════════

    function _onMouseMove(e) {
        const rect = e.target.getBoundingClientRect();
        screenX = e.clientX - rect.left;
        screenY = e.clientY - rect.top;

        // Update hotbar hover state
        if (CatWar.Renderer && CatWar.Renderer.hotbarHandleHover) {
            CatWar.Renderer.hotbarHandleHover(screenX, screenY);
        }

        if (leftDown && !buildMode) {
            dragEndX = screenX;
            dragEndY = screenY;
            const dist = Math.hypot(dragEndX - dragStartX, dragEndY - dragStartY);
            if (dist > MIN_DRAG_DIST) {
                isDragging = true;
            }
        }

        // Update build-mode validity
        if (buildMode && buildType) {
            _updateBuildValidity();
        }
    }

    function _onMouseDown(e) {
        if (e.button === 0) {       // Left
            leftDown = true;
            dragStartX = screenX;
            dragStartY = screenY;
            dragEndX   = screenX;
            dragEndY   = screenY;
            isDragging = false;
        } else if (e.button === 1) { // Middle
            middleDown = true;
            CatWar.Camera.startPan(screenX, screenY);
        } else if (e.button === 2) { // Right
            rightDown = true;
        }
    }

    function _onMouseUp(e) {
        if (e.button === 0) {       // Left release
            leftDown = false;

            if (buildMode) {
                _handleBuildPlacement();
            } else if (isDragging) {
                _handleBoxSelect();
            } else if (attackMoveMode) {
                _handleAttackMove();
            } else {
                _handleLeftClick(e.shiftKey);
            }
            isDragging = false;
            attackMoveMode = false;

        } else if (e.button === 1) { // Middle release
            middleDown = false;
            CatWar.Camera.stopPan();

        } else if (e.button === 2) { // Right release
            rightDown = false;
            _handleRightClick();
        }
    }

    function _onWheel(e) {
        e.preventDefault();
        if (e.deltaY < 0) CatWar.Camera.zoomIn();
        else              CatWar.Camera.zoomOut();
    }

    // ═══════════════════════════════════════════════════════════════
    //  Click / selection logic
    // ═══════════════════════════════════════════════════════════════

    function _handleLeftClick(shiftHeld) {
        // Check scout popup first
        if (CatWar.Renderer && CatWar.Renderer.scoutPopupHandleClick &&
            CatWar.Renderer.scoutPopupHandleClick(screenX, screenY)) return;

        // Check training panel next
        if (CatWar.Renderer && CatWar.Renderer.trainPanelHandleClick &&
            CatWar.Renderer.trainPanelHandleClick(screenX, screenY)) return;

        // Check miner panel
        if (CatWar.Renderer && CatWar.Renderer.minerPanelHandleClick &&
            CatWar.Renderer.minerPanelHandleClick(screenX, screenY)) return;

        // Check transport panel
        if (CatWar.Renderer && CatWar.Renderer.transportPanelHandleClick &&
            CatWar.Renderer.transportPanelHandleClick(screenX, screenY)) return;

        // Check hotbar
        if (CatWar.Renderer && CatWar.Renderer.hotbarHandleClick &&
            CatWar.Renderer.hotbarHandleClick(screenX, screenY)) return;

        // Check minimap
        if (CatWar.Camera.handleMinimapClick(screenX, screenY)) return;

        const game = CatWar.Game;
        if (!game) return;

        const w = CatWar.Camera.screenToWorld(screenX, screenY);
        const clicked = game.getEntitiesAtPoint(w.x, w.y);

        if (!clicked) {
            if (!shiftHeld) deselectAll();
            return;
        }

        if (clicked.isUnit) {
            if (shiftHeld) {
                // Toggle in selection
                const idx = selectedUnits.indexOf(clicked);
                if (idx >= 0) {
                    selectedUnits.splice(idx, 1);
                    clicked.selected = false;
                } else if (selectedUnits.length < CFG().UI.MAX_SELECTION) {
                    selectedUnits.push(clicked);
                    clicked.selected = true;
                }
                selectedBuilding = null;
            } else {
                deselectAll();
                selectedUnits.push(clicked);
                clicked.selected = true;
            }
        } else if (clicked.isBuilding) {
            deselectAll();
            selectedBuilding = clicked;
            clicked.selected = true;
        }
    }

    function _handleBoxSelect() {
        const game = CatWar.Game;
        if (!game) return;

        // Convert drag rect to world coords
        const topLeft     = CatWar.Camera.screenToWorld(
            Math.min(dragStartX, dragEndX),
            Math.min(dragStartY, dragEndY)
        );
        const bottomRight = CatWar.Camera.screenToWorld(
            Math.max(dragStartX, dragEndX),
            Math.max(dragStartY, dragEndY)
        );

        const entities = game.getEntitiesInRect(
            topLeft.x, topLeft.y,
            bottomRight.x - topLeft.x,
            bottomRight.y - topLeft.y
        );

        if (!keys['shift']) deselectAll();

        const maxSel = CFG().UI.MAX_SELECTION;
        // Prefer player units
        const playerFaction = game.playerFaction;
        const friendlyUnits = entities.filter(e => e.isUnit && e.faction === playerFaction);
        const toSelect = friendlyUnits.length > 0 ? friendlyUnits : entities.filter(e => e.isUnit);

        for (let i = 0; i < toSelect.length && selectedUnits.length < maxSel; i++) {
            if (selectedUnits.indexOf(toSelect[i]) === -1) {
                selectedUnits.push(toSelect[i]);
                toSelect[i].selected = true;
            }
        }
    }

    function _handleRightClick() {
        // Don't issue commands when clicking over UI panels or modals
        if (CatWar.Renderer) {
            if (CatWar.Renderer.isOverScoutPopup && CatWar.Renderer.isOverScoutPopup(screenX, screenY)) {
                return;
            }
            if (CatWar.Renderer.isOverTrainPanel && CatWar.Renderer.isOverTrainPanel(screenX, screenY)) {
                return;
            }
            if (CatWar.Renderer.isOverMinerPanel && CatWar.Renderer.isOverMinerPanel(screenX, screenY)) {
                return;
            }
            if (CatWar.Renderer.isOverTransportPanel && CatWar.Renderer.isOverTransportPanel(screenX, screenY)) {
                return;
            }
            if (CatWar.Renderer.isOverHotbar && CatWar.Renderer.isOverHotbar(screenX, screenY)) {
                console.log('[INPUT] Right-click blocked by hotbar');
                return;
            }
        }

        if (selectedUnits.length === 0) {
            console.log('[INPUT] Right-click but no units selected');
            return;
        }
        const game = CatWar.Game;
        if (!game) return;
        console.log('[INPUT] Right-click with', selectedUnits.length, 'selected units at screen', screenX, screenY);

        const w = CatWar.Camera.screenToWorld(screenX, screenY);
        let target = game.getEntitiesAtPoint(w.x, w.y);

        // If target is a friendly unit (and not a transport ship), look "through" it
        if (target && !target.isBuilding && !target.isResource && target.faction === game.playerFaction && target.type !== 'TRANSPORT_SHIP') {
            const alt = game.getEntitiesAtPoint(w.x, w.y, { ignoreFriendlyUnits: true });
            if (alt) target = alt;
        }

        if (target && target.faction !== game.playerFaction) {
            // Right-click on enemy → attack
            _pushCommand({
                type:   'ATTACK',
                units:  [...selectedUnits],
                target: target
            });
        } else if (target && target.type === 'TRANSPORT_SHIP' && target.faction === game.playerFaction) {
            // Right-click on friendly transport ship → LOAD command
            _pushCommand({
                type:   'LOAD',
                units:  [...selectedUnits],
                target: target
            });
        } else if (target && target.isBuilding && target.faction === game.playerFaction) {
            // Right-click on own building → set rally point
            _pushCommand({
                type:     'SET_RALLY',
                building: target,
                x:        w.x,
                y:        w.y
            });
        } else if (target && target.isResource) {
            // Right-click on resource node → gather
            _pushCommand({
                type:   'GATHER',
                units:  [...selectedUnits],
                target: target
            });
        } else {
            // Right-click on ground → move
            _pushCommand({
                type:  'MOVE',
                units: [...selectedUnits],
                x:     w.x,
                y:     w.y
            });
        }
    }

    function _handleAttackMove() {
        if (selectedUnits.length === 0) return;
        const w = CatWar.Camera.screenToWorld(screenX, screenY);
        _pushCommand({
            type:  'ATTACK_MOVE',
            units: [...selectedUnits],
            x:     w.x,
            y:     w.y
        });
        attackMoveMode = false;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Control groups
    // ═══════════════════════════════════════════════════════════════

    function _recallControlGroup(key) {
        const group = controlGroups[key];
        if (!group || group.length === 0) return;

        // Remove dead units from the group
        controlGroups[key] = group.filter(u => u.alive !== false);
        if (controlGroups[key].length === 0) return;

        deselectAll();
        for (const unit of controlGroups[key]) {
            selectedUnits.push(unit);
            unit.selected = true;
        }

        // Double-tap to center camera on group
        // (tracked externally if needed — here we just select)
    }

    // ═══════════════════════════════════════════════════════════════
    //  Building placement
    // ═══════════════════════════════════════════════════════════════

    function enterBuildMode(buildingType) {
        buildMode  = true;
        buildType  = buildingType;
        buildValid = false;
        deselectAll();
    }

    function cancelBuildMode() {
        buildMode  = false;
        buildType  = null;
        buildValid = false;
    }

    function _updateBuildValidity() {
        const cfg  = CFG();
        const map  = CatWar.Map;
        const game = CatWar.Game;
        if (!map || !game || !buildType) { buildValid = false; return; }

        const bCfg = cfg.BUILDINGS[buildType];
        if (!bCfg) { buildValid = false; return; }

        const tile = map.worldToTile(worldX, worldY);
        buildValid = true;

        if (buildType === 'DOCK') {
            let hasWater = false;
            let hasLand = false;
            const size = bCfg.size;

            for (let dy = 0; dy < size.h; dy++) {
                for (let dx = 0; dx < size.w; dx++) {
                    const tx = tile.tx + dx;
                    const ty = tile.ty + dy;

                    if (tx < 0 || tx >= cfg.MAP_WIDTH || ty < 0 || ty >= cfg.MAP_HEIGHT) {
                        buildValid = false;
                        return;
                    }

                    const entities = game.getEntitiesAtPoint(
                        (tx + 0.5) * cfg.TILE_SIZE,
                        (ty + 0.5) * cfg.TILE_SIZE
                    );
                    if (entities && entities.isBuilding) {
                        buildValid = false;
                        return;
                    }

                    const tileId = map.grid[ty][tx];
                    const tKey = cfg.TERRAIN_BY_ID[tileId];
                    if (tKey === 'WATER') {
                        hasWater = true;
                    } else if (tKey === 'GRASS' || tKey === 'SAND' || tKey === 'FOREST' || tKey === 'ROAD') {
                        hasLand = true;
                    } else {
                        buildValid = false;
                        return;
                    }
                }
            }

            if (!hasWater || !hasLand) {
                buildValid = false;
            }
            return;
        }

        // Check every tile the building would occupy
        for (let dy = 0; dy < bCfg.size.h; dy++) {
            for (let dx = 0; dx < bCfg.size.w; dx++) {
                const tx = tile.tx + dx;
                const ty = tile.ty + dy;
                if (!map.isWalkable(tx, ty)) {
                    buildValid = false;
                    return;
                }
                // Check for overlapping buildings
                const entities = game.getEntitiesAtPoint(
                    (tx + 0.5) * cfg.TILE_SIZE,
                    (ty + 0.5) * cfg.TILE_SIZE
                );
                if (entities && entities.isBuilding) {
                    buildValid = false;
                    return;
                }
            }
        }
    }

    function _handleBuildPlacement() {
        if (!buildValid || !buildType) return;
        const cfg  = CFG();
        const map  = CatWar.Map;
        if (!map) return;

        const tile = map.worldToTile(worldX, worldY);

        _pushCommand({
            type:      'PLACE_BUILDING',
            building:  buildType,
            tileX:     tile.tx,
            tileY:     tile.ty
        });

        // Stay in build mode if shift is held (allows rapid placement)
        if (!keys['shift']) {
            cancelBuildMode();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  Selection helpers
    // ═══════════════════════════════════════════════════════════════

    function deselectAll() {
        for (const u of selectedUnits) u.selected = false;
        if (selectedBuilding) selectedBuilding.selected = false;
        selectedUnits    = [];
        selectedBuilding = null;
    }

    // ═══════════════════════════════════════════════════════════════
    //  Command queue helper
    // ═══════════════════════════════════════════════════════════════

    function _pushCommand(cmd) {
        commandQueue.push(cmd);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Drawing helpers (called by renderer)
    // ═══════════════════════════════════════════════════════════════

    /** Draw the rubber-band selection box if the player is dragging. */
    function drawSelectionBox(ctx) {
        if (!isDragging) return;
        const x = Math.min(dragStartX, dragEndX);
        const y = Math.min(dragStartY, dragEndY);
        const w = Math.abs(dragEndX - dragStartX);
        const h = Math.abs(dragEndY - dragStartY);

        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth   = 1;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
        ctx.fillRect(x, y, w, h);
    }

    /** Draw the building placement ghost (called in world-space after camera transform). */
    function drawBuildGhost(ctx) {
        if (!buildMode || !buildType) return;
        const cfg  = CFG();
        const map  = CatWar.Map;
        if (!map) return;

        const bCfg = cfg.BUILDINGS[buildType];
        if (!bCfg) return;

        const tile = map.worldToTile(worldX, worldY);
        const px   = tile.tx * cfg.TILE_SIZE;
        const py   = tile.ty * cfg.TILE_SIZE;
        const pw   = bCfg.size.w * cfg.TILE_SIZE;
        const ph   = bCfg.size.h * cfg.TILE_SIZE;

        ctx.globalAlpha = 0.5;
        ctx.fillStyle   = buildValid ? '#00ff00' : '#ff0000';
        ctx.fillRect(px, py, pw, ph);
        ctx.globalAlpha = 1;

        ctx.strokeStyle = buildValid ? '#00ff00' : '#ff0000';
        ctx.lineWidth   = 2;
        ctx.strokeRect(px, py, pw, ph);
    }

    // ═══════════════════════════════════════════════════════════════
    //  Public API
    // ═══════════════════════════════════════════════════════════════

    return {
        init,
        update,
        drainCommands,
        pushCommand: _pushCommand,

        // Raw state (read-only from outside)
        get keys()           { return keys; },
        get screenX()        { return screenX; },
        get screenY()        { return screenY; },
        get worldX()         { return worldX; },
        get worldY()         { return worldY; },
        get leftDown()       { return leftDown; },
        get rightDown()      { return rightDown; },
        get middleDown()     { return middleDown; },

        // Selection
        get selectedUnits()    { return selectedUnits; },
        get selectedBuilding() { return selectedBuilding; },
        deselectAll,

        // Modes
        get attackMoveMode() { return attackMoveMode; },
        get buildMode()      { return buildMode; },
        get buildType()      { return buildType; },
        get buildValid()     { return buildValid; },
        enterBuildMode,
        cancelBuildMode,

        // Drawing
        drawSelectionBox,
        drawBuildGhost
    };
})();
