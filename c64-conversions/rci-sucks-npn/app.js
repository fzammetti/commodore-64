import { IntroModel } from './intro-model.js';
import { PageOneModel } from './page-one-model.js';
import { PageTwoModel } from './page-two-model.js';
import { PageThreeModel } from './page-three-model.js';
import { PageFourModel } from './page-four-model.js';
import { PageFiveModel } from './page-five-model.js';
import { PageSixModel } from './page-six-model.js';
import { C64Display, WIDTH, HEIGHT } from './display.js';
import { SidPlayer } from './audio.js';
import { FRAME_RATE } from './timing.js';

const pages = ['intro', 'page1', 'page2', 'page3', 'page4', 'page5', 'page6'];
const labels = ['Opening', 'Messages', 'Shocwave', 'Portrait', 'Color waves', 'New designs', 'Final letter'];
const models = [IntroModel, PageOneModel, PageTwoModel, PageThreeModel,
  PageFourModel, PageFiveModel, PageSixModel];
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

class RciScene extends Phaser.Scene {
  constructor() {
    super('Rci');
    this.page = 0;
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
    this.load.binary('baseline', 'assets/baseline.io');
    this.load.json('music', 'assets/music.json');
    for (const name of pages) this.load.binary(`${name}-ram`, `assets/${name}.ram`);
    for (const name of ['page1', 'page2', 'page3', 'page4', 'page5']) {
      this.load.binary(`${name}-music`, `assets/sid-${name}.bin`);
    }
  }

  create() {
    if (this.loadFailed) return;
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
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => { this.interact(); this.setPage(index); });
      document.querySelector('#pages').append(button);
    }
    document.querySelector('#stage').addEventListener('click', () => {
      this.interact();
      this.advanceOriginal();
    });
    document.querySelector('#advance').addEventListener('click', () => { this.interact(); this.next(); });
    document.querySelector('#restart').addEventListener('click', () => {
      this.interact();
      this.setPage(this.page);
    });
    document.querySelector('#sound').addEventListener('click', () => {
      soundChosen = true;
      setSound(!sound.enabled);
    });
    document.querySelector('#pause').addEventListener('click', () => this.togglePause());
    document.querySelector('#fullscreen').addEventListener('click', () => this.fullscreen());
    for (const button of document.querySelectorAll('[data-pattern]')) {
      button.addEventListener('click', () => {
        this.interact();
        this.setPattern(Number(button.dataset.pattern));
      });
    }
    window.addEventListener('keydown', event => this.handleKey(event));
    document.addEventListener('visibilitychange', () => {
      this.accumulator = 0;
      sound.pause(document.hidden || this.paused);
    });
    this.setPage(0);
    document.querySelector('#loading').hidden = true;
    window.rci = this;
  }

  handleKey(event) {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === ' ' && element?.closest('button, summary')) return;
    const key = event.key.toLowerCase();
    if (![' ', 'r', 'm', 'p', 'f', 'f1', '1', '2', '3', '4', '5'].includes(key)) return;
    if (/^[1-5]$/.test(key) && this.page !== 2) return;
    event.preventDefault();
    if (key !== 'm') this.interact();
    if (key === ' ') this.advanceOriginal();
    else if (key === 'r') this.setPage(this.page);
    else if (key === 'f1') this.setPage(0);
    else if (key === 'p') this.togglePause();
    else if (key === 'm') { soundChosen = true; setSound(!sound.enabled); }
    else if (key === 'f') this.fullscreen();
    else this.setPattern(Number(key));
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

  setPage(index) {
    if (!Number.isInteger(index) || index < 0 || index >= pages.length) throw new Error('Unknown part.');
    const name = pages[index];
    const model = new models[index](this.capture(`${name}-ram`, 65536), this.capture('baseline', 4096));
    this.page = index;
    this.model = model;
    this.accumulator = 0;
    sound.stop();
    const metadata = this.cache.json.get('music')?.[name];
    if (metadata) sound.load(this.cache.binary.get(`${name}-music`), metadata);
    sound.pause(this.paused || document.hidden);
    for (const button of document.querySelectorAll('[data-page]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.page) === index));
    }
    document.querySelector('#patterns').hidden = index !== 2;
    if (index === 2) this.refreshPatterns();
    document.querySelector('#hint').textContent = index === 0
      ? 'SPACE after the curtain opens · Next part skips the opening'
      : index === 6 ? 'F1 returns to the opening · R replays this part'
      : index === 2 ? '1–5 change bounce patterns · SPACE for the next part'
      : `${labels[index]} · SPACE for the next part`;
    const advance = document.querySelector('#advance');
    advance.disabled = index === pages.length - 1;
    advance.textContent = 'Next part →';
    this.paint();
  }

  setPattern(pattern) {
    if (this.page !== 2) return;
    this.model.setPattern(pattern);
    this.refreshPatterns();
    this.paint();
  }

  refreshPatterns() {
    for (const button of document.querySelectorAll('[data-pattern]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.pattern) === this.model.pattern));
    }
  }

  advanceOriginal() {
    if (this.page === 0) this.model.advance();
    else this.next();
  }

  next() {
    if (this.page < pages.length - 1) this.setPage(this.page + 1);
  }

  update(time, delta) {
    if (!this.model || this.paused || document.hidden) return;
    this.accumulator += Math.min(delta, 200);
    let changed = false;
    while (this.accumulator >= 1000 / FRAME_RATE) {
      this.model.step();
      this.accumulator -= 1000 / FRAME_RATE;
      changed = true;
      if (this.page === 0 && this.model.complete) { this.next(); break; }
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

  // Visual seeking pauses playback; captured SID audio restarts at the part's beginning.
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
  scene: RciScene, audio: { noAudio: true }, banner: false
});
