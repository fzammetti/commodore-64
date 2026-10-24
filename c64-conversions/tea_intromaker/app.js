import { IntroModel } from './intro-model.js';
import { EditorModel } from './editor-model.js';
import { CompactorModel } from './compactor-model.js';
import { ResetModel } from './reset-model.js';
import { petsciiForKey } from './kernal-screen.js';
import { C64Display, WIDTH, HEIGHT } from './display.js';
import { SidPlayer } from './audio.js';
import { FRAME_RATE } from './timing.js';

const parts = ['intro', 'editor', 'compactor'];
const labels = ['Intro', 'Intro/Editor I', 'Compactor V4/S'];
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

class TeaScene extends Phaser.Scene {
  constructor() {
    super('Tea');
    this.part = 0;
    this.paused = false;
    this.accumulator = 0;
    this.loadFailed = false;
    this.editor = null;
    this.preview = false;
  }

  preload() {
    this.load.on('loaderror', file => {
      this.loadFailed = true;
      reportError(new Error(`Could not load ${file.url}.`));
    });
    this.load.binary('chargen', 'assets/chargen.bin');
    this.load.json('music', 'assets/music.json');
    this.load.json('timeline', 'assets/timeline.json');
    for (const name of ['intro', 'editor', 'compactor', 'linker']) {
      this.load.binary(`${name}-ram`, `assets/${name}.ram`);
      this.load.binary(`${name}-io`, `assets/${name}.io`);
    }
    for (const name of ['intro', 'template']) this.load.binary(`${name}-music`, `assets/sid-${name}.bin`);
  }

