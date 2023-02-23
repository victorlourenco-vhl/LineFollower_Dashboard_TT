declare namespace Robot {
  enum Status {
    CAR_IN_CURVE = 0,
    CAR_IN_LINE = 1,
    CAR_STOPPED = 2,
  }

  type DataClass = Map<string, string | number>;

  interface Response<T> extends Record<string, unknown> {
    cmdExecd: string;
    data: T;
  }

  type MappingRecord = {
    id: number;
    encMedia: number;
    time: number;
    encRight: number;
    encLeft: number;
    offset: number
    status: Status;
    trackStatus: number;
  };

  type RuntimeStream = {
    name: string;
    value: number | string;
    Time: number;
  };

  type BluetoothConnectionConfig = {
    name: string;
    services: Map<string, Map<string, string>>;
  };

  type Command = (
    ble: Bluetooth.BLEInterface,
    command: string,
    characteristicId: string
  ) => Promise<never>;
}
