import { FantasyModel, InfiltratorModel, FRAME_RATE } from "./model.js";
import { C64Display, WIDTH, HEIGHT } from "./display.js";
import { SidPlayer } from "./audio.js";
import { CPU_CLOCK } from "./timing.js";

const pages = [`welcome`, `fantasy`, `infiltrator`];
export const sound = new SidPlayer();
let soundChosen = false;


function reportError(inError) {
  const element = document.querySelector(`#error`);
  element.hidden = false;
  element.textContent = inError instanceof Error ? inError.message : String(inError);
}


function updateSoundButton() {
  const button = document.querySelector(`#sound`);
  button.textContent = sound.enabled ? `Sound: on` : `Sound: off`;
  button.setAttribute(`aria-pressed`, String(sound.enabled));
}


async function enableSound(inEnabled) {
  try {
    await sound.setEnabled(inEnabled);
    updateSoundButton();
  } catch (error) {
    sound.enabled = false;
    updateSoundButton();
    reportError(new Error(`Browser audio could not start: ${error.message}`));
  }
}


class AuraScene extends Phaser.Scene {

  constructor() {
    super(`Aura`);
    this.page = `welcome`;
    this.model = null;
    this.paused = false;
    this.accumulator = 0;
    this.startup = null;
  }

  preload() {
    this.load.on(`loaderror`, function (inFile) {
      reportError(new Error(`Could not load ${inFile.url}. Start the local server with npm start.`));
    });
    this.load.binary(`rom`, `assets/rom-font.bin`);
    this.load.binary(`welcome`, `assets/welcome-screen.bin`);
    for (const name of [`fantasy`, `infiltrator`]) {
      this.load.binary(`${name}-initial`, `assets/${name}.initial`);
      this.load.binary(`${name}-music`, `assets/${name}.sidtrace`);
      this.load.binary(`${name}-startup`, `assets/${name}.startup`);
    }
    this.load.json(`metadata`, `assets/metadata.json`);
    this.load.json(`rasters`, `assets/rasters.json`);
  }

  create() {
    this.surface = this.textures.createCanvas(`c64-surface`, WIDTH, HEIGHT);
    this.context = this.surface.getContext();
    this.imageData = this.context.createImageData(WIDTH, HEIGHT);
    this.display = new C64Display(
      new Uint32Array(this.imageData.data.buffer), new Uint8Array(this.cache.binary.get(`rom`)),
      this.cache.json.get(`rasters`)
    );
    this.add.image(0, 0, `c64-surface`).setOrigin(0, 0);
    this.metadata = this.cache.json.get(`metadata`);
    this.setPage(`welcome`);
    this.bindControls();
    document.querySelector(`#loading`).hidden = true;
    window.aura = this;
  }

