import { IntroModel } from './intro-model.js';
import { EditorModel } from './editor-model.js';
import { CompactorModel } from './compactor-model.js';
import { LoaderScreen } from './loader-screen.js';
import { VirtualDisk } from './disk.js';
import { C64Display, WIDTH, HEIGHT } from './display.js';
import { SidPlayer } from './audio.js';
import { FRAME_RATE, CYCLES_PER_FRAME } from './timing.js';
import { FramePacer } from './frame-pacer.js';
import { petsciiForKey, petsciiForCharacter, REPEATING } from './keyboard.js';

// Frames of the cleared KERNAL screen while each launcher copies and decrunches.
const EDITOR_LOAD_FRAMES = 105;
const COMPACTOR_LOAD_FRAMES = 65;
const PARTS = [['intro', 'Intro'], ['editor', 'Intro editor'], ['compactor', 'Linker / compactor']];
const HINTS = {
  intro: 'SPACE starts the BMI Intro Editor',
  preview: 'Your intro · SPACE returns to the editor',
  loading: 'Loading…',
  editor: 'Type 1–6 to choose · RETURN ends scroll editing',
  compactor: 'Type answers and press RETURN · $ lists the disk · @ compacts',
  title: 'Press any key once the title is complete'
};

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

function download(name, data) {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'program'}.prg`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

class IntroMakerScene extends Phaser.Scene {
  constructor() {
    super('IntroMaker');
    this.phase = 'intro';
    this.paused = false;
    this.pacer = new FramePacer(FRAME_RATE);
    this.loadFailed = false;
    this.held = new Set();
    // A tap or click is held for a few frames so once-per-frame key checks see it.
    this.tapFrames = 0;
  }

  preload() {
    this.load.on('loaderror', file => {
      this.loadFailed = true;
      reportError(new Error(`Could not load ${file.url}.`));
    });
    this.load.binary('chargen', 'assets/chargen.bin');
    this.load.binary('d64', 'assets/bmi-intromaker-1.d64');
    this.load.binary('music', 'assets/music.sidtrace');
    this.load.json('music-info', 'assets/music.json');
    for (const name of ['intro', 'editor', 'compactor']) {
      this.load.binary(`${name}-ram`, `assets/${name}.ram`);
      this.load.binary(`${name}-io`, `assets/${name}.io`);
    }
  }

  create() {
    if (this.loadFailed) return;
    this.surface = this.textures.createCanvas('display', WIDTH, HEIGHT);
    this.context = this.surface.getContext();
    this.imageData = this.context.createImageData(WIDTH, HEIGHT);
    this.display = new C64Display(new Uint32Array(this.imageData.data.buffer), this.capture('chargen', 4096));
    this.add.image(0, 0, 'display').setOrigin(0, 0);
    this.disk = VirtualDisk.fromD64(this.cache.binary.get('d64'));
    this.disk.onChange(() => this.refreshDisk());
    this.createControls();
    this.refreshDisk();
    this.startIntro();
    document.querySelector('#loading').hidden = true;
    window.bmi = this;
  }

  capture(key, length) {
    const buffer = this.cache.binary.get(key);
    if (buffer?.byteLength !== length) throw new Error(`Invalid or missing ${key} asset.`);
    return new Uint8Array(buffer);
  }

  createControls() {
    const parts = document.querySelector('#parts');
    for (const [name, label] of PARTS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.dataset.part = name;
      button.addEventListener('click', () => {
        this.interact();
        if (name === 'intro') this.startIntro();
        else if (name === 'editor') this.startEditor(false);
        else this.startCompactor(true);
      });
      parts.append(button);
    }
    document.querySelector('#preview').addEventListener('click', () => { this.interact(); this.startPreview(); });
    document.querySelector('#sound').addEventListener('click', () => {
      soundChosen = true;
      setSound(!sound.enabled);
    });
    document.querySelector('#pause').addEventListener('click', () => this.togglePause());
    document.querySelector('#fullscreen').addEventListener('click', () => this.fullscreen());
    document.querySelector('#add-file').addEventListener('change', event => this.addFiles(event.target));
    const stage = document.querySelector('#stage');
    stage.addEventListener('pointerdown', () => this.tapStage());
    window.addEventListener('keydown', event => this.keyDown(event));
    window.addEventListener('keyup', event => this.keyUp(event));
    window.addEventListener('blur', () => {
      this.held.clear();
      this.updateHeld();
    });
    const typing = document.querySelector('#typing');
    typing.addEventListener('beforeinput', event => this.virtualInput(event));
    document.addEventListener('visibilitychange', () => {
      this.pacer.reset();
      sound.pause(document.hidden || this.paused);
    });
  }

  interact() {
    if (soundChosen) return;
    soundChosen = true;
    setSound(true);
  }

  // Phases ----------------------------------------------------------------------------

  setPhase(phase, model) {
    this.phase = phase;
    this.model = model;
    this.pacer.reset();
    this.pacer.smooth = phase === 'intro' || phase === 'preview';
    this.held.clear();
    this.tapFrames = 0;
    const part = phase === 'preview' ? 'editor' : phase === 'loading' ? this.loadingPart : phase;
    for (const button of document.querySelectorAll('[data-part]')) {
      button.setAttribute('aria-pressed', String(button.dataset.part === part));
    }
    document.querySelector('#preview').hidden = phase !== 'editor';
    document.querySelector('#hint').textContent = HINTS[phase];
    document.querySelector('#stage').setAttribute('aria-label', `Commodore 64 display: ${HINTS[phase]}.`);
    this.paint();
  }

  startIntro() {
    const model = new IntroModel(this.capture('intro-ram', 65536), this.capture('intro-io', 4096));
    this.playMusic();
    this.setPhase('intro', model);
  }

  // The editor's own template, run as the intro it would save ("Test intro").
  startPreview() {
    if (this.phase !== 'editor') return;
    this.editor = this.model;
    const ram = this.capture('intro-ram', 65536).slice();
    ram.set(this.editor.memory.subarray(0x0800, 0x3800), 0x0800);
    this.playMusic();
    this.setPhase('preview', new IntroModel(ram, this.capture('intro-io', 4096)));
  }

  startLoader(frames, next, part) {
    // IOINIT turns the SID volume down; the voices keep their last settings.
    sound.live();
    sound.frame([0, 0x18, 0]);
    this.loadingPart = part;
    this.nextPhase = next;
    this.setPhase('loading', new LoaderScreen(frames));
  }

  startEditor(launched) {
    const model = new EditorModel(this.capture('editor-ram', 65536), this.capture('editor-io', 4096), {
      save: (name, data) => this.editorSaved(name, data),
      compactor: () => this.startLoader(COMPACTOR_LOAD_FRAMES, () => this.startCompactor(false), 'compactor')
    });
    this.editor = null;
    // After a launcher the SID keeps the intro's voices at volume 0; a jump starts fresh.
    sound.live(!launched);
    this.setPhase('editor', model);
  }

  startCompactor(fresh) {
    sound.live(fresh);
    const model = new CompactorModel(this.capture('compactor-ram', 65536), this.capture('compactor-io', 4096),
      this.disk, { saved: file => this.compactorSaved(file) });
    this.setPhase('compactor', model);
  }

  playMusic() {
    const info = this.cache.json.get('music-info').intro;
    sound.load(this.cache.binary.get('music'), info);
    sound.pause(this.paused || document.hidden);
  }

  editorSaved(name, data) {
    const file = this.disk.save(Array.from(name, character => character.charCodeAt(0)), data);
    this.setStatus(file ? '00, OK,00,00' : '63,FILE EXISTS,00,00');
  }

  compactorSaved(file) {
    this.setStatus(file ? '00, OK,00,00' : '63,FILE EXISTS,00,00');
  }

  // Disk panel ------------------------------------------------------------------------

  setStatus(text) {
    document.querySelector('#drive-status').textContent = text;
  }

  refreshDisk() {
    const list = document.querySelector('#files');
    list.replaceChildren();
    let used = 0;
    for (const file of this.disk.files) {
      used += file.blocks;
      const row = document.createElement('li');
      const blocks = document.createElement('span');
      blocks.className = 'blocks';
      blocks.textContent = file.blocks;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = `"${file.name}"`;
      const save = document.createElement('button');
      save.type = 'button';
      save.textContent = 'Download';
      save.setAttribute('aria-label', `Download ${file.name}`);
      save.addEventListener('click', () => download(file.name, file.data));
      const scratch = document.createElement('button');
      scratch.type = 'button';
      scratch.textContent = 'Scratch';
      scratch.setAttribute('aria-label', `Scratch ${file.name} from the disk`);
      scratch.addEventListener('click', () => {
        this.disk.files = this.disk.files.filter(entry => entry !== file);
        this.setStatus('01, FILES SCRATCHED,01,00');
        this.refreshDisk();
      });
      row.append(blocks, name, save, scratch);
      list.append(row);
    }
    document.querySelector('#free').textContent = `${Math.max(0, 664 - used)} BLOCKS FREE.`;
  }

  async addFiles(input) {
    for (const file of input.files) {
      const data = new Uint8Array(await file.arrayBuffer());
      if (data.length < 3) {
        reportError(new Error(`${file.name} is too short to be a PRG file.`));
        continue;
      }
      if (data.length > 65538) {
        reportError(new Error(`${file.name} is larger than C64 memory.`));
        continue;
      }
      this.disk.add(file.name.replace(/\.prg$/i, ''), data);
    }
    input.value = '';
  }

  // Input -----------------------------------------------------------------------------

  keyDown(event) {
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('input:not(#typing), textarea:not(#typing), select, [contenteditable="true"]')) return;
    if (element?.closest('button, summary, a') && (event.key === ' ' || event.key === 'Enter')) return;
    if (!this.model) return;
    const modifier = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(event.key);
    if (this.phase === 'intro' || this.phase === 'preview') {
      if (event.code === 'Space') {
        event.preventDefault();
        this.interact();
        this.held.add('Space');
        this.updateHeld();
      }
      return;
    }
    if (this.phase === 'loading' || modifier) return;
    const code = petsciiForKey(event);
    if (code === null || code === undefined) return;
    event.preventDefault();
    this.interact();
    if (event.repeat && !REPEATING.has(code)) return;
    this.held.add(event.code);
    this.updateHeld();
    this.model.pressKey(code);
  }

  keyUp(event) {
    this.held.delete(event.code);
    this.updateHeld();
  }

  updateHeld() {
    if (!this.model) return;
    const tapped = this.tapFrames > 0;
    if (this.phase === 'intro' || this.phase === 'preview') this.model.space = this.held.has('Space') || tapped;
    else if ('keyHeld' in this.model) this.model.keyHeld = this.held.size > 0 || tapped;
  }

  // Taps press SPACE in the intro and open the on-screen keyboard elsewhere.
  tapStage() {
    this.interact();
    if (this.phase === 'loading') return;
    this.tapFrames = 6;
    this.updateHeld();
    if (this.phase !== 'intro' && this.phase !== 'preview') {
      document.querySelector('#typing').focus({ preventScroll: true });
    }
  }

  virtualInput(event) {
    if (!this.model?.pressKey) return;
    event.preventDefault();
    if (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') this.model.pressKey(0x0d);
    else if (event.inputType === 'deleteContentBackward') this.model.pressKey(0x14);
    else if (event.data) {
      for (const character of event.data) {
        const code = petsciiForCharacter(character, false);
        if (code !== null) this.model.pressKey(code);
      }
    }
  }

  // Frames ----------------------------------------------------------------------------

  update(time) {
    if (!this.model || this.paused || document.hidden) {
      this.pacer.reset();
      return;
    }
    const frames = this.pacer.frames(time);
    for (let frame = 0; frame < frames; frame++) this.stepFrame();
    if (frames > 0) {
      this.context.putImageData(this.imageData, 0, 0);
      this.surface.refresh();
    }
  }

  stepFrame() {
    if (this.tapFrames > 0) {
      this.tapFrames--;
      this.updateHeld();
    }
    const model = this.model;
    if (this.phase === 'intro' || this.phase === 'preview') {
      this.display.begin(model);
      model.step(line => this.display.renderTo(model, line));
      this.display.finish(model);
      if (model.launch) {
        if (this.phase === 'intro') this.startLoader(EDITOR_LOAD_FRAMES, () => this.startEditor(true), 'editor');
        else this.returnToEditor();
      }
      return;
    }
    model.step();
    if (this.phase === 'compactor') this.showHint(model.state.startsWith('title') ? 'title' : 'compactor');
    if (this.phase === 'loading' && model.complete) {
      this.nextPhase();
      return;
    }
    if (model.sidWrites?.length) {
      const writes = [];
      for (const write of model.sidWrites) {
        writes.push(Math.max(0, Math.min(CYCLES_PER_FRAME - 1, write.cycle - model.frameStart)), write.register, write.value);
      }
      model.sidWrites.length = 0;
      sound.frame(writes);
    }
    this.display.draw(model);
  }

  showHint(key) {
    const hint = document.querySelector('#hint');
    if (hint.textContent !== HINTS[key]) hint.textContent = HINTS[key];
  }

  returnToEditor() {
    sound.live();
    sound.frame([0, 0x18, 0]);
    const editor = this.editor;
    this.editor = null;
    this.setPhase('editor', editor);
  }

  paint() {
    if (!this.model) return;
    this.display.draw(this.model);
    this.context.putImageData(this.imageData, 0, 0);
    this.surface.refresh();
  }

  togglePause() {
    this.paused = !this.paused;
    this.pacer.reset();
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

  // Run whole frames without real time (used for testing).
  advance(frames) {
    if (!Number.isInteger(frames) || frames < 0 || frames > 100000) throw new Error('Invalid frame count.');
    for (let frame = 0; frame < frames; frame++) this.stepFrame();
    this.context.putImageData(this.imageData, 0, 0);
    this.surface.refresh();
  }
}

window.addEventListener('error', event => reportError(event.error || event.message));
window.addEventListener('unhandledrejection', event => reportError(event.reason));
new Phaser.Game({
  type: Phaser.CANVAS, parent: 'stage', width: WIDTH, height: HEIGHT,
  pixelArt: true, roundPixels: true, backgroundColor: '#000000',
  render: { antialias: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: IntroMakerScene, audio: { noAudio: true }, banner: false
});
