import { IntroModel } from './intro-model.js';
import { ExitModel } from './exit-model.js';
import { C64Display, WIDTH, HEIGHT } from './display.js';
import { SidPlayer } from './audio.js';
import { FRAME_RATE } from './timing.js';

const sound = new SidPlayer();
let soundChosen = false;

function reportError(error) {
  const element = document.querySelector('#error');
  element.hidden = false;
  element.textContent = error instanceof Error ? error.message : String(error);
}

async function setSound(enabled) {
  try { await sound.setEnabled(enabled); }
  catch (error) {
    sound.enabled = false;
    reportError(new Error(`Audio could not start: ${error.message}`));
  }
  const button = document.querySelector('#sound');
  button.textContent = sound.enabled ? 'Sound: on' : 'Sound: off';
  button.setAttribute('aria-pressed', String(sound.enabled));
}

class ExodusScene extends Phaser.Scene {
  constructor() {
    super('Exodus');
    this.paused = false;
    this.accumulator = 0;
    this.loadFailed = false;
  }

  preload() {
    this.load.on('loaderror', file => {
      this.loadFailed = true;
      reportError(new Error(`Could not load ${file.url}.`));
    });
    this.load.binary('rom', 'assets/rom-font.bin');
    this.load.binary('ram', 'assets/intro.ram');
    this.load.binary('io', 'assets/intro.io');
    this.load.json('timing', 'assets/irq-timing.json');
    this.load.binary('music', 'assets/music.bin');
    this.load.json('music-info', 'assets/music.json');
  }

  create() {
    if (this.loadFailed) return;
    this.surface = this.textures.createCanvas('display', WIDTH, HEIGHT);
    this.context = this.surface.getContext();
    this.imageData = this.context.createImageData(WIDTH, HEIGHT);
    this.display = new C64Display(new Uint32Array(this.imageData.data.buffer),
      this.capture('rom', 2048));
    this.ram = this.capture('ram', 65536);
    this.io = this.capture('io', 4096);
    this.music = this.cache.json.get('music-info');
    this.timing = this.cache.json.get('timing');
    if (!this.music?.frames || !this.cache.binary.get('music')) throw new Error('Invalid or missing music asset.');
    if (!this.timing) throw new Error('Invalid or missing IRQ timing asset.');
    this.add.image(0, 0, 'display').setOrigin(0, 0);
    document.querySelector('#stage').addEventListener('click', () => {
      this.interact();
      this.pressSpace();
    });
    document.querySelector('#exit').addEventListener('click', () => {
      this.interact();
      this.pressSpace();
    });
    document.querySelector('#restart').addEventListener('click', () => {
      this.interact();
      this.start();
    });
    document.querySelector('#sound').addEventListener('click', () => {
      soundChosen = true;
      setSound(!sound.enabled);
    });
    document.querySelector('#pause').addEventListener('click', () => this.togglePause());
    document.querySelector('#fullscreen').addEventListener('click', () => this.fullscreen());
    window.addEventListener('keydown', event => this.handleKey(event));
    document.addEventListener('visibilitychange', () => {
      this.accumulator = 0;
      sound.pause(document.hidden || this.paused);
    });
    this.start();
    document.querySelector('#loading').hidden = true;
    window.exodus = this;
  }

  handleKey(event) {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === ' ' && element?.closest('button, summary')) return;
    const key = event.key.toLowerCase();
    if (![' ', 'r', 'm', 'p', 'f'].includes(key)) return;
    event.preventDefault();
    if (key !== 'm') this.interact();
    if (key === ' ') this.pressSpace();
    else if (key === 'r') this.start();
    else if (key === 'p') this.togglePause();
    else if (key === 'm') { soundChosen = true; setSound(!sound.enabled); }
    else this.fullscreen();
  }

  interact() {
    if (soundChosen) return;
    soundChosen = true;
    setSound(true);
  }

  capture(key, length) {
    const buffer = this.cache.binary.get(key);
    if (buffer?.byteLength !== length) throw new Error(`Invalid or missing ${key} asset.`);
    return new Uint8Array(buffer);
  }

  start() {
    this.model = new IntroModel(this.ram, this.io, this.timing);
    this.accumulator = 0;
    sound.stop();
    sound.load(this.cache.binary.get('music'), this.music);
    sound.pause(this.paused || document.hidden);
    this.showState();
    this.paint();
  }

  // The intro tests SPACE at the end of its last IRQ every frame; the BASIC screen restarts.
  pressSpace() {
    if (this.model instanceof IntroModel) this.model.requestExit();
    else this.start();
  }

  leave() {
    this.model = new ExitModel();
    sound.stop();
    this.showState();
  }

  showState() {
    const exited = this.model instanceof ExitModel;
    const button = document.querySelector('#exit');
    button.textContent = exited ? 'Run intro again' : 'Press SPACE';
    document.querySelector('#hint').textContent = exited
      ? 'The linked game is not on this disk · SPACE or R runs the intro again'
      : 'SPACE leaves the intro, as on the C64';
  }

  update(time, delta) {
    if (!this.model || this.paused || document.hidden) return;
    this.accumulator += Math.min(delta, 200);
    let changed = false;
    while (this.accumulator >= 1000 / FRAME_RATE) {
      this.model.step();
      this.accumulator -= 1000 / FRAME_RATE;
      changed = true;
      // SPACE is acted on at the end of the frame, so its last picture still shows.
      if (this.model.exited) {
        this.paint();
        this.leave();
        changed = false;
        break;
      }
    }
    if (changed) this.paint();
  }

  paint() {
    this.display.draw(this.model);
    this.context.putImageData(this.imageData, 0, 0);
    this.surface.refresh();
  }

  togglePause() {
    this.paused = !this.paused;
    this.accumulator = 0;
    sound.pause(this.paused || document.hidden);
    const button = document.querySelector('#pause');
    button.textContent = this.paused ? 'Resume' : 'Pause';
    button.setAttribute('aria-pressed', String(this.paused));
  }

  async fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.querySelector('.monitor').requestFullscreen();
    } catch (error) { reportError(new Error(`Fullscreen could not start: ${error.message}`)); }
  }

  // Visual seeking pauses playback; captured SID audio restarts at the beginning.
  seek(frames) {
    if (!Number.isInteger(frames) || frames < 0 || frames > 100000) throw new Error('Invalid frame.');
    if (!this.paused) this.togglePause();
    this.start();
    for (let frame = 0; frame < frames; frame++) this.model.step();
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
  scene: ExodusScene, audio: { noAudio: true }, banner: false
});
