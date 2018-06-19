const JSONRPCWebSocket = require('../util/jsonrpc-web-socket');
const PeripheralChooser = require('./peripheralChooser');

const ScratchLinkWebSocket = 'ws://localhost:20110/scratch/ble';

class ScratchBLE extends JSONRPCWebSocket {
    constructor (runtime, deviceOptions) {
        const ws = new WebSocket(ScratchLinkWebSocket);
        super(ws);

        this._socketPromise = new Promise((resolve, reject) => {
            this._ws.onopen = resolve;
            this._ws.onerror = reject;
        });

        this._runtime = runtime;

        this._ws = ws;
        this.peripheralChooser = new PeripheralChooser(this._runtime); // TODO: finalize gui connection
        this._characteristicDidChange = null;

        this._deviceOptions = deviceOptions;
    }

    // @todo handle websocket failed
    startScan () {
        console.log('BLE startScan', this._ws.readyState);
        if (this._ws.readyState === 1) {
            this.sendRemoteRequest('pingMe')
                .then(() => this.requestDevice(this._deviceOptions));
        } else {
            // Try again to connect to the websocket
            this._socketPromise(this.sendRemoteRequest('pingMe')
                .then(() => this.requestDevice(this._deviceOptions)));
        }
    }

    connectToPeripheral (id) {
        this.sendRemoteRequest(
            'connect',
            {peripheralId: id}
        ).then(() =>
            this._runtime.emit(this._runtime.constructor.PERIPHERAL_CONNECTED)
        );
    }

    /**
     * Request a device with the device options and optional gui options.
     * @param {object} deviceOptions - list of device guiOptions.
     * @param {object} onConnect - on connect callback.
     * @param {object} onError - on error callbackk.
     */
    requestDevice (deviceOptions, onConnect, onError) {
        this.sendRemoteRequest('discover', deviceOptions)
            .then(() => this.peripheralChooser.choosePeripheral()) // TODO: use gui options?
            .then(id => this.sendRemoteRequest(
                'connect',
                {peripheralId: id}
            ))
            .then(
                onConnect,
                onError
            );
    }

    /**
     * Handle a received call from the socket.
     * @param {string} method - a received method label.
     * @param {object} params - a received list of parameters.
     * @return {object} - optional return value.
     */
    didReceiveCall (method, params) {
        // TODO: Add peripheral 'undiscover' handling
        switch (method) {
        case 'didDiscoverPeripheral':
            this.peripheralChooser.addPeripheral(params);
            break;
        case 'characteristicDidChange':
            this._characteristicDidChange(params.message);
            break;
        case 'ping':
            return 42;
        }
    }

    /**
     * Start reading from the specified ble service.
     * @param {number} serviceId - the ble service to read.
     * @param {number} characteristicId - the ble characteristic to read.
     * @param {boolean} optStartNotifications - whether to start receiving characteristic change notifications.
     * @param {object} onCharacteristicChanged - callback for characteristic change notifications.
     * @return {Promise} - a promise from the remote read request.
     */
    read (serviceId, characteristicId, optStartNotifications = false, onCharacteristicChanged) {
        const params = {
            serviceId,
            characteristicId
        };
        if (optStartNotifications) {
            params.startNotifications = true;
        }
        this._characteristicDidChange = onCharacteristicChanged;
        return this.sendRemoteRequest('read', params);
    }

    /**
     * Write data to the specified ble service.
     * @param {number} serviceId - the ble service to write.
     * @param {number} characteristicId - the ble characteristic to write.
     * @param {string} message - the message to send.
     * @param {string} encoding - the message encoding type.
     * @return {Promise} - a promise from the remote send request.
     */
    write (serviceId, characteristicId, message, encoding = null) {
        const params = {serviceId, characteristicId, message};
        if (encoding) {
            params.encoding = encoding;
        }
        return this.sendRemoteRequest('write', params);
    }
}

module.exports = ScratchBLE;
