const formatMessage = require('format-message');
const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Words = require('./words');

/**
 * Icon svg to be displayed at the left edge of each extension block, encoded as a data URI.
 * @type {string}
 */
// eslint-disable-next-line max-len
const blockIconURI = '';

/**
 * Class for the makey makey blocks in Scratch 3.0
 * @constructor
 */
class Scratch3WordsBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'words',
            name: 'Words',
            blockIconURI: blockIconURI,
            blocks: [
                {
                    opcode: 'getRandomWord',
                    text: formatMessage({
                        id: 'words.getRandomWord',
                        default: 'random [CATEGORY]',
                        description: ''
                    }),
                    blockType: BlockType.REPORTER,
                    arguments: {
                        CATEGORY: {
                            type: ArgumentType.STRING,
                            menu: 'category',
                            defaultValue: 'animal'
                        }
                    }
                }
            ],
            menus: {
                category: {
                    acceptReporters: false,
                    items: [
                        'animal',
                        'fruit',
                        'vegetable',
                        'noun',
                        'adjective'
                    ]
                }
            }
        };
    }

    getRandomWord (args) {
        const array = Words[args.CATEGORY];
        return array[Math.floor(Math.random() * array.length)];
    }
}
module.exports = Scratch3WordsBlocks;
