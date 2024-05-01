import { fetchDigitalAsset } from '@metaplex-foundation/mpl-token-metadata';
import fetch from 'node-fetch';
import { umi } from './client';
import { publicKey } from '@metaplex-foundation/umi';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

export type GmgnHotTokens = {
  address: string,
  symbol: string,
  hotLevel: number,
}[];

export async function getGmgnHotTokens(): Promise<GmgnHotTokens> {
  const res: any = await fetch('https://gmgn.ai/defi/quotation/v1/rank/sol/swaps/1h?orderby=swaps&direction=desc').then(res => res.json());

  if (res?.code !== 0 || !res?.data?.rank?.length) {
    throw Error('Failed to get gmgn hot tokens');
  }

  const rank = res.data.rank;
  return rank.map((token: any) => {
    return {
      address: token.address,
      symbol: token.symbol,
      hotLevel: token.hot_level,
    };
  });
}

export async function getTokenMetadata(tokenAddress: string) {
  const { metadata } = await fetchDigitalAsset(umi, publicKey(tokenAddress));
  return metadata;
}

export type JupToken = {
  address: string,
  chainId: number,
  decimals: number,
  name: string,
  symbol: string,
  logoURI: string,
  tags: string[],
  extensions: object
};

export async function getJupTokenList(type: 'strict' | 'all'): Promise<JupToken[]> {
  const list = await fetch(`https://token.jup.ag/${type}`).then(res => res.json());
  if (Array.isArray(list) && list.length > 0) {
    return list;
  } else {
    throw Error('Failed to get token list');
  }
}

export async function getJupTokenMap(type: 'strict' | 'all') {
  const tokenList = await getJupTokenList(type);
  const addressMap = new Map<string, JupToken>();
  const symbolMap = new Map<string, JupToken[]>();
  for (const token of tokenList) {
    addressMap.set(token.address, token);
    if (symbolMap.has(token.symbol)) {
      symbolMap.get(token.symbol)?.push(token);
    } else {
      symbolMap.set(token.symbol, [token]);
    }
  }
  return {
    addressMap,
    symbolMap,
  };
}

export type TwitterProfile = {
  followers: number,
  tweets: number,
}

export async function getTwitterProfile(username: string): Promise<TwitterProfile> {
  const { success, message, followerCount, bottomOdos }: any = await fetch(`https://api.livecounts.io/twitter-live-follower-counter/stats/${username}`, {
    headers: {
      'Origin': 'https://livecounts.io',
      'User-Agent': USER_AGENT
    }
  }).then(res => {
    if (res.ok) {
      return res.json();
    } else {
      throw Error(`Failed to get twitter followers: ${res.statusText}`);
    }
  });
  if (success) {
    return {
      followers: followerCount,
      tweets: bottomOdos[0],
    };
  } else {
    throw Error(`Failed to get twitter followers: ${message}`);
  }
}
