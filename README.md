# 🐱⚔️ The Cat War

An immersive, premium procedural Real-Time Strategy (RTS) game built entirely in vanilla HTML5, CSS, and Javascript. Command your feline army, claim territory, scout the fog of war, and defeat rival cat kingdoms!

## 🎮 Play Now
The game runs locally using any static file server.
To run:
```bash
npx http-server -p 8080 -o
```
Then open [http://localhost:8080](http://localhost:8080) in your browser!

---

## 🌟 Premium Features

*   🔭 **Scout Cats**: Special reconnaissance units equipped with spyglasses that can cut through the dense Fog of War, detect stealthy invaders, and reveal key strategic areas.
*   🧪 **Catnip Potions**: Elite Healers throw catnip potions at allies to drive them into a combat frenzy (+30% attack speed and movement speed).
*   ⛏️ **Head Miners**: Elite resource gathers equipped with golden pickaxes that mine 50% faster than standard peasant cats.
*   🌫️ **Fair Fog of War**: A realistic dual-layer fog system where even AI kingdoms are bound by the same fog restrictions and must actively scout to find you.
*   🏰 **Claimed Territory**: Claim and protect tiles near your structures. Constructing buildings expands your territory and permanently clears nearby fog.
*   💎 **Rich Ore Tiles**: Realistic resource distribution where gold (10%), stone (25%), and wood (35%) tiles have a chance of containing rich nodes with double harvesting yields.
*   🎵 **Procedural Web Audio SFX**: 17 unique, dynamically synthesized retro sound effects (meows, clashes, heals, construction tapping) with positional volume panning based on camera position. No heavy audio assets required!

---

## 🎭 The Cat Kingdoms (Factions)

Choose from 5 playable factions, each with its own distinct identity, aesthetic, and mechanics:

1.  👑 **Lion Cats** (Gold/Dark Red)
    *   *Lore*: "The proud Lion Cats rule from their golden fortress. Their warriors are the fiercest in all the kingdoms."
    *   *Bonus*: **+20% melee damage, +15% unit HP**. Extremely powerful in early-game rushes and front-line clashes.
2.  ⚡ **Siamese Cats** (Steel Blue/Silver)
    *   *Lore*: "Swift and cunning, the Siamese Cats strike like lightning and vanish before the enemy can react."
    *   *Bonus*: **+30% unit movement speed, +2 range for all ranged units**. Excels at skirmishing, hit-and-run tactics, and ranged harassment.
3.  🛡️ **Maine Coon Cats** (Sea Green/Saddle Brown)
    *   *Lore*: "The mighty Maine Coons build impregnable fortresses and crush their foes with devastating siege weapons."
    *   *Bonus*: **+25% siege damage, +20% building HP**. Designed for late-game defensive turtles and heavy catapult pushes.
4.  👥 **Black Cat Kingdom** (Purple/Near-Black)
    *   *Lore*: "The shadowy Black Cat Kingdom moves unseen through the night. Their enemies never hear the final meow."
    *   *Bonus*: **Stealth** (units remain completely invisible to enemies beyond 4 tiles until they attack) and **+20% first-strike damage**. Perfect for sneaky flank maneuvers and peasant hunting.
5.  💰 **Persian Cat Empire** (Ivory/Gold)
    *   *Lore*: "The wealthy Persian Empire crushes opposition through sheer economic might and endless armies."
    *   *Bonus*: **+30% resource gather rate, -15% unit training cost**. A boom faction capable of maintaining massive economies and overwhelming numbers.

---

## 🛠️ Advanced Game Systems

*   **A\* Pathfinding with Group Formations**: Smart 8-directional pathfinding with binary heap optimization, path smoothing, request throttling, and cohesive group/formation movement.
*   **Deep Economy System**: Manage 4 primary resources: **Gold, Wood, Stone, and Food**. Peasants automatically gather resources, walk to the closest drop-off point, and maintain a constant workflow. Keep your cats fed to prevent starvation!
*   **Fully Autonomous AI Opponents**: A full strategic FSM (Finite State Machine) brain for each faction. AI players gather resources, expand their economy, build barracks, stables, or workshops, train balanced armies, coordinate base defense, and orchestrate large-scale grouped attacks.
*   **Robust Combat Mechanics**: Advanced damage formula incorporating base damage, armor mitigation, type bonuses (e.g., Spearcats doing 2x damage against Cavalry), ranged projectile calculations, minimum ranges for siege weapons, and a friendly-fire immune AoE damage field.

---

## 📂 Codebase Architecture

The project is structured modularly:
*   `index.html`: Web entrance and canvas-binding script.
*   `css/style.css`: Sleek user interface styling with parchment aesthetic and medieval overlays.
*   `js/config.js`: Balanced game constants, unit stats, terrain movement costs, and faction settings.
*   `js/game.js`: Core game state machine, gameloop ticking at 60 FPS, entity management.
*   `js/map.js`: Procedural Perlin-like value noise map generator with rivers, resource deposits, and fog data structures.
*   `js/camera.js`: Orthographic viewport controls, smooth lerp movement, edge scrolling, mouse pan, zoom, and dynamic minimap drawing.
*   `js/input.js`: Comprehensive listener tracking mouse box selections, unit commands, hotkeys, and ghost building placement.
*   `js/pathfinding.js`: Highly optimized A* implementation with throttling and binary heap queues.
*   `js/renderer.js`: Double-buffered multi-layer rendering pipeline for terrain, shadows, units, projectiles, particles, selection decals, health bars, and fog overlays.
*   `js/sprites.js`: 100% procedural pixel-art visual engine drawing cute, expressive, animated cats and detailed historical buildings.
*   `js/entities.js`: Object-oriented architecture for Units and Buildings with integrated state-updating logic.
*   `js/units.js` & `js/buildings.js`: Custom factory spawn engines and unit-specific behaviors (miner gold pickaxes, catapult AoE, healers).
*   `js/combat.js`: Dynamic combat manager handling projectile updates, auto-aggro, armor, and damage bonuses.
*   `js/resources.js`: Economy managers overseeing deposits, consumption, and population limits.
*   `js/factions.js`: Multipliers, lore registries, and stat scaling for each feline country.
*   `js/ai.js`: Comprehensive AI logic orchestrating economic booms, military expansions, group rallies, and base defenses.
*   `js/ui.js`: Full-screen interfaces including interactive main menu, comprehensive faction selection board, detailed top bar resource counters, responsive command panels, and stats boards on victory/defeat.
*   `js/audio.js`: Synthesized Web Audio sound library simulating combat and environment sounds procedurally.
*   `js/particles.js`: Immersive particle emitters generating dust trails, battle sparks, healing glowing fields, construction smoke, and victory confetti.

---

*Made with love and meows.* 🐱👑
