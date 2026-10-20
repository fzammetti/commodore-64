import { WelcomeModel } from './welcome-model.js';
import { PageOneModel } from './page-one-model.js';
import { PageTwoModel } from './page-two-model.js';
import { PageThreeModel } from './page-three-model.js';
import { PageFourModel } from './page-four-model.js';
import { C64Display, WIDTH, HEIGHT } from './display.js';
import { SidPlayer } from './audio.js';
import { FRAME_RATE } from './timing.js';

const pages = ['welcome', 'page1', 'page2', 'page3', 'page4'];
const labels = ['Welcome', 'New Age', 'Sprite dance', 'Fantasy World', 'Finale'];
const models = [WelcomeModel, PageOneModel, PageTwoModel, PageThreeModel, PageFourModel];
const sound = new SidPlayer();
let soundChosen = false;
function reportError(error) {
  const element = document.querySelector('#error');
  element.hidden = false;
  element.textContent = error instanceof Error ? error.message : String(error);
}
async function setSound(enabled) {
  try {
    await sound.setEnabled(enabled);
  } catch (error) {
    sound.enabled = false;
    reportError(new Error(`Audio could not start: ${error.message}`));
  }
  const button = document.querySelector('#sound');
  button.textContent = sound.enabled ? 'Sound: on' : 'Sound: off';
  button.setAttribute('aria-pressed', String(sound.enabled));
}

class FantasyScene extends Phaser.Scene {
  constructor() {
    super('FantasyWorld');
    this.page = 0;
    this.paused = false;
    this.accumulator = 0;
  }
  preload() {
    this.load.on('loaderror', file => reportError(new Error(`Could not load ${file.url}. Check the deployed assets.`)));
    this.load.binary('rom', 'assets/rom-font.bin');
    for (const name of pages) {
      this.load.binary(`${name}-ram`, `assets/${name}.ram`);
      this.load.binary(`${name}-io`, `assets/${name}.io`);
      if (name === 'welcome') continue;
      this.load.binary(`${name}-music`, `assets/${name}.sidtrace`);
      this.load.json(`${name}-metadata`, `assets/${name}.music.json`);
      this.load.json(`${name}-calls`, `assets/${name}.calls.json`);
    }
  }
  create() {
    this.surface = this.textures.createCanvas('display', WIDTH, HEIGHT);
    this.context = this.surface.getContext();
    this.imageData = this.context.createImageData(WIDTH, HEIGHT);
    this.display = new C64Display(new Uint32Array(this.imageData.data.buffer),
      new Uint8Array(this.cache.binary.get('rom')));
    this.add.image(0, 0, 'display').setOrigin(0, 0);
    const navigation = document.querySelector('#pages');
    labels.forEach((label, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.dataset.page = index;
      button.title = `${label} (${index})`;
      button.addEventListener('click', () => { this.interact(); this.setPage(index); });
      navigation.append(button);
    });
    document.querySelector('#stage').addEventListener('click', () => { this.interact(); this.next(); });
    document.querySelector('#advance').addEventListener('click', () => { this.interact(); this.next(); });
    document.querySelector('#restart').addEventListener('click', () => this.setPage(this.page));
    document.querySelector('#sound').addEventListener('click', () => {
      soundChosen = true;
      setSound(!sound.enabled);
    });
    document.querySelector('#pause').addEventListener('click', () => this.togglePause());
    document.querySelector('#fullscreen').addEventListener('click', () => this.fullscreen());
    window.addEventListener('keydown', event => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target.closest('button, input, textarea, select, summary') && event.key === ' ') return;
      const key = event.key.toLowerCase();
      if (key === ' ') { event.preventDefault(); this.interact(); this.next(); }
      else if (/^[0-4]$/.test(key)) { this.interact(); this.setPage(Number(key)); }
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
    window.fantasyWorld = this;
  }
  interact() {
    if (soundChosen) return;
    soundChosen = true;
    setSound(true);
  }
  readCapture(name, extension, expectedSize) {
    const buffer = this.cache.binary.get(`${name}-${extension}`);
    const size = buffer?.byteLength ?? 0;
    if (size !== expectedSize) {
      throw new Error(`Invalid assets/${name}.${extension}: expected ${expectedSize} bytes, received ${size}. `
        + 'Re-upload the original asset in binary mode; text/ASCII transfers corrupt these files.');
    }
    return new Uint8Array(buffer).slice(2);
  }
  setPage(index) {
    if (!Number.isInteger(index) || index < 0 || index >= pages.length) throw new Error('Unknown demo section.');
    this.page = index;
    this.accumulator = 0;
    const name = pages[index];
    const ram = this.readCapture(name, 'ram', 65538);
    const io = this.readCapture(name, 'io', 4098);
    this.model = new models[index](ram, io);
    this.calls = index ? this.cache.json.get(`${name}-calls`) : null;
    sound.stop();
    if (index) {
      sound.load(this.cache.binary.get(`${name}-music`), this.cache.json.get(`${name}-metadata`));
      sound.pause(this.paused || document.hidden);
    }
    for (const button of document.querySelectorAll('[data-page]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.page) === index));
    }
    document.querySelector('#hint').textContent = index === 4
      ? 'Finale · 0–4 select a section · R replay'
      : `${labels[index]} · SPACE for ${labels[index + 1]}`;
    const advance = document.querySelector('#advance');
    advance.disabled = index === 4;
    advance.textContent = index === 0 ? 'Enter demo →' : 'Next part →';
    this.paint();
  }
  next() { if (this.page < 4) this.setPage(this.page + 1); }
  update(time, delta) {
    if (!this.model || this.paused || document.hidden) return;
    this.accumulator += Math.min(delta, 200);
    let changed = false;
    while (this.accumulator >= 1000 / FRAME_RATE) {
      const calls = this.calls?.[this.model.frame % this.calls.length];
      this.model.step(calls);
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
  // Deterministic frame seeking is also useful when comparing the C64 reference captures.
  seek(index, frames) {
    if (!Number.isInteger(frames) || frames < 0 || frames > 100000) throw new Error('Invalid frame.');
    if (!this.paused) this.togglePause();
    this.setPage(index);
    for (let frame = 0; frame < frames; frame++) this.model.step(this.calls?.[frame % this.calls.length]);
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
  scene: FantasyScene, audio: { noAudio: true }, banner: false
});
