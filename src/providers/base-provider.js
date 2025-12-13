import { defaultTransport } from '../transport/unified-transport.js';

export class BaseProvider {
  constructor(config) {
    this.config = config;
    this.transport = defaultTransport;
  }

  async generate(payload) {
    throw new Error('Method not implemented');
  }

  async stream(payload) {
    throw new Error('Method not implemented');
  }

  async healthCheck() {
    return true;
  }
}
