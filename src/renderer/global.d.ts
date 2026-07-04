import type { MqttTreeApi } from '../shared/contracts';

declare global {
  interface Window {
    mqttTree: MqttTreeApi;
  }
}

export {};
