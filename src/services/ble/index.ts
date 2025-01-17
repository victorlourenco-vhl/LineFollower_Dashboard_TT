import { v4 as uuidv4 } from 'uuid';
import { inject, markRaw, ref } from 'vue';
import {
  ConnectionError,
  DeviceNotFoundError,
  CharacteristicWriteError,
} from './errors';
import type { PiniaPlugin } from 'pinia';
import type { App } from 'vue';

export { BleError } from './errors';

/**
 * Hardcodado pois os serviços para o envio de comandos via
 * bluetooth foram implementados apenas no Braia
 */
const ROBOTS: Robot.BluetoothConnectionConfig[] = [
  {
    name: 'Braia Pro',
    services: new Map([
      [
        '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
        new Map([
          ['UART_RX', '6e400002-b5a3-f393-e0a9-e50e24dcca9e'],
          ['UART_TX', '6e400003-b5a3-f393-e0a9-e50e24dcca9e'],
        ]),
      ],
      [
        '3a8328fb-3768-46d2-b371-b34864ce8025',
        new Map([['STREAM_TX', '3a8328fc-3768-46d2-b371-b34864ce8025']]),
      ],
    ]),
  },
];

export class BLE implements Bluetooth.BLEInterface {
  private _characteristics: Map<string, BluetoothRemoteGATTCharacteristic>;
  private _cache: string;
  private _txObservers: Bluetooth.TxObserverMap;
  private _decoder = new TextDecoder();
  private _encoder = new TextEncoder();
  private _messages: Map<string, Map<string, string[]>>;
  private _device: BluetoothDevice;

  constructor() {
    this._characteristics = new Map();
    this._cache = '';
    this._txObservers = new Map();
    this._messages = new Map();
  }

  async connect(
    device: BluetoothDevice,
    config: Required<Robot.BluetoothConnectionConfig> = ROBOTS[0]
  ) {
    this._device = device;

    try {
      device.addEventListener('gattserverdisconnected', this._onDisconnect);
      const robotGattServer = await device.gatt.connect();

      for (const [uuid, characteristics] of config.services.entries()) {
        const uartService = await robotGattServer.getPrimaryService(uuid);
        for (const [id, uuid] of characteristics.entries()) {
          const characteristic = await uartService.getCharacteristic(uuid);
          this._characteristics.set(id, characteristic);
          this._messages.set(id, new Map());

          if (id.endsWith('TX')) {
            characteristic.addEventListener(
              'characteristicvaluechanged',
              this._handleChunck.bind(this)
            );

            this._txObservers.set(id, new Map());

            await characteristic.startNotifications();
          }
        }
      }
    } catch (error) {
      return Promise.reject(new ConnectionError({ cause: error }));
    }
  }

  get connected() {
    return this._device?.gatt.connected;
  }

  disconnect() {
    if (!this._device.gatt.connected) return;

    this._device.gatt.disconnect();
  }

  decode(buffer: ArrayBufferLike) {
    return this._decoder.decode(buffer);
  }

  encode(message: string) {
    return this._encoder.encode(message);
  }

  /**
   * Envia uma mensagem através de uma characterística.
   *
   * @param id Id da characterística pela qual a mensagem será enviada.
   * @param message Mensagem a ser enviada.
   * @returns `Promise<never>`
   */
  async send(id: string, message: string) {
    if (!this._characteristics.has(id)) {
      throw new ConnectionError({
        message: 'Característica RX não encontrada.',
        action: 'Verifique se as características estão disponíveis no robô.',
      });
    }

    try {
      await this._characteristics
        .get(id)
        .writeValueWithoutResponse(this.encode(message));
    } catch (error) {
      return Promise.reject(new CharacteristicWriteError({ cause: error }));
    }
  }

  _clearCache() {
    this._cache = '';
  }

  _cacheData(value: string) {
    this._cache += value;
  }

  _onDisconnect() {
    this._cache = '';
    if (this._txObservers) {
      this._txObservers.clear();
    }
    if (this._messages) {
      this._txObservers.clear();
    }
    if (this._characteristics) {
      this._characteristics.clear();
    }
  }

  _pushMessage(characteristicId: string) {
    this._messages.get(characteristicId).forEach((messageQueue) => {
      messageQueue.push(this._cache);
    });
    return this._clearCache();
  }

  _sendMessages(characteristicId: string) {
    this._txObservers.get(characteristicId).forEach((observer, uuid) => {
      this._messages
        .get(characteristicId)
        .get(uuid)
        .forEach((rawMessage) => {
          observer instanceof Function && observer(JSON.parse(rawMessage));
        });

      this._messages.get(characteristicId).set(uuid, []);
    });
  }

  _handleChunck(event: Event) {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;

    const data = this.decode(new Uint8Array(characteristic.value.buffer));
    if (data.indexOf('\0') === -1) {
      return this._cacheData(data);
    }

    this._cacheData(data.split('\0').at(0));
    const [id] = [...this._characteristics.entries()].find(([, tx]) => {
      return tx.uuid === characteristic.uuid;
    });
    this._pushMessage(id);
    this._cacheData(data.slice(data.indexOf('\0') + 1));

    return this._sendMessages(id);
  }

  addTxObserver<T>(
    txCharacteristicId: string,
    observer: Bluetooth.CharacteristicObserver<T>,
    uuid: string = undefined
  ) {
    if (!this.connected) {
      throw new ConnectionError({
        message: 'Não há conexão bluetooth.',
        action: 'Conecte a dashboard a um seguidor de linha.',
      });
    }

    if (!this._txObservers.has(txCharacteristicId)) {
      throw new ConnectionError({
        message: 'Foram encontrados problemas na comunicação com o robô.',
        action:
          'Verifique se as configurações da interface bluetooth do robô estão corretas.',
      });
    }

    if (!uuid) {
      uuid = uuidv4();
    }

    this._txObservers.get(txCharacteristicId).set(uuid, observer);
    this._messages.get(txCharacteristicId).set(uuid, []);

    return this.removeTxObserver.bind(this, uuid, txCharacteristicId);
  }

  /**
   * Remove o observer de uma characterística.
   *
   * @param observerUuid Uuid do observer registrado para a characterística
   * @param txCharacteristicId Id da characterística (e.g. UART_TX)
   * @returns `true` caso o observer tenha sido removido, `false` caso contrário
   */
  removeTxObserver(observerUuid: string, txCharacteristicId: string) {
    this._messages.get(txCharacteristicId).delete(observerUuid);
    return this._txObservers.get(txCharacteristicId).delete(observerUuid);
  }
}

export const plugin = {
  install(app: App) {
    const ble = new BLE();
    app.config.globalProperties.$ble = ble;

    const connected = ref(false);
    const connecting = ref(false);
    app.provide<Bluetooth.UseBLE>(key, {
      ble,
      connected: connected,
      connecting: connecting,
      connect: async (config: Robot.BluetoothConnectionConfig = ROBOTS[0]) => {
        connecting.value = true;

        try {
          const device = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'TT_' }],
            optionalServices: [...config.services.keys()],
          });
          if (!device) {
            throw new DeviceNotFoundError();
          }

          await ble.connect(device, config);
          connected.value = true;
        } catch (error) {
          connected.value = false;
          throw error;
        } finally {
          connecting.value = false;
        }
        return Promise.resolve();
      },
      disconnect: () => {
        connected.value = false;
        ble.disconnect();
      },
    });
  },
};

export const piniaPlugin = (service: BLE): PiniaPlugin => {
  return () => ({ ble: markRaw(service) });
};

const key = Symbol('ble');
export default () => inject<Bluetooth.UseBLE>(key);
