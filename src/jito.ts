import { Commitment, PublicKey, SystemProgram, TransactionExpiredBlockheightExceededError, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { bundle } from "jito-ts";
import bs58 from "bs58";
import { connection, getJitoClient } from "./client";
import { logger } from "./logger";
import { BundleResult, droppedReasonToJSON } from "jito-ts/dist/gen/block-engine/bundle";
import config from "./config";
import EventEmitter from "events";
import { refresh, retry, timeout } from "./utils";

const jitoLogger = logger.child({ name: 'jito' });

const tipAccounts = getJitoClient().getTipAccounts().then(accounts => accounts.map(account => new PublicKey(account))).catch(err => {
  jitoLogger.error({ err }, 'Failed to get jito tip accounts');
  throw err;
});

const getRandomTipAccount = async () => {
  const accounts = await tipAccounts;
  return accounts[Math.floor(Math.random() * accounts.length)];
};

const recentBlockhash = refresh(() => connection.getLatestBlockhash('finalized'), { interval: 10 * 1000 });

const bundleResultEvent = new EventEmitter<Record<string, [BundleResult]>>();

retry(
  () => new Promise((_, reject) => {
    getJitoClient().onBundleResult(result => {
      jitoLogger.debug({ result }, 'Received jito bundle result');
      bundleResultEvent.emit(result.bundleId, result);
    }, err => {
      jitoLogger.warn({ err }, 'Jito bundle result subscription error');
      reject(err);
    });
  }),
  { retries: Number.MAX_SAFE_INTEGER, minInterval: 5 * 1000 },
);


export async function sendAndConfirmJitoBundle(instructions: TransactionInstruction[], tip: bigint, commitment: Commitment): Promise<string> {
  const prepareTime = Date.now();

  if (tip !== BigInt(0)) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: config.keypair.publicKey,
        toPubkey: await getRandomTipAccount(),
        lamports: tip,
      })
    );
  }

  const { blockhash, lastValidBlockHeight } = await recentBlockhash.get();

  const transaction = new VersionedTransaction(
    new TransactionMessage({
      payerKey: config.keypair.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToLegacyMessage()
  );
  transaction.sign([config.keypair]);

  const signature = bs58.encode(transaction.signatures[0]);

  jitoLogger.debug({ signature, prepareDuration: Date.now() - prepareTime }, 'Sending jito bundle');

  const sendTime = Date.now();
  const bundleId = await retry(
    () => timeout(
      () => getJitoClient().sendBundle(new bundle.Bundle([transaction], 1)).catch(err => {
        jitoLogger.debug({ signature, err, sendDuration: Date.now() - sendTime }, 'Failed to send jito bundle');
        throw err;
      }), 5000, new Error('Send jito bundle timeout')),
    { retries: 3, minInterval: 1000 }
  );

  jitoLogger.debug({ signature, bundleId, sendDuration: Date.now() - sendTime }, 'Sent jito bundle');

  const confirmTime = Date.now();
  const abortController = new AbortController();
  try {
    await Promise.race([
      new Promise<never>((_, reject) => {
        let accepted = false;
        bundleResultEvent.on(bundleId, result => {
          jitoLogger.debug({ signature, bundleId, result, confirmDuration: Date.now() - confirmTime }, 'Got jito bundle result for the signature');
          if (accepted) {
            return;
          }
          if (result.rejected) {
            const { droppedBundle, internalError, simulationFailure, stateAuctionBidRejected, winningBatchBidRejected } = result.rejected;
            const error = droppedBundle || internalError || simulationFailure || stateAuctionBidRejected || winningBatchBidRejected;
            if (!error?.msg?.includes('processed')) {
              return reject(new Error('Jito bundle has been rejected: ' + error?.msg, { cause: result.rejected }));
            }
          } else if (result.accepted) {
            accepted = true;
          }
        });
      }),
      connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
        abortSignal: abortController.signal,
      }, commitment).then(res => {
        if (res.value.err) {
          throw new Error('Transaction error: ' + res.value.err, { cause: res.value.err });
        }
      }).catch(err => {
        if (err instanceof TransactionExpiredBlockheightExceededError) {
          throw new Error('Transaction did not land');
        }
        throw err;
      }),
    ]);
    jitoLogger.debug({ signature, bundleId, commitment, confirmDuration: Date.now() - confirmTime }, 'Confirmed transaction in jito bundle');
  } catch (err) {
    jitoLogger.debug({ signature, bundleId, err, confirmDuration: Date.now() - confirmTime }, 'Failed to confirm jito bundle');
    throw err;
  } finally {
    bundleResultEvent.removeAllListeners(bundleId);
    abortController.abort();
  }

  return signature;
}
