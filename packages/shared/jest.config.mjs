// eslint-disable-next-line import/no-relative-packages
import baseConfig from '../../jest.config.mjs';

process.env.RPC_BROKER_WSS_URL = 'wss://rpc-broker.example.com';

export default {
  ...baseConfig,
};
