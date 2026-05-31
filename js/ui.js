/**
 * THE CAT WAR - HUD & Menu Rendering System
 * Handles all UI drawing on top of the game canvas: menus, HUD, tooltips,
 * floating text, victory/defeat screens. Premium medieval parchment aesthetic.
 */
window.CatWar = window.CatWar || {};

(function () {
    'use strict';

    // ── Theme Constants ──────────────────────────────────────────────────
    const THEME = {
        // Parchment / Medieval palette
        parchment: '#F5E6C8',
        parchmentDark: '#D4B896',
        parchmentLight: '#FFF8EE',
        ink: '#2C1810',
        inkLight: '#5C3A28',
        gold: '#DAA520',
        goldLight: '#FFD700',
        goldDark: '#B8860B',
        darkBg: 'rgba(20, 12, 8, 0.85)',
        darkBgSolid: '#140C08',
        hudBg: 'rgba(30, 18, 10, 0.80)',
        hudBorder: '#8B6914',
        red: '#CC3333',
        green: '#33AA44',
        blue: '#4488CC',
        white: '#FFFFFF',
        shadow: 'rgba(0, 0, 0, 0.5)',

        // Fonts
        titleFont: 'bold 72px "Palatino Linotype", "Book Antiqua", Palatino, serif',
        subtitleFont: 'italic 24px "Palatino Linotype", "Book Antiqua", Palatino, serif',
        headerFont: 'bold 28px "Palatino Linotype", "Book Antiqua", Palatino, serif',
        bodyFont: '16px "Palatino Linotype", "Book Antiqua", Palatino, serif',
        smallFont: '13px "Palatino Linotype", "Book Antiqua", Palatino, serif',
        hudFont: 'bold 14px "Palatino Linotype", "Book Antiqua", Palatino, serif',
        buttonFont: 'bold 18px "Palatino Linotype", "Book Antiqua", Palatino, serif',
        resourceFont: 'bold 15px "Palatino Linotype", "Book Antiqua", Palatino, serif'
    };

    // ── Layout Constants ─────────────────────────────────────────────────
    const LAYOUT = {
        topBarHeight: 40,
        bottomBarHeight: 140,
        minimapSize: 180,        // width & height in bottom bar
        unitInfoWidth: 200,
        actionGridWidth: 300,
        actionGridCols: 4,
        actionGridRows: 3,
        buttonSize: 48,
        buttonPadding: 6,
        tooltipMaxWidth: 250
    };

    // ── Resource Icons (drawn procedurally) ──────────────────────────────
    const RESOURCE_ICONS = {
        gold: { color: '#FFD700', symbol: '●', label: 'Gold' },
        wood: { color: '#8B4513', symbol: '▪', label: 'Wood' },
        stone: { color: '#808080', symbol: '◆', label: 'Stone' },
        food: { color: '#DAA520', symbol: '✦', label: 'Food' }
    };

    // ── UI State ─────────────────────────────────────────────────────────
    const uiState = {
        screen: 'main_menu',     // 'main_menu', 'faction_select', 'in_game', 'victory', 'defeat'
        selectedFaction: 0,
        numOpponents: 1,
        difficulty: 'normal',
        hoveredButton: null,     // { id, x, y, w, h, tooltip }
        tooltip: null,           // { x, y, text, subtext, cost }
        floatingTexts: [],       // [{ x, y, text, color, alpha, vy, life }]
        buttons: [],             // Active clickable areas
        factionScrollOffset: 0,
        showBuildMenu: false,
        fps: 0,
        gameTime: 0
    };

    // ── Floating Text ────────────────────────────────────────────────────

    /**
     * Add a floating text that drifts upward and fades.
     */
    function addFloatingText(x, y, text, color, duration) {
        uiState.floatingTexts.push({
            x: x,
            y: y,
            text: String(text),
            color: color || THEME.white,
            alpha: 1.0,
            vy: -40,          // pixels per second upward
            life: duration || 1.5,
            maxLife: duration || 1.5
        });
    }

    /**
     * Update floating texts (call each frame).
     * @param {number} dt - Delta time in seconds.
     */
    function updateFloatingTexts(dt) {
        for (let i = uiState.floatingTexts.length - 1; i >= 0; i--) {
            const ft = uiState.floatingTexts[i];
            ft.y += ft.vy * dt;
            ft.life -= dt;
            ft.alpha = Math.max(0, ft.life / ft.maxLife);
            if (ft.life <= 0) {
                uiState.floatingTexts.splice(i, 1);
            }
        }
    }

    // ── Drawing Helpers ──────────────────────────────────────────────────

    function drawRoundedRect(ctx, x, y, w, h, r) {
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

    function drawParchmentPanel(ctx, x, y, w, h, opts) {
        const r = (opts && opts.radius) || 8;
        ctx.save();

        // Shadow
        ctx.shadowColor = THEME.shadow;
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        // Background
        drawRoundedRect(ctx, x, y, w, h, r);
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, THEME.parchmentLight);
        grad.addColorStop(0.5, THEME.parchment);
        grad.addColorStop(1, THEME.parchmentDark);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Border
        drawRoundedRect(ctx, x, y, w, h, r);
        ctx.strokeStyle = (opts && opts.borderColor) || THEME.goldDark;
        ctx.lineWidth = (opts && opts.borderWidth) || 2;
        ctx.stroke();

        // Inner decorative border
        if (!opts || !opts.noBorderInner) {
            drawRoundedRect(ctx, x + 4, y + 4, w - 8, h - 8, Math.max(1, r - 3));
            ctx.strokeStyle = THEME.gold + '40';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawMedievalButton(ctx, x, y, w, h, text, isHovered, isDisabled) {
        ctx.save();

        const r = 6;
        drawRoundedRect(ctx, x, y, w, h, r);

        if (isDisabled) {
            ctx.fillStyle = '#666';
        } else if (isHovered) {
            const grad = ctx.createLinearGradient(x, y, x, y + h);
            grad.addColorStop(0, '#FFE066');
            grad.addColorStop(1, THEME.goldDark);
            ctx.fillStyle = grad;
        } else {
            const grad = ctx.createLinearGradient(x, y, x, y + h);
            grad.addColorStop(0, THEME.gold);
            grad.addColorStop(1, '#8B6914');
            ctx.fillStyle = grad;
        }
        ctx.fill();

        // Border
        drawRoundedRect(ctx, x, y, w, h, r);
        ctx.strokeStyle = isHovered ? THEME.goldLight : THEME.inkLight;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Text
        ctx.fillStyle = isDisabled ? '#999' : THEME.ink;
        ctx.font = THEME.buttonFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + w / 2, y + h / 2 + 1);

        ctx.restore();
    }

    function drawHPBar(ctx, x, y, w, h, ratio, fgColor) {
        // Background
        ctx.fillStyle = '#333';
        ctx.fillRect(x, y, w, h);

        // Fill
        const color = fgColor || (ratio > 0.6 ? THEME.green : ratio > 0.3 ? '#CCAA00' : THEME.red);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w * Math.max(0, Math.min(1, ratio)), h);

        // Border
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
    }

    function drawCatSilhouette(ctx, x, y, size, color) {
        ctx.save();
        ctx.fillStyle = color || THEME.ink;

        const s = size;

        // Body (oval)
        ctx.beginPath();
        ctx.ellipse(x, y + s * 0.1, s * 0.35, s * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head (circle)
        ctx.beginPath();
        ctx.arc(x, y - s * 0.2, s * 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Left ear
        ctx.beginPath();
        ctx.moveTo(x - s * 0.15, y - s * 0.35);
        ctx.lineTo(x - s * 0.05, y - s * 0.55);
        ctx.lineTo(x + s * 0.02, y - s * 0.32);
        ctx.fill();

        // Right ear
        ctx.beginPath();
        ctx.moveTo(x + s * 0.15, y - s * 0.35);
        ctx.lineTo(x + s * 0.05, y - s * 0.55);
        ctx.lineTo(x - s * 0.02, y - s * 0.32);
        ctx.fill();

        // Tail
        ctx.beginPath();
        ctx.lineWidth = s * 0.06;
        ctx.strokeStyle = color || THEME.ink;
        ctx.moveTo(x + s * 0.3, y + s * 0.15);
        ctx.quadraticCurveTo(x + s * 0.55, y - s * 0.1, x + s * 0.45, y - s * 0.3);
        ctx.stroke();

        // Eyes
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(x - s * 0.08, y - s * 0.22, s * 0.035, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + s * 0.08, y - s * 0.22, s * 0.035, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    /**
     * Draw a Scout Cat icon — small nimble cat with spyglass.
     * @param {number} x - Center X.
     * @param {number} y - Center Y.
     * @param {number} size - Overall size.
     * @param {string} [color] - Primary color.
     */
    function drawScoutCatIcon(ctx, x, y, size, color) {
        ctx.save();
        const s = size;
        const catColor = color || '#C0C0C0';

        // Slim body (smaller, leaner than normal cat)
        ctx.fillStyle = catColor;
        ctx.beginPath();
        ctx.ellipse(x, y + s * 0.1, s * 0.25, s * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head (slightly smaller)
        ctx.beginPath();
        ctx.arc(x, y - s * 0.18, s * 0.16, 0, Math.PI * 2);
        ctx.fill();

        // Pointed ears (alert)
        ctx.beginPath();
        ctx.moveTo(x - s * 0.12, y - s * 0.30);
        ctx.lineTo(x - s * 0.04, y - s * 0.48);
        ctx.lineTo(x + s * 0.02, y - s * 0.28);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + s * 0.12, y - s * 0.30);
        ctx.lineTo(x + s * 0.04, y - s * 0.48);
        ctx.lineTo(x - s * 0.02, y - s * 0.28);
        ctx.fill();

        // Alert eyes
        ctx.fillStyle = '#00FF88';
        ctx.beginPath();
        ctx.arc(x - s * 0.06, y - s * 0.20, s * 0.03, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + s * 0.06, y - s * 0.20, s * 0.03, 0, Math.PI * 2);
        ctx.fill();

        // Spyglass — held from head extending outward
        ctx.strokeStyle = '#8B6914';
        ctx.lineWidth = s * 0.05;
        ctx.beginPath();
        ctx.moveTo(x + s * 0.10, y - s * 0.18);
        ctx.lineTo(x + s * 0.38, y - s * 0.30);
        ctx.stroke();

        // Spyglass lens (circle at end)
        ctx.fillStyle = '#4488CC';
        ctx.beginPath();
        ctx.arc(x + s * 0.40, y - s * 0.31, s * 0.06, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8B6914';
        ctx.lineWidth = s * 0.03;
        ctx.stroke();

        // Spyglass rim highlight
        ctx.fillStyle = '#AAD4FF';
        ctx.beginPath();
        ctx.arc(x + s * 0.38, y - s * 0.33, s * 0.02, 0, Math.PI * 2);
        ctx.fill();

        // Quick tail (shorter, alert posture)
        ctx.strokeStyle = catColor;
        ctx.lineWidth = s * 0.05;
        ctx.beginPath();
        ctx.moveTo(x + s * 0.22, y + s * 0.12);
        ctx.quadraticCurveTo(x + s * 0.35, y - s * 0.02, x + s * 0.28, y - s * 0.12);
        ctx.stroke();

        ctx.restore();
    }

    function drawResourceIcon(ctx, x, y, type, size) {
        const s = size || 16;
        ctx.save();

        switch (type) {
            case 'gold':
                // Gold coin
                ctx.fillStyle = '#FFD700';
                ctx.beginPath();
                ctx.arc(x + s / 2, y + s / 2, s * 0.42, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#B8860B';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.fillStyle = '#B8860B';
                ctx.font = `bold ${s * 0.55}px serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('G', x + s / 2, y + s / 2 + 1);
                break;

            case 'wood':
                // Wood log
                ctx.fillStyle = '#8B4513';
                drawRoundedRect(ctx, x + 2, y + s * 0.3, s - 4, s * 0.4, 3);
                ctx.fill();
                ctx.fillStyle = '#A0522D';
                ctx.beginPath();
                ctx.arc(x + s - 3, y + s * 0.5, s * 0.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#654321';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(x + s - 3, y + s * 0.5, s * 0.12, 0, Math.PI * 2);
                ctx.stroke();
                break;

            case 'stone':
                // Rock
                ctx.fillStyle = '#808080';
                ctx.beginPath();
                ctx.moveTo(x + s * 0.2, y + s * 0.8);
                ctx.lineTo(x + s * 0.1, y + s * 0.4);
                ctx.lineTo(x + s * 0.35, y + s * 0.15);
                ctx.lineTo(x + s * 0.7, y + s * 0.2);
                ctx.lineTo(x + s * 0.9, y + s * 0.5);
                ctx.lineTo(x + s * 0.75, y + s * 0.85);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = '#666';
                ctx.lineWidth = 1;
                ctx.stroke();
                break;

            case 'food':
                // Wheat
                ctx.fillStyle = '#DAA520';
                ctx.strokeStyle = '#8B6914';
                ctx.lineWidth = 1.5;
                // Stem
                ctx.beginPath();
                ctx.moveTo(x + s * 0.5, y + s * 0.9);
                ctx.lineTo(x + s * 0.5, y + s * 0.2);
                ctx.stroke();
                // Grain heads
                for (let i = 0; i < 3; i++) {
                    const angle = -0.4 + i * 0.4;
                    ctx.beginPath();
                    ctx.ellipse(
                        x + s * 0.5 + Math.sin(angle) * s * 0.12,
                        y + s * 0.25 + i * s * 0.08,
                        s * 0.06, s * 0.12, angle, 0, Math.PI * 2
                    );
                    ctx.fill();
                }
                break;

            case 'population':
                // Cat face
                ctx.fillStyle = '#DDD';
                ctx.beginPath();
                ctx.arc(x + s / 2, y + s * 0.55, s * 0.32, 0, Math.PI * 2);
                ctx.fill();
                // Ears
                ctx.beginPath();
                ctx.moveTo(x + s * 0.22, y + s * 0.35);
                ctx.lineTo(x + s * 0.3, y + s * 0.05);
                ctx.lineTo(x + s * 0.45, y + s * 0.3);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(x + s * 0.78, y + s * 0.35);
                ctx.lineTo(x + s * 0.7, y + s * 0.05);
                ctx.lineTo(x + s * 0.55, y + s * 0.3);
                ctx.fill();
                // Eyes
                ctx.fillStyle = '#333';
                ctx.beginPath();
                ctx.arc(x + s * 0.38, y + s * 0.48, s * 0.05, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(x + s * 0.62, y + s * 0.48, s * 0.05, 0, Math.PI * 2);
                ctx.fill();
                break;
        }

        ctx.restore();
    }

    // ── Screen Renderers ─────────────────────────────────────────────────

    /**
     * Draw the main menu screen.
     */
    function drawMainMenu(ctx) {
        const cw = ctx.canvas.width;
        const ch = ctx.canvas.height;

        uiState.buttons = [];

        // Dark parchment background
        ctx.fillStyle = THEME.darkBgSolid;
        ctx.fillRect(0, 0, cw, ch);

        // Subtle repeating pattern
        ctx.globalAlpha = 0.03;
        for (let px = 0; px < cw; px += 20) {
            for (let py = 0; py < ch; py += 20) {
                if ((px + py) % 40 === 0) {
                    ctx.fillStyle = THEME.gold;
                    ctx.fillRect(px, py, 2, 2);
                }
            }
        }
        ctx.globalAlpha = 1.0;

        // Decorative cat silhouettes
        ctx.globalAlpha = 0.08;
        drawCatSilhouette(ctx, cw * 0.15, ch * 0.5, 200, THEME.gold);
        drawCatSilhouette(ctx, cw * 0.85, ch * 0.5, 200, THEME.gold);
        ctx.globalAlpha = 1.0;

        // Title
        ctx.save();
        ctx.font = THEME.titleFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Title shadow
        ctx.fillStyle = '#000';
        ctx.fillText('THE CAT WAR', cw / 2 + 3, ch * 0.25 + 3);

        // Title outline
        ctx.strokeStyle = THEME.goldDark;
        ctx.lineWidth = 3;
        ctx.strokeText('THE CAT WAR', cw / 2, ch * 0.25);

        // Title fill
        const titleGrad = ctx.createLinearGradient(0, ch * 0.2, 0, ch * 0.3);
        titleGrad.addColorStop(0, THEME.goldLight);
        titleGrad.addColorStop(0.5, THEME.gold);
        titleGrad.addColorStop(1, THEME.goldDark);
        ctx.fillStyle = titleGrad;
        ctx.fillText('THE CAT WAR', cw / 2, ch * 0.25);

        // Subtitle
        ctx.font = THEME.subtitleFont;
        ctx.fillStyle = THEME.parchmentDark;
        ctx.fillText('Kingdoms of Fur & Steel', cw / 2, ch * 0.33);

        // Decorative line
        ctx.strokeStyle = THEME.gold + '60';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cw * 0.3, ch * 0.38);
        ctx.lineTo(cw * 0.7, ch * 0.38);
        ctx.stroke();

        // Diamond accent
        ctx.fillStyle = THEME.gold + '80';
        ctx.beginPath();
        ctx.moveTo(cw / 2, ch * 0.38 - 6);
        ctx.lineTo(cw / 2 + 6, ch * 0.38);
        ctx.lineTo(cw / 2, ch * 0.38 + 6);
        ctx.lineTo(cw / 2 - 6, ch * 0.38);
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        // Buttons
        const btnW = 260;
        const btnH = 50;
        const btnX = cw / 2 - btnW / 2;
        let btnY = ch * 0.48;

        const isNewGameHovered = uiState.hoveredButton && uiState.hoveredButton.id === 'new_skirmish';
        drawMedievalButton(ctx, btnX, btnY, btnW, btnH, 'New Skirmish', isNewGameHovered);
        uiState.buttons.push({
            id: 'new_skirmish', x: btnX, y: btnY, w: btnW, h: btnH,
            action: () => { uiState.screen = 'faction_select'; }
        });

        btnY += 70;
        const isHowToPlayHovered = uiState.hoveredButton && uiState.hoveredButton.id === 'how_to_play';
        drawMedievalButton(ctx, btnX, btnY, btnW, btnH, 'How to Play', isHowToPlayHovered);
        uiState.buttons.push({
            id: 'how_to_play', x: btnX, y: btnY, w: btnW, h: btnH,
            action: () => { /* TODO: show instructions */ }
        });

        // Version text
        ctx.font = THEME.smallFont;
        ctx.fillStyle = THEME.parchmentDark + '80';
        ctx.textAlign = 'center';
        ctx.fillText('v0.1 — All cats go to war', cw / 2, ch - 30);
    }

    /**
     * Draw faction selection screen.
     */
    function drawFactionSelect(ctx) {
        const cw = ctx.canvas.width;
        const ch = ctx.canvas.height;

        uiState.buttons = [];

        // Background
        ctx.fillStyle = THEME.darkBgSolid;
        ctx.fillRect(0, 0, cw, ch);

        // Header
        ctx.save();
        ctx.font = THEME.headerFont;
        ctx.textAlign = 'center';
        ctx.fillStyle = THEME.gold;
        ctx.fillText('Choose Your Kingdom', cw / 2, 50);
        ctx.restore();

        // Faction cards
        const factions = CatWar.Factions ? CatWar.Factions.getAllFactions() : [];
        const cardW = Math.min(200, (cw - 80) / Math.max(factions.length, 1) - 16);
        const cardH = 340;
        const totalCardsW = factions.length * (cardW + 12) - 12;
        const startX = (cw - totalCardsW) / 2;
        const cardY = 80;

        for (let i = 0; i < factions.length; i++) {
            const faction = factions[i];
            const cx = startX + i * (cardW + 12);
            const isSelected = uiState.selectedFaction === i;
            const isHovered = uiState.hoveredButton && uiState.hoveredButton.id === `faction_${i}`;

            // Card background
            drawParchmentPanel(ctx, cx, cardY, cardW, cardH, {
                borderColor: isSelected ? THEME.goldLight : THEME.goldDark,
                borderWidth: isSelected ? 3 : 1
            });

            // Selected glow
            if (isSelected) {
                ctx.save();
                ctx.shadowColor = THEME.goldLight;
                ctx.shadowBlur = 15;
                drawRoundedRect(ctx, cx, cardY, cardW, cardH, 8);
                ctx.strokeStyle = THEME.goldLight;
                ctx.lineWidth = 2;
                ctx.stroke();
                ctx.restore();
            }

            // Faction color stripe
            ctx.fillStyle = faction.colors.primary;
            ctx.fillRect(cx + 8, cardY + 8, cardW - 16, 6);
            ctx.fillStyle = faction.colors.secondary;
            ctx.fillRect(cx + 8, cardY + 14, cardW - 16, 3);

            // Cat portrait
            drawCatSilhouette(ctx, cx + cardW / 2, cardY + 70, 60, faction.colors.primary);

            // Faction name
            ctx.save();
            ctx.font = 'bold 15px "Palatino Linotype", serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = THEME.ink;
            ctx.fillText(faction.name, cx + cardW / 2, cardY + 120);
            ctx.restore();

            // Icon
            ctx.font = '24px serif';
            ctx.textAlign = 'center';
            ctx.fillText(faction.icon, cx + cardW / 2, cardY + 148);

            // Lore (wrapped)
            ctx.save();
            ctx.font = 'italic 11px "Palatino Linotype", serif';
            ctx.fillStyle = THEME.inkLight;
            ctx.textAlign = 'center';
            const loreLines = wrapText(ctx, faction.lore, cardW - 24);
            for (let l = 0; l < Math.min(loreLines.length, 4); l++) {
                ctx.fillText(loreLines[l], cx + cardW / 2, cardY + 168 + l * 14);
            }
            ctx.restore();

            // Strengths
            ctx.save();
            ctx.font = 'bold 11px "Palatino Linotype", serif';
            ctx.fillStyle = faction.colors.primary === '#FFFFF0' ? THEME.goldDark : faction.colors.primary;
            ctx.textAlign = 'center';
            const strengthText = faction.strengths.join(' • ');
            ctx.fillText(strengthText, cx + cardW / 2, cardY + cardH - 40);
            ctx.restore();

            // Bonus description
            ctx.save();
            ctx.font = '10px "Palatino Linotype", serif';
            ctx.fillStyle = THEME.inkLight;
            ctx.textAlign = 'center';
            const bonusText = _describeBonuses(faction.bonuses);
            const bonusLines = wrapText(ctx, bonusText, cardW - 20);
            for (let l = 0; l < Math.min(bonusLines.length, 2); l++) {
                ctx.fillText(bonusLines[l], cx + cardW / 2, cardY + cardH - 22 + l * 12);
            }
            ctx.restore();

            // Clickable area
            uiState.buttons.push({
                id: `faction_${i}`, x: cx, y: cardY, w: cardW, h: cardH,
                action: () => { uiState.selectedFaction = i; }
            });
        }

        // Opponent count selector
        const optY = cardY + cardH + 20;
        ctx.save();
        ctx.font = THEME.bodyFont;
        ctx.fillStyle = THEME.parchment;
        ctx.textAlign = 'center';
        ctx.fillText('AI Opponents:', cw / 2 - 100, optY + 18);
        ctx.restore();

        for (let n = 1; n <= 4; n++) {
            const nx = cw / 2 - 30 + (n - 1) * 48;
            const isNumHovered = uiState.hoveredButton && uiState.hoveredButton.id === `opponents_${n}`;
            const isNumSelected = uiState.numOpponents === n;

            drawMedievalButton(ctx, nx, optY, 40, 32, String(n), isNumHovered || isNumSelected);
            uiState.buttons.push({
                id: `opponents_${n}`, x: nx, y: optY, w: 40, h: 32,
                action: () => { uiState.numOpponents = n; }
            });
        }

        // Difficulty selector
        const diffY = optY + 44;
        ctx.save();
        ctx.font = THEME.bodyFont;
        ctx.fillStyle = THEME.parchment;
        ctx.textAlign = 'center';
        ctx.fillText('Difficulty:', cw / 2 - 115, diffY + 18);
        ctx.restore();

        const diffs = ['easy', 'normal', 'hard'];
        const diffLabels = ['Easy', 'Normal', 'Hard'];
        for (let d = 0; d < diffs.length; d++) {
            const dx = cw / 2 - 40 + d * 80;
            const isDiffHovered = uiState.hoveredButton && uiState.hoveredButton.id === `diff_${diffs[d]}`;
            const isDiffSelected = uiState.difficulty === diffs[d];

            drawMedievalButton(ctx, dx, diffY, 72, 32, diffLabels[d], isDiffHovered || isDiffSelected);
            uiState.buttons.push({
                id: `diff_${diffs[d]}`, x: dx, y: diffY, w: 72, h: 32,
                action: () => { uiState.difficulty = diffs[d]; }
            });
        }

        // Start Battle button
        const startBtnW = 220;
        const startBtnH = 50;
        const startBtnX = cw / 2 - startBtnW / 2;
        const startBtnY = diffY + 52;
        const isStartHovered = uiState.hoveredButton && uiState.hoveredButton.id === 'start_battle';

        drawMedievalButton(ctx, startBtnX, startBtnY, startBtnW, startBtnH,
            '⚔ Start Battle ⚔', isStartHovered);
        uiState.buttons.push({
            id: 'start_battle', x: startBtnX, y: startBtnY, w: startBtnW, h: startBtnH,
            action: () => {
                uiState.screen = 'in_game';
                const factions = CatWar.Factions ? CatWar.Factions.getAllFactions() : [];
                return {
                    type: 'start_game',
                    playerFaction: factions[uiState.selectedFaction] ? factions[uiState.selectedFaction].id : 'lion',
                    numOpponents: uiState.numOpponents,
                    difficulty: uiState.difficulty
                };
            }
        });

        // Back button
        const isBackHovered = uiState.hoveredButton && uiState.hoveredButton.id === 'back_to_menu';
        drawMedievalButton(ctx, 20, ch - 55, 100, 36, '← Back', isBackHovered);
        uiState.buttons.push({
            id: 'back_to_menu', x: 20, y: ch - 55, w: 100, h: 36,
            action: () => { uiState.screen = 'main_menu'; }
        });
    }

    /**
     * Draw the in-game HUD.
     * @param {object} gameState - Current game state with resources, selection, etc.
     */
    function drawHUD(ctx, gameState) {
        const cw = ctx.canvas.width;
        const ch = ctx.canvas.height;
        const gs = gameState || {};
        const resources = gs.resources || { gold: 0, wood: 0, stone: 0, food: 0 };
        const population = gs.population || { current: 0, max: 0 };
        const selection = gs.selection || null;
        const actions = gs.actions || [];

        uiState.buttons = [];

        // ── Top Bar ──────────────────────────────────────────────────────
        ctx.save();
        ctx.fillStyle = THEME.hudBg;
        ctx.fillRect(0, 0, cw, LAYOUT.topBarHeight);

        // Top bar border
        ctx.strokeStyle = THEME.hudBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, LAYOUT.topBarHeight);
        ctx.lineTo(cw, LAYOUT.topBarHeight);
        ctx.stroke();

        // Resources (left side)
        let rx = 16;
        const ry = 4;
        const resTypes = ['gold', 'wood', 'stone', 'food'];
        for (const resType of resTypes) {
            drawResourceIcon(ctx, rx, ry, resType, 18);
            ctx.font = THEME.resourceFont;
            ctx.fillStyle = THEME.parchment;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(resources[resType] || 0), rx + 22, LAYOUT.topBarHeight / 2);
            rx += 90;
        }

        // Population (center)
        const popX = cw / 2 - 40;
        drawResourceIcon(ctx, popX, ry, 'population', 18);
        ctx.font = THEME.resourceFont;
        ctx.fillStyle = THEME.parchment;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${population.current}/${population.max}`, popX + 22, LAYOUT.topBarHeight / 2);

        // Game time and FPS (right side)
        const timeStr = _formatGameTime(gs.gameTime || uiState.gameTime);
        ctx.font = THEME.hudFont;
        ctx.fillStyle = THEME.parchmentDark;
        ctx.textAlign = 'right';
        ctx.fillText(timeStr, cw - 16, LAYOUT.topBarHeight / 2 - 6);
        ctx.fillText(`FPS: ${uiState.fps}`, cw - 16, LAYOUT.topBarHeight / 2 + 10);

        ctx.restore();

        // ── Bottom Bar ───────────────────────────────────────────────────
        const bbY = ch - LAYOUT.bottomBarHeight;

        ctx.save();

        // Background with subtle parchment texture
        const bbGrad = ctx.createLinearGradient(0, bbY, 0, ch);
        bbGrad.addColorStop(0, 'rgba(30, 18, 10, 0.90)');
        bbGrad.addColorStop(0.1, 'rgba(40, 25, 15, 0.88)');
        bbGrad.addColorStop(1, 'rgba(25, 15, 8, 0.92)');
        ctx.fillStyle = bbGrad;
        ctx.fillRect(0, bbY, cw, LAYOUT.bottomBarHeight);

        // Top border
        ctx.strokeStyle = THEME.hudBorder;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, bbY);
        ctx.lineTo(cw, bbY);
        ctx.stroke();

        // Decorative gold line
        ctx.strokeStyle = THEME.gold + '30';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, bbY + 3);
        ctx.lineTo(cw, bbY + 3);
        ctx.stroke();

        ctx.restore();

        // ── Minimap (bottom-left) ────────────────────────────────────────
        const mmX = 10;
        const mmY = bbY + 8;
        const mmSize = LAYOUT.minimapSize - 16;

        // Minimap background
        ctx.save();
        ctx.fillStyle = '#1A3A1A';
        ctx.fillRect(mmX, mmY, mmSize, mmSize - 20);
        ctx.strokeStyle = THEME.hudBorder;
        ctx.lineWidth = 2;
        ctx.strokeRect(mmX, mmY, mmSize, mmSize - 20);

        // Draw minimap content if available
        if (gs.minimapData) {
            _drawMinimapContent(ctx, mmX, mmY, mmSize, mmSize - 20, gs.minimapData);
        }

        // Camera viewport rectangle on minimap
        if (gs.camera) {
            const mapW = gs.mapWidth || 2048;
            const mapH = gs.mapHeight || 2048;
            const vpX = mmX + (gs.camera.x / mapW) * mmSize;
            const vpY = mmY + (gs.camera.y / mapH) * (mmSize - 20);
            const vpW = (gs.camera.w / mapW) * mmSize;
            const vpH = (gs.camera.h / mapH) * (mmSize - 20);
            ctx.strokeStyle = THEME.white;
            ctx.lineWidth = 1;
            ctx.strokeRect(vpX, vpY, vpW, vpH);
        }
        ctx.restore();

        // Minimap label
        ctx.save();
        ctx.font = THEME.smallFont;
        ctx.fillStyle = THEME.parchmentDark;
        ctx.textAlign = 'center';
        ctx.fillText('Map', mmX + mmSize / 2, mmY + mmSize - 8);
        ctx.restore();

        // ── Selected Unit/Building Info (center-left) ────────────────────
        const infoX = mmX + mmSize + 16;
        const infoY = bbY + 8;
        const infoW = LAYOUT.unitInfoWidth;
        const infoH = LAYOUT.bottomBarHeight - 16;

        // Info panel background
        ctx.save();
        ctx.fillStyle = 'rgba(60, 40, 25, 0.5)';
        drawRoundedRect(ctx, infoX, infoY, infoW, infoH, 4);
        ctx.fill();
        ctx.strokeStyle = THEME.hudBorder + '80';
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, infoX, infoY, infoW, infoH, 4);
        ctx.stroke();
        ctx.restore();

        if (selection) {
            _drawSelectionInfo(ctx, infoX, infoY, infoW, infoH, selection);
        } else {
            ctx.save();
            ctx.font = THEME.smallFont;
            ctx.fillStyle = THEME.parchmentDark + '80';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('No selection', infoX + infoW / 2, infoY + infoH / 2);
            ctx.restore();
        }

        // ── Action Buttons (center-right) ────────────────────────────────
        const actX = infoX + infoW + 16;
        const actY = bbY + 8;
        const actW = LAYOUT.actionGridWidth;
        const actH = LAYOUT.bottomBarHeight - 16;

        // Action panel background
        ctx.save();
        ctx.fillStyle = 'rgba(60, 40, 25, 0.5)';
        drawRoundedRect(ctx, actX, actY, actW, actH, 4);
        ctx.fill();
        ctx.strokeStyle = THEME.hudBorder + '80';
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, actX, actY, actW, actH, 4);
        ctx.stroke();
        ctx.restore();

        if (actions.length > 0) {
            _drawActionButtons(ctx, actX + 6, actY + 6, actW - 12, actH - 12, actions);
        }

        // ── Utility Buttons (right side) ─────────────────────────────────
        const utilX = actX + actW + 16;
        const utilY = bbY + 10;
        const utilBtnW = 80;
        const utilBtnH = 36;

        // Idle Worker button
        const isIdleHovered = uiState.hoveredButton && uiState.hoveredButton.id === 'idle_worker';
        drawMedievalButton(ctx, utilX, utilY, utilBtnW, utilBtnH, 'Idle ⚒', isIdleHovered);
        uiState.buttons.push({
            id: 'idle_worker', x: utilX, y: utilY, w: utilBtnW, h: utilBtnH,
            tooltip: 'Select Idle Worker',
            action: () => ({ type: 'select_idle_worker' })
        });

        // Select All Army button
        const isArmyHovered = uiState.hoveredButton && uiState.hoveredButton.id === 'select_army';
        drawMedievalButton(ctx, utilX, utilY + utilBtnH + 8, utilBtnW, utilBtnH, 'Army ⚔', isArmyHovered);
        uiState.buttons.push({
            id: 'select_army', x: utilX, y: utilY + utilBtnH + 8, w: utilBtnW, h: utilBtnH,
            tooltip: 'Select All Army',
            action: () => ({ type: 'select_all_army' })
        });

        // Menu button
        const isMenuHovered = uiState.hoveredButton && uiState.hoveredButton.id === 'menu_btn';
        drawMedievalButton(ctx, utilX, utilY + (utilBtnH + 8) * 2, utilBtnW, utilBtnH, 'Menu', isMenuHovered);
        uiState.buttons.push({
            id: 'menu_btn', x: utilX, y: utilY + (utilBtnH + 8) * 2, w: utilBtnW, h: utilBtnH,
            action: () => ({ type: 'open_menu' })
        });
    }

    // ── HUD Sub-Renderers ────────────────────────────────────────────────

    function _drawSelectionInfo(ctx, x, y, w, h, selection) {
        ctx.save();

        // Portrait area
        const portraitSize = 48;
        const px = x + 10;
        const py = y + 10;

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(px, py, portraitSize, portraitSize);
        ctx.strokeStyle = THEME.hudBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, portraitSize, portraitSize);

        // Draw portrait based on entity type
        if (selection.entityType === 'unit' && selection.type === 'scout') {
            // Scout Cat gets unique spyglass portrait
            drawScoutCatIcon(ctx, px + portraitSize / 2, py + portraitSize / 2 + 5,
                portraitSize * 0.7, selection.factionColor || THEME.parchment);
        } else if (selection.entityType === 'unit') {
            drawCatSilhouette(ctx, px + portraitSize / 2, py + portraitSize / 2 + 5,
                portraitSize * 0.7, selection.factionColor || THEME.parchment);
        } else {
            // Building icon (simple house shape)
            ctx.fillStyle = selection.factionColor || THEME.parchment;
            ctx.beginPath();
            ctx.moveTo(px + portraitSize / 2, py + 8);
            ctx.lineTo(px + portraitSize - 6, py + 24);
            ctx.lineTo(px + portraitSize - 6, py + portraitSize - 6);
            ctx.lineTo(px + 6, py + portraitSize - 6);
            ctx.lineTo(px + 6, py + 24);
            ctx.closePath();
            ctx.fill();
        }

        // Name
        ctx.font = 'bold 13px "Palatino Linotype", serif';
        ctx.fillStyle = THEME.parchment;
        ctx.textAlign = 'left';
        ctx.fillText(selection.name || 'Unknown', px + portraitSize + 8, y + 22);

        // HP Bar
        const hpRatio = (selection.hp || 0) / (selection.maxHp || 1);
        drawHPBar(ctx, px + portraitSize + 8, y + 30, w - portraitSize - 28, 10, hpRatio);

        ctx.font = THEME.smallFont;
        ctx.fillStyle = THEME.parchmentDark;
        ctx.fillText(`${selection.hp || 0} / ${selection.maxHp || 0}`, px + portraitSize + 8, y + 52);

        // Stats
        let statY = y + 68;
        ctx.font = '12px "Palatino Linotype", serif';
        ctx.fillStyle = THEME.parchment;

        if (selection.damage != null) {
            ctx.fillText(`⚔ Dmg: ${selection.damage}`, x + 10, statY);
            statY += 16;
        }
        if (selection.armor != null) {
            ctx.fillText(`🛡 Armor: ${selection.armor}`, x + 10, statY);
            statY += 16;
        }
        if (selection.speed != null) {
            ctx.fillText(`👢 Speed: ${selection.speed.toFixed(1)}`, x + 10, statY);
            statY += 16;
        }
        if (selection.range != null && selection.range > 1) {
            ctx.fillText(`🏹 Range: ${selection.range}`, x + 10, statY);
            statY += 16;
        }
        if (selection.type === 'scout' && selection.visionRange != null) {
            ctx.fillStyle = '#00FF88';
            ctx.fillText(`👁 Vision: ${selection.visionRange}`, x + 10, statY);
            ctx.fillStyle = THEME.parchment;
            statY += 16;
        }

        // Construction progress for buildings
        if (selection.constructionProgress != null && selection.constructionProgress < 1) {
            ctx.fillStyle = THEME.parchmentDark;
            ctx.fillText('Building...', x + 10, statY);
            statY += 4;
            drawHPBar(ctx, x + 10, statY, w - 20, 8, selection.constructionProgress, THEME.blue);
            statY += 14;
            ctx.fillText(`${Math.round(selection.constructionProgress * 100)}%`, x + 10, statY);
        }

        // Training queue for buildings
        if (selection.trainingQueue && selection.trainingQueue.length > 0) {
            ctx.fillStyle = THEME.parchmentDark;
            ctx.fillText('Training:', x + 10, statY);
            statY += 14;
            for (let qi = 0; qi < Math.min(selection.trainingQueue.length, 5); qi++) {
                const qItem = selection.trainingQueue[qi];
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.fillRect(x + 10 + qi * 22, statY, 20, 20);
                ctx.strokeStyle = THEME.hudBorder;
                ctx.strokeRect(x + 10 + qi * 22, statY, 20, 20);
                ctx.fillStyle = THEME.parchment;
                ctx.font = '10px serif';
                ctx.textAlign = 'center';
                ctx.fillText(qItem.charAt(0).toUpperCase(), x + 20 + qi * 22, statY + 14);
            }
        }

        ctx.restore();
    }

    function _drawActionButtons(ctx, x, y, w, h, actions) {
        const cols = LAYOUT.actionGridCols;
        const rows = LAYOUT.actionGridRows;
        const btnSize = LAYOUT.buttonSize;
        const pad = LAYOUT.buttonPadding;

        for (let i = 0; i < Math.min(actions.length, cols * rows); i++) {
            const action = actions[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const bx = x + col * (btnSize + pad);
            const by = y + row * (btnSize + pad);

            const isHovered = uiState.hoveredButton && uiState.hoveredButton.id === `action_${i}`;
            const isDisabled = action.disabled || false;

            // Button background
            ctx.save();
            drawRoundedRect(ctx, bx, by, btnSize, btnSize, 4);

            if (isDisabled) {
                ctx.fillStyle = '#444';
            } else if (isHovered) {
                ctx.fillStyle = 'rgba(218, 165, 32, 0.4)';
            } else {
                ctx.fillStyle = 'rgba(80, 50, 30, 0.6)';
            }
            ctx.fill();

            ctx.strokeStyle = isHovered ? THEME.gold : THEME.hudBorder + '80';
            ctx.lineWidth = isHovered ? 2 : 1;
            drawRoundedRect(ctx, bx, by, btnSize, btnSize, 4);
            ctx.stroke();

            // Icon text (abbreviation)
            ctx.font = 'bold 16px serif';
            ctx.fillStyle = isDisabled ? '#777' : THEME.parchment;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(action.icon || action.label.charAt(0), bx + btnSize / 2, bx + btnSize / 2 - 4);

            // Short label
            ctx.font = '9px "Palatino Linotype", serif';
            ctx.fillText(action.label || '', bx + btnSize / 2, by + btnSize - 8);

            ctx.restore();

            // Register button
            uiState.buttons.push({
                id: `action_${i}`, x: bx, y: by, w: btnSize, h: btnSize,
                tooltip: action.tooltip || action.label,
                cost: action.cost,
                action: () => {
                    if (!action.disabled) {
                        return { type: 'action', actionId: action.id, action: action };
                    }
                    return null;
                }
            });
        }
    }

    function _drawMinimapContent(ctx, x, y, w, h, minimapData) {
        // Draw terrain colors
        if (minimapData.terrain) {
            ctx.drawImage(minimapData.terrain, x, y, w, h);
        }

        // Draw entity dots
        if (minimapData.entities) {
            for (const entity of minimapData.entities) {
                ctx.fillStyle = entity.color || '#FFF';
                const ex = x + (entity.x / (minimapData.mapWidth || 1)) * w;
                const ey = y + (entity.y / (minimapData.mapHeight || 1)) * h;
                const size = entity.entityType === 'building' ? 3 : 2;
                ctx.fillRect(ex - size / 2, ey - size / 2, size, size);
            }
        }
    }

    // ── Tooltips ─────────────────────────────────────────────────────────

    /**
     * Draw tooltip at specified position.
     */
    function drawTooltip(ctx, x, y, text, subtext, cost) {
        if (!text) return;

        ctx.save();
        ctx.font = THEME.bodyFont;

        // Measure text
        const lines = [text];
        let maxWidth = ctx.measureText(text).width;

        if (subtext) {
            ctx.font = THEME.smallFont;
            const subLines = wrapText(ctx, subtext, LAYOUT.tooltipMaxWidth - 20);
            lines.push(...subLines);
            for (const sl of subLines) {
                maxWidth = Math.max(maxWidth, ctx.measureText(sl).width);
            }
        }

        if (cost) {
            ctx.font = THEME.smallFont;
            const costLine = _formatCost(cost);
            lines.push(costLine);
            maxWidth = Math.max(maxWidth, ctx.measureText(costLine).width);
        }

        const ttW = maxWidth + 20;
        const ttH = lines.length * 18 + 12;

        // Clamp to screen
        let tx = x;
        let ty = y - ttH - 8;
        if (tx + ttW > ctx.canvas.width) tx = ctx.canvas.width - ttW - 4;
        if (ty < 0) ty = y + 20;
        if (tx < 0) tx = 4;

        // Background
        ctx.fillStyle = 'rgba(20, 12, 8, 0.92)';
        drawRoundedRect(ctx, tx, ty, ttW, ttH, 4);
        ctx.fill();

        // Gold border
        ctx.strokeStyle = THEME.gold;
        ctx.lineWidth = 1.5;
        drawRoundedRect(ctx, tx, ty, ttW, ttH, 4);
        ctx.stroke();

        // Text
        let textY = ty + 16;
        ctx.textAlign = 'left';

        // Title
        ctx.font = 'bold 14px "Palatino Linotype", serif';
        ctx.fillStyle = THEME.goldLight;
        ctx.fillText(lines[0], tx + 10, textY);
        textY += 18;

        // Subtext / cost lines
        ctx.font = THEME.smallFont;
        for (let i = 1; i < lines.length; i++) {
            const isLastCost = cost && i === lines.length - 1;
            ctx.fillStyle = isLastCost ? THEME.gold : THEME.parchmentDark;
            ctx.fillText(lines[i], tx + 10, textY);
            textY += 16;
        }

        ctx.restore();
    }

    /**
     * Draw all active floating texts.
     */
    function drawFloatingText(ctx) {
        ctx.save();
        for (const ft of uiState.floatingTexts) {
            ctx.globalAlpha = ft.alpha;
            ctx.font = 'bold 16px "Palatino Linotype", serif';
            ctx.textAlign = 'center';

            // Shadow
            ctx.fillStyle = '#000';
            ctx.fillText(ft.text, ft.x + 1, ft.y + 1);

            // Text
            ctx.fillStyle = ft.color;
            ctx.fillText(ft.text, ft.x, ft.y);
        }
        ctx.globalAlpha = 1.0;
        ctx.restore();
    }

    // ── Victory / Defeat Screens ─────────────────────────────────────────

    /**
     * Draw victory screen.
     * @param {object} stats - { unitsKilled, buildingsDestroyed, resourcesGathered }
     */
    function drawVictoryScreen(ctx, stats) {
        _drawEndScreen(ctx, 'VICTORY!', THEME.goldLight, stats);
    }

    /**
     * Draw defeat screen.
     * @param {object} stats
     */
    function drawDefeatScreen(ctx, stats) {
        _drawEndScreen(ctx, 'DEFEAT!', THEME.red, stats);
    }

    function _drawEndScreen(ctx, title, titleColor, stats) {
        const cw = ctx.canvas.width;
        const ch = ctx.canvas.height;
        stats = stats || {};

        uiState.buttons = [];

        // Overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, cw, ch);

        // Central panel
        const panelW = 400;
        const panelH = 350;
        const px = cw / 2 - panelW / 2;
        const py = ch / 2 - panelH / 2;

        drawParchmentPanel(ctx, px, py, panelW, panelH);

        // Title
        ctx.save();
        ctx.font = 'bold 52px "Palatino Linotype", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Glow effect
        ctx.shadowColor = titleColor;
        ctx.shadowBlur = 20;
        ctx.fillStyle = titleColor;
        ctx.fillText(title, cw / 2, py + 60);
        ctx.shadowBlur = 0;
        ctx.restore();

        // Stats
        ctx.save();
        ctx.font = THEME.bodyFont;
        ctx.textAlign = 'center';
        ctx.fillStyle = THEME.ink;

        let sy = py + 110;
        const statLines = [
            `Units Killed: ${stats.unitsKilled || 0}`,
            `Buildings Destroyed: ${stats.buildingsDestroyed || 0}`,
            `Resources Gathered: ${stats.resourcesGathered || 0}`,
            `Game Time: ${_formatGameTime(stats.gameTime || 0)}`
        ];

        for (const line of statLines) {
            ctx.fillText(line, cw / 2, sy);
            sy += 28;
        }
        ctx.restore();

        // Play Again button
        const btnW = 180;
        const btnH = 46;
        const btnX = cw / 2 - btnW / 2;
        const btnY = py + panelH - 70;
        const isHovered = uiState.hoveredButton && uiState.hoveredButton.id === 'play_again';

        drawMedievalButton(ctx, btnX, btnY, btnW, btnH, 'Play Again', isHovered);
        uiState.buttons.push({
            id: 'play_again', x: btnX, y: btnY, w: btnW, h: btnH,
            action: () => {
                uiState.screen = 'main_menu';
                return { type: 'restart' };
            }
        });
    }

    // ── Input Handling ───────────────────────────────────────────────────

    /**
     * Handle a click at canvas coordinates.
     * @param {number} x
     * @param {number} y
     * @param {object} [gameState]
     * @returns {object|null} Action result or null.
     */
    function handleClick(x, y, gameState) {
        // Play click sound
        if (CatWar.Audio) {
            CatWar.Audio.playSound('buttonClick');
        }

        for (const btn of uiState.buttons) {
            if (x >= btn.x && x <= btn.x + btn.w &&
                y >= btn.y && y <= btn.y + btn.h) {
                if (btn.action) {
                    return btn.action();
                }
            }
        }
        return null;
    }

    /**
     * Handle mouse hover to update tooltip state.
     * @param {number} x
     * @param {number} y
     */
    function handleHover(x, y) {
        uiState.hoveredButton = null;
        uiState.tooltip = null;

        for (const btn of uiState.buttons) {
            if (x >= btn.x && x <= btn.x + btn.w &&
                y >= btn.y && y <= btn.y + btn.h) {
                uiState.hoveredButton = btn;
                if (btn.tooltip) {
                    uiState.tooltip = {
                        x: x,
                        y: btn.y,
                        text: btn.tooltip,
                        cost: btn.cost
                    };
                }
                break;
            }
        }
    }

    /**
     * Check if a screen coordinate is within the HUD (should block game input).
     * @param {number} x
     * @param {number} y
     * @param {number} canvasHeight
     * @returns {boolean}
     */
    function isOverHUD(x, y, canvasHeight) {
        if (uiState.screen !== 'in_game') return true; // Menus block all input
        if (y <= LAYOUT.topBarHeight) return true;
        if (y >= canvasHeight - LAYOUT.bottomBarHeight) return true;
        return false;
    }

    // ── Utility Functions ────────────────────────────────────────────────

    function wrapText(ctx, text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let currentLine = '';

        for (const word of words) {
            const testLine = currentLine ? currentLine + ' ' + word : word;
            if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
    }

    function _formatGameTime(ms) {
        const totalSec = Math.floor((ms || 0) / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        return `${min}:${sec.toString().padStart(2, '0')}`;
    }

    function _formatCost(cost) {
        if (!cost) return '';
        const parts = [];
        if (cost.gold) parts.push(`Gold: ${cost.gold}`);
        if (cost.wood) parts.push(`Wood: ${cost.wood}`);
        if (cost.stone) parts.push(`Stone: ${cost.stone}`);
        if (cost.food) parts.push(`Food: ${cost.food}`);
        return parts.join(' | ');
    }

    function _describeBonuses(bonuses) {
        const parts = [];
        if (bonuses.meleeDamage > 1) parts.push(`+${Math.round((bonuses.meleeDamage - 1) * 100)}% melee dmg`);
        if (bonuses.unitHP > 1) parts.push(`+${Math.round((bonuses.unitHP - 1) * 100)}% HP`);
        if (bonuses.unitSpeed > 1) parts.push(`+${Math.round((bonuses.unitSpeed - 1) * 100)}% speed`);
        if (bonuses.rangeBonus > 0) parts.push(`+${bonuses.rangeBonus} range`);
        if (bonuses.siegeDamage > 1) parts.push(`+${Math.round((bonuses.siegeDamage - 1) * 100)}% siege`);
        if (bonuses.buildingHP > 1) parts.push(`+${Math.round((bonuses.buildingHP - 1) * 100)}% bldg HP`);
        if (bonuses.gatherRate > 1) parts.push(`+${Math.round((bonuses.gatherRate - 1) * 100)}% gather`);
        if (bonuses.unitCost < 1) parts.push(`-${Math.round((1 - bonuses.unitCost) * 100)}% cost`);
        if (bonuses.stealthRange > 0) parts.push(`stealth (${bonuses.stealthRange} tiles)`);
        if (bonuses.firstStrikeDamage > 1) parts.push(`+${Math.round((bonuses.firstStrikeDamage - 1) * 100)}% 1st strike`);
        return parts.join(', ');
    }

    // ── Main Draw Dispatcher ─────────────────────────────────────────────

    /**
     * Main draw call — dispatches to the appropriate screen renderer.
     * @param {CanvasRenderingContext2D} ctx
     * @param {object} [gameState]
     */
    function draw(ctx, gameState) {
        switch (uiState.screen) {
            case 'main_menu':
                drawMainMenu(ctx);
                break;
            case 'faction_select':
                drawFactionSelect(ctx);
                break;
            case 'in_game':
                drawHUD(ctx, gameState);
                break;
            case 'victory':
                drawVictoryScreen(ctx, gameState ? gameState.endStats : null);
                break;
            case 'defeat':
                drawDefeatScreen(ctx, gameState ? gameState.endStats : null);
                break;
        }

        // Draw tooltip if active
        if (uiState.tooltip) {
            drawTooltip(ctx, uiState.tooltip.x, uiState.tooltip.y,
                uiState.tooltip.text, uiState.tooltip.subtext, uiState.tooltip.cost);
        }

        // Draw floating texts (always, even over menus, for feedback)
        drawFloatingText(ctx);
    }

    // ── Export ────────────────────────────────────────────────────────────
    CatWar.UI = {
        // State
        state: uiState,
        THEME: THEME,
        LAYOUT: LAYOUT,

        // Main draw
        draw,

        // Individual screens
        drawMainMenu,
        drawFactionSelect,
        drawHUD,
        drawVictoryScreen,
        drawDefeatScreen,

        // Overlays
        drawTooltip,
        drawFloatingText,

        // Input
        handleClick,
        handleHover,
        isOverHUD,

        // Floating text
        addFloatingText,
        updateFloatingTexts,

        // Helpers
        drawCatSilhouette,
        drawScoutCatIcon,
        drawMedievalButton,
        drawParchmentPanel,
        drawHPBar,
        drawResourceIcon
    };

})();
