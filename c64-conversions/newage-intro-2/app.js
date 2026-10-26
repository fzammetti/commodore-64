import { IntroModel } from './model.js';
import { IntroDisplay, WIDTH, HEIGHT } from './display.js';
import { SidPlayer } from './audio.js';
import { FRAME_RATE } from './timing.js';

const sound = new SidPlayer();
const $ = selector => document.querySelector(selector);
function reportError(error) {
  $('#error').hidden = false;
  $('#error').textContent = error instanceof Error ? error.message : String(error);
}

class IntroScene extends Phaser.Scene {
  constructor() {
    super('NewageIntro');
    this.accumulator = 0;
    this.paused = false;
    this.ended = false;
  }

  preload() {
    this.load.on('loaderror', file => reportError(new Error(`Could not load ${file.url}.`)));
    this.load.binary('intro', 'assets/intro.bin');
    this.load.binary('io', 'assets/intro.io');
    this.load.json('timing', 'assets/raster-timing.json');
    this.load.binary('music', 'assets/music.sidtrace');
  }

  create() {
    this.surface = this.textures.createCanvas('intro-display', WIDTH, HEIGHT);
    this.context = this.surface.getContext();
    this.imageData = this.context.createImageData(WIDTH, HEIGHT);
    this.display = new IntroDisplay(new Uint32Array(this.imageData.data.buffer));
    this.add.image(0, 0, 'intro-display').setOrigin(0, 0);
    $('#restart').addEventListener('click', () => this.restart());
    $('#replay').addEventListener('click', () => { this.restart(); $('#stage').focus(); });
    $('#exit').addEventListener('click', () => this.exit());
    $('#pause').addEventListener('click', () => this.togglePause());
    $('#sound').addEventListener('click', () => this.toggleSound());
    $('#fullscreen').addEventListener('click', () => this.fullscreen());
    $('#stage').addEventListener('click', () => {
      if (!sound.enabled && !this.ended) this.toggleSound();
    });
    window.addEventListener('keydown', event => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target.closest('input, textarea, select')) return;
      if (event.key === ' ' && event.target.closest('button, summary')) return;
      const key = event.key.toLowerCase();
      if (key === ' ') { event.preventDefault(); this.exit(); }
      else if (key === 'r') this.restart();
      else if (key === 'p') this.togglePause();
      else if (key === 'm') this.toggleSound();
      else if (key === 'f') this.fullscreen();
    });
    document.addEventListener('visibilitychange', () => {
      this.accumulator = 0;
      sound.pause(document.hidden || this.paused || this.ended);
    });
    this.restart();
    $('#loading').hidden = true;
    window.newageIntro = this;
  }

  restart() {
    this.model = new IntroModel(this.cache.binary.get('intro'), this.cache.binary.get('io'),
      this.cache.json.get('timing'));
    this.model.step();
    this.accumulator = 0;
    this.paused = false;
    this.ended = false;
    $('#ending').hidden = true;
    $('#exit').disabled = false;
    $('#pause').disabled = false;
    this.refreshPause();
    $('#hint').textContent = 'SPACE to end the intro · Click the display or enable sound for music';
    sound.load(this.cache.binary.get('music'), {});
    sound.pause(document.hidden);
    this.paint();
  }

  exit() {
    if (this.ended) return;
    this.ended = true;
    this.accumulator = 0;
    sound.stop();
    this.context.fillStyle = '#000';
    this.context.fillRect(0, 0, WIDTH, HEIGHT);
    this.surface.refresh();
    $('#ending').hidden = false;
    $('#exit').disabled = true;
    $('#pause').disabled = true;
    $('#hint').textContent = 'End of intro · Press R to replay';
    $('#replay').focus();
  }

  async toggleSound() {
    try { await sound.setEnabled(!sound.enabled); }
    catch (error) {
      sound.enabled = false;
      reportError(new Error(`Audio could not start: ${error.message}`));
    }
    $('#sound').textContent = sound.enabled ? 'Sound: on' : 'Sound: off';
    $('#sound').setAttribute('aria-pressed', String(sound.enabled));
  }

  refreshPause() {
    $('#pause').textContent = this.paused ? 'Resume' : 'Pause';
    $('#pause').setAttribute('aria-pressed', String(this.paused));
  }

  togglePause() {
    if (this.ended) return;
    this.paused = !this.paused;
    this.accumulator = 0;
    this.refreshPause();
    sound.pause(this.paused || document.hidden);
  }

  async fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $('.monitor').requestFullscreen();
    } catch (error) { reportError(new Error(`Fullscreen could not start: ${error.message}`)); }
  }

  update(time, delta) {
    if (!this.model || this.paused || this.ended || document.hidden) return;
    this.accumulator += Math.min(delta, 200);
    let changed = false;
    while (this.accumulator >= 1000 / FRAME_RATE) {
      this.model.step();
      this.accumulator -= 1000 / FRAME_RATE;
      changed = true;
    }
    if (changed) this.paint();
  }

  paint() {
    this.display.draw(this.model);
    this.context.putImageData(this.imageData, 0, 0);
    this.surface.refresh();
  }

  // Deterministic visual seeking for VICE comparison, without executing the PRG.
  seek(frames) {
    if (!Number.isInteger(frames) || frames < 1 || frames > 100000) throw new Error('Invalid frame.');
    this.restart();
    this.togglePause();
    for (let frame = 1; frame < frames; frame++) this.model.step();
    this.paint();
  }
}

window.addEventListener('error', event => reportError(event.error || event.message));
window.addEventListener('unhandledrejection', event => reportError(event.reason));
new Phaser.Game({
  type: Phaser.CANVAS, parent: 'stage', width: WIDTH, height: HEIGHT,
  pixelArt: true, roundPixels: true, backgroundColor: '#000000',
  render: { antialias: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: IntroScene, audio: { noAudio: true }, banner: false
});

