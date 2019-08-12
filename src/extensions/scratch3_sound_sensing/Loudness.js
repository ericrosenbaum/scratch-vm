const log = require('../../util/log');

const SMOOTHING = 0.77;

class Loudness {
    /**
     * Instrument and detect a loudness value from a local microphone.
     * @param {AudioContext} audioContext - context to create nodes from for
     *     detecting loudness
     * @param {AudioNode} projectInput - audio node providing sound generated
     *      by the project
     * @constructor
     */
    constructor (audioContext, projectInput) {
        /**
         * AudioContext the mic will connect to and provide analysis of
         * @type {AudioContext}
         */
        this.audioContext = audioContext;

        /**
         * Audio node providing sound generated by the project.
         * @type {AudioNode}
         */
        this.projectInput = projectInput;

        /**
         * Are we connecting to the mic yet?
         * @type {Boolean}
         */
        this.connectingToMic = false;

        /**
         * microphone, for measuring loudness, with a level meter analyzer
         * @type {MediaStreamSourceNode}
         */
        this.mic = null;
    }

    /**
     * Get the current loudness of sound received by the microphone.
     * Sound is measured in RMS and smoothed.
     * Some code adapted from Tone.js: https://github.com/Tonejs/Tone.js
     * @return {number} loudness scaled 0 to 100
     */
    getMicrophoneLoudness () {
        // The microphone has not been set up, so try to connect to it
        if (!this.mic && !this.connectingToMic) {
            this.connectingToMic = true; // prevent multiple connection attempts
            navigator.mediaDevices.getUserMedia({audio: true}).then(stream => {
                this.audioStream = stream;
                this.mic = this.audioContext.createMediaStreamSource(stream);
                this.micAnalyser = this.audioContext.createAnalyser();
                this.mic.connect(this.micAnalyser);
                this.micDataArray = new Float32Array(this.micAnalyser.fftSize);
            })
                .catch(err => {
                    log.warn(err);
                });
        }

        // If the microphone is set up and active, measure the loudness
        if (this.mic && this.audioStream.active) {
            this.micAnalyser.getFloatTimeDomainData(this.micDataArray);
            let loudness = this.getLoudnessOfArray(this.micDataArray);
            // smooth the value, if it is descending
            if (this._lastMicLoudness) {
                loudness = Math.max(loudness, this._lastMicLoudness * SMOOTHING);
            }
            this._lastMicLoudness = loudness;
            return Math.round(loudness);
        }

        // if there is no microphone input, return -1
        return -1;
    }

    /*
     * Get the loudness of sounds being produced by the project.
     * @return {number} loudness scaled 0 to 100
     */
    getProjectLoudness () {
        if (!this.projectAnalyser) {
            this.projectAnalyser = this.audioContext.createAnalyser();
            this.projectInput.connect(this.projectAnalyser);
            this.projectDataArray = new Float32Array(this.projectAnalyser.fftSize);
        }
        this.projectAnalyser.getFloatTimeDomainData(this.projectDataArray);
        let loudness = this.getLoudnessOfArray(this.projectDataArray);
        // smooth the value, if it is descending
        if (this._lastProjectLoudness) {
            loudness = Math.max(loudness, this._lastProjectLoudness * SMOOTHING);
        }
        this._lastProjectLoudness = loudness;
        return Math.round(loudness);
    }

    getLoudnessOfArray (array) {
        let sum = 0;
        // compute the RMS of the sound
        for (let i = 0; i < array.length; i++){
            sum += Math.pow(array[i], 2);
        }
        let rms = Math.sqrt(sum / array.length);

        // Scale the measurement so it's more sensitive to quieter sounds
        rms *= 1.63;
        rms = Math.sqrt(rms);
        // Scale it up to 0-100 and round
        rms = Math.round(rms * 100);
        // Prevent it from going above 100
        rms = Math.min(rms, 100);
        return rms;
    }
}

module.exports = Loudness;
