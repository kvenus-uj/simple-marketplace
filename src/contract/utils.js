import { Connection, PublicKey } from '@solana/web3.js';
import {
  Program, Provider, web3, utils, BN
} from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID, Token, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import idl from './idl.json';
import { programs } from '@metaplex/js';
const Transaction = programs.Transaction;
const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new PublicKey(
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  );
const opts = {
    preflightCommitment: "processed"
}
const programID = new PublicKey(idl.metadata.address);
export const tokenMintPubkey = new PublicKey('GNJh9XndvsTkXj7irwSadZ5V4ZqXK7pkwx6KYssqeR3n');

async function getProvider(wallet) {
  /* create the provider and return it to the caller */
  /* network set to local network for now */
  const network = "https://metaplex.devnet.rpcpool.com";//https://api.devnet.solana.com
  const connection = new Connection(network, opts.preflightCommitment);

  const provider = new Provider(
    connection, wallet, opts.preflightCommitment,
  );
  return provider;
}
export async function initialize(wallet, token_price) {
  const provider = await getProvider(wallet);
  const program = new Program(idl, programID, provider);
  const [marketPubkey, marketBump] =
  await web3.PublicKey.findProgramAddress(
    [Buffer.from(utils.bytes.utf8.encode('simple-marketplace'))],
    program.programId
  );
  const [tokenVaultPubkey, tokenVaultBump] =
  await web3.PublicKey.findProgramAddress(
    [tokenMintPubkey.toBuffer()],
    program.programId
  );
  await program.rpc.initialize(
    marketBump,
    tokenVaultBump,
    new BN(token_price),
    {
      accounts: {
        marketAccount: marketPubkey,
        tokenMint: tokenMintPubkey,
        tokenVault: tokenVaultPubkey,
        initializer: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
      }
    }
  );
}

export async function list(wallet, nftVaultBumps, remainingAccounts) {
  const provider = await getProvider(wallet);
  const program = new Program(idl, programID, provider);
  const [marketPubkey, marketBump] =
  await web3.PublicKey.findProgramAddress(
    [Buffer.from(utils.bytes.utf8.encode('simple-marketplace'))],
    program.programId
  );
  await program.rpc.list(
    nftVaultBumps,
    marketBump,
    {
      accounts: {
        nftFromAuthority: provider.wallet.publicKey,
        marketAccount: marketPubkey,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
      remainingAccounts,
    }
  );
}

export async function delist(wallet, remainingAccounts) {
  const provider = await getProvider(wallet);
  const program = new Program(idl, programID, provider);
  const [marketPubkey, marketBump] =
  await web3.PublicKey.findProgramAddress(
    [Buffer.from(utils.bytes.utf8.encode('simple-marketplace'))],
    program.programId
  );
  await program.rpc.delist(
    marketBump,
    {
      accounts: {
        nftToAuthority: provider.wallet.publicKey,
        marketAccount: marketPubkey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      remainingAccounts,
    }
  );
}

export async function buyNft(wallet, remainingAccounts) {
  const provider = await getProvider(wallet);
  const program = new Program(idl, programID, provider);
  const [marketPubkey, marketBump] =
  await web3.PublicKey.findProgramAddress(
    [Buffer.from(utils.bytes.utf8.encode('simple-marketplace'))],
    program.programId
  );
  const [tokenVaultPubkey, tokenVaultBump] =
  await web3.PublicKey.findProgramAddress(
    [tokenMintPubkey.toBuffer()],
    program.programId
  );
  await program.rpc.buyNft(
    tokenVaultBump,
    marketBump,
    {
      accounts: {
        tokenMint: tokenMintPubkey,
        tokenVault: tokenVaultPubkey,
        tokenTo: tokenVaultPubkey,
        nftToAuthority: provider.wallet.publicKey,
        marketAccount: marketPubkey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      remainingAccounts,
    }
  );
}

export async function mintToken(wallet) {
  const provider = await getProvider(wallet);
  const program = new Program(idl, programID, provider);
  const [marketPubkey, marketBump] =
  await web3.PublicKey.findProgramAddress(
    [Buffer.from(utils.bytes.utf8.encode('simple-marketplace'))],
    program.programId
  );
  await program.rpc.mintTo(
    marketBump,
    new BN(100e10),
    {
      accounts: {
        nftMint: tokenMintPubkey,
        nftTo: provider.wallet.publicKey,
        marketAccount: marketPubkey,
        admin: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      }
    }
  )  
}

export async function _getPDA(wallet, mintKey) {
  const provider = await getProvider(wallet);
  const [pdaAddress] = await web3.PublicKey.findProgramAddress(
      [
          provider.wallet.publicKey.toBuffer(),
          TOKEN_PROGRAM_ID.toBuffer(),
          mintKey.toBuffer(),
      ],
      SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
  );
  return pdaAddress;
}

export async function _getATA(wallet, mintKey) {
  const provider = await getProvider(wallet);
  const program = new Program(idl, programID, provider);
  const [pubkey, bump] = await web3.PublicKey.findProgramAddress(
    [provider.wallet.publicKey.toBuffer(), mintKey.toBuffer()],
    program.programId
  );
  return [pubkey, bump];
}

export async function getMarketPlaceInfo(wallet) {
  const provider = await getProvider(wallet);
  const program = new Program(idl, programID, provider);
  const [marketPubkey] =
  await web3.PublicKey.findProgramAddress(
    [Buffer.from(utils.bytes.utf8.encode('simple-marketplace'))],
    program.programId
  );
  try{
    const info = await program.account.marketAccount.fetch(marketPubkey);
    return info;
  }catch(err){
    return null;
  }
  
}

