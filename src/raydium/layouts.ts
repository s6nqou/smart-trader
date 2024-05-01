import { GetLayoutSchemaFromStructure, UInt, publicKey, rustEnum, seq, struct, u64, u8, union } from "@raydium-io/raydium-sdk";

export enum AmmInstructionType {
  Initialize = 0,
  Initialize2 = 1,
  Deposit = 3,
  Withdraw = 4,
  SwapBaseIn = 9,
  SwapBaseOut = 11,
}

export const AmmInstructionLayout = struct([u8('instructionType') as UInt<AmmInstructionType, 'instructionType'>]);

export enum RayLogType {
  Init,
  Deposit,
  Withdraw,
  SwapBaseIn,
  SwapBaseOut,
}

const InitRayLogLayout = struct([
  u64('openTime'),
  u8('quoteDecimals'),
  u8('baseDecimals'),
  u64('quoteLotSize'),
  u64('baseLotSize'),
  u64('quoteAmount'),
  u64('baseAmount'),
  publicKey('marketAccount'),
]);
export type InitRayLog = GetLayoutSchemaFromStructure<typeof InitRayLogLayout>;

export enum SwapDirection {
  Quote2Base = 1,
  Base2Quote = 2,
}

const SwapBaseInRayLogLayout = struct([
  u64('amountIn'),
  u64('minAmountOut'),
  u64('direction'),
  u64('userAmount'),
  u64('baseReserve'),
  u64('quoteReserve'),
  u64('amountOut'),
]);
export type SwapBaseInRayLog = GetLayoutSchemaFromStructure<typeof SwapBaseInRayLogLayout>;

const SwapBaseOutRayLogLayout = struct([
  u64('maxAmountIn'),
  u64('amountOut'),
  u64('direction'),
  u64('userAmount'),
  u64('baseReserve'),
  u64('quoteReserve'),
  u64('amountIn'),
]);
export type SwapBaseOutRayLog = GetLayoutSchemaFromStructure<typeof SwapBaseOutRayLogLayout>;

export const RayLogLayout = union<RayLog>(u8('logType'));

RayLogLayout.addVariant(RayLogType.Init, InitRayLogLayout as any, 'init');
RayLogLayout.addVariant(RayLogType.Deposit, u8(), 'padding');
RayLogLayout.addVariant(RayLogType.Withdraw, u8(), 'padding');
RayLogLayout.addVariant(RayLogType.SwapBaseIn, SwapBaseInRayLogLayout as any, 'swapBaseIn');
RayLogLayout.addVariant(RayLogType.SwapBaseOut, SwapBaseOutRayLogLayout as any, 'swapBaseOut');

export type RayLog = Partial<{
  logType: RayLogType,
  init: InitRayLog,
  swapBaseIn: SwapBaseInRayLog,
  swapBaseOut: SwapBaseOutRayLog,
}>;

export const SwapBaseInArgsLayout = struct([u8('instruction'), u64('amountIn'), u64('minAmountOut')]);
