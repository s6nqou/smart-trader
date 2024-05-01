import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, TransactionError, TransactionExpiredBlockheightExceededError, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { AccountMeta, AccountMetaReadonly, Liquidity, MAINNET_PROGRAM_ID, Market, MarketState, Percent, TOKEN_PROGRAM_ID, WSOL } from "@raydium-io/raydium-sdk";
import { SwapBaseInArgsLayout } from "./layouts";
import BN from "bn.js";
import { createAssociatedTokenAccountIdempotentInstruction, createCloseAccountInstruction, createSyncNativeInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { SwapRayLogCommon, findAndParseSwapRayLog } from "./swap";
import { parseErrorFromTransactionError } from "./error";
import config from "../config";
import { connection, getJitoClient } from "../client";
import { sendAndConfirmJitoBundle } from "../jito";
import { retry } from "../utils";
import { logger } from "../logger";

const swapLogger = logger.child({ name: 'swap' });

export type SwapPoolInfo = {
  id: PublicKey;
  marketProgramId: PublicKey;
  marketId: PublicKey,
  openOrders: PublicKey;
  targetOrders: PublicKey;
  baseMint: PublicKey,
  quoteMint: PublicKey,
  baseVault: PublicKey;
  quoteVault: PublicKey;
}

export function makeSwapInstruction(
  poolInfo: SwapPoolInfo, marketInfo: MarketState, amountIn: BN, minAmountOut: BN,
  mintIn: PublicKey, mintOut: PublicKey, owner: PublicKey
): TransactionInstruction[] {
  const instructions: TransactionInstruction[] = [];

  const [tokenAccountIn, tokenAccountOut] = [
    getAssociatedTokenAddressSync(mintIn, owner),
    getAssociatedTokenAddressSync(mintOut, owner),
  ];

  instructions.push(createAssociatedTokenAccountIdempotentInstruction(owner, tokenAccountIn, owner, mintIn));
  if (mintIn.equals(new PublicKey(WSOL.mint))) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: owner,
        toPubkey: tokenAccountIn,
        lamports: BigInt(amountIn.toString()),
      }),
      createSyncNativeInstruction(tokenAccountIn),
    )
  }
  instructions.push(createAssociatedTokenAccountIdempotentInstruction(owner, tokenAccountOut, owner, mintOut));

  const data = Buffer.alloc(SwapBaseInArgsLayout.span);
  SwapBaseInArgsLayout.encode(
    {
      instruction: 9,
      amountIn,
      minAmountOut,
    },
    data,
  );

  const programAuthority = Liquidity.getAssociatedAuthority({ programId: MAINNET_PROGRAM_ID.AmmV4 }).publicKey;

  const marketAuthority = Market.getAssociatedAuthority({
    programId: poolInfo.marketProgramId,
    marketId: poolInfo.marketId
  }).publicKey;

  const keys = [
    // system
    AccountMetaReadonly(TOKEN_PROGRAM_ID, false),
    // amm
    AccountMeta(poolInfo.id, false),
    AccountMetaReadonly(programAuthority, false),
    AccountMeta(poolInfo.openOrders, false),
    AccountMeta(poolInfo.targetOrders, false),
    AccountMeta(poolInfo.baseVault, false),
    AccountMeta(poolInfo.quoteVault, false),
    // serum
    AccountMetaReadonly(poolInfo.marketProgramId, false),
    AccountMeta(poolInfo.marketId, false),
    AccountMeta(marketInfo.bids, false),
    AccountMeta(marketInfo.asks, false),
    AccountMeta(marketInfo.eventQueue, false),
    AccountMeta(marketInfo.baseVault, false),
    AccountMeta(marketInfo.quoteVault, false),
    AccountMetaReadonly(marketAuthority, false),
    // user
    AccountMeta(tokenAccountIn, false),
    AccountMeta(tokenAccountOut, false),
    AccountMetaReadonly(owner, true),
  ]

  instructions.push(new TransactionInstruction({
    programId: MAINNET_PROGRAM_ID.AmmV4,
    keys,
    data,
  }));

  instructions.push(createCloseAccountInstruction(tokenAccountIn, owner, owner));

  if (mintOut.equals(new PublicKey(WSOL.mint))) {
    instructions.push(createCloseAccountInstruction(tokenAccountOut, owner, owner));
  }

  return instructions;
}

export type FlashswapParams = {
  poolInfo: SwapPoolInfo,
  marketInfo: MarketState,
  mintIn: PublicKey,
  mintOut: PublicKey,
  amountIn: BN,
  minAmountOut: BN,
  keypair: Keypair,
  mode: 'normal' | 'jito' | 'auto' | 'simulate',
  cuPrice?: number,
  jitoTip?: bigint,
};

