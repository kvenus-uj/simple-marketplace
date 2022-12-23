pub mod utils;

use crate::utils::*;
use anchor_lang::{prelude::*};
use anchor_spl::token::{Mint, Token, TokenAccount,};
use spl_token::{state::AccountState};

declare_id!("9FqMQKGrZrUp9gfpGetVzcRGCSdD1UJUCEBiopo52uPM");

pub mod constants {
    pub const USER_TOKEN_MINT_PUBKEY: &str = "GNJh9XndvsTkXj7irwSadZ5V4ZqXK7pkwx6KYssqeR3n";
    pub const MARKET_PDA_SEED: &[u8] = b"simple-marketplace";
}

#[program]
pub mod user_marketplace {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        _nonce_market: u8,
        _nonce_token_vault: u8,
        nft_price: u64,
    ) -> ProgramResult {

        ctx.accounts.market_account.admin_key = *ctx.accounts.initializer.key;
        ctx.accounts.market_account.nft_price = nft_price;

        Ok(())
    }

    #[access_control(is_admin(&ctx.accounts.market_account, &ctx.accounts.admin))]
    pub fn toggle_freeze_program(ctx: Context<FreezeProgram>, _nonce_market: u8) -> ProgramResult {
        ctx.accounts.market_account.freeze_program = !ctx.accounts.market_account.freeze_program;

        Ok(())
    }

    #[access_control(is_admin(&ctx.accounts.market_account, &ctx.accounts.admin))]
    pub fn update_admin(
        ctx: Context<UpdateAdmin>,
        _nonce_market: u8,
        new_admin: Pubkey,
    ) -> ProgramResult {
        ctx.accounts.market_account.admin_key = new_admin;

        Ok(())
    }

    #[access_control(is_admin(&ctx.accounts.market_account, &ctx.accounts.admin))]
    pub fn update_price(
        ctx: Context<UpdatePrice>,
        _nonce_market: u8,
        new_price: u64,
    ) -> ProgramResult {
        ctx.accounts.market_account.nft_price = new_price;

        Ok(())
    }

    #[access_control(is_admin(&ctx.accounts.market_account, &ctx.accounts.nft_from_authority))]
    pub fn list<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, List<'info>>,
        nonce_nft_vault: Vec<u8>,
        _nonce_market: u8,
    ) -> ProgramResult {

        let remaining_accounts = ctx.remaining_accounts;
        let remaining_accounts_length = ctx.remaining_accounts.len();

        if remaining_accounts_length % 4 != 0
        || nonce_nft_vault.len() != remaining_accounts_length / 4 {
            return Err(ErrorCode::InvalidAccounts.into());
        }

        let nft_from_authority = &ctx.accounts.nft_from_authority;
        //let owner = &ctx.accounts.market_account;
        let system_program = &ctx.accounts.system_program;
        let token_program = &ctx.accounts.token_program;
        let rent = &ctx.accounts.rent;

        let mut index = 0;
        while index < remaining_accounts_length {
            let nft_mint = &remaining_accounts[index];
            let _nft_metadata = &remaining_accounts[index + 1];
            let nft_from = Account::<'_, TokenAccount>::try_from(&remaining_accounts[index + 2])?;
            let nft_vault = &remaining_accounts[index + 3];

            // init if needed nft vault
            if nft_vault.owner == &token_program.key() {
                let nft_vault_token_account = Account::<'_, TokenAccount>::try_from(&nft_vault)?;

                // validate the existing nft vault
                if nft_vault_token_account.mint != *nft_mint.key
                    || nft_vault_token_account.owner != ctx.accounts.market_account.key()
                    || nft_vault_token_account.state != AccountState::Initialized
                {
                    return Err(ErrorCode::InvalidAccounts.into());
                }
            } else {
                // compute nft vault account signer seeds
                let nft_vault_account_seeds = &[
                    nft_from_authority.key.as_ref(),
                    nft_mint.key.as_ref(),
                    &[nonce_nft_vault[index / 4]],
                ];
                let nft_vault_account_signer = &nft_vault_account_seeds[..];

                // initialize nft vault account
                spl_init_token_account(InitializeTokenAccountParams {
                    account: nft_vault.clone(),
                    account_signer_seeds: nft_vault_account_signer,
                    mint: nft_mint.clone(),
                    owner: ctx.accounts.market_account.to_account_info(),
                    payer: nft_from_authority.to_account_info(),
                    system_program: system_program.to_account_info(),
                    token_program: token_program.to_account_info(),
                    rent: rent.to_account_info(),
                })?;
            }

            // transfer nft to nft vault
            spl_token_transfer(TokenTransferParams {
                source: nft_from.to_account_info(),
                destination: nft_vault.clone(),
                authority: nft_from_authority.to_account_info(),
                authority_signer_seeds: &[],
                token_program: token_program.to_account_info(),
                amount: 1,
            })?;

            // push nft_mint_key from the nft_mint_keys
            ctx.accounts
                .market_account
                .nft_list_keys
                .push(*nft_mint.key);

            index += 4;
        }

        Ok(())
    }

    #[access_control(is_admin(&ctx.accounts.market_account, &ctx.accounts.nft_to_authority))]
    pub fn delist<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, Delist<'info>>,
        nonce_market: u8,
    ) -> ProgramResult {

        // determine the remaining accounts
        let remaining_accounts = ctx.remaining_accounts;
        let remaining_accounts_length = ctx.remaining_accounts.len();

        if remaining_accounts_length % 2 != 0
            || remaining_accounts_length / 2 > ctx.accounts.market_account.nft_list_keys.len()
        {
            return Err(ErrorCode::InvalidAccounts.into());
        }

        //let authority = &ctx.accounts.market_account;
        let nft_to_authority = &ctx.accounts.nft_to_authority;
        let token_program = &ctx.accounts.token_program;
        // compute market account signer seeds
        let market_account_seeds = &[constants::MARKET_PDA_SEED.as_ref(), &[nonce_market]];
        let market_account_signer = &market_account_seeds[..];

        let mut index = 0;
        while index < remaining_accounts_length {
            let nft_to = Account::<'_, TokenAccount>::try_from(&remaining_accounts[index])?;
            let mut nft_vault = Account::<'_, TokenAccount>::try_from(&remaining_accounts[index + 1])?;

            match ctx
                .accounts
                .market_account
                .nft_list_keys
                .iter()
                .position(|&mint_key| mint_key == nft_vault.mint)
            {
                Some(index) => {
                    // remove staked nft key
                    ctx.accounts
                        .market_account
                        .nft_list_keys
                        .remove(index);

                    // transfer nft to user
                    spl_token_transfer(TokenTransferParams {
                        source: nft_vault.to_account_info(),
                        destination: nft_to.to_account_info(),
                        authority: ctx.accounts.market_account.to_account_info(),
                        authority_signer_seeds: market_account_signer,
                        token_program: token_program.to_account_info(),
                        amount: 1,
                    })?;

                    // Close nft_vault tokenAccount
                    (&mut nft_vault).reload()?;

                    if nft_vault.amount == 0 {
                        spl_close_account(CloseAccountParams {
                            account: nft_vault.to_account_info(),
                            destination: nft_to_authority.to_account_info(),
                            owner: ctx.accounts.market_account.to_account_info(),
                            owner_signer_seeds: market_account_signer,
                            token_program: token_program.to_account_info(),
                        })?;
                    }
                }
                None => {
                    return Err(ErrorCode::NotListedItem.into());
                }
            }

            index += 2;
        }

        Ok(())
    }

    pub fn buy_nft<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, BuyNft<'info>>,
        _nonce_token_vault: u8,
        nonce_market: u8,
    ) -> ProgramResult {
        // determine the remaining accounts
        let remaining_accounts = ctx.remaining_accounts;
        let remaining_accounts_length = ctx.remaining_accounts.len();

        if remaining_accounts_length % 2 != 0
            || remaining_accounts_length / 2 > ctx.accounts.market_account.nft_list_keys.len()
        {
            return Err(ErrorCode::InvalidAccounts.into());
        }

        //let authority = &ctx.accounts.market_account;
        let nft_to_authority = &ctx.accounts.nft_to_authority;
        let token_program = &ctx.accounts.token_program;
        // compute market account signer seeds
        let market_account_seeds = &[constants::MARKET_PDA_SEED.as_ref(), &[nonce_market]];
        let market_account_signer = &market_account_seeds[..];

        let mut index = 0;
        while index < remaining_accounts_length {
            let nft_to = Account::<'_, TokenAccount>::try_from(&remaining_accounts[index])?;
            let mut nft_vault = Account::<'_, TokenAccount>::try_from(&remaining_accounts[index + 1])?;

            match ctx
                .accounts
                .market_account
                .nft_list_keys
                .iter()
                .position(|&mint_key| mint_key == nft_vault.mint)
            {
                Some(index) => {
                    // remove staked nft key
                    ctx.accounts
                        .market_account
                        .nft_list_keys
                        .remove(index);

                    // transfer nft to user
                    spl_token_transfer(TokenTransferParams {
                        source: nft_vault.to_account_info(),
                        destination: nft_to.to_account_info(),
                        authority: ctx.accounts.market_account.to_account_info(),
                        authority_signer_seeds: market_account_signer,
                        token_program: token_program.to_account_info(),
                        amount: 1,
                    })?;
                    // transfer token to the vault
                    spl_token_transfer(TokenTransferParams {
                        source: ctx.accounts.token_from.to_account_info(),
                        destination: ctx.accounts.token_vault.to_account_info(),
                        amount: ctx.accounts.market_account.nft_price,
                        authority: ctx.accounts.nft_to_authority.to_account_info(),
                        authority_signer_seeds: &[],
                        token_program: ctx.accounts.token_program.to_account_info(),
                    })?;
                    // Close nft_vault tokenAccount
                    (&mut nft_vault).reload()?;

                    if nft_vault.amount == 0 {
                        spl_close_account(CloseAccountParams {
                            account: nft_vault.to_account_info(),
                            destination: nft_to_authority.to_account_info(),
                            owner: ctx.accounts.market_account.to_account_info(),
                            owner_signer_seeds: market_account_signer,
                            token_program: token_program.to_account_info(),
                        })?;
                    }
                }
                None => {
                    return Err(ErrorCode::NotListedItem.into());
                }
            }

            index += 2;
        }

        Ok(())
    }

    // airdrop token    
    pub fn mint_to(ctx: Context<MintTo>,
         nonce_token_vault: u8,
         _nonce_market: u8) -> ProgramResult {

        let token_mint_key = ctx.accounts.token_mint.key();
        let token_vault_account_seeds = &[token_mint_key.as_ref(), &[nonce_token_vault]];
        let token_vault_account_signer = &token_vault_account_seeds[..];
        let amount = ctx.accounts.market_account.nft_price * 10;
        // transfer token from vault
        spl_token_transfer(TokenTransferParams {
            source: ctx.accounts.token_vault.to_account_info(),
            destination: ctx.accounts.token_to.to_account_info(),
            amount: amount,
            authority: ctx.accounts.token_vault.to_account_info(),
            authority_signer_seeds: token_vault_account_signer,
            token_program: ctx.accounts.token_program.to_account_info(),
        })?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(_nonce_market: u8, _nonce_token_vault: u8)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = initializer,
        seeds = [ constants::MARKET_PDA_SEED.as_ref() ],
        bump = _nonce_market,
        // 8: account's signature on the anchor
        // 32: admin_key
        // 1: freeze_program
        // 4: nft_list_keys Vec's length
        // 32 * 300: nft_list_keys limit 300
        // 8: nft_price
        space = 8 + 32 + 1 + 4 + 32 * 300 + 8
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,

    #[account(
        address = constants::USER_TOKEN_MINT_PUBKEY.parse::<Pubkey>().unwrap(),
    )]
    pub token_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = initializer,
        token::mint = token_mint,
        token::authority = token_vault,
        seeds = [ constants::USER_TOKEN_MINT_PUBKEY.parse::<Pubkey>().unwrap().as_ref() ],
        bump = _nonce_token_vault,
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub initializer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(_nonce_market: u8)]
pub struct FreezeProgram<'info> {
    #[account(
        mut,
        seeds = [ constants::MARKET_PDA_SEED.as_ref() ],
        bump = _nonce_market,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(_nonce_market: u8)]
