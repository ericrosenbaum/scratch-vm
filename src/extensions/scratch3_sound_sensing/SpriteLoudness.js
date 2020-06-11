const SMOOTHING = 0.77;

class SpriteLoudness {
    constructor (audioEngine, target) {

        this.audioContext = audioEngine.audioContext;

        this.inputNode = audioEngine.createTargetOutputNode(target);
    }

    getLoudness () {
        if (!this.analyzer) {
            this.analyzer = this.audioContext.createAnalyser();
            this.inputNode.connect(this.analyzer);
            this.dataArray = new Float32Array(this.analyzer.fftSize);
        }
        this.analyzer.getFloatTimeDomainData(this.dataArray);
        let loudness = this.getLoudnessOfArray(this.dataArray);
        // smooth the value, if it is descending
        if (this._lastLoudness) {
            loudness = Math.max(loudness, this._lastLoudness * SMOOTHING);
        }
        this._lastLoudness = loudness;
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

module.exports = SpriteLoudness;