  bindControls() {
    for (const button of document.querySelectorAll(`[data-page]`)) {
      button.addEventListener(`click`, function () {
        this.interact();
        this.setPage(button.dataset.page);
      }.bind(this));
    }
    document.querySelector(`#stage`).addEventListener(`click`, function () {
      this.interact();
      this.next();
    }.bind(this));
    document.querySelector(`#sound`).addEventListener(`click`, function () {
      soundChosen = true;
      enableSound(!sound.enabled);
    });
    document.querySelector(`#pause`).addEventListener(`click`, this.togglePause.bind(this));
    document.querySelector(`#fullscreen`).addEventListener(`click`, this.toggleFullscreen.bind(this));
    window.addEventListener(`keydown`, function (inEvent) {
      const target = inEvent.target;
      if (inEvent.repeat || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      const key = inEvent.key.toLowerCase();
      if (key === ` ` && target instanceof HTMLButtonElement) {
        return;
      }
      if (key === ` `) {
        inEvent.preventDefault();
        this.interact();
        this.next();
      } else if ([`0`, `1`, `2`].includes(key)) {
        this.interact();
        this.setPage(pages[Number(key)]);
      } else if (key === `r`) {
        this.setPage(this.page);
      } else if (key === `m`) {
        soundChosen = true;
        enableSound(!sound.enabled);
      } else if (key === `p`) {
        this.togglePause();
      } else if (key === `f`) {
        this.toggleFullscreen();
      }
    }.bind(this));
    document.addEventListener(`visibilitychange`, function () {
      this.accumulator = 0;
      sound.pause(document.hidden || this.paused);
    }.bind(this));
  }

  interact() {
    if (!soundChosen) {
      soundChosen = true;
      enableSound(true);
    }
  }

  setPage(inName, inSkipStartup = false) {
    if (!pages.includes(inName)) {
      throw new Error(`Unknown demo page.`);
    }
    this.page = inName;
    this.accumulator = 0;
    this.startup = null;
    sound.stop();
    if (inName === `welcome`) {
      const memory = new Uint8Array(65536);
      const io = new Uint8Array(4096);
      memory.set(new Uint8Array(this.cache.binary.get(`welcome`)), 0x400);
      io[0x011] = 0x1b;
      io[0x016] = 0xc8;
      io[0x018] = 0x14;
      io[0xd00] = 3;
      io.fill(1, 0x800, 0xbe8);
      this.model = { memory: memory, io: io, frame: 0 };
    } else {
      const Model = inName === `fantasy` ? FantasyModel : InfiltratorModel;
      this.model = new Model(this.cache.binary.get(`${inName}-initial`));
      if (!inSkipStartup) {
        this.startup = {
          data: new DataView(this.cache.binary.get(`${inName}-startup`)), offset: 0, cycles: 0,
          duration: this.metadata.startup[inName]
        };
        this.model.memory.fill(32, 0x400, 0x7e8);
        this.model.io.fill(inName === `fantasy` ? 0 : 10, 0x800, 0xc00);
        this.model.io[0x015] = 0;
        this.model.io[0x018] = 0x14;
        this.model.io[0x016] = 0xc8;
      } else {
        this.startMusic();
      }
    }
    for (const button of document.querySelectorAll(`[data-page]`)) {
      button.setAttribute(`aria-pressed`, String(button.dataset.page === inName));
    }
    const hints = {
      welcome: `SPACE to enter Aura`,
      fantasy: `Page one by Fantasy · SPACE for page two`,
      infiltrator: `Page two by Infiltrator · R to replay`
    };
    document.querySelector(`#hint`).textContent = hints[inName];
    this.paint();
  }

  next() {
    if (this.page === `welcome`) {
      this.setPage(`fantasy`);
    } else if (this.page === `fantasy`) {
      this.setPage(`infiltrator`);
    }
  }

  startMusic() {
    if (this.page === `fantasy` && this.model.frame < 160) {
      return;
    }
    sound.load(this.cache.binary.get(`${this.page}-music`), this.metadata.music[this.page]);
    sound.pause(this.paused || document.hidden);
  }

  advanceStartup() {
    const startup = this.startup;
    startup.cycles += CPU_CLOCK / FRAME_RATE;
    while (startup.offset < startup.data.byteLength
      && startup.data.getUint32(startup.offset, true) <= startup.cycles) {
      const address = startup.data.getUint16(startup.offset + 4, true);
      const value = startup.data.getUint8(startup.offset + 6);
      if (address >= 0xd000) {
        this.model.io[address - 0xd000] = value;
      } else {
        this.model.memory[address] = value;
      }
      startup.offset += 7;
    }
    if (startup.cycles >= startup.duration) {
      this.startup = null;
      this.startMusic();
    }
  }

  update(inTime, inDelta) {
    if (!this.model || this.paused || this.page === `welcome`) {
      return;
    }
    this.accumulator += Math.min(inDelta, 200);
    let changed = false;
    while (this.accumulator >= 1000 / FRAME_RATE) {
      if (this.startup) {
        this.advanceStartup();
      } else {
        this.model.step();
        if (this.page === `fantasy` && this.model.frame === 160) {
          this.startMusic();
        }
      }
      this.accumulator -= 1000 / FRAME_RATE;
      changed = true;
    }
    if (changed) {
      this.paint();
    }
  }

  paint() {
    this.display.draw(this.model, this.page, this.startup !== null);
    this.context.putImageData(this.imageData, 0, 0);
    this.surface.refresh();
  }

  togglePause() {
    this.paused = !this.paused;
    this.accumulator = 0;
    sound.pause(this.paused || document.hidden);
    const button = document.querySelector(`#pause`);
    button.textContent = this.paused ? `Resume` : `Pause`;
    button.setAttribute(`aria-pressed`, String(this.paused));
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.querySelector(`.monitor`).requestFullscreen();
      }
    } catch (error) {
      reportError(new Error(`Fullscreen is unavailable: ${error.message}`));
    }
  }

  seek(inName, inFrames) {
    if (!Number.isInteger(inFrames) || inFrames < 0 || inFrames > 100000) {
      throw new Error(`Frame must be an integer between 0 and 100000.`);
    }
    if (!this.paused) {
      this.togglePause();
    }
    this.setPage(inName, true);
    if (inName !== `welcome`) {
      for (let frame = 0; frame < inFrames; frame++) {
        this.model.step();
      }
      this.startMusic();
    }
    this.paint();
  }

}

window.addEventListener(`error`, function (inEvent) {
  reportError(inEvent.error || inEvent.message);
});

new Phaser.Game({
  type: Phaser.CANVAS,
  parent: `stage`,
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: `#000000`,
  pixelArt: true,
  roundPixels: true,
  render: { antialias: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: AuraScene,
  audio: { noAudio: true },
  banner: false
});
