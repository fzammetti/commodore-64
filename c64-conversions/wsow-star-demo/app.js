import { DemoModel } from './demo-model.js';
import { C64Display, WIDTH, HEIGHT } from './display.js';
import { SidPlayer } from './audio.js';
import { FRAME_RATE } from './timing.js';

const labels = ['Picture reveal', 'Star scroller'];
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

class WsowScene extends Phaser.Scene {
  constructor() {
    super('Wsow');
    this.part = 0;
    this.paused = false;
    this.accumulator = 0;
    this.loadFailed = false;
    this.musicLoaded = false;
    this.hinted = false;
  }

  preload() {
    this.load.on('loaderror', file => {
      this.loadFailed = true;
      reportError(new Error(`Could not load ${file.url}.`));
    });
    this.load.binary('ram', 'assets/demo.ram');
    this.load.binary('io', 'assets/demo.io');
    this.load.json('cadence', 'assets/reveal.json');
    this.load.json('music', 'assets/music.json');
    this.load.binary('trace', 'assets/music.sidtrace');
  }

  create() {
    if (this.loadFailed) return;
    this.surface = this.textures.createCanvas('display', WIDTH, HEIGHT);
    this.context = this.surface.getContext();
    this.imageData = this.context.createImageData(WIDTH, HEIGHT);
    this.display = new C64Display(new Uint32Array(this.imageData.data.buffer));
    this.add.image(0, 0, 'display').setOrigin(0, 0);
    for (let index = 0; index < labels.length; index++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = labels[index];
      button.dataset.part = index;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => { this.interact(); this.setPart(index); });
      document.querySelector('#parts').append(button);
    }
    document.querySelector('#stage').addEventListener('click', () => { this.interact(); this.skip(); });
    document.querySelector('#advance').addEventListener('click', () => { this.interact(); this.skip(); });
    document.querySelector('#restart').addEventListener('click', () => {
      this.interact();
      this.setPart(this.part);
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
    this.setPart(0);
    document.querySelector('#loading').hidden = true;
    window.wsow = this;
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
    if (key === ' ') this.skip();
    else if (key === 'r') this.setPart(this.part);
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

  setPart(index) {
    if (index !== 0 && index !== 1) throw new Error('Unknown part.');
    this.model = new DemoModel(this.capture('ram', 65536), this.capture('io', 4096),
      this.cache.json.get('cadence'));
    if (index === 1) this.model.skipReveal();
    this.accumulator = 0;
    this.musicLoaded = false;
    sound.stop();
    this.model.step();
    this.refresh();
    this.paint();
  }

  // The original takes no input; skipping the reveal is a browser addition.
  skip() {
    if (this.model.phase !== 'reveal') return;
    this.model.skipReveal();
    this.refresh();
  }

  refresh() {
    const part = this.model.phase === 'reveal' ? 0 : 1;
    if (part !== this.part || !this.hinted) {
      this.part = part;
      this.hinted = true;
      for (const button of document.querySelectorAll('[data-part]')) {
        button.setAttribute('aria-pressed', String(Number(button.dataset.part) === part));
      }
      document.querySelector('#hint').textContent = part === 0
        ? 'The picture draws itself in · SPACE skips to the scroller'
        : 'Star scroller · R replays it · Picture reveal starts over';
      document.querySelector('#advance').disabled = part === 1;
    }
    if (this.model.musicStarted && !this.musicLoaded) {
      this.musicLoaded = true;
      sound.load(this.cache.binary.get('trace'), this.cache.json.get('music'));
      sound.pause(this.paused || document.hidden);
    }
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
    if (changed) {
      this.refresh();
      this.paint();
    }
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

  // Visual seeking pauses playback; captured SID audio restarts at the scroller's beginning.
  seek(frames) {
    if (!Number.isInteger(frames) || frames < 0 || frames > 100000) throw new Error('Invalid frame.');
    if (!this.paused) this.togglePause();
    this.setPart(0);
    for (let frame = 1; frame < frames; frame++) this.model.step();
    this.refresh();
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
  scene: WsowScene, audio: { noAudio: true }, banner: false
});
