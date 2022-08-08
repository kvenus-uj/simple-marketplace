import './App.css';
import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getParsedNftAccountsByOwner, isValidSolanaAddress, createConnectionConfig } from "@nfteyez/sol-rayz";
import { Button, Col, Row } from "react-bootstrap";
import Mynft from './components/Mynft';
import * as metaplex from '@metaplex/js';
import { PublicKey, Connection } from '@solana/web3.js';
import { list, delist, initialize, _getPDA, _getATA, getMarketPlaceInfo, mintToken, buyNft } from './contract/utils';
const admin = "HCkebVSBp5nwsJw7PNomAP1MHuaRvg9DPYBsNe1aMDGt";
function App(props) {
  const { publicKey } = useWallet();
  const wallet = useWallet();
  const { connection } = props;
  // state change
  useEffect(() => {
    setNfts([]);
    setShow(false);
     if (publicKey && publicKey.toString() === admin) {
        getNfts();
     } else {
      getListedInfo();
     }
  }, [publicKey, connection]);

  const [nfts, setNfts] = useState([]);
  //alert props
  const [show, setShow] = useState(false);

  //loading props
  const [loading, setLoading] = useState(false);

  const [listedNft, setlistedNft] = useState([]);
  const [selectlistedNft, setSelectlistedNft] = useState([]);
  const [selectMyNft, setSelectMyNft] = useState([]);
  const [seller, setSeller] = useState([]);

  const getNfts = async (e) => {
    setShow(false);
    await getListedInfo();
    let address = publicKey;
    if (!isValidSolanaAddress(address)) {
      setLoading(false);
      setShow(true);
      return;
    }

    const connect = createConnectionConfig(connection);
    setLoading(true);
    const nftArray = await getParsedNftAccountsByOwner({
      publicAddress: address,
      connection: connect,
      serialization: true,
    });
    if (nftArray.length === 0) {
      setLoading(false);
      setShow(true);
      return;
    }

    const metadatas = await fetchMetadata(nftArray);
    var group = {};

    for (const nft of metadatas) {
      if (group.hasOwnProperty(nft.data.symbol)) {
        group[nft.data.symbol].push(nft);
      } else {
        group[nft.data.symbol] = [nft];
      }
    }
    setLoading(false);
    return setNfts(metadatas);
  };

  const fetchMetadata = async (nftArray) => {
    let metadatas = [];
    for (const nft of nftArray) {
      try {
        await fetch(nft.data.uri)
        .then((response) => response.json())
        .then((meta) => { 
          metadatas.push({...meta, ...nft});
        });
      } catch (error) {
        console.log(error);
      }
    }
    return metadatas;
  };

  const getMetaData = async (tokenAddress) => {
    const con = new Connection('https://metaplex.devnet.rpcpool.com', 'confirmed');
    const metadataPDA = await metaplex.programs.metadata.Metadata.getPDA(tokenAddress);
    const mintAccInfo = await con.getAccountInfo(metadataPDA); // fetch account info
    const metadata = metaplex.programs.metadata.Metadata.from(new metaplex.Account(tokenAddress, mintAccInfo));

    return {
      metadata,
      metaPDA: metadataPDA,
    };
  };

  async function selectListed(tk) {
    if(isListedNftSelected(tk)) {
      setSelectlistedNft(
        selectlistedNft.filter(
          (data) => data.mint !== tk.mint
        )
      )
    } else {
      setSelectlistedNft([...selectlistedNft, tk])
    }
  }

  async function selectOwned(tk) {
    if(isMyNftSelected(tk)) {
      setSelectMyNft(
        selectMyNft.filter(
          (data) => data.mint !== tk.mint
        )
      )
    } else {
      setSelectMyNft([...selectMyNft, tk])
    }
  }

  const isListedNftSelected = (tk) =>
    selectlistedNft.some(
      (utk) => utk.mint === tk.mint
    )

  const isMyNftSelected = (tk) =>
    selectMyNft.some(
      (utk) => utk.mint === tk.mint
    )

  async function listNft() {
    let remainingAccounts = [];
    let nftVaultBump = [];
    for(const tmp of selectMyNft) {
      const pk = new PublicKey(tmp.mint);
      const pdaAddress = await _getPDA(wallet, pk);
      const [pubkey, bump] = await _getATA(wallet, pk);
      let ra = {
        pubkey: pk,
        isWritable: false,
        isSigner: false,
      };
      remainingAccounts.push(ra);
      remainingAccounts.push(ra);
      let ra1 = {
        pubkey: pdaAddress,
        isWritable: true,
        isSigner: false,
      };
      remainingAccounts.push(ra1);
      let ra2 = {
        pubkey: pubkey,
        isWritable: true,
        isSigner: false,
      };
      nftVaultBump.push(bump);
      remainingAccounts.push(ra2);
    }
    let nftVaultBumps = Buffer.from(nftVaultBump);
    try{
      await list(wallet, nftVaultBumps, remainingAccounts);
      await getNfts();
      console.log('list');
    }catch (err) {
      console.log("Transaction error: ", err);
    }
  }

  async function delistNft() {
    let remainingAccounts = [];
    for(const obj of selectlistedNft) {
      const pk = new PublicKey(obj.mint);
      const pdaAddress = await _getPDA(wallet, pk);
      const [pubkey, bump] = await _getATA(wallet, pk);
      let tmp = {
        pubkey: pdaAddress,
        isWritable: true,
        isSigner: false,
      };
      remainingAccounts.push(tmp);
      let tmp1 = 
      {
        pubkey: pubkey,
        isWritable: true,
        isSigner: false,
      };
      remainingAccounts.push(tmp1);
    }
    try{
      await delist(wallet, remainingAccounts);
      await getNfts();
      console.log('delist');
    } catch (err) {
      console.log("Transaction error: ", err);
    }
  }

  async function buy() {
    let mintKeys = [];
    for(const obj of selectlistedNft) {
      const pk = new PublicKey(obj.mint);
      mintKeys.push(pk);
    }
    try{
      await buyNft(wallet, mintKeys);
      await getListedInfo();
      console.log('buy');
    } catch (err) {
      console.log("Transaction error: ", err);
    }
  }

  async function initializeProgram() {
    await initialize(wallet, 2);
    console.log('init success');
  }

  async function aidropToken() {
    await mintToken(wallet);
    console.log('airdrop')
  }

  async function getListedInfo() {
    const info = await getMarketPlaceInfo(wallet);
    if(!info) return;
    const mintNfts = info.nftListKeys;
    const sellerPk = info.adminKey;
    setSeller(sellerPk);
    let newListedNft = [];
    for (const mintNft of mintNfts) {
      const _nft = [];
      const meta = await getMetaData(mintNft.toString());
      const response = await fetch(meta.metadata.data.data.uri);
      const data = await response.json();
      _nft.mint = mintNft.toString();
      _nft.image = data.image;
      _nft.name = data.name;
      newListedNft.push(_nft);
    }
    setlistedNft(newListedNft);
  }

  return (
    <div className="main">
      <Row className="inputForm">
        <Col lg="5">Listed NFT. You can buy this NFT.(Price: 2)</Col>
        <Col lg="1" >
        </Col>
        <Col className='flex justify-between'>
          {publicKey && publicKey.toString() === admin ? (<>
            <Button onClick={listNft}>List</Button>
            <Button onClick={delistNft}>Delist</Button>
          </>
          ) : (<Button onClick={buy}>Buy</Button>)}
          <Button href='https://solfaucet.com/'>Sol Faucet</Button>
          <Button href='https://kamino-nft-mint.netlify.app/'>Test NFT</Button>
          <Button onClick={aidropToken}>Airdrop token</Button>
        </Col>
      </Row>
      <Mynft nfts={listedNft} select={selectListed} isMyNftSelected={isListedNftSelected}  />
      <Row className="inputForm">
        <Col lg="10">This is admin panel. Admin can list/delist his own nft.</Col>
        <Col lg="2">
        </Col>
      </Row>
      <Mynft loading={loading} show={show} nfts={nfts} select={selectOwned} isMyNftSelected={isMyNftSelected} />
    </div>
  );
}

export default App;
