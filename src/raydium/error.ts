import { TransactionError } from "@solana/web3.js";

export enum AmmErrorType {
  AlreadyInUse,
  InvalidProgramAddress,
  ExpectedMint,
  ExpectedAccount,
  InvalidCoinVault,
  InvalidPCVault,
  InvalidTokenLP,
  InvalidDestTokenCoin,
  InvalidDestTokenPC,
  InvalidPoolMint,
  InvalidOpenOrders,
  InvalidMarket,
  InvalidMarketProgram,
  InvalidTargetOrders,
  AccountNeedWriteable,
  AccountNeedReadOnly,
  InvalidCoinMint,
  InvalidPCMint,
  InvalidOwner,
  InvalidSupply,
  InvalidDelegate,
  InvalidSignAccount,
  InvalidStatus,
  InvalidInstruction,
  WrongAccountsNumber,
  InvalidTargetAccountOwner,
  InvalidTargetOwner,
  InvalidAmmAccountOwner,
  InvalidParamsSet,
  InvalidInput,
  ExceededSlippage,
  CalculationExRateFailure,
  CheckedSubOverflow,
  CheckedAddOverflow,
  CheckedMulOverflow,
  CheckedDivOverflow,
  CheckedEmptyFunds,
  CalcPnlError,
  InvalidSplTokenProgram,
  TakePnlError,
  InsufficientFunds,
  ConversionFailure,
  InvalidUserToken,
  InvalidSrmMint,
  InvalidSrmToken,
  TooManyOpenOrders,
  OrderAtSlotIsPlaced,
  InvalidSysProgramAddress,
  InvalidFee,
  RepeatCreateAmm,
  NotAllowZeroLP,
  InvalidCloseAuthority,
  InvalidFreezeAuthority,
  InvalidReferPCMint,
  InvalidConfigAccount,
  RepeatCreateConfigAccount,
  MarketLotSizeIsTooLarge,
  InitLpAmountTooLess,
  UnknownAmmError,
}

export const AmmErrorMessages = [
  'AlreadyInUse',
  'InvalidProgramAddress',
  'ExpectedMint',
  'ExpectedAccount',
  'InvalidCoinVault',
  'InvalidPCVault',
  'InvalidTokenLP',
  'InvalidDestTokenCoin',
  'InvalidDestTokenPC',
  'InvalidPoolMint',
  'InvalidOpenOrders',
  'InvalidMarket',
  'InvalidMarketProgram',
  'InvalidTargetOrders',
  'AccountNeedWriteable',
  'AccountNeedReadOnly',
  'InvalidCoinMint',
  'InvalidPCMint',
  'InvalidOwner',
  'InvalidSupply',
  'InvalidDelegate',
  'InvalidSignAccount',
  'InvalidStatus',
  'InvalidInstruction',
  'WrongAccountsNumber',
  'InvalidTargetAccountOwner',
  'InvalidTargetOwner',
  'InvalidAmmAccountOwner',
  'InvalidParamsSet',
  'InvalidInput',
  'ExceededSlippage',
  'CalculationExRateFailure',
  'CheckedSubOverflow',
  'CheckedAddOverflow',
  'CheckedMulOverflow',
  'CheckedDivOverflow',
  'CheckedEmptyFunds',
  'CalcPnlError',
  'InvalidSplTokenProgram',
  'TakePnlError',
  'InsufficientFunds',
  'ConversionFailure',
  'InvalidUserToken',
  'InvalidSrmMint',
  'InvalidSrmToken',
  'TooManyOpenOrders',
  'OrderAtSlotIsPlaced',
  'InvalidSysProgramAddress',
  'InvalidFee',
  'RepeatCreateAmm',
  'NotAllowZeroLP',
  'InvalidCloseAuthority',
  'InvalidFreezeAuthority',
  'InvalidReferPCMint',
  'InvalidConfigAccount',
  'RepeatCreateConfigAccount',
  'MarketLotSizeIsTooLarge',
  'InitLpAmountTooLess',
  'UnknownAmmError',
];

export class AmmError extends Error {
  constructor(type: AmmErrorType) {
    super(AmmErrorMessages[type] ?? 'Unknown Error');
    this.name = 'AmmError';
  }
}

export function parseErrorFromTransactionError(transactionError: TransactionError | Error | string): Error | AmmError | null {
  const message = String(transactionError);
  const commonError = message.match(/Program log: Error: ([\w\s]+)/)?.[1];
  if (commonError) {
    const error = new Error(commonError);
    error.cause = transactionError;
    return error;
  }
  const ammError = message.match(/custom\sprogram\serror:\s(0x\w+)/)?.[1] || message.match(/{"Custom":(\d+)}/)?.[1];
  if (ammError) {
    const ammErrorType = Number(ammError) as AmmErrorType;
    const error = new AmmError(ammErrorType);
    error.cause = transactionError;
    return error;
  }
  return null;
}
