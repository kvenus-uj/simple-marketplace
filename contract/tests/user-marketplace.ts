import * as anchor from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
import assert from 'assert';
import { expect } from 'chai';
import { nft_data, nft_json_url } from './data';
import {
  createMint,
  setMintAuthority,
  mintToAccount,
  createTokenAccount,
  createTokenMint,
  sleep,
} from './utils';
import fs from 'fs';
import dayjs from 'dayjs';
import { PublicKey } from '@solana/web3.js';
import { Program } from '@project-serum/anchor';
import { NftStaking } from '../target/types/user_marketplace';
import { numberEnumValues } from 'quicktype-core/dist/support/Support';

// manually loading the idl as accessing anchor.workspace
// trigers an error because metadata and vault program don't have idls
const filepath = 'target/idl/user_marketplace.json';
const idlStr = fs.readFileSync(filepath);
const idl = JSON.parse(idlStr.toString());

const envProvider = anchor.Provider.env();

let provider = envProvider;

let program: Program<NftStaking>;
function setProvider(p: anchor.Provider) {
  provider = p;
  anchor.setProvider(p);
  program = new anchor.Program(
    idl,
    idl.metadata.address,
    p
  ) as Program<NftStaking>;
}
setProvider(provider);

describe('user-marketplace', () => {

  it('Is initialized!', async () => {
    const tokenMintPubkey = new PublicKey('GNJh9XndvsTkXj7irwSadZ5V4ZqXK7pkwx6KYssqeR3n');
    const [marketPubkey, marketBump] =
    await PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode('simple-marketplace'))],
      program.programId
    );
    const [tokenVaultPubkey, tokenVaultBump] =
    await PublicKey.findProgramAddress(
      [tokenMintPubkey.toBuffer()],
      program.programId
    );

    await program.rpc.initialize(
      marketBump,
      tokenVaultBump,
      new anchor.BN(2e9),
      {
        accounts: {
          marketAccount: marketPubkey,
          tokenMint: tokenMintPubkey,
          tokenVault: tokenVaultPubkey,
          initializer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        }
      }
    );
  });
});  

async function getTokenBalance(pubkey: PublicKey) {
  return parseInt(
    (await provider.connection.getTokenAccountBalance(pubkey)).value.amount
  );
}
