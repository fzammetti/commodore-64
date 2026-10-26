import { SidPlayback } from './sid-playback.js';

export class SidPlayer {

  constructor() {
    this.context = null;
    this.node = null;
    this.gain = null;
    this.enabled = false;
    this.initializing = null;
    this.pending = [];
    this.paused = false;
  }

  async initialize() {
    if (!this.initializing) {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) throw new Error('This browser does not support Web Audio.');
      const context = this.context = new Context();
      this.initializing = Promise.resolve().then(async () => {
        if (typeof context.audioWorklet?.addModule === 'function' && typeof AudioWorkletNode === 'function') {
          await context.audioWorklet.addModule(new URL('./sid-worklet.js', import.meta.url).href);
          this.node = new AudioWorkletNode(context, `newage-psynus-sid`, { outputChannelCount: [1] });
        } else {
          // Regular HTTP origins lack AudioWorklet. Use the same SID scheduler
          // for compatibility, while preferring the worklet on HTTPS/localhost.
          if (typeof context.createScriptProcessor !== 'function') {
            throw new Error('This browser does not support custom Web Audio playback.');
          }
          const playback = new SidPlayback(context.sampleRate);
          this.node = context.createScriptProcessor(4096, 0, 1);
          this.node.onaudioprocess = event => playback.render(event.outputBuffer.getChannelData(0));
          this.node.port = { postMessage: message => playback.receive(message) };
        }
        this.gain = this.context.createGain();
        this.gain.gain.value = this.enabled ? 0.7 : 0;
        this.node.connect(this.gain).connect(this.context.destination);
        for (const message of this.pending) this.node.port.postMessage(message);
        this.pending = [];
        this.node.port.postMessage({ type: `pause`, value: this.paused });
      }).catch(async error => {
        this.context = null;
        this.initializing = null;
        this.node = null;
        this.gain = null;
        await context.close().catch(() => {});
        throw error;
      });
    }
    await Promise.all([this.context.resume(), this.initializing]);
  }

  async setEnabled(inEnabled) {
    this.enabled = inEnabled;
    if (inEnabled) {
      await this.initialize();
    }
    if (this.gain) {
      this.gain.gain.setTargetAtTime(this.enabled ? 0.7 : 0, this.context.currentTime, 0.02);
    }
  }

  post(inMessage) {
    if (this.node) {
      this.node.port.postMessage(inMessage);
    } else {
      this.pending.push(inMessage);
    }
  }

  // Starts the music: the worklet runs its own copy of the intro from its RAM and I/O.
  load(inRam, inIo) {
    this.pending = [];
    this.post({ type: `load`, ram: inRam.slice().buffer, io: inIo.slice().buffer });
  }

  // A key goes down; the worklet's copy of the intro leaves for the game as well, and
  // IOINIT silences the SID on the way.
  key() {
    this.post({ type: `key` });
  }

  stop() {
    this.pending = [];
    if (this.node) {
      this.node.port.postMessage({ type: `stop` });
    }
  }

  pause(inPaused) {
    this.paused = inPaused;
    if (this.node) {
      this.node.port.postMessage({ type: `pause`, value: inPaused });
    }
  }

}
