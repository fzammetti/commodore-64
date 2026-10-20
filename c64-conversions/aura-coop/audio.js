export class SidPlayer {

  constructor() {
    this.context = null;
    this.node = null;
    this.gain = null;
    this.enabled = false;
    this.initializing = null;
    this.pending = null;
  }

  async initialize() {
    if (!this.initializing) {
      this.context = new AudioContext();
      this.initializing = this.context.audioWorklet.addModule(`sid-worklet.js`).then(function () {
        this.node = new AudioWorkletNode(this.context, `aura-sid`, { outputChannelCount: [1] });
        this.gain = this.context.createGain();
        this.gain.gain.value = this.enabled ? 0.7 : 0;
        this.node.connect(this.gain).connect(this.context.destination);
        if (this.pending) {
          this.node.port.postMessage(this.pending);
          this.pending = null;
        }
      }.bind(this));
    }
    await this.context.resume();
    await this.initializing;
  }

  async setEnabled(inEnabled) {
    this.enabled = inEnabled;
    if (inEnabled) {
      await this.initialize();
    }
    if (this.gain) {
      this.gain.gain.setTargetAtTime(inEnabled ? 0.7 : 0, this.context.currentTime, 0.02);
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
    if (this.node) {
      this.node.port.postMessage({ type: `pause`, value: inPaused });
    }
  }

}
