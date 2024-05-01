import { Context, Logs, PublicKey } from "@solana/web3.js";
import { logger } from "../logger";
import { SwapRayLogCommon, computePriceFromRayLog, findAndParseSwapRayLog } from "../raydium/swap";
import Big from "big.js";
import { connection } from "../client";
import { Pool } from "./pool";

const screenerLogger = logger.child({ name: 'screener' });

export class Screener {
  private poolId: PublicKey;
  private baseDecimals: number;
  private quoteDecimals: number;
  private coinSide: 'base' | 'quote';

  private listener: (price: Big) => void;
  private clientSubscriptionId?: number;
  private intervalId?: NodeJS.Timeout;
  private prices: Big[] = [];

  constructor(poolInfo: Pick<Pool, 'id' | 'baseDecimals' | 'quoteDecimals' | 'coinSide'>, listener: (price: Big) => void) {
    this.poolId = poolInfo.id;
    this.baseDecimals = poolInfo.baseDecimals;
    this.quoteDecimals = poolInfo.quoteDecimals;
    this.coinSide = poolInfo.coinSide;
    this.listener = listener;
  }

  watch(interval = 1000) {
    if (this.clientSubscriptionId !== undefined) {
      throw Error('Already in watching');
    }
    this.clientSubscriptionId = connection.onLogs(this.poolId, this.processLogs.bind(this), 'recent');
    this.intervalId = setInterval(this.processPrices.bind(this), interval);
    screenerLogger.debug({ poolId: this.poolId }, 'Start watching screen: poolId=%s', this.poolId);
  }

  async disconnect() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    if (this.clientSubscriptionId !== undefined) {
      return connection.removeOnLogsListener(this.clientSubscriptionId);
    }
  }

  private async processPrices() {
    if (!this.prices.length) {
      return;
    }

    const prices = this.prices;
    this.prices = [];

    prices.sort((a, b) => a.gt(b) ? 1 : -1);
    const median = prices[Math.floor(prices.length / 2)];

    try {
      this.listener(median);
    } catch (err) {
      screenerLogger.debug({ poolId: this.poolId, err }, 'Callback error');
    }
  }

  private async processLogs({ logs, signature, err }: Logs, { slot }: Context) {
    const poolId = this.poolId;

    if (err) {
      return;
    }

    let parsedSwapRayLog: SwapRayLogCommon | null;
    try {
      parsedSwapRayLog = findAndParseSwapRayLog(logs);
    } catch (err) {
      return screenerLogger.debug({ poolId, signature, err }, 'Failed to parse swap ray log');
    }
    if (!parsedSwapRayLog) {
      return screenerLogger.trace({ poolId, signature }, 'Ignored transaction: ray log not found');
    }

    const price = computePriceFromRayLog(parsedSwapRayLog, this.baseDecimals, this.quoteDecimals, this.coinSide);
    screenerLogger.trace({ poolId, signature, price }, 'Got new price: %s', price.toString());

    this.prices.push(price);
  }
}