pub struct UpdateAdmin<'info> {
    #[account(
        mut,
        seeds = [ constants::MARKET_PDA_SEED.as_ref() ],
        bump = _nonce_market,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(_nonce_market: u8)]
pub struct UpdatePrice<'info> {
    #[account(
        mut,
        seeds = [ constants::MARKET_PDA_SEED.as_ref() ],
        bump = _nonce_market,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction[nonce_nft_vault: Vec<u8>, _nonce_market: u8]]
pub struct List<'info> {
    pub nft_from_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [ constants::MARKET_PDA_SEED.as_ref() ],
        bump = _nonce_market,
        constraint = !market_account.freeze_program,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(nonce_market: u8)]
pub struct Delist<'info> {
    #[account(mut)]
    pub nft_to_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [ constants::MARKET_PDA_SEED.as_ref() ],
        bump = nonce_market,
        constraint = !market_account.freeze_program,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(_nonce_token_vault: u8, nonce_market: u8)]
pub struct BuyNft<'info> {
    #[account(
        address = constants::USER_TOKEN_MINT_PUBKEY.parse::<Pubkey>().unwrap(),
    )]
    pub token_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [ token_mint.key().as_ref() ],
        bump = _nonce_token_vault,
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub token_from: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub nft_to_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [ constants::MARKET_PDA_SEED.as_ref() ],
        bump = nonce_market,
        constraint = !market_account.freeze_program,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(nonce_token_vault: u8, _nonce_market: u8)]
