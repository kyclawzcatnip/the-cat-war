/**
 * THE CAT WAR - Procedural Audio System
 * Generates all sound effects using Web Audio API oscillators, noise, and envelopes.
 * No external audio files required.
 */
window.CatWar = window.CatWar || {};

(function () {
    'use strict';

    // ── Audio Manager ────────────────────────────────────────────────────

    class AudioManager {
        constructor() {
            this.ctx = null;           // AudioContext (lazy init)
            this.masterGain = null;
            this.masterVolume = 0.5;
            this.enabled = true;

            // Cooldown tracking: soundName -> { lastPlayed, count, resetTime }
            this.cooldowns = {};
            this.maxPlaysPerSecond = 5;

            // Camera position for positional audio
            this.cameraX = 0;
            this.cameraY = 0;
            this.cameraWidth = 1280;
            this.cameraHeight = 720;
        }

        /**
         * Initialize the AudioContext. Must be called after user interaction.
         */
        init() {
            if (this.ctx) return;

            try {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.value = this.masterVolume;
                this.masterGain.connect(this.ctx.destination);
            } catch (e) {
                console.warn('[Audio] Web Audio API not available:', e);
                this.enabled = false;
            }
        }

        /**
         * Resume AudioContext if suspended (required by browsers after user interaction).
         */
        resume() {
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        }

        /**
         * Set master volume.
         * @param {number} vol - Volume from 0.0 to 1.0.
         */
        setVolume(vol) {
            this.masterVolume = Math.max(0, Math.min(1, vol));
            if (this.masterGain) {
                this.masterGain.gain.value = this.masterVolume;
            }
        }

        /**
         * Update camera position for positional audio.
         * @param {number} x - Camera X.
         * @param {number} y - Camera Y.
         * @param {number} w - Camera width.
         * @param {number} h - Camera height.
         */
        updateCamera(x, y, w, h) {
            this.cameraX = x;
            this.cameraY = y;
            this.cameraWidth = w || 1280;
            this.cameraHeight = h || 720;
        }

        /**
         * Play a named sound with optional positional audio.
         * @param {string} soundName - Name of the sound to play.
         * @param {number} [x] - World X position.
         * @param {number} [y] - World Y position.
         * @param {object} [opts] - Additional options (e.g. pitch).
         */
        playSound(soundName, x, y, opts) {
            if (!this.enabled || !this.ctx) return;
            this.resume();

            // Cooldown check
            if (!this._checkCooldown(soundName)) return;

            // Calculate positional volume
            let volume = 1.0;
            if (x !== undefined && y !== undefined) {
                volume = this._getPositionalVolume(x, y);
                if (volume <= 0.01) return; // Too far away, skip
            }

            // Create a gain node for this sound
            const gainNode = this.ctx.createGain();
            gainNode.gain.value = volume;
            gainNode.connect(this.masterGain);

            // Dispatch to the appropriate sound generator
            const generator = this._generators[soundName];
            if (generator) {
                generator.call(this, gainNode, opts || {});
            } else {
                console.warn(`[Audio] Unknown sound: ${soundName}`);
            }
        }

        // ── Cooldown System ──────────────────────────────────────────────

        _checkCooldown(soundName) {
            const now = performance.now();
            let cd = this.cooldowns[soundName];

            if (!cd) {
                cd = { lastPlayed: 0, count: 0, resetTime: 0 };
                this.cooldowns[soundName] = cd;
            }

            // Reset count every second
            if (now - cd.resetTime > 1000) {
                cd.count = 0;
                cd.resetTime = now;
            }

            if (cd.count >= this.maxPlaysPerSecond) {
                return false;
            }

            cd.count++;
            cd.lastPlayed = now;
            return true;
        }

        // ── Positional Audio ─────────────────────────────────────────────

        _getPositionalVolume(x, y) {
            const cx = this.cameraX + this.cameraWidth / 2;
            const cy = this.cameraY + this.cameraHeight / 2;
            const dx = x - cx;
            const dy = y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Full volume within camera view, fade out beyond
            const maxDist = Math.max(this.cameraWidth, this.cameraHeight) * 1.5;
            const viewDist = Math.max(this.cameraWidth, this.cameraHeight) * 0.5;

            if (dist < viewDist) return 1.0;
            if (dist > maxDist) return 0.0;

            return 1.0 - (dist - viewDist) / (maxDist - viewDist);
        }

        // ── Utility: Create Nodes ────────────────────────────────────────

        _createOsc(type, frequency, output) {
            const osc = this.ctx.createOscillator();
            osc.type = type;
            osc.frequency.value = frequency;
            osc.connect(output);
            return osc;
        }

        _createNoiseBuffer(duration) {
            const sampleRate = this.ctx.sampleRate;
            const length = Math.floor(sampleRate * duration);
            const buffer = this.ctx.createBuffer(1, length, sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < length; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            return buffer;
        }

        _createNoise(duration, output) {
            const buffer = this._createNoiseBuffer(duration);
            const source = this.ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(output);
            return source;
        }

        _createEnvelope(output, attack, decay, sustain, release, duration) {
            const env = this.ctx.createGain();
            env.connect(output);
            const now = this.ctx.currentTime;
            env.gain.setValueAtTime(0, now);
            env.gain.linearRampToValueAtTime(1, now + attack);
            env.gain.linearRampToValueAtTime(sustain, now + attack + decay);
            env.gain.setValueAtTime(sustain, now + duration - release);
            env.gain.linearRampToValueAtTime(0, now + duration);
            return env;
        }

        // ── Sound Generators ─────────────────────────────────────────────

        get _generators() {
            return {
                meow: this._meow,
                swordClash: this._swordClash,
                arrowShoot: this._arrowShoot,
                arrowHit: this._arrowHit,
                catapultFire: this._catapultFire,
                buildingPlace: this._buildingPlace,
                constructionHammer: this._constructionHammer,
                goldCollect: this._goldCollect,
                woodChop: this._woodChop,
                stoneBreak: this._stoneBreak,
                unitDeath: this._unitDeath,
                victoryFanfare: this._victoryFanfare,
                defeatSound: this._defeatSound,
                buttonClick: this._buttonClick,
                errorSound: this._errorSound,
                healSound: this._healSound,
                chargeSound: this._chargeSound
            };
        }

        /**
         * Cat meow with variable pitch.
         */
        _meow(output, opts) {
            const now = this.ctx.currentTime;
            const pitch = opts.pitch || 1.0;
            const baseFreq = 600 * pitch;
            const duration = 0.35;

            // Main meow oscillator — frequency sweep up then down
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(baseFreq * 0.8, now);
            osc.frequency.linearRampToValueAtTime(baseFreq * 1.3, now + 0.08);
            osc.frequency.linearRampToValueAtTime(baseFreq * 1.1, now + 0.15);
            osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.6, now + duration);

            // Harmonics for "cat" quality
            const osc2 = this.ctx.createOscillator();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(baseFreq * 1.5, now);
            osc2.frequency.linearRampToValueAtTime(baseFreq * 2.0, now + 0.08);
            osc2.frequency.exponentialRampToValueAtTime(baseFreq * 0.9, now + duration);

            const harmGain = this.ctx.createGain();
            harmGain.gain.value = 0.3;
            osc2.connect(harmGain);

            // Envelope
            const env = this.ctx.createGain();
            env.gain.setValueAtTime(0, now);
            env.gain.linearRampToValueAtTime(0.6, now + 0.03);
            env.gain.setValueAtTime(0.6, now + 0.10);
            env.gain.linearRampToValueAtTime(0.4, now + 0.20);
            env.gain.exponentialRampToValueAtTime(0.01, now + duration);

            osc.connect(env);
            harmGain.connect(env);
            env.connect(output);

            osc.start(now);
            osc2.start(now);
            osc.stop(now + duration);
            osc2.stop(now + duration);
        }

        /**
         * Metallic sword clash.
         */
        _swordClash(output) {
            const now = this.ctx.currentTime;
            const duration = 0.2;

            // High-frequency metallic ring
            const osc1 = this.ctx.createOscillator();
            osc1.type = 'square';
            osc1.frequency.setValueAtTime(2200, now);
            osc1.frequency.exponentialRampToValueAtTime(800, now + duration);

            const osc2 = this.ctx.createOscillator();
            osc2.type = 'sawtooth';
            osc2.frequency.setValueAtTime(3100, now);
            osc2.frequency.exponentialRampToValueAtTime(600, now + duration);

            // Noise burst for impact
            const noise = this._createNoise(0.05, output);
            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.4, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            noise.disconnect();
            noise.connect(noiseGain);
            noiseGain.connect(output);

            const env = this.ctx.createGain();
            env.gain.setValueAtTime(0.5, now);
            env.gain.exponentialRampToValueAtTime(0.01, now + duration);

            osc1.connect(env);
            osc2.connect(env);
            env.connect(output);

            osc1.start(now);
            osc2.start(now);
            noise.start(now);
            osc1.stop(now + duration);
            osc2.stop(now + duration);
            noise.stop(now + 0.05);
        }

        /**
         * Arrow whoosh sound.
         */
        _arrowShoot(output) {
            const now = this.ctx.currentTime;
            const duration = 0.25;

            // Filtered noise whoosh
            const noise = this._createNoise(duration, output);
            noise.disconnect();

            const bandpass = this.ctx.createBiquadFilter();
            bandpass.type = 'bandpass';
            bandpass.frequency.setValueAtTime(1500, now);
            bandpass.frequency.linearRampToValueAtTime(4000, now + 0.05);
            bandpass.frequency.exponentialRampToValueAtTime(800, now + duration);
            bandpass.Q.value = 2;

            const env = this.ctx.createGain();
            env.gain.setValueAtTime(0, now);
            env.gain.linearRampToValueAtTime(0.3, now + 0.02);
            env.gain.exponentialRampToValueAtTime(0.01, now + duration);

            noise.connect(bandpass);
            bandpass.connect(env);
            env.connect(output);

            noise.start(now);
            noise.stop(now + duration);
        }

        /**
         * Arrow hit thud.
         */
        _arrowHit(output) {
            const now = this.ctx.currentTime;
            const duration = 0.15;

            // Low thud
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + duration);

            // Noise for impact texture
            const noise = this._createNoise(0.05, output);
            noise.disconnect();
            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.2, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            noise.connect(noiseGain);
            noiseGain.connect(output);

            const env = this.ctx.createGain();
            env.gain.setValueAtTime(0.4, now);
            env.gain.exponentialRampToValueAtTime(0.01, now + duration);

            osc.connect(env);
            env.connect(output);

            osc.start(now);
            noise.start(now);
            osc.stop(now + duration);
            noise.stop(now + 0.05);
        }

        /**
         * Catapult fire — heavy thud followed by whoosh.
         */
        _catapultFire(output) {
            const now = this.ctx.currentTime;

            // Phase 1: Heavy thud (creak & release)
            const thudOsc = this.ctx.createOscillator();
            thudOsc.type = 'sine';
            thudOsc.frequency.setValueAtTime(100, now);
            thudOsc.frequency.exponentialRampToValueAtTime(30, now + 0.2);

            const thudEnv = this.ctx.createGain();
            thudEnv.gain.setValueAtTime(0.6, now);
            thudEnv.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            thudOsc.connect(thudEnv);
            thudEnv.connect(output);

            // Creak
            const creak = this.ctx.createOscillator();
            creak.type = 'sawtooth';
            creak.frequency.setValueAtTime(200, now);
            creak.frequency.linearRampToValueAtTime(400, now + 0.1);
            const creakGain = this.ctx.createGain();
            creakGain.gain.setValueAtTime(0.1, now);
            creakGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            creak.connect(creakGain);
            creakGain.connect(output);

            // Phase 2: Whoosh (delayed)
            const whooshDelay = 0.15;
            const noise = this._createNoise(0.4, output);
            noise.disconnect();
            const bandpass = this.ctx.createBiquadFilter();
            bandpass.type = 'bandpass';
            bandpass.frequency.setValueAtTime(600, now + whooshDelay);
            bandpass.frequency.linearRampToValueAtTime(2000, now + whooshDelay + 0.1);
            bandpass.frequency.exponentialRampToValueAtTime(400, now + whooshDelay + 0.35);
            bandpass.Q.value = 1.5;

            const whooshEnv = this.ctx.createGain();
            whooshEnv.gain.setValueAtTime(0, now);
            whooshEnv.gain.setValueAtTime(0, now + whooshDelay);
            whooshEnv.gain.linearRampToValueAtTime(0.35, now + whooshDelay + 0.05);
            whooshEnv.gain.exponentialRampToValueAtTime(0.01, now + whooshDelay + 0.35);

            noise.connect(bandpass);
            bandpass.connect(whooshEnv);
            whooshEnv.connect(output);

            thudOsc.start(now);
            creak.start(now);
            noise.start(now);
            thudOsc.stop(now + 0.25);
            creak.stop(now + 0.15);
            noise.stop(now + 0.55);
        }

        /**
         * Building placement — wooden thud.
         */
        _buildingPlace(output) {
            const now = this.ctx.currentTime;
            const duration = 0.3;

            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + duration);

            // Wood resonance
            const osc2 = this.ctx.createOscillator();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(350, now);
            osc2.frequency.exponentialRampToValueAtTime(120, now + duration * 0.6);

            const env = this.ctx.createGain();
            env.gain.setValueAtTime(0.5, now);
            env.gain.exponentialRampToValueAtTime(0.01, now + duration);

            const env2 = this.ctx.createGain();
            env2.gain.setValueAtTime(0.2, now);
            env2.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.5);

            osc.connect(env);
            osc2.connect(env2);
            env.connect(output);
            env2.connect(output);

            osc.start(now);
            osc2.start(now);
            osc.stop(now + duration);
            osc2.stop(now + duration);
        }

        /**
         * Construction hammer tapping.
         */
        _constructionHammer(output) {
            const now = this.ctx.currentTime;

            // Single hammer tap
            const osc = this.ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);

            const noise = this._createNoise(0.03, output);
            noise.disconnect();
            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.15, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.03);
            noise.connect(noiseGain);
            noiseGain.connect(output);

            const env = this.ctx.createGain();
            env.gain.setValueAtTime(0.3, now);
            env.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

            osc.connect(env);
            env.connect(output);

            osc.start(now);
            noise.start(now);
            osc.stop(now + 0.1);
            noise.stop(now + 0.03);
        }

        /**
         * Gold coin collect clink.
         */
        _goldCollect(output) {
            const now = this.ctx.currentTime;

            // High-pitched metallic clink
            const osc1 = this.ctx.createOscillator();
            osc1.type = 'sine';
            osc1.frequency.value = 2400;

            const osc2 = this.ctx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.value = 3200;

            const env = this.ctx.createGain();
            env.gain.setValueAtTime(0.3, now);
            env.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

            const env2 = this.ctx.createGain();
            env2.gain.setValueAtTime(0.15, now + 0.03);
            env2.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

            osc1.connect(env);
            osc2.connect(env2);
            env.connect(output);
            env2.connect(output);

            osc1.start(now);
            osc2.start(now + 0.03);
            osc1.stop(now + 0.2);
            osc2.stop(now + 0.25);
        }

        /**
         * Wood chopping sound.
         */
        _woodChop(output) {
            const now = this.ctx.currentTime;
            const duration = 0.15;

            // Impact
            const noise = this._createNoise(0.06, output);
            noise.disconnect();

            const highpass = this.ctx.createBiquadFilter();
            highpass.type = 'highpass';
            highpass.frequency.value = 1000;

            const env = this.ctx.createGain();
            env.gain.setValueAtTime(0.35, now);
            env.gain.exponentialRampToValueAtTime(0.01, now + 0.06);

            noise.connect(highpass);
            highpass.connect(env);
            env.connect(output);

            // Wood resonance
            const osc = this.ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(250, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + duration);

            const woodEnv = this.ctx.createGain();
            woodEnv.gain.setValueAtTime(0.25, now);
            woodEnv.gain.exponentialRampToValueAtTime(0.01, now + duration);

            osc.connect(woodEnv);
            woodEnv.connect(output);

            noise.start(now);
            osc.start(now);
            noise.stop(now + 0.06);
            osc.stop(now + duration);
        }

        /**
         * Stone breaking sound.
         */
        _stoneBreak(output) {
            const now = this.ctx.currentTime;
            const duration = 0.2;

            // Noise burst
            const noise = this._createNoise(duration, output);
            noise.disconnect();

            const bandpass = this.ctx.createBiquadFilter();
            bandpass.type = 'bandpass';
            bandpass.frequency.value = 2000;
            bandpass.Q.value = 0.5;

            const env = this.ctx.createGain();
            env.gain.setValueAtTime(0.4, now);
            env.gain.exponentialRampToValueAtTime(0.01, now + duration);

            noise.connect(bandpass);
            bandpass.connect(env);
            env.connect(output);

            // Low rumble
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + duration);

            const rumbleEnv = this.ctx.createGain();
            rumbleEnv.gain.setValueAtTime(0.3, now);
            rumbleEnv.gain.exponentialRampToValueAtTime(0.01, now + duration);

            osc.connect(rumbleEnv);
            rumbleEnv.connect(output);

            noise.start(now);
            osc.start(now);
            noise.stop(now + duration);
            osc.stop(now + duration);
        }

        /**
         * Unit death — sad meow.
         */
        _unitDeath(output) {
            const now = this.ctx.currentTime;
            const duration = 0.5;

            // Descending sad meow
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(700, now);
            osc.frequency.linearRampToValueAtTime(500, now + 0.1);
            osc.frequency.exponentialRampToValueAtTime(200, now + duration);

            const osc2 = this.ctx.createOscillator();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(1050, now);
            osc2.frequency.exponentialRampToValueAtTime(300, now + duration);

            const harmGain = this.ctx.createGain();
            harmGain.gain.value = 0.2;
            osc2.connect(harmGain);

            const env = this.ctx.createGain();
            env.gain.setValueAtTime(0, now);
            env.gain.linearRampToValueAtTime(0.5, now + 0.04);
            env.gain.setValueAtTime(0.5, now + 0.15);
            env.gain.exponentialRampToValueAtTime(0.01, now + duration);

            osc.connect(env);
            harmGain.connect(env);
            env.connect(output);

            osc.start(now);
            osc2.start(now);
            osc.stop(now + duration);
            osc2.stop(now + duration);
        }

        /**
         * Victory fanfare — triumphant chord + meow chorus.
         */
        _victoryFanfare(output) {
            const now = this.ctx.currentTime;

            // Triumphant major chord (C-E-G-C)
            const freqs = [262, 330, 392, 523];
            const chordDuration = 1.5;

            for (let i = 0; i < freqs.length; i++) {
                const osc = this.ctx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.value = freqs[i];

                const env = this.ctx.createGain();
                const delay = i * 0.08;
                env.gain.setValueAtTime(0, now + delay);
                env.gain.linearRampToValueAtTime(0.2, now + delay + 0.1);
                env.gain.setValueAtTime(0.2, now + delay + chordDuration - 0.3);
                env.gain.linearRampToValueAtTime(0, now + delay + chordDuration);

                osc.connect(env);
                env.connect(output);
                osc.start(now + delay);
                osc.stop(now + delay + chordDuration);
            }

            // Meow chorus (staggered meows at different pitches)
            const meowPitches = [0.9, 1.0, 1.1, 1.2];
            for (let i = 0; i < meowPitches.length; i++) {
                const delay = 0.8 + i * 0.15;
                setTimeout(() => {
                    this._meow(output, { pitch: meowPitches[i] });
                }, delay * 1000);
            }
        }

        /**
         * Defeat sound — sad descending tone.
         */
        _defeatSound(output) {
            const now = this.ctx.currentTime;
            const duration = 2.0;

            // Minor chord descending
            const freqs = [330, 294, 262, 220];
            for (let i = 0; i < freqs.length; i++) {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                const start = i * 0.4;
                osc.frequency.setValueAtTime(freqs[i], now + start);
                osc.frequency.exponentialRampToValueAtTime(freqs[i] * 0.7, now + start + 0.5);

                const env = this.ctx.createGain();
                env.gain.setValueAtTime(0, now + start);
                env.gain.linearRampToValueAtTime(0.25, now + start + 0.05);
                env.gain.exponentialRampToValueAtTime(0.01, now + start + 0.5);

                osc.connect(env);
                env.connect(output);
                osc.start(now + start);
                osc.stop(now + start + 0.5);
            }

            // Low rumble underneath
            const bass = this.ctx.createOscillator();
            bass.type = 'sine';
            bass.frequency.setValueAtTime(80, now);
            bass.frequency.exponentialRampToValueAtTime(40, now + duration);

            const bassEnv = this.ctx.createGain();
            bassEnv.gain.setValueAtTime(0, now);
            bassEnv.gain.linearRampToValueAtTime(0.15, now + 0.2);
            bassEnv.gain.exponentialRampToValueAtTime(0.01, now + duration);

            bass.connect(bassEnv);
            bassEnv.connect(output);
            bass.start(now);
            bass.stop(now + duration);
        }

        /**
         * UI button click.
         */
        _buttonClick(output) {
            const now = this.ctx.currentTime;

            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = 1000;

            const env = this.ctx.createGain();
            env.gain.setValueAtTime(0.2, now);
            env.gain.exponentialRampToValueAtTime(0.01, now + 0.06);

            osc.connect(env);
            env.connect(output);
            osc.start(now);
            osc.stop(now + 0.06);
        }

        /**
         * Error / denial buzz.
         */
        _errorSound(output) {
            const now = this.ctx.currentTime;
            const duration = 0.25;

            // Low buzz
            const osc = this.ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.value = 150;

            const osc2 = this.ctx.createOscillator();
            osc2.type = 'square';
            osc2.frequency.value = 155; // Slight detune for buzz

            const env = this.ctx.createGain();
            env.gain.setValueAtTime(0, now);
            env.gain.linearRampToValueAtTime(0.25, now + 0.02);
            env.gain.setValueAtTime(0.25, now + duration * 0.7);
            env.gain.linearRampToValueAtTime(0, now + duration);

            osc.connect(env);
            osc2.connect(env);
            env.connect(output);

            osc.start(now);
            osc2.start(now);
            osc.stop(now + duration);
            osc2.stop(now + duration);
        }

        /**
         * Heal sound — magical shimmer.
         */
        _healSound(output) {
            const now = this.ctx.currentTime;
            const duration = 0.6;

            // Ascending sparkle
            for (let i = 0; i < 5; i++) {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                const freq = 800 + i * 300;
                const delay = i * 0.08;

                osc.frequency.setValueAtTime(freq, now + delay);
                osc.frequency.linearRampToValueAtTime(freq * 1.2, now + delay + 0.15);

                const env = this.ctx.createGain();
                env.gain.setValueAtTime(0, now + delay);
                env.gain.linearRampToValueAtTime(0.15, now + delay + 0.03);
                env.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.2);

                osc.connect(env);
                env.connect(output);
                osc.start(now + delay);
                osc.stop(now + delay + 0.2);
            }
        }

        /**
         * Charge sound — whoosh + battle cry meow.
         */
        _chargeSound(output) {
            const now = this.ctx.currentTime;

            // Whoosh
            const noise = this._createNoise(0.4, output);
            noise.disconnect();

            const bandpass = this.ctx.createBiquadFilter();
            bandpass.type = 'bandpass';
            bandpass.frequency.setValueAtTime(300, now);
            bandpass.frequency.linearRampToValueAtTime(2000, now + 0.3);
            bandpass.Q.value = 1;

            const whooshEnv = this.ctx.createGain();
            whooshEnv.gain.setValueAtTime(0, now);
            whooshEnv.gain.linearRampToValueAtTime(0.3, now + 0.15);
            whooshEnv.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

            noise.connect(bandpass);
            bandpass.connect(whooshEnv);
            whooshEnv.connect(output);

            noise.start(now);
            noise.stop(now + 0.4);

            // Battle cry meow (higher pitch, more aggressive)
            setTimeout(() => {
                this._meow(output, { pitch: 1.4 });
            }, 200);
        }
    }

    // ── Singleton Export ──────────────────────────────────────────────────
    CatWar.Audio = new AudioManager();

})();
