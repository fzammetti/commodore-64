import { IntroModel } from './intro-model.js';
import { C64Display, WIDTH, HEIGHT } from './display.js';
import { SidPlayer } from './audio.js';
import { FRAME_RATE, CYCLES_PER_FRAME, CYCLES_PER_LINE, FIRST_VISIBLE_LINE } from './timing.js';

const sound = new SidPlayer();
let soundChosen = false;
// This page's own controls; every other key is a key on the C64's keyboard.
const CONTROLS = ['r', 'm', 'p', 'f'];

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

class SorcererLordScene extends Phaser.Scene {
  constructor() {
    super('SorcererLord');
    this.paused = false;
    this.accumulator = 0;
    this.loadFailed = false;
    this.state = '';
  }

  preload() {
    this.load.on('loaderror', file => {
      this.loadFailed = true;
      reportError(new Error(`Could not load ${file.url}.`));
    });
    this.load.binary('rom', 'assets/rom-font.bin');
    this.load.binary('ram', 'assets/intro.ram');
    this.load.binary('io', 'assets/intro.io');
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
    this.add.image(0, 0, 'display').setOrigin(0, 0);
    document.querySelector('#stage').addEventListener('click', () => {
      this.interact();
      this.pressKey();
    });
    document.querySelector('#exit').addEventListener('click', () => {
      this.interact();
      this.pressKey();
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
    window.sorcererLord = this;
  }

  handleKey(event) {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if ((event.key === ' ' || event.key === 'Enter') && element?.closest('button, summary')) return;
    const key = event.key.toLowerCase();
    const typed = key.length === 1 || key === 'enter';
    if (!typed) return;
    event.preventDefault();
    if (key !== 'm') this.interact();
    if (!CONTROLS.includes(key)) this.pressKey();
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
    this.model = new IntroModel({ ram: this.ram, io: this.io });
    this.accumulator = 0;
    sound.stop();
    sound.load(this.ram, this.io);
    sound.pause(this.paused || document.hidden);
    this.showState();
    this.paint();
  }

  // The key goes down where the model has got to; the KERNAL's keyboard scan in the
  // bottom IRQ finds it, and the main loop looks in the buffer once a round. Once the
  // intro has reached the game, or hung, a key runs it again.
  pressKey() {
    if (this.model.done) {
      this.start();
      return;
    }
    if (this.model.keyPressed) return;
    this.model.pressKey(this.model.clock);
    sound.key();
  }

  // The clock at which the picture of the frame just drawn ends.
  shownClock() {
    return this.model.frame * CYCLES_PER_FRAME + FIRST_VISIBLE_LINE * CYCLES_PER_LINE;
  }

  showState() {
    const model = this.model, clock = this.shownClock();
    const state = model.hung && clock >= model.hangClock ? 'hung'
      : clock >= model.gameClock ? 'game'
        : model.exited && clock > model.exitClock ? 'leaving'
          : model.keyPressed ? 'pressed' : 'intro';
    if (state === this.state) return;
    this.state = state;
    document.querySelector('#exit').textContent = model.done ? 'Run intro again' : 'Press a key';
    document.querySelector('#hint').textContent = {
      intro: 'Any key leaves the intro, as on the C64',
      pressed: 'The KERNAL scans the keyboard at the end of the frame…',
      leaving: 'The intro clears the screen, resets the C64 and copies the game into place…',
      game: 'Here Sorcerer Lord would start; the game is not part of this reconstruction · any key runs the intro again',
      hung: 'The C64 has hung, as the original does when a raster IRQ falls between RESTOR and CINT · any key runs the intro again'
    }[state];
  }

  update(time, delta) {
    if (!this.model || this.paused || document.hidden) return;
    this.accumulator += Math.min(delta, 200);
    let changed = false;
    while (this.accumulator >= 1000 / FRAME_RATE) {
      this.model.step();
      this.accumulator -= 1000 / FRAME_RATE;
      changed = true;
    }
    if (!changed) return;
    this.paint();
    this.showState();
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

  // Visual seeking pauses playback; the sound restarts with the intro.
  seek(frames) {
    if (!Number.isInteger(frames) || frames < 0 || frames > 1000000) throw new Error('Invalid frame.');
    if (!this.paused) this.togglePause();
    this.start();
    for (let frame = 0; frame < frames; frame++) this.model.step();
    this.paint();
    this.showState();
  }
}

window.addEventListener('error', event => reportError(event.error || event.message));
window.addEventListener('unhandledrejection', event => reportError(event.reason));
new Phaser.Game({
  type: Phaser.CANVAS, parent: 'stage', width: WIDTH, height: HEIGHT,
  pixelArt: true, roundPixels: true, backgroundColor: '#000000',
  render: { antialias: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: SorcererLordScene, audio: { noAudio: true }, banner: false
});
