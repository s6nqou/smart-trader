import { ParsedTransaction, ParsedTransactionMeta, PublicKey, TransactionVersion } from "@solana/web3.js";
import { logger } from "../logger";
import { InitRayLog } from "../raydium/layouts";
import { Initialize2InstructionAccounts, findAndParseInitRayLog, parseInitialize2InstructionAccounts } from "../raydium/initialize";
import { MAINNET_PROGRAM_ID, ReplaceType, WSOL } from "@raydium-io/raydium-sdk";
import config from "../config";
import WebSocket from "ws";
import { Pool } from "./pool";

const observerLogger = logger.child({ name: 'observer' });

export type RawParsedTransactionResponse = {
  transaction: ReplaceType<ParsedTransaction, PublicKey, string>;
  meta: ReplaceType<ParsedTransactionMeta, PublicKey, string> | null;
  version: TransactionVersion;
}

export class Observer {
  static readonly CREATE_FEE_ACCOUNT = new PublicKey('7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5');

  private listener: (pool: Pool) => void;
  private ws?: WebSocket;

  constructor(listener: (pool: Pool) => void) {
    this.listener = listener;
  }

  observe() {
    if (this.ws !== undefined) {
      throw Error('Already in observing');
    }
    const ws = new WebSocket(config.websocketUrl);
    ws.on('error', (err) => {
      observerLogger.error({ err }, 'Observer websocket error');
    });
    ws.on('close', (code, reason) => {
      observerLogger.warn({ code, reason }, 'Observer websocket closed, reconnecting');
      this.ws = undefined;
      this.observe();
    });
    ws.on('message', data => {
      data = data.toString('utf8');
      try {
        const message = JSON.parse(data);
        if (message.method === 'transactionNotification') {
          this.processTransaction(message.params.result.transaction);
        } else if (message.result) {
          observerLogger.debug('Start observing for new pool');
        } else {
          observerLogger.trace({ message }, 'Received unknown message');
        }
      } catch (err) {
        observerLogger.warn({ data, err }, 'Failed to parse websocket message');
        this.ws = undefined;
        this.observe();
      }
    });
    ws.on('open', () => {
      ws.send(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "transactionSubscribe",
        params: [
          {
            accountRequired: [Observer.CREATE_FEE_ACCOUNT.toString(), MAINNET_PROGRAM_ID.AmmV4.toString()],
            failed: false,
          },
          {
            commitment: "processed",
            encoding: "jsonParsed",
            transactionDetails: "full",
            showRewards: false,
            maxSupportedTransactionVersion: 0
          }
        ]
      }));
    });
    this.ws = ws;
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }

  private async processTransaction(transaction: RawParsedTransactionResponse) {
    const startTime = Date.now();
    const signature = transaction.transaction.signatures[0];

    observerLogger.trace({ signature }, 'Processing transaction');

    if (!transaction.meta) {
      return observerLogger.trace({ signature }, 'Ignored transaction: missing transaction meta');
    }
    if (transaction.meta.err) {
      return observerLogger.trace({ signature, err: transaction.meta.err }, 'Ignored transaction: found error logs');
    }
    if (!transaction.meta.logMessages) {
      return observerLogger.trace({ signature }, 'Ignored transaction: missing transaction logs');
    }

    let parsedInitRayLog: InitRayLog | null;
    try {
      parsedInitRayLog = findAndParseInitRayLog(transaction.meta.logMessages);
    } catch (err) {
      return observerLogger.debug({ signature, err }, 'Failed to parse init ray log');
    }
    if (!parsedInitRayLog) {
      return observerLogger.trace({ signature }, 'Ignored transaction: ray log not found');
    }

    const instruction = transaction.transaction.message.instructions.find(ins => new PublicKey(ins.programId).equals(MAINNET_PROGRAM_ID.AmmV4));
    if (!instruction) {
      return observerLogger.trace({ signature }, 'Ignored transaction: could not found initialize2 instruction');
    }
    if (!('accounts' in instruction)) {
      return observerLogger.trace({ signature }, 'Ignored transaction: unexpected instruction format');
    }

    let parsedInstructionAccounts: Initialize2InstructionAccounts;
    try {
      parsedInstructionAccounts = parseInitialize2InstructionAccounts(instruction.accounts.map(acc => new PublicKey(acc)));
    } catch (err) {
      return observerLogger.debug({ signature, err }, 'Failed to parse initialize instruction accounts');
    }

    const { baseMint, quoteMint } = parsedInstructionAccounts;
    if (!baseMint.equals(new PublicKey(WSOL.mint)) && !quoteMint.equals(new PublicKey(WSOL.mint))) {
      return observerLogger.trace({ signature, quoteMint }, 'Ignored transaction: pair does not include WSOL');
    }

    const createSigners = transaction.transaction.message.accountKeys.filter(account => account.signer).map(account => new PublicKey(account.pubkey));
    const openTime = parsedInitRayLog.openTime.toNumber() * 1000;

    const pool = new Pool({
      ...parsedInitRayLog,
      ...parsedInstructionAccounts,
      programId: MAINNET_PROGRAM_ID.AmmV4,
      openTime,
      initBaseAmount: parsedInitRayLog.baseAmount,
      initQuoteAmount: parsedInitRayLog.quoteAmount,
      createSigners,
    })

    const duration = Date.now() - startTime;
    observerLogger.trace({ signature, pool, duration }, 'Got init pool info: poolId=%s', pool.id.toString());

    try {
      this.listener(pool);
    } catch (err) {
      observerLogger.debug({ signature, err }, 'Callback error');
    }
  }
}