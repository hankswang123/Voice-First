import { StreamProcessorSrc } from './worklets/stream_processor.js';
import { AudioAnalysis } from './analysis/audio_analysis.js';

/**
 * Plays audio streams received in raw PCM16 chunks from the browser
 * @class
 */
export class WavStreamPlayer {
  /**
   * Creates a new WavStreamPlayer instance
   * @param {{sampleRate?: number}} options
   * @returns {WavStreamPlayer}
   */
  constructor({ sampleRate = 44100 } = {}) {
    this.scriptSrc = StreamProcessorSrc;
    this.sampleRate = sampleRate;
    this.context = null;
    this.stream = null;
    this.analyser = null;
    this.trackSampleOffsets = {};
    this.interruptedTrackIds = {};

    // hanks - control audio playback
    this.newsAudio = null;
    this.newsVideo = null;
    this.isHidden = true;
    this.setIsPlaying = null;
    this.repeatCurrent = null;
    this.itemStatus = null;
    this.askStop = false;
    this.gainNode = null;
    // hanks
  }

  /** hanks
   * set the status of the item to determine whether the last chunk has been added
   */  
  setItemStatus(itemStatus) {
    this.itemStatus = itemStatus;
  }
  // hanks

  /**
   * Connects the audio context and enables output to speakers
   * @returns {Promise<true>}
   */
  async connect(newsAudio, newsVideo, setIsPlaying, repeatCurrent) {
    this.context = new AudioContext({ sampleRate: this.sampleRate });
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    try {
      await this.context.audioWorklet.addModule(this.scriptSrc);
    } catch (e) {
      console.error(e);
      throw new Error(`Could not add audioWorklet module: ${this.scriptSrc}`);
    }
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0.1;
    this.analyser = analyser;
    // hanks - 
    this.newsAudio = newsAudio;
    this.newsVideo = newsVideo;
    this.setIsPlaying = setIsPlaying;  
    this.repeatCurrent = repeatCurrent;
    this.gainNode = this.context.createGain(); // Create gain node for volume control
    this.gainNode.connect(this.context.destination); // Connect gain to output    
    this.gainNode.gain.value = 0; // Set volume to -1: mute, 0: default, 1: max
    return true;
  }

  setMute() {
    if(this.gainNode) {
      this.gainNode.gain.value = -1;
    }
  }

  unMute() {
    if(this.gainNode) {
      this.gainNode.gain.value = 0;
    }
  }

  /**
   * Gets the current frequency domain data from the playing track
   * @param {"frequency"|"music"|"voice"} [analysisType]
   * @param {number} [minDecibels] default -100
   * @param {number} [maxDecibels] default -30
   * @returns {import('./analysis/audio_analysis.js').AudioAnalysisOutputType}
   */
  getFrequencies(
    analysisType = 'frequency',
    minDecibels = -100,
    maxDecibels = -30
  ) {
    if (!this.analyser) {
      throw new Error('Not connected, please call .connect() first');
    }
    return AudioAnalysis.getFrequencies(
      this.analyser,
      this.sampleRate,
      null,
      analysisType,
      minDecibels,
      maxDecibels
    );
  }

  /**
   * Starts audio streaming
   * @private
   * @returns {Promise<true>}
   */
  _start() {
    const streamNode = new AudioWorkletNode(this.context, 'stream_processor');
    streamNode.connect(this.context.destination);
    // hanks      
    streamNode.connect(this.gainNode); // Connect gain to output to control the player volume
    // hanks
    streamNode.port.onmessage = (e) => {
      const { event } = e.data;
      if (event === 'stop') {
        streamNode.disconnect();
        this.stream = null;
      } else if (event === 'offset') {
        const { requestId, trackId, offset } = e.data;
        const currentTime = offset / this.sampleRate;
        this.trackSampleOffsets[requestId] = { trackId, offset, currentTime };
      } else if (event === 'stop_by_completion') {
        // hanks
        // 'stop_by_completion' will be triggered together with 'stop' for each delta chunk finished playing
        // BUT, audio will be resumed only after item with 'completed' staus received after the last chunk 
        if(this.itemStatus === 'completed' && this.newsAudio && this.isHidden) {
          if(this.askStop) {
            this.newsAudio.pause();
            //this.askStop = false;
          } else {
            this.newsAudio.play();
            // Resume playing the audio from the start of the current caption
            // bug: only start playing from the beginning of the whole audio
            //this.repeatCurrent();
            this.setIsPlaying(true);            
          }
        }

        if(this.itemStatus === 'completed' && this.newsVideo && !this.isHidden) {
          if(this.askStop) {
            this.newsVideo.pause();
            //this.askStop = false;
          } else {
            this.newsVideo.play();
            this.setIsPlaying(true);            
          }
        }          
        // hanks
      }
    };
    this.analyser.disconnect();
    streamNode.connect(this.analyser);
    this.stream = streamNode;
    return true;
  }

  /**
   * Adds 16BitPCM data to the currently playing audio stream
   * You can add chunks beyond the current play point and they will be queued for play
   * @param {ArrayBuffer|Int16Array} arrayBuffer
   * @param {string} [trackId]
   * @returns {Int16Array}
   */
  add16BitPCM(arrayBuffer, trackId = 'default') {
    if (typeof trackId !== 'string') {
      throw new Error(`trackId must be a string`);
    } else if (this.interruptedTrackIds[trackId]) {
      return;
    }
    if (!this.stream) {
      this._start();
    }
    let buffer;
    if (arrayBuffer instanceof Int16Array) {
      buffer = arrayBuffer;
    } else if (arrayBuffer instanceof ArrayBuffer) {
      buffer = new Int16Array(arrayBuffer);
    } else {
      throw new Error(`argument must be Int16Array or ArrayBuffer`);
    }
    this.stream.port.postMessage({ event: 'write', buffer, trackId });
    return buffer;
  }

  /**
   * Gets the offset (sample count) of the currently playing stream
   * @param {boolean} [interrupt]
   * @returns {{trackId: string|null, offset: number, currentTime: number}}
   */
  async getTrackSampleOffset(interrupt = false) {
    if (!this.stream) {
      return null;
    }
    const requestId = crypto.randomUUID();
    this.stream.port.postMessage({
      event: interrupt ? 'interrupt' : 'offset',
      requestId,
    });
    let trackSampleOffset;
    while (!trackSampleOffset) {
      trackSampleOffset = this.trackSampleOffsets[requestId];
      await new Promise((r) => setTimeout(() => r(), 1));
    }
    const { trackId } = trackSampleOffset;
    if (interrupt && trackId) {
      this.interruptedTrackIds[trackId] = true;
    }
    return trackSampleOffset;
  }

  /**
   * Strips the current stream and returns the sample offset of the audio
   * @param {boolean} [interrupt]
   * @returns {{trackId: string|null, offset: number, currentTime: number}}
   */
  async interrupt() {
    return this.getTrackSampleOffset(true);
  }
}

globalThis.WavStreamPlayer = WavStreamPlayer;
