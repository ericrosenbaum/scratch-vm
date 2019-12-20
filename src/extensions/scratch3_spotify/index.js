const formatMessage = require('format-message');
const nets = require('nets');
const log = require('../../util/log');

const ArgumentType = require('../../extension-support/argument-type');
const BlockType = require('../../extension-support/block-type');
const Cast = require('../../util/cast');

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
 * Class for the spotify blocks.
 * @constructor
 */
class Scratch3SpotifyBlocks {
    constructor (runtime) {
        /**
         * The runtime instantiating this block package.
         * @type {Runtime}
         */
        this.runtime = runtime;

        this.getAccessToken().then(token => {
            this.spotifyToken = token;
        });

        this._soundPlayers = new Map();

        this._stopAllSounds = this._stopAllSounds.bind(this);
        if (this.runtime) {
            this.runtime.on('PROJECT_STOP_ALL', this._stopAllSounds);
        }
    }

    /**
     * @returns {object} metadata for this extension and its blocks.
     */
    getInfo () {
        return {
            id: 'spotify',
            name: formatMessage({
                id: 'spotify.categoryName',
                default: 'Spotify',
                description: ''
            }),
            blockIconURI: blockIconURI,
            menuIconURI: menuIconURI,
            blocks: [
                {
                    opcode: 'playMusicAndWait',
                    text: formatMessage({
                        id: 'spotify.playMusicAndWaitBlock',
                        default: 'play music like [QUERY]',
                        description: 'play some music.'
                    }),
                    blockType: BlockType.COMMAND,
                    arguments: {
                        QUERY: {
                            type: ArgumentType.STRING,
                            defaultValue: 'chance the rapper'
                        }
                    }
                }
            ]
        };
    }

    playMusicAndWait (args) {
        return this.requestSearch(Cast.toString(args.QUERY));
    }

    currentTimeSec () {
        return new Date().getTime() / 1000;
    }

    getAccessToken () {
        return new Promise((resolve, reject) => {
            nets({
                url: 'https://u61j2fb017.execute-api.us-east-1.amazonaws.com/prod/get-spotify-token',
                encoding: 'undefined',
                json: true,
                timeout: 10000
            }, (err, res) => {
                if (err) {
                    log.warn(err);
                    reject();
                }
                const token = {};
                token.expirationTime = this.currentTimeSec() + 3600;
                token.value = res.body.token;
                log.warn('got token', token.value);
                resolve(token);
            });
        });
    }

    requestSearch (query) {
        return new Promise((resolve, reject) => {
            if (!this.spotifyToken) {
                return reject();
            }
            if (query === '') {
                return reject();
            }
            nets({
                url: `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track`,
                headers: {
                    Authorization: `Bearer ${this.spotifyToken.value}`
                },
                json: true
            }, (err, res, body) => {

                if (err) {
                    log.warn(err);
                    return reject();
                }

                if (res.statusCode !== 200) {
                    log.warn(res.statusCode);
                    return reject();
                }

                const trackObjects = body.tracks.items;
                console.log(trackObjects);

                const songUrl = trackObjects[0].preview_url;
                resolve(this.playTrack(songUrl));
            });
        });
    }

    playTrack (url) {
        return new Promise(resolve => {
            nets({
                url: url,
                timeout: 10000
            }, (err, res, body) => {
                if (err) {
                    log.warn(err);
                    return resolve();
                }

                if (res.statusCode !== 200) {
                    log.warn(res.statusCode);
                    return resolve();
                }

                // Play the sound
                const sound = {
                    data: {
                        buffer: body.buffer
                    }
                };

                this.runtime.audioEngine.decodeSoundPlayer(sound).then(soundPlayer => {
                    this._stopAllSounds();
                    this._soundPlayers.set(soundPlayer.id, soundPlayer);

                    const engine = this.runtime.audioEngine;
                    const chain = engine.createEffectChain();
                    chain.set('volume', 100);
                    soundPlayer.connect(chain);

                    soundPlayer.play();
                    soundPlayer.on('stop', () => {
                        this._soundPlayers.delete(soundPlayer.id);
                        resolve();
                    });
                });
            });
        });
    }

    _stopAllSounds () {
        this._soundPlayers.forEach(player => {
            player.stop();
        });
    }
}
module.exports = Scratch3SpotifyBlocks;
