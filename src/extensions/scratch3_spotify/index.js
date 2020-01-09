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

        this.currentTrackObject = {};

        this.beatFlag = false;
        this.currentBeatNum = 0;
        this.beatTimeouts = [];
        this.prevQuery = '';

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
                },
                {
                    opcode: 'whenABeatPlays',
                    text: formatMessage({
                        id: 'spotify.whenABeatPlays',
                        default: 'when a beat plays',
                        description: ''
                    }),
                    blockType: BlockType.HAT
                },
                {
                    opcode: 'getTrackInfo',
                    text: formatMessage({
                        id: 'spotify.getTrackInfo',
                        default: 'track info',
                        description: ''
                    }),
                    blockType: BlockType.REPORTER
                },
                {
                    opcode: 'stopMusic',
                    text: formatMessage({
                        id: 'spotify.stopMusic',
                        default: 'stop the music',
                        description: 'stop the music.'
                    }),
                    blockType: BlockType.COMMAND
                }
            ]
        };
    }

    playMusicAndWait (args) {
        const query = Cast.toString(args.QUERY);
        if (query === this.prevQuery && this.currentTrackObject.url) {
            return this.playTrack(this.currentTrackObject);
        }
        return this.refreshAccessTokenIfNeeded().then(() =>
            this.requestSearch(query).then(trackObjects =>
                this.keepTryingToGetTimingData(trackObjects).then(trackObject => {
                    this.currentTrackObject = trackObject;
                    this.prevQuery = query;
                    return this.playTrack(this.currentTrackObject);
                })
            )
        );
    }

    setupTimeouts () {
        // events on each beat
        this.clearTimeouts();
        this.beatTimeouts = [];
        for (let i = 0; i < this.currentTrackObject.numBeats; i++) {
            const t = window.setTimeout(num => {
                this.beatFlag = true;
                this.currentBeatNum = num;
            }, (this.currentTrackObject.beats[i] - 0.1) * 1000, i);
            this.beatTimeouts.push(t);
        }
    }

    clearTimeouts () {
        this.beatTimeouts.forEach(timeout => clearTimeout(timeout));
    }

    whenABeatPlays () {
        if (this.beatFlag) {
            window.setTimeout(() => {
                this.beatFlag = false;
            }, 60);
            return true;
        }
        return false;
    }

    getTrackInfo () {
        if (this.currentTrackObject.url) {
            const t = this.currentTrackObject;
            return `${t.name} by ${t.artist} from ${t.album}`;
        }
        return '';
    }

    stopMusic () {
        this._stopAllSounds();
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

    refreshAccessTokenIfNeeded () {
        return new Promise(resolve => {
            if (!this.spotifyToken || this.currentTimeSec() > this.spotifyToken.expirationTime) {
                this.getAccessToken().then(newToken => {
                    this.spotifyToken = newToken;
                    log.warn('token expired, got a new one');
                    resolve();
                });
            } else {
                resolve();
            }
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

                let trackObjects = body.tracks.items;

                if (!trackObjects || trackObjects.length === 0) {
                    log.warn('no tracks');
                    return reject();
                }

                trackObjects = trackObjects.filter(t => !t.explicit);
                if (trackObjects.length === 0) {
                    log.warn('no tracks without explicit lyrics');
                    return reject();
                }

                trackObjects = trackObjects.filter(t => t.preview_url);
                if (trackObjects.length === 0) {
                    log.warn('no tracks with preview mp3');
                    return reject();
                }

                resolve(trackObjects);
            });
        });
    }

    keepTryingToGetTimingData (trackObjects) {
        return new Promise((resolve, reject) =>
            this.tryToGetTimingData(trackObjects, resolve, reject)
        );
    }

    tryToGetTimingData (trackObjects, resolve, reject) {
        this.getTrackTimingData(trackObjects[0].preview_url).then(
            trackTimingData => {
                const track = trackObjects[0];
                const trackObject = {
                    url: track.preview_url,
                    name: track.name ? track.name : '',
                    artist: track.artists ? track.artists[0].name : '',
                    album: track.album ? track.album.name : '',
                    ...trackTimingData
                };
                resolve(trackObject);
            },
            () => {
                log.warn(`no timing data for ${trackObjects[0].name}, trying next track`);
                if (trackObjects.length > 1) {
                    trackObjects = trackObjects.slice(1);
                    return this.tryToGetTimingData(trackObjects, resolve, reject);
                }
                log.warn('no more results');
                reject();
            });
    }

    playTrack (trackObject) {
        if (trackObject.soundPlayer) {
            return this.start(trackObject.soundPlayer);
        }
        return this.downloadTrack(trackObject).then(() =>
            this.start(trackObject.soundPlayer)
        );
    }

    start (soundPlayer) {
        return new Promise(resolve => {
            const engine = this.runtime.audioEngine;
            const chain = engine.createEffectChain();
            chain.set('volume', 100);
            soundPlayer.connect(chain);

            soundPlayer.play();
            soundPlayer.on('stop', () => {
                // this._soundPlayers.delete(soundPlayer.id);
                resolve();
            });

            window.clearTimeout(this.trackTimeout);
            this.trackTimeout = window.setTimeout(() => {
                soundPlayer.stop();
            }, this.currentTrackObject.loop_duration * 1000);

            this.setupTimeouts();
        });
    }

    downloadTrack (trackObject) {
        return new Promise(resolve => {
            nets({
                url: trackObject.url,
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

                const sound = {
                    data: {
                        buffer: body.buffer
                    }
                };

                this.runtime.audioEngine.decodeSoundPlayer(sound).then(soundPlayer => {
                    this._stopAllSounds();
                    this._soundPlayers.set(soundPlayer.id, soundPlayer);

                    trackObject.soundPlayer = soundPlayer;
                    resolve();
                });
            });
        });
    }

    _stopAllSounds () {
        this.clearTimeouts();
        this._soundPlayers.forEach(player => {
            player.stop();
        });
    }

    // code below adapted from spotify
    getTrackTimingData (url) {
        return new Promise((resolve, reject) => {
            if (!url) {
                reject();
                return;
            }
            this.makeRequest(url, resolve, reject);
        });
    }

    findString (buffer, string) {
        for (let i = 0; i < buffer.length - string.length; i++) {
            let match = true;
            for (let j = 0; j < string.length; j++) {
                const c = String.fromCharCode(buffer[i + j]);
                if (c !== string[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                return i;
            }
        }
        return -1;
    }

    getSection (buffer, start, which) {
        let sectionCount = 0;
        let i;
        for (i = start; i < buffer.length; i++) {
            if (buffer[i] === 0) {
                sectionCount++;
            }
            if (sectionCount >= which) {
                break;
            }
        }
        i++;
        let content = '';
        while (i < buffer.length) {
            if (buffer[i] === 0) {
                break;
            }
            const c = String.fromCharCode(buffer[i]);
            content += c;
            i++;
        }
        let js = '';
        try {
            js = JSON.parse(content);
        } catch (e) {
            js = '';
        }
        return js;
    }

    makeRequest (url, resolve, reject) {
        if (!url) {
            reject();
            return;
        }
        nets({
            url: url,
            responseType: 'arraybuffer'
        }, (err, res, body) => {
            const buffer = new Uint8Array(body.buffer); // this.response == uInt8Array.buffer
            const idx = this.findString(buffer, 'GEOB');
            const trackTimingData = this.getSection(buffer, idx + 1, 8);

            if (!trackTimingData) {
                reject();
                return;
            }

            for (let i = 0; i < trackTimingData.beats.length; i++) {
                if (trackTimingData.loop_duration < trackTimingData.beats[i]) {
                    trackTimingData.numBeats = i;
                    break;
                }
            }

            resolve(trackTimingData);
        });
    }


}
module.exports = Scratch3SpotifyBlocks;