export async function flashswap(params: FlashswapParams): Promise<SwapRayLogCommon> {
  const { poolInfo, marketInfo, mintIn, mintOut, amountIn, minAmountOut, keypair, cuPrice, jitoTip } = params;

  let mode = params.mode;
  if (mode === 'auto') {
    await getJitoClient().getNextScheduledLeader().then(({ currentSlot, nextLeaderSlot }) => {
      swapLogger.debug({ poolId: poolInfo.id, currentSlot, nextLeaderSlot }, 'Fetched jito leader schedule');
      if (nextLeaderSlot - currentSlot < 5) {
        mode = 'jito';
      } else {
        mode = 'normal'
      }
    }).catch(err => {
      swapLogger.debug({ poolId: poolInfo.id, err }, 'Failed to get jito leader schedule');
      mode = 'normal';
      throw err;
    });
    swapLogger.debug({ poolId: poolInfo.id }, 'Auto selected mode: %s', mode);
  }

  swapLogger.debug({ poolId: poolInfo.id, mintIn, mintOut, amountIn: amountIn.toString() }, 'Start swapping in %s mode', mode);

  const instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
  ];
  if (mode === 'normal' && cuPrice) {
    instructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: cuPrice }));
  }
  instructions.push(
    ...makeSwapInstruction(poolInfo, marketInfo, amountIn, minAmountOut, mintIn, mintOut, keypair.publicKey),
  )

  let signature: string | null = null, error: Error | TransactionError | null = null, logs: string[] | null = null;

  if (mode === 'jito') {
    signature = await sendAndConfirmJitoBundle(instructions, jitoTip ?? BigInt(0), 'confirmed').catch(err => {
      swapLogger.debug({ poolId: poolInfo.id, mintIn, mintOut, err }, 'Failed to send or confirm swap jito bundle');
      error = err;
      return null;
    });
  } else {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const transaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: config.keypair.publicKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToLegacyMessage()
    );
    transaction.sign([config.keypair]);

    if (mode === 'simulate') {
      const result = await retry(() => connection.simulateTransaction(transaction, { commitment: 'processed' }), { retries: 3, minInterval: 1000 }).catch(err => {
        swapLogger.debug({ poolId: poolInfo.id, mintIn, mintOut, err }, 'Failed to simulate swap transaction');
        throw err;
      });
      error = result.value.err, logs = result.value.logs;
    } else {
      signature = await retry(() => connection.sendTransaction(transaction, { preflightCommitment: 'processed' }), { retries: 3, minInterval: 1000 }).catch(err => {
        swapLogger.debug({ poolId: poolInfo.id, mintIn, mintOut, err }, 'Failed to send swap transaction');
        error = err;
        return null;
      });
      if (signature) {
        const result = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed').catch(err => {
          swapLogger.debug({ poolId: poolInfo.id, mintIn, mintOut, err }, 'Failed to confirm swap transaction');
          if (err instanceof TransactionExpiredBlockheightExceededError) {
            throw new Error('Transaction did not land');
          }
          throw err;
        });
        if (result.value.err) {
          error = result.value.err;
        }
      }
    }
  }

  if (signature && !error && !logs) {
    const result = await retry(
      () => connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }).then(res => res ?? Promise.reject(Error('Transaction did not land'))),
      { retries: 3, minInterval: 1000 },
    ).catch(err => {
      swapLogger.debug({ poolId: poolInfo.id, mintIn, mintOut, err }, 'Failed to get swap transaction');
      throw err;
    });
    if (result.meta?.err) {
      error = result.meta.err;
    }
    if (result.meta?.logMessages) {
      logs = result.meta.logMessages;
    }
  }

  if (error) {
    error = error instanceof Error ? error : new Error('Transaction error: ' + JSON.stringify(error), { cause: error });
    error = parseErrorFromTransactionError(error) ?? error;
    swapLogger.warn({ poolId: poolInfo.id, mintIn, mintOut, err: error }, 'Failed to swap in %s mode', mode);
    throw error;
  }
  if (logs) {
    const parsedLog = findAndParseSwapRayLog(logs);
    if (parsedLog) {
      swapLogger.debug({ poolId: poolInfo.id, mintIn, mintOut, amountIn: amountIn.toString(), amountOut: parsedLog.amountOut.toString() }, 'Swapped successfully in %s mode', mode);
      return parsedLog;
    }
  }

  throw Error('Can not find swap log in the transaction');
}

export function computeMinAmountOut(amountIn: BN, inReserve: BN, outReserve: BN, slippage: number): BN {
  return new Percent(1).add(new Percent(slippage, 100)).add(1).invert().mul(amountIn.mul(outReserve).div(inReserve.add(amountIn))).quotient;
}
