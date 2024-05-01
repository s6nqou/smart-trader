import { PublicKey } from "@solana/web3.js";
import { InitRayLog, RayLogLayout } from "./layouts";

export function parseInitialize2InstructionAccounts(accounts: PublicKey[]) {
  const [
    tokenProgram, associatedTokenAccount, systemProgram, rent,
    id, authority, openOrders, lpMint, baseMint, quoteMint, baseVault, quoteVault,
    targetOrders, configId, feeDestinationId, marketProgramId, marketId,
    userWallet, userBaseVault, userQuoteVault, userLpVault,
  ] = accounts;

  return {
    tokenProgram, associatedTokenAccount, systemProgram, rent,
    id, authority, openOrders, lpMint, baseMint, quoteMint, baseVault, quoteVault,
    targetOrders, configId, feeDestinationId, marketProgramId, marketId,
    userWallet, userBaseVault, userQuoteVault, userLpVault,
  }
}

export type Initialize2InstructionAccounts = ReturnType<typeof parseInitialize2InstructionAccounts>;

export function findAndParseInitRayLog(logs: string[]): InitRayLog | null {
  const initializeLog = logs.find(log => log.startsWith('Program log: initialize2: InitializeInstruction2'));
  if (!initializeLog) {
    return null;
  }

  for (let i = logs.length - 1; i > 0; i--) {
    const log = logs[i];
    if (log.startsWith('Program log: ray_log: ')) {
      const rayLog = log.replace('Program log: ray_log: ', '');
      const parsed = RayLogLayout.decode(Buffer.from(rayLog, 'base64'));
      if (parsed.init) {
        return parsed.init;
      }
    }
  }

  return null;
}
