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
            onReady: () => {
                console.log('superpowered loaded');
                this.startSuperpowered();
            }
        });
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
                        description: 'Speak some words.'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        SOUND: {
                            type: ArgumentType.NUMBER,
                            defaultValue: 0
                        }
                    }
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
            const player = sprite.soundBank.soundPlayers[soundId];
            player.outputNode.connect(this.superpoweredNode);
            this.superpoweredNode.connect(this.runtime.audioEngine.audioContext.destination);
            window.setInterval(() => {
                this.superpoweredNode.sendMessageToAudioScope({
                    analyzer: true
                });
            }, 200);
            return soundPromise;
        }
    }
}
module.exports = Scratch3AnalyzerBlocks;
