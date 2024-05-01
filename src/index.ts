import Big from "big.js";
import { Observer } from "./core/observer";
import { logger } from "./logger";

Big.NE = -21;

export async function start() {
  const observer = new Observer(async pool => {
    logger.info({ poolId: pool.id, mint: pool.coinMint }, 'Got new pool info');

    /** HIDDEN */
  });
  observer.observe();
  logger.info('Start observing...');
}
