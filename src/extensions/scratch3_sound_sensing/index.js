const formatMessage = require('format-message');

const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Timer = require('../../util/timer');
const Cast = require('../../util/cast');

const Loudness = require('./Loudness');

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

/**
 * Input sources for audio.
 * @readonly
 * @enum {string}
 */
const INPUT = {
    microphone: 'microphone',
    project: 'project',
    all: 'all'
};

/**
 * Class for the text2speech blocks.
 * @constructor
 */
class Scratch3SoundSensingBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;

        this.input = INPUT.microphone;

        /**
         * The timer utility.
         * @type {Timer}
         */
        this._timer = new Timer();

        /**
         * The stored loudness measurement.
         * @type {number}
         */
        this._cachedLoudness = -1;

        /**
         * The time of the most recent loudness measurement.
         * @type {number}
         */
        this._cachedLoudnessTimestamp = 0;
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'soundSensing',
            name: formatMessage({
                id: 'soundSensing.categoryName',
                default: 'Sound Sensing',
                description: 'Name of the sound sensing extension.'
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            blocks: [
                {
                    opcode: 'whenLoud',
                    text: formatMessage({
                        id: 'soundSensing.whenLoud',
                        default: 'when loudness > [LOUDNESS]',
                        description: 'when the loudness is greater than the specified threshold'
                    }),
                    blockType: BlockType.HAT,
                    arguments: {
                        LOUDNESS: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 10
                        }
                    }
                },
                {
                    opcode: 'setInputSource',
                    text: formatMessage({
                        id: 'soundSensing.setInputSourceBlock',
                        default: 'listen to [INPUT]',
                        description: 'Choose a sound source to listen to.'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        INPUT: {
                            type: ArgumentType.STRING,
                            menu: 'INPUT',
                            defaultValue: INPUT.microphone
                        }
                    }
                },
                {
                    opcode: 'getLoudness',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'soundSensing.getLoudness',
                        default: 'loudness',
                        description: 'get the loudness'
                    })
                }
            ],
            menus: {
                INPUT: {
                    acceptReporters: false,
                    items: [
                        {
                            text: formatMessage({
                                id: 'soundSensing.microphone',
                                default: 'microphone',
                                description: 'The microphone.'
                            }),
                            value: INPUT.microphone
                        },
                        {
                            text: formatMessage({
                                id: 'soundSensing.project',
                                default: 'project',
                                description: 'The project.'
                            }),
                            value: INPUT.project
                        },
                        {
                            text: formatMessage({
                                id: 'soundSensing.all',
                                default: 'all',
                                description: 'All sounds.'
                            }),
                            value: INPUT.all
                        }
                    ]
                }
            }
        };
    }

    setInputSource (args) {
        this.input = args.INPUT;
    }

    getLoudness () {
        if (typeof this.runtime.audioEngine === 'undefined') return -1;
        if (this.runtime.currentStepTime === null) return -1;
        if (!this.loudness) {
            const engine = this.runtime.audioEngine;
            this.loudness = new Loudness(engine.audioContext, engine.inputNode);
        }

        // Only measure loudness once per step
        const timeSinceLoudness = this._timer.time() - this._cachedLoudnessTimestamp;
        if (timeSinceLoudness < this.runtime.currentStepTime) {
            return this._cachedLoudness;
        }

        this._cachedLoudnessTimestamp = this._timer.time();
        switch (this.input) {
        case INPUT.microphone:
            this._cachedLoudness = this.loudness.getMicrophoneLoudness();
            break;
        case INPUT.project:
            this._cachedLoudness = this.loudness.getProjectLoudness();
            break;
        case INPUT.all:
            this._cachedLoudness = Math.max(
                this.loudness.getMicrophoneLoudness(),
                this.loudness.getProjectLoudness()
            );
            break;
        }
        return this._cachedLoudness;
    }

    whenLoud (args) {
        const loudness = Cast.toNumber(args.LOUDNESS);
        return this.getLoudness() > loudness;
    }

}
module.exports = Scratch3SoundSensingBlocks;