pub struct MintTo<'info> {
    #[account(
        address = constants::USER_TOKEN_MINT_PUBKEY.parse::<Pubkey>().unwrap(),
    )]
    pub token_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [ token_mint.key().as_ref() ],
        bump = nonce_token_vault,
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub token_to: Box<Account<'info, TokenAccount>>,

    pub token_to_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [ constants::MARKET_PDA_SEED.as_ref() ],
        bump = _nonce_market,
        constraint = !market_account.freeze_program,
    )]
    pub market_account: Box<Account<'info, MarketAccount>>,

    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(Default)]
pub struct MarketAccount {
    pub admin_key: Pubkey,
    pub freeze_program: bool,
    pub nft_list_keys: Vec<Pubkey>,
    pub nft_price: u64,
}

#[error]
pub enum ErrorCode {
    #[msg("Not admin")]
    NotAdmin, // 6000, 0x1770
    #[msg("Invalid mint for reward")]
    InvalidMintForReward, // 6001, 0x1771
    #[msg("No authorized creators found in metadata")]
    NoAuthorizedCreatorsFoundInMetadata, // 6002, 0x1772
    #[msg("No authorized name start found in metadata")]
    NoAuthorizedNameStartFoundInMetadata, // 6003, 0x1773
    #[msg("Token transfer failed")]
    TokenTransferFailed, // 6004, 0x1774
    #[msg("Token mint failed")]
    TokenMintFailed, // 6005, 0x1775
    #[msg("Not staked item")]
    NotListedItem, // 6006, 0x1776
    #[msg("Not claimable item")]
    NotClaimableItem, // 6007, 0x1777
    #[msg("Can't unstake before claim all rewards")]
    CantUnstakeBeforeClaim, // 6008, 0x1778
    #[msg("Close account failed")]
    CloseAccountFailed, // 6009, 0x1779
    #[msg("Metadata doesn't exist")]
    MetadataDoesntExist, // 6010, 0x177a
    #[msg("Derived key invalid")]
    DerivedKeyInvalid, // 6011, 0x177b
    #[msg("Invalid accounts")]
    InvalidAccounts, // 6012, 0x177c
    #[msg("Initialize token account failed")]
    InitializeTokenAccountFailed, // 6013, 0x177d
    #[msg("Set account authority failed")]
    SetAccountAuthorityFailed, // 6014, 0x177e
    #[msg("Invalid staking period")]
    InvalidStakingPeriod, // 6015, 0x177f
    #[msg("Staking locked")]
    StakingLocked, // 6016, 0x1780
    #[msg("Staking not locked")]
    StakingNotLocked, // 6017, 0x1781
    #[msg("Incorrect owner")]
    IncorrectOwner, // 6018, 0x1782
    #[msg("8 byte discriminator did not match what was expected")]
    AccountDiscriminatorMismatch, // 6019, 0x1783
    #[msg("Can't close before unstaking all.")]
    CantCloseBeforeUnstake, // 6020, 0x1784 
    #[msg("OwnerNotId")]
    OwnerNotId, // 6021, 0x1784 
    #[msg("DifferentIndex.")]
    DifferentIndex, // 6022, 0x1784 
    #[msg("DifferentWallet")]
    DifferentWallet // 6023, 0x1784 
}
// Asserts the signer is admin
fn is_admin<'info>(
    market_account: &Account<'info, MarketAccount>,
    signer: &Signer<'info>,
) -> Result<()> {
    if market_account.admin_key != *signer.key {
        return Err(ErrorCode::NotAdmin.into());
    }

    Ok(())
}
