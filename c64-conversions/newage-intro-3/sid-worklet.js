import { SidPlayback } from './sid-playback.js';

class PsynusSidProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.playback = new SidPlayback(sampleRate);
    this.port.onmessage = event => this.playback.receive(event.data);
  }

  process(inputs, outputs) {
    this.playback.render(outputs[0][0]);
    return true;
  }
}

registerProcessor('newage-psynus-sid', PsynusSidProcessor);
