import BN from "bn.js";
import { RayLogLayout, SwapDirection } from "./layouts";
import Big from "big.js";
import { Currency, Price } from "@raydium-io/raydium-sdk";
import { PublicKey } from "@solana/web3.js";

export function parseSwapInstructionAccounts(accounts: PublicKey[]) {
  const ACCOUNT_LEN = 17;

  if (accounts.length > ACCOUNT_LEN + 1) {
    throw Error('Account length does not match');
  }
  if (accounts.length === ACCOUNT_LEN + 1) {
    accounts.splice(4, 1);
  }

  const [
    tokenProgram, id, authority, openOrders, baseVault, quoteVault,
    marketProgramId, marketId, marketBids, marketAsks, marketEventQueue, marketBaseVault, marketQuoteVault, marketAuthority,
    tokenAccountIn, tokenAccountOut, owner
  ] = accounts;

  return {
    tokenProgram, id, authority, openOrders, baseVault, quoteVault,
    marketProgramId, marketId, marketBids, marketAsks, marketEventQueue, marketBaseVault, marketQuoteVault, marketAuthority,
    tokenAccountIn, tokenAccountOut, owner
  };
}

export type SwapRayLogCommon = {
  direction: SwapDirection,
  amountIn: BN,
  amountOut: BN,
  baseReserve: BN,
  quoteReserve: BN,
}

export function findAndParseSwapRayLog(logs: string[]): SwapRayLogCommon | null {
  for (let i = logs.length - 1; i > 0; i--) {
    const log = logs[i];
    if (log.startsWith('Program log: ray_log: ')) {
      const rayLog = log.replace('Program log: ray_log: ', '');
      const parsed = RayLogLayout.decode(Buffer.from(rayLog, 'base64'));
      if (parsed.swapBaseIn) {
        const { direction, amountIn, amountOut, baseReserve, quoteReserve } = parsed.swapBaseIn;
        return {
          direction: direction.toNumber(),
          amountIn,
          amountOut,
          baseReserve,
          quoteReserve,
        };
      } else if (parsed.swapBaseOut) {
        const { direction, amountIn, amountOut, baseReserve, quoteReserve } = parsed.swapBaseOut;
        return {
          direction: direction.toNumber(),
          amountIn,
          amountOut,
          baseReserve,
          quoteReserve,
        };
      }
    }
  }

  return null;
}

export function computePriceFromRayLog(swapRayLog: SwapRayLogCommon, baseDecimals: number, quoteDecimals: number, coinSide: 'base' | 'quote'): Big {
  const { amountIn, amountOut, direction } = swapRayLog;
  const baseAmount = direction === SwapDirection.Base2Quote ? amountIn : amountOut;
  const quoteAmount = direction === SwapDirection.Quote2Base ? amountIn : amountOut;
  const price = new Price(
    new Currency(coinSide === 'base' ? baseDecimals : quoteDecimals),
    coinSide === 'base' ? baseAmount : quoteAmount,
    new Currency(coinSide === 'base' ? quoteDecimals : baseDecimals),
    coinSide === 'base' ? quoteAmount : baseAmount,
  );
  return new Big(price.toSignificant());
}
