import { readKeypair } from "./utils";

export default {
  keypair: readKeypair('/home/s6nqou/.config/solana/id.json'),
  rpcUrl: '',
  websocketUrl: '',
  jitoUrl: 'tokyo.mainnet.block-engine.jito.wtf',
  jitoAuthKeypair: readKeypair('/home/s6nqou/.config/solana/jito.json'),
  logLevel: 'debug'
}
