import 'dotenv/config';
import assert from 'assert';
import { setTimeout as sleep } from 'timers/promises';
import {
  InternalAsset,
  UncheckedAssetAndChain,
  getAssetAndChain,
  getInternalAsset,
} from '@/shared/enums';
import { getBlockHash, getPoolOrders, getPoolPriceV2, getSupportedAssets } from '@/shared/rpc';
import env from '../config/env';
import { AsyncCacheMap } from '../utils/dataStructures';
import { handleExit } from '../utils/function';
import logger from '../utils/logger';

const rpcConfig = { rpcUrl: env.RPC_NODE_HTTP_URL };

type BaseAsset = Exclude<InternalAsset, 'Usdc'>;

let baseAssets: BaseAsset[];

type PoolState = {
  poolState: string;
  rangeOrderPrice: bigint;
};

const fetchPoolState = async (hash: string) => {
  baseAssets ??= (await getSupportedAssets(rpcConfig))
    .filter((asset) => !(asset.chain === 'Ethereum' && asset.asset === 'USDC'))
    .map((asset) => getInternalAsset(asset as UncheckedAssetAndChain)) as BaseAsset[];

  return Object.fromEntries(
    await Promise.all(
      baseAssets.map(async (asset) => {
        const base = getAssetAndChain(asset);
        const usdc = getAssetAndChain('Usdc');

        const [orders, price] = await Promise.all([
          getPoolOrders(rpcConfig, base, usdc, null, hash),
          getPoolPriceV2(rpcConfig, base, usdc, hash),
        ]);

        return [asset, { poolState: orders, rangeOrderPrice: price.rangeOrder }] as const;
      }),
    ),
  ) as Record<BaseAsset, PoolState>;
};

export default class PoolStateCache {
  private running = false;

  private latestHash: string | null = null;

  private age = 0;

  private cleanup?: () => void;

  private cacheMap = new AsyncCacheMap<string, Record<BaseAsset, PoolState>>({
    resetExpiryOnLookup: false,
    ttl: 10_000,
    fetch: fetchPoolState,
  });

  start() {
    if (this.running) return this;

    this.running = true;

    this.cleanup = handleExit(() => {
      this.stop();
    });

    this.startPolling();

    return this;
  }

  stop() {
    this.running = false;
    this.cleanup?.();
  }

  private async startPolling() {
    while (this.running) {
      const hash = await getBlockHash(rpcConfig).catch(() => null);

      if (hash !== null && hash !== this.latestHash) {
        this.latestHash = hash;

        const success = await this.cacheMap.load(hash);

        if (success) {
          this.age = Date.now();
        } else {
          logger.error('failed to fetch pool state', { hash });
        }
      }

      await sleep(1_000);
    }
  }

  async getPoolState(asset: BaseAsset) {
    while (this.latestHash === null && this.running) {
      await sleep(1_000);
    }

    assert(this.latestHash !== null && Date.now() - this.age < 10_000, 'cache should be fresh');

    const cache = await this.cacheMap.get(this.latestHash);

    assert(cache !== undefined, 'cache should be present');

    return cache[asset];
  }
}
