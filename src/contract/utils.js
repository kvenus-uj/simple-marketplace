import {
  Connection,
  sendAndConfirmRawTransaction,
  Transaction,
  PublicKey
} from '@solana/web3.js'
import {
  Program, Provider, web3, utils, BN
} from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import idl from './idl.json';
import * as splToken from "@solana/spl-token";
const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new PublicKey(
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  );
const opts = {
    preflightCommitment: "processed"
}
const programID = new PublicKey(idl.metadata.address);
export const tokenMintPubkey = new PublicKey('GNJh9XndvsTkXj7irwSadZ5V4ZqXK7pkwx6KYssqeR3n');
const admin = "HCkebVSBp5nwsJw7PNomAP1MHuaRvg9DPYBsNe1aMDGt";

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

export async function withFindOrInitAssociatedTokenAccount(
  transaction,
  connection,
  mint,
  owner,
  payer,
  allowOwnerOffCurve
) {
  const associatedAddress = await splToken.Token.getAssociatedTokenAddress(
    splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
    splToken.TOKEN_PROGRAM_ID,
    mint,
    owner,
    allowOwnerOffCurve
  );
  const account = await connection.getAccountInfo(associatedAddress);
  if (!account) {
    transaction.add(
      splToken.Token.createAssociatedTokenAccountInstruction(
        splToken.ASSOCIATED_TOKEN_PROGRAM_ID,
        splToken.TOKEN_PROGRAM_ID,
        mint,
        associatedAddress,
        owner,
        payer
      )
    );
  }
  return associatedAddress;
}

export async function buyNft(wallet, mintKeys) {
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
  const txs = [];
  const transaction = new Transaction();
  const userTokenAccount = await withFindOrInitAssociatedTokenAccount(
    transaction,
    provider.connection,
    tokenMintPubkey,
    wallet.publicKey,
    wallet.publicKey,
    true
  );  
  const remainingAccounts = [];
  const seller = new PublicKey(admin);
  for(const mintKey of mintKeys) {
    const NftTokenAccount=await withFindOrInitAssociatedTokenAccount(
      transaction,
      provider.connection,
      mintKey,
      wallet.publicKey,
      wallet.publicKey,
      true
    );  
    const [nftvault] = await getVault(wallet,seller, mintKey);
    let tmp = {
      pubkey: NftTokenAccount,
      isWritable: true,
      isSigner: false,
    };
    remainingAccounts.push(tmp);
    let tmp1 = 
    {
      pubkey: nftvault,
      isWritable: true,
      isSigner: false,
    };
    remainingAccounts.push(tmp1);
  }
  transaction.add(program.instruction.buyNft(
    tokenVaultBump,
    marketBump,
    {
      accounts: {
        tokenMint: tokenMintPubkey,
        tokenVault: tokenVaultPubkey,
        tokenFrom: userTokenAccount,
        nftToAuthority: provider.wallet.publicKey,
        marketAccount: marketPubkey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      remainingAccounts,
    }
  ));
  txs.push(transaction);
  try {
    await executeAllTransactions(
      provider.connection,
      wallet,
      txs,
    );
  } catch (e) {
    console.log(e);
  }
}

export const executeAllTransactions = async (
  connection,
  wallet,
  transactions,
) => {
  if (transactions.length === 0) return []

  const recentBlockhash = (await connection.getRecentBlockhash('max')).blockhash
  for (let tx of transactions) {
    tx.feePayer = wallet.publicKey
    tx.recentBlockhash = recentBlockhash
  }
  await wallet.signAllTransactions(transactions)

  const txIds = await Promise.all(
    transactions.map(async (tx, index) => {
      try {
        const txid = await sendAndConfirmRawTransaction(
          connection,
          tx.serialize(),
        )
        return txid
      } catch (e) {
        return null
      }
    })
  )
  return txIds
}

export async function mintToken(wallet) {
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
  const txs = [];
  const transaction = new Transaction();
  const userTokenAccount = await withFindOrInitAssociatedTokenAccount(
    transaction,
    provider.connection,
    tokenMintPubkey,
    wallet.publicKey,
    wallet.publicKey,
    true
  );  
  txs.push(transaction);
  const tx= new Transaction();
  tx.add(program.instruction.mintTo(
    tokenVaultBump,
    marketBump,
    {
      accounts: {
        tokenMint: tokenMintPubkey,
        tokenVault: tokenVaultPubkey,
        tokenTo: userTokenAccount,
        tokenToAuthority: provider.wallet.publicKey,
        marketAccount: marketPubkey,
        tokenProgram: TOKEN_PROGRAM_ID,
      }
    }
  ))  
  txs.push(tx);
  try {
    await executeAllTransactions(
      provider.connection,
      wallet,
      txs,
    );
  } catch (e) {
    console.log(e);
  }
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

export async function getVault(wallet, seller, mintKey) {
  const provider = await getProvider(wallet);
  const program = new Program(idl, programID, provider);
  const [pubkey, bump] = await web3.PublicKey.findProgramAddress(
    [seller.toBuffer(), mintKey.toBuffer()],
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

