const formatMessage = require('format-message');

const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Timer = require('../../util/timer');
const Cast = require('../../util/cast');

const Loudness = require('./Loudness');

/**
 * Icon svg to be displayed at the left edge of each extension block, encoded as a data URI.
 * @type {string}
 */
const blockIconURI = 'https://www.gstatic.com/images/icons/material/system/1x/mic_white_24dp.png';
const menuIconURI = 'https://www.gstatic.com/images/icons/material/system/1x/mic_grey600_24dp.png';

/**
 * Input sources for audio.
 * @readonly
 * @enum {string}
 */
const INPUT = {
    microphone: 'microphone',
    project: 'project'
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

        /**
         * The timer utility.
         * @type {Timer}
         */
        this._timer = new Timer();

        /**
         * The stored loudness measurement.
         * @type {number}
         */
        this._cachedMicrophoneLoudness = -1;
        this._cachedProjectLoudness = -1;

        /**
         * The time of the most recent loudness measurement.
         * @type {number}
         */
        this._cachedMicrophoneLoudnessTimestamp = 0;
        this._cachedProjectLoudnessTimestamp = 0;
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
                        default: 'when [INPUT] loudness > [LOUDNESS]',
                        description: 'when the loudness is greater than the specified threshold'
                    }),
                    blockType: BlockType.HAT,
                    arguments: {
                        INPUT: {
                            type: ArgumentType.STRING,
                            menu: 'INPUT',
                            defaultValue: INPUT.microphone
                        },
                        LOUDNESS: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 10
                        }
                    }
                },
                {
                    opcode: 'getMicrophoneLoudness',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'soundSensing.getMicrophoneLoudness',
                        default: 'microphone loudness',
                        description: 'get the loudness of the sound measured by the microphone'
                    })
                },
                {
                    opcode: 'getProjectLoudness',
                    blockType: BlockType.REPORTER,
                    text: formatMessage({
                        id: 'soundSensing.getProjectLoudness',
                        default: 'project loudness',
                        description: 'get the loudness of the sound produced by the project'
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
                        }
                    ]
                }
            }
        };
    }

    whenLoud (args) {
        const loudness = Cast.toNumber(args.LOUDNESS);
        return this.getLoudness(args.INPUT) > loudness;
    }

    getMicrophoneLoudness () {
        return this.getLoudness(INPUT.microphone);
    }

    getProjectLoudness (args, util) {
        const thisSpriteId = util.target.sprite.clones[0].id;
        const playerTargets = util.target.sprite.soundBank.playerTargets;
        for (const [playerId, playerTarget] of playerTargets) {
            if (playerTarget.id === thisSpriteId) {
                console.log('this sprite has a sound player', playerId);
            }
        }
        debugger;
        return this.getLoudness(INPUT.project);
    }

    getLoudness (input) {
        if (typeof this.runtime.audioEngine === 'undefined') return -1;
        if (this.runtime.currentStepTime === null) return -1;
        if (!this.loudness) {
            const engine = this.runtime.audioEngine;
            this.loudness = new Loudness(engine.audioContext, engine.inputNode);
        }

        let timeSinceLoudness = 0;
        switch (input) {
        case INPUT.microphone:
            timeSinceLoudness = this._timer.time() - this._cachedMicrophoneLoudnessTimestamp;
            if (timeSinceLoudness < this.runtime.currentStepTime) {
                return this._cachedMicrophoneLoudness;
            }
            this._cachedMicrophoneLoudness = this.loudness.getMicrophoneLoudness();
            this._cachedMicrophoneLoudnessTimestamp = this._timer.time();
            return this._cachedMicrophoneLoudness;
        case INPUT.project:
            timeSinceLoudness = this._timer.time() - this._cachedProjectLoudnessTimestamp;
            if (timeSinceLoudness < this.runtime.currentStepTime) {
                return this._cachedProjectLoudness;
            }
            this._cachedProjectLoudness = this.loudness.getProjectLoudness();
            this._cachedProjectLoudnessTimestamp = this._timer.time();
            return this._cachedProjectLoudness;
        }
    }
}
module.exports = Scratch3SoundSensingBlocks;
