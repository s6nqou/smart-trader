import { Currency, LIQUIDITY_STATE_LAYOUT_V4, MAINNET_PROGRAM_ID, MARKET_STATE_LAYOUT_V3, MarketState, Price, WSOL } from "@raydium-io/raydium-sdk";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { connection } from "../client";
import Big from "big.js";

export interface InitPoolInfo {
  id: PublicKey;
  programId: PublicKey;
  marketProgramId: PublicKey;
  marketId: PublicKey;
  openOrders: PublicKey;
  targetOrders: PublicKey;
  openTime: number | null;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  lpMint: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  baseDecimals: number;
  quoteDecimals: number;
  initBaseAmount?: BN;
  initQuoteAmount?: BN;
  createSigners?: PublicKey[];
}

export class Pool {
  readonly id: PublicKey;
  readonly programId: PublicKey;
  readonly marketProgramId: PublicKey;
  readonly marketId: PublicKey;
  readonly openOrders: PublicKey;
  readonly targetOrders: PublicKey;
  readonly openTime: number | null;
  readonly baseMint: PublicKey;
  readonly quoteMint: PublicKey;
  readonly lpMint: PublicKey;
  readonly baseVault: PublicKey;
  readonly quoteVault: PublicKey;
  readonly baseDecimals: number;
  readonly quoteDecimals: number;
  readonly coinSide: "base" | "quote";
  readonly initBaseAmount?: BN;
  readonly initQuoteAmount?: BN;
  readonly createSigners?: PublicKey[];

  constructor(info: InitPoolInfo) {
    if (info.quoteMint.equals(new PublicKey(WSOL.mint))) {
      this.coinSide = 'base';
    } else if (info.baseMint.equals(new PublicKey(WSOL.mint))) {
      this.coinSide = 'quote';
    } else {
      throw Error('Pair does not include WSOL')
    }

    this.id = info.id;
    this.programId = info.programId;
    this.marketProgramId = info.marketProgramId;
    this.marketId = info.marketId;
    this.openOrders = info.openOrders;
    this.targetOrders = info.targetOrders;
    this.openTime = info.openTime || null;
    this.baseMint = info.baseMint;
    this.quoteMint = info.quoteMint;
    this.lpMint = info.lpMint;
    this.baseVault = info.baseVault;
    this.quoteVault = info.quoteVault;
    this.baseDecimals = info.baseDecimals;
    this.quoteDecimals = info.quoteDecimals;
    this.initBaseAmount = info.initBaseAmount;
    this.initQuoteAmount = info.initQuoteAmount;
    this.createSigners = info.createSigners;
  }

  static async getById(id: PublicKey) {
    const poolInfo = await connection.getAccountInfo(id, 'recent').then(poolInfo => {
      if (poolInfo === null) throw Error('Pool info account not found');
      return LIQUIDITY_STATE_LAYOUT_V4.decode(poolInfo.data);
    });

    return new Pool({
      ...poolInfo,
      id,
      programId: MAINNET_PROGRAM_ID.AmmV4,
      openTime: poolInfo.poolOpenTime.toNumber() * 1000 || null,
      baseDecimals: poolInfo.baseDecimal.toNumber(),
      quoteDecimals: poolInfo.quoteDecimal.toNumber(),
    });
  }

  get coinMint() {
    return this.coinSide === 'base' ? this.baseMint : this.quoteMint;
  }

  get solMint() {
    return this.coinSide === 'base' ? this.quoteMint : this.baseMint;
  }

  get coinDecimals() {
    return this.coinSide === 'base' ? this.baseDecimals : this.quoteDecimals;
  }

  get solDecimals() {
    return this.coinSide === 'base' ? this.quoteDecimals : this.baseDecimals;
  }

  get coinVault() {
    return this.coinSide === 'base' ? this.baseVault : this.quoteVault;
  }

  get solVault() {
    return this.coinSide === 'base' ? this.quoteVault : this.baseVault;
  }

  get initCoinAmount() {
    return this.coinSide === 'base' ? this.initBaseAmount : this.initQuoteAmount;
  }

  get initSolAmount() {
    return this.coinSide === 'base' ? this.initQuoteAmount : this.initBaseAmount;
  }

  async getBaseReserve() {
    return await connection.getTokenAccountBalance(this.baseVault, 'recent').then(res => new BN(res.value.amount));
  }

  async getQuoteReserve() {
    return await connection.getTokenAccountBalance(this.quoteVault, 'recent').then(res => new BN(res.value.amount));
  }

  async getCoinReserve() {
    return this.coinSide === 'base' ? this.getBaseReserve() : this.getQuoteReserve();
  }

  async getSolReserve() {
    return this.coinSide === 'base' ? this.getQuoteReserve() : this.getBaseReserve();
  }

  async getLpReserve() {
    const poolInfo = await connection.getAccountInfo(this.id, 'recent').then(pool => {
      if (pool === null) throw Error('Pool info account not found');
      return LIQUIDITY_STATE_LAYOUT_V4.decode(pool.data);
    });

    return poolInfo.lpReserve;
  }

  async getPrice() {
    const [coinReserve, solReserve] = await Promise.all([
      this.getCoinReserve(),
      this.getSolReserve(),
    ]);
    const price = new Price(
      new Currency(this.coinDecimals),
      coinReserve,
      new Currency(this.solDecimals),
      solReserve,
    );
    return new Big(price.toSignificant());
  }

  async getMarketInfo(): Promise<MarketState> {
    return await connection.getAccountInfo(this.marketId, 'recent').then(market => {
      if (market === null) throw Error('Market info account not found');
      return MARKET_STATE_LAYOUT_V3.decode(market.data);
    });
  }
}
