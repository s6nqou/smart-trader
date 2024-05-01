import { Connection } from "@solana/web3.js";
import config from "./config";
import { searcher } from "jito-ts";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";

export const connection = new Connection(config.rpcUrl, { disableRetryOnRateLimit: true });

export const getJitoClient = () => searcher.searcherClient(config.jitoUrl, config.jitoAuthKeypair, {
  'grpc.keepalive_time_ms': 10 * 1000,
  'grpc.keepalive_timeout_ms': 5 * 1000,
  'grpc.keepalive_permit_without_calls': 1,
});

export const umi = createUmi(config.rpcUrl, { disableRetryOnRateLimit: true, commitment: 'recent' }).use(mplTokenMetadata())
