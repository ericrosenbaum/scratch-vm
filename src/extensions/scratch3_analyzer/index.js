const SuperpoweredModule = require('./superpowered.js');

const formatMessage = require('format-message');
const nets = require('nets');

const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');
const MathUtil = require('../../util/math-util');
const Clone = require('../../util/clone');
const log = require('../../util/log');

/**
 * Icon svg to be displayed in the blocks category menu, encoded as a data URI.
 * @type {string}
 */
// eslint-disable-next-line max-len
const menuIconURI = '';
/**
 * Icon svg to be displayed at the left edge of each extension block, encoded as a data URI.
 * @type {string}
 */
// eslint-disable-next-line max-len
const blockIconURI = '';

const musicalChordNames = [
    'A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', /// major
    'Am', 'A#m', 'Bm', 'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m' /// minor
];

/**
 * Class for the text2speech blocks.
 * @constructor
 */
class Scratch3AnalyzerBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;

        this.superpoweredNode = null;

        this.superpowered = SuperpoweredModule.default({
            licenseKey: 'ExampleLicenseKey-WillExpire-OnNextUpdate',
            enableAudioAnalysis: true,
            enableAudioEffects: true,
            onReady: () => {
                console.log('superpowered loaded');
                this.startSuperpowered();
            }
        });

        // soundplayer for the most recently played sound
        this.player = null;

        this.tempo = -1;

        this.beatInterval = null;
        this.beatFlag = false;

        this.keyIndex = -1;
    }

    startSuperpowered () {
        const context = this.runtime.audioEngine.audioContext;
        const url = './static/analyzer.js';
        this.superpowered.createAudioNode(context, url, 'Analyzer',
            newNode => {
                console.log('superpowered node ready');
                this.superpoweredNode = newNode;
            },
            // runs when the audio node sends a message
            message => {
              console.log('Message received from the audio node:', message);
            }
        );
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'analyzer',
            name: formatMessage({
                id: 'analyzer.categoryName',
                default: 'Audio Analyzer',
                description: 'Name of the Audio Analyzer extension.'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            blocks: [
                {
                    opcode: 'playAndWait',
                    text: formatMessage({
                        id: 'analyzer.playAndWaitBlock',
                        default: 'play sound [SOUND] until done',
                        description: ''
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        SOUND: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        }
                    }
                },
                {
                    opcode: 'whenABeatPlayed',
                    text: formatMessage({
                        id: 'analyzer.whenABeatPlayed',
                        default: 'when a beat played',
                        description: ''
                    }),
                    blockType: BlockType.HAT
                },
                {
                    opcode: 'getTempo',
                    text: formatMessage({
                        id: 'analyzer.getTempo',
                        default: 'tempo',
                        description: 'get the measured tempo of the music'
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'getKey',
                    text: formatMessage({
                        id: 'analyzer.getKey',
                        default: 'musical key',
                        description: 'get the measured key of the music'
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'getRootNote',
                    text: formatMessage({
                        id: 'analyzer.getRootNote',
                        default: 'root note',
                        description: 'get the measured root note of the music'
                    }),
                    blockType: BlockType.REPORTER
                }
            ],
            menus: {
            }
        };
    }

    playAndWait (args, util) {
        const {target} = util;
        const {sprite} = target;
        const len = sprite.sounds.length;
        if (len === 0) {
            return;
        }
        const {soundId} = sprite.sounds[args.SOUND % len];
        if (sprite.soundBank) {
            const soundPromise = sprite.soundBank.playSound(target, soundId);
            this.player = sprite.soundBank.soundPlayers[soundId];

            const length = this.player.buffer.length;
            const float32Buffer = this.superpowered.createFloatArray(length);

            const myBuffer = this.player.buffer.getChannelData(0);
            for (let i = 0; i < myBuffer.length; i++) {
                float32Buffer.array[i] = myBuffer[i];
            }

            const interleavedBuffer = this.superpowered.createFloatArray(length * 2);

            this.superpowered.Interleave(
                float32Buffer.pointer,
                float32Buffer.pointer,
                interleavedBuffer.pointer,
                length
            );

            this.analyzer = this.superpowered.new('Analyzer',
                this.player.buffer.sampleRate,
                this.player.buffer.duration
            );

            this.analyzer.process(
                interleavedBuffer.pointer, // Pointer to floating point numbers. 32-bit interleaved stereo input.
                length, // Number of frames to process.
                this.player.buffer.duration
            );

            this.analyzer.makeResults(
                60, // Detected bpm will be more than or equal to this. Recommended value: 60.
                200, // Detected bpm will be less than or equal to this. Recommended value: 200.
                0, // If you know the bpm set it here. Use 0 otherwise.
                0, // Provides a "hint" for the analyzer with this. Use 0 otherwise.
                true, // True: calculate beatgridStartMs. False: save some CPU with not calculating it.
                0, // Provides a "hint" for the analyzer with this. Use 0 otherwise.
                false, // True: make overviewWaveform. False: save some CPU and memory with not making it.
                false, // True: make the low/mid/high waveforms. False: save some CPU and memory with not making them.
                true // True: calculate keyIndex. False: save some CPU with not calculating it.
            );

            /*
            drive around
            superpowered bpm: 187.5
            actual bpm: 120

            techno
            superpowered bpm: 127.659
            actual bpm: 120
            */



            console.log(this.analyzer);
            debugger;

            this.tempo = this.analyzer.bpm > 0 ? this.analyzer.bpm : -1;

            this.keyIndex = this.analyzer.keyIndex;

            this.setupBeatTimeouts();

            this.superpowered.destroyFloatArray(float32Buffer);
            this.superpowered.destroyFloatArray(interleavedBuffer);
            this.analyzer.destruct();

            return soundPromise.then(() => {
                window.clearInterval(this.beatInterval);
            });
        }
    }

    setupBeatTimeouts () {
        window.clearInterval(this.beatInterval);
        if (this.tempo <= 0) return;
        const secPerBeat = 60 / this.tempo;
        this.beatInterval = window.setInterval(() => {
            this.beatFlag = true;
        }, secPerBeat * 1000);
    }

    whenABeatPlayed () {
        if (this.beatFlag) {
            window.setTimeout(() => {
                this.beatFlag = false;
            }, 60);
            return true;
        }
        return false;
    }

    getTempo () {
        return Math.round(this.tempo);
    }

    getKey () {
        if (this.keyIndex === -1) return '';
        return musicalChordNames[this.keyIndex];
    }

    getRootNote () {
        if (this.keyIndex === -1) return '';
        return (this.keyIndex % 12) + 57;
    }
}
module.exports = Scratch3AnalyzerBlocks;