  create() {
    if (this.loadFailed) return;
    this.surface = this.textures.createCanvas('display', WIDTH, HEIGHT);
    this.context = this.surface.getContext();
    this.imageData = this.context.createImageData(WIDTH, HEIGHT);
    this.display = new C64Display(new Uint32Array(this.imageData.data.buffer));
    this.chargen = this.capture('chargen', 4096);
    this.add.image(0, 0, 'display').setOrigin(0, 0);
    for (let index = 0; index < parts.length; index++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = labels[index];
      button.dataset.part = index;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => { this.interact(); this.setPart(index); });
      document.querySelector('#parts').append(button);
    }
    document.querySelector('#stage').addEventListener('click', () => {
      this.interact();
      document.querySelector('#stage').focus();
    });
    document.querySelector('#preview').addEventListener('click', () => { this.interact(); this.startPreview(); });
    document.querySelector('#restart').addEventListener('click', () => {
      this.interact();
      if (this.preview) this.startPreview();
      else this.setPart(this.part);
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
    window.tea = this;
  }

  get typing() {
    return this.model instanceof EditorModel || this.model instanceof CompactorModel;
  }

  handleKey(event) {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if ((event.key === ' ' || event.key === 'Enter') && element?.closest('button, summary')) return;
    if (event.key === 'F1') {
      event.preventDefault();
      this.interact();
      this.setPart(0);
      return;
    }
    if (this.typing) {
      // The C64 owns the keyboard here; browser controls are on the buttons.
      const code = petsciiForKey(event);
      if (code === null) return;
      event.preventDefault();
      this.interact();
      if (!this.paused) this.model.key(code);
      this.afterKey();
      return;
    }
    // While a reset screen decrunches, the original reads no keys at all.
    if (event.repeat || !(this.model instanceof IntroModel)) return;
    const key = event.key.toLowerCase();
    if (![' ', 'r', 'm', 'p', 'f'].includes(key)) return;
    event.preventDefault();
    if (key !== 'm') this.interact();
    if (key === ' ') this.space();
    else if (key === 'r') document.querySelector('#restart').click();
    else if (key === 'p') this.togglePause();
    else if (key === 'm') { soundChosen = true; setSound(!sound.enabled); }
    else if (key === 'f') this.fullscreen();
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

  // $28A7: SPACE alone ($DC01 = $EF) leaves the intro for the attached editor.
  space() {
    if (!(this.model instanceof IntroModel) || this.paused) return;
    sound.stop();
    if (this.preview && this.editor) {
      // Browser addition: a preview returns to the editing session it came from.
      this.preview = false;
      this.model = this.editor;
      this.showPart(1);
      return;
    }
    this.model = new ResetModel(this.chargen, { frames: this.cache.json.get('timeline').editorFrames });
    this.pending = 1;
    this.showPart(1);
  }

  setPart(index) {
    if (!Number.isInteger(index) || index < 0 || index >= parts.length) throw new Error('Unknown part.');
    this.preview = false;
    this.pending = null;
    sound.stop();
    if (index === 0) {
      this.model = new IntroModel(this.capture('intro-ram', 65536), this.capture('intro-io', 4096));
      this.playMusic('intro');
    } else if (index === 1) this.startEditor();
    else this.startCompactor();
    this.showPart(index);
  }

  startEditor() {
    this.editor = new EditorModel(this.capture('editor-ram', 65536), this.capture('editor-io', 4096),
      this.chargen);
    this.model = this.editor;
  }

  startCompactor() {
    this.model = new CompactorModel(this.capture('compactor-ram', 65536), this.capture('compactor-io', 4096),
      this.capture('linker-ram', 65536), this.capture('linker-io', 4096), this.chargen,
      this.cache.json.get('timeline'));
    sound.live();
  }

  // Browser addition: run the intro as the editor would save it, at SYS 9216 ($2400).
  startPreview() {
    if (!this.editor) this.startEditor();
    this.model = IntroModel.fromProgram(this.capture('intro-ram', 65536), this.capture('intro-io', 4096),
      this.editor.memory);
    this.preview = true;
    this.pending = null;
    sound.stop();
    this.playMusic('template');
    this.showPart(0);
  }

  playMusic(name) {
    sound.load(this.cache.binary.get(`${name}-music`), this.cache.json.get('music')[name]);
    sound.pause(this.paused || document.hidden);
  }

  showPart(index) {
    this.part = index;
    this.accumulator = 0;
    for (const button of document.querySelectorAll('[data-part]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.part) === index && !this.preview));
    }
    document.querySelector('#preview').setAttribute('aria-pressed', String(this.preview));
    this.refreshHint();
    this.paint();
  }

  refreshHint() {
    const model = this.model;
    let hint;
    if (model instanceof ResetModel) hint = 'Decrunching…';
    else if (model instanceof IntroModel) {
      hint = this.preview ? 'Preview of the edited intro · SPACE returns to the editor'
        : 'SPACE runs the Intro/Editor';
    } else if (model instanceof EditorModel) {
      hint = {
        menu: 'Type 1–6 to choose',
        edit: "Type the scroll text, end it with '@', then press RETURN",
        saving: 'Saving “INTRO” — your browser downloads it as intro.prg',
        instructions: 'Press any key for the menu'
      }[model.state];
    } else if (model instanceof CompactorModel) {
      hint = model.halted ? 'Linking needs a disk drive, which this reconstruction does not have'
        : model.state === 'linker' ? 'The linker asks for LOW-MEM · F1 returns to the intro'
          : 'Press any key to continue';
    }
    const element = document.querySelector('#hint');
    if (element.textContent !== hint) element.textContent = hint;
  }

  afterKey() {
    const model = this.model;
    if (model instanceof EditorModel && model.exit) {
      // $C3C5 cleared the screen; $CA00 resets the machine and relocates the compactor.
      const before = model.view;
      this.model = new ResetModel(this.chargen, { frames: this.cache.json.get('timeline').compactorFrames,
        cintFrame: 4, blackFrame: 6, before });
      this.pending = 2;
      this.showPart(2);
      return;
    }
    this.refreshHint();
    this.paint();
  }

  download(bytes) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    link.download = 'intro.prg';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  update(time, delta) {
    if (!this.model || this.paused || document.hidden) return;
    this.accumulator += Math.min(delta, 200);
    let changed = false;
    while (this.accumulator >= 1000 / FRAME_RATE) {
      this.model.step();
      this.accumulator -= 1000 / FRAME_RATE;
      changed = true;
      if (this.model instanceof ResetModel && this.model.complete) {
        if (this.pending === 1) this.startEditor();
        else this.startCompactor();
        this.pending = null;
        this.refreshHint();
      }
      if (this.model.sidWrites?.length) {
        sound.writes(this.model.sidWrites);
        this.model.sidWrites = [];
      }
      if (this.model.saved) {
        this.download(this.model.saved);
        this.model.saved = null;
      }
    }
    if (changed) {
      this.refreshHint();
      this.paint();
    }
  }

  paint() {
    this.display.draw(this.model.view ?? this.model);
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
    this.setPart(index);
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
  scene: TeaScene, audio: { noAudio: true }, banner: false
});
