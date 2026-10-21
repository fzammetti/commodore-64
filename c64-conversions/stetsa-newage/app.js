import { WelcomeModel, CreditsModel } from './intro-model.js';
import { PageOneModel } from './page-one-model.js';
import { PageTwoModel } from './page-two-model.js';
import { PageThreeModel } from './page-three-model.js';
import { PageFourModel } from './page-four-model.js';
import { InterludeModel } from './interlude-model.js';
import { FinaleModel } from './finale-model.js';
import { C64Display, WIDTH, HEIGHT } from './display.js';
import { SidPlayer } from './audio.js';
import { FRAME_RATE } from './timing.js';

const pages = ['welcome', 'credits', 'page1', 'page2', 'page3', 'page4', 'interlude', 'finale'];
const labels = ['Welcome', 'Credits', 'Stetsa', 'Patterns', 'Raster duet', 'Two scrolls', 'Interlude', 'Wireframe'];
const models = [WelcomeModel, CreditsModel, PageOneModel, PageTwoModel, PageThreeModel,
  PageFourModel, InterludeModel, FinaleModel];
const sound = new SidPlayer();
let soundChosen = false;

function reportError(error) {
  const element = document.querySelector('#error');
  element.hidden = false;
  element.textContent = error instanceof Error ? error.message : String(error);
}

async function setSound(enabled) {
  try { await sound.setEnabled(enabled); }
  catch (error) { sound.enabled = false; reportError(new Error(`Audio could not start: ${error.message}`)); }
  const button = document.querySelector('#sound');
  button.textContent = sound.enabled ? 'Sound: on' : 'Sound: off';
  button.setAttribute('aria-pressed', String(sound.enabled));
}

class StetsaScene extends Phaser.Scene {
  constructor() {
    super('Stetsa');
    this.page = 0;
    this.paused = false;
    this.accumulator = 0;
  }
  preload() {
    this.load.on('loaderror', file => reportError(new Error(`Could not load ${file.url}.`)));
    this.load.binary('rom', 'assets/rom-font.bin');
    this.load.json('music', 'assets/music.json');
    for (const name of pages) {
      this.load.binary(`${name}-ram`, `assets/${name}.ram`);
      this.load.binary(`${name}-io`, `assets/${name}.io`);
    }
    for (const name of ['credits', 'page1', 'page2', 'page3', 'page4', 'finale']) {
      this.load.binary(`${name}-music`, `assets/sid-${name}.bin`);
    }
  }
  create() {
    this.surface = this.textures.createCanvas('display', WIDTH, HEIGHT);
    this.context = this.surface.getContext();
    this.imageData = this.context.createImageData(WIDTH, HEIGHT);
    this.display = new C64Display(new Uint32Array(this.imageData.data.buffer),
      new Uint8Array(this.cache.binary.get('rom')));
    this.add.image(0, 0, 'display').setOrigin(0, 0);
    for (let index = 0; index < pages.length; index++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = labels[index];
      button.dataset.page = index;
      button.addEventListener('click', () => { this.interact(); this.setPage(index); });
      document.querySelector('#pages').append(button);
    }
    const advance = () => { this.interact(); this.next(); };
    document.querySelector('#stage').addEventListener('click', advance);
    document.querySelector('#advance').addEventListener('click', advance);
    document.querySelector('#restart').addEventListener('click', () => { this.interact(); this.setPage(this.page); });
    document.querySelector('#sound').addEventListener('click', () => {
      soundChosen = true; setSound(!sound.enabled);
    });
    document.querySelector('#pause').addEventListener('click', () => this.togglePause());
    document.querySelector('#fullscreen').addEventListener('click', () => this.fullscreen());
    for (const button of document.querySelectorAll('[data-pattern]')) {
      button.addEventListener('click', () => { this.interact(); this.setPattern(Number(button.dataset.pattern)); });
    }
    window.addEventListener('keydown', event => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target.closest('button, input, textarea, select, summary') && event.key === ' ') return;
      const key = event.key.toLowerCase();
      if (key === ' ') { event.preventDefault(); advance(); }
      else if (this.page === 3 && (key === 'arrowleft' || key === '1' || key === '2')) {
        event.preventDefault();
        this.setPattern(key === 'arrowleft' ? 1 : Number(key) + 1);
      }
      else if (key === 'r') this.setPage(this.page);
      else if (key === 'p') this.togglePause();
      else if (key === 'm') { soundChosen = true; setSound(!sound.enabled); }
      else if (key === 'f') this.fullscreen();
    });
    document.addEventListener('visibilitychange', () => {
      this.accumulator = 0;
      sound.pause(document.hidden || this.paused);
    });
    this.setPage(0);
    document.querySelector('#loading').hidden = true;
    window.stetsa = this;
  }
  interact() {
    if (soundChosen) return;
    soundChosen = true;
    setSound(true);
  }
  capture(name, extension, length) {
    const buffer = this.cache.binary.get(`${name}-${extension}`);
    if (buffer?.byteLength !== length) throw new Error(`Invalid assets/${name}.${extension}.`);
    return new Uint8Array(buffer);
  }
  setPage(index) {
    if (!Number.isInteger(index) || index < 0 || index >= pages.length) throw new Error('Unknown part.');
    this.page = index;
    this.accumulator = 0;
    const name = pages[index];
    this.model = new models[index](this.capture(name, 'ram', 65536), this.capture(name, 'io', 4096));
    sound.stop();
    const metadata = this.cache.json.get('music')[name];
    if (metadata) sound.load(this.cache.binary.get(`${name}-music`), metadata);
    sound.pause(this.paused || document.hidden);
    for (const button of document.querySelectorAll('[data-page]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.page) === index));
    }
    document.querySelector('#patterns').hidden = index !== 3;
    if (index === 3) this.refreshPatterns();
    document.querySelector('#hint').textContent = index === 7 ? 'Wireframe · R to replay'
      : index === 6 ? 'The original interlude advances automatically · SPACE to skip'
      : index === 3 ? '← / 1 / 2 change patterns · SPACE for the next part'
      : `${labels[index]} · SPACE for ${labels[index + 1]}`;
    const advance = document.querySelector('#advance');
    advance.disabled = index === 7;
    advance.textContent = index === 0 ? 'Enter demo →' : 'Next part →';
    this.paint();
  }
  setPattern(pattern) {
    if (this.page !== 3) return;
    this.model.setPattern(pattern);
    this.refreshPatterns();
    this.paint();
  }
  refreshPatterns() {
    for (const button of document.querySelectorAll('[data-pattern]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.pattern) === this.model.pattern));
    }
  }
  next() { if (this.page < pages.length - 1) this.setPage(this.page + 1); }
  update(time, delta) {
    if (!this.model || this.paused || document.hidden) return;
    this.accumulator += Math.min(delta, 200);
    let changed = false;
    while (this.accumulator >= 1000 / FRAME_RATE) {
      this.model.step();
      this.accumulator -= 1000 / FRAME_RATE;
      changed = true;
      if (this.model.complete && this.page === 6) { this.next(); break; }
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
  // Visual-only deterministic seeking for comparison with the original NTSC captures.
  seek(index, frames) {
    if (!Number.isInteger(frames) || frames < 0 || frames > 100000) throw new Error('Invalid frame.');
    if (!this.paused) this.togglePause();
    this.setPage(index);
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
  scene: StetsaScene, audio: { noAudio: true }, banner: false
});
