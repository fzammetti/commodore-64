import { SidPlayback } from './sid-playback.js';

export class SidPlayer {

  constructor() {
    this.context = null;
    this.node = null;
    this.gain = null;
    this.enabled = false;
    this.initializing = null;
    this.pending = null;
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
          this.node = new AudioWorkletNode(context, `aura-sid`, { outputChannelCount: [1] });
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
        if (this.pending) {
          this.node.port.postMessage(this.pending);
          this.pending = null;
        }
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

  load(inBuffer, inMetadata) {
    const message = {
      type: `load`, buffer: inBuffer, loopStart: inMetadata.loopStart, frameRate: inMetadata.rate
    };
    if (this.node) {
      this.node.port.postMessage(message);
    } else {
      this.pending = message;
    }
  }

  stop() {
    this.pending = null;
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
