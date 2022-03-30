// Note: There is no sufficient typescript support for truffle tests now

const TeleportToken = artifacts.require("TeleportToken");
const ethUtil = require('ethereumjs-util');
const eosjs = require('eosjs');
const ecc = require('eosjs-ecc');
const { TextDecoder, TextEncoder } = require('text-encoding');
const fs = require('fs');

const catchRevert = require("./exceptions.js").catchRevert;

function generateAllKeys(ethPrivateKey){
  let ethPrivate = Buffer.from(ethPrivateKey, 'hex')
  if(!ethUtil.isValidPrivate(ethPrivate)){
    throw("Invalid private key: " + ethPrivateKey)
  }
  let ethAddress = '0x' + ethUtil.privateToAddress(ethPrivate).toString('hex')
	let ethPublic = ethUtil.privateToPublic(ethPrivate).toString('hex')

	// Create EOS keys
	// let eosWIF = ecc.PrivateKey(Buffer.from(ethPrivate, 'hex')).toWif()
	let eosioPrivate = ecc.PrivateKey(ethPrivate)
	let eosioPublic = ecc.privateToPublic(eosioPrivate)

  return {ethPrivate, ethPublic, ethAddress, eosioPrivate, eosioPublic }
}

function eosioGetContractByAbi(abi) {
  const types = eosjs.Serialize.getTypesFromAbi(eosjs.Serialize.createInitialTypes(), abi);
  const actions = new Map();
  for (const { name, type } of abi.actions) {
      actions.set(name, eosjs.Serialize.getType(types, type));
  }
  return { types, actions };
}

const TestSettings = {
  Token: {
    symbol: "TLM",
    totalSupply: 100000000000000,
    decimals: 4,
  },
  threshold: 3,
  chainId: 1,
  oracles: [{
    eosio_name: 'klausklaus12',
    keys: generateAllKeys('8940fbd7806ec09af7e1ceaf7ccac80e89eeeb1e85cee42f84c07b1d5a378100'),
  }, {
    eosio_name: 'anneliese',
    keys: generateAllKeys('8940fbd7806ec09af7e1ceaf7ccac80e89eeeb1e85cee42f84c07b1d5a378101'),
  }, {
    eosio_name: 'peterpeter12',
    keys: generateAllKeys('8940fbd7806ec09af7e1ceaf7ccac80e89eeeb1e85cee42f84c07b1d5a378102'),
  }, {
    eosio_name: 'helga',
    keys: generateAllKeys('4040fbd7806ec09af7e1ceaf7ccac80e89eeeb1e85cee42f84c07b1d5a378110'),
  },{
    eosio_name: 'hans',
    keys: generateAllKeys('8940fbd7806ec09af7e1ceaf7ccac80e89eeeb1e85cee42f84c07b1d5a378103'),
  }],
  eosioAbi: JSON.parse(fs.readFileSync('./test/teleporteos.abi', null).toString())
}


function signWithKey(privateKey, msg_hash_buf){
  const pk = Buffer.from(privateKey, "hex");
  const sig = ethUtil.ecsign(msg_hash_buf, pk);
  return ethUtil.toRpcSig(sig.v, sig.r, sig.s);
}

function toHexString(bytes){
  return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '')
}
function fromHexString(hexString){
  return new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
}

contract('TeleportToken', (accounts) => {

  // List all oracles in console log
  for (let i = 0; i < TestSettings.oracles.length; i++) {
    const element = TestSettings.oracles[i];
    console.log(element.eosio_name, element.keys.ethAddress);
  }

  it('Total supply', async () => {
    const instance = await TeleportToken.deployed();
    const balance = await instance._totalSupply.call();
    assert.equal(balance.valueOf(), TestSettings.Token.totalSupply, `Total supply is not ${TestSettings.Token.totalSupply}`);
  })

  it('Register oracles', async () => {
    const instance = await TeleportToken.deployed();
    
    // Check test settings
    assert.equal(TestSettings.oracles.length > 0, true, 'No oracles defined')
    assert.equal(TestSettings.oracles.length > TestSettings.threshold, true, 'Need one more oracle for testing than threshold')

    // Check if someone else can register an oracle than owner
    await catchRevert(instance.regOracle(TestSettings.oracles[0].keys.ethAddress, {from: accounts[3]}), 'Unauthorized oracle registration')
    
    // Register all oracles
    for(let i = 0; i < TestSettings.oracles.length; i++){
      await instance.regOracle(TestSettings.oracles[i].keys.ethAddress, {from: accounts[0]});
      assert.equal(await instance.oracles(TestSettings.oracles[i].keys.ethAddress), true, 'Missing oracle' + i)
    }

    // Remove one oracle
    let noOracle = TestSettings.oracles[TestSettings.oracles.length - 1].keys.ethAddress;
    await instance.unregOracle(noOracle, {from: accounts[0]});
    assert.equal(await instance.oracles(noOracle), false, 'Oracle is still registered')

    // Check further unauthorized registrations
    await catchRevert(instance.regOracle(noOracle, {from: accounts[3]}), 'Unauthorized registration of former oracle')
    await catchRevert(instance.regOracle(TestSettings.oracles[0].keys.ethAddress, {from: accounts[0]}), 'Double registration of the same oracle')
  })
  
  let tokenAmount1 = 500000;
  const fullToken1 = Math.round(tokenAmount1/(10**TestSettings.Token.decimals))
  it('Receive token from eosio chain', async () => {
    const instance = await TeleportToken.deployed();

    // Check initial state of token amounts
    assert.equal(await instance.balanceOf.call(accounts[0]).valueOf(), 0, 'Balance of account 0 is not 0');
    assert.equal(await instance.balanceOf.call(accounts[1]).valueOf(), 0, 'Balance of account 1 is not 0');
    
    // Check abi file
    assert.equal(TestSettings.eosioAbi.actions.length > 0, true, "No actions in abi file")
    
    // Create example log data by abi definition
    const eosioFromAcc = "wololo"
    const logAsset = `${fullToken1}.${'0'.repeat(TestSettings.Token.decimals)} ${TestSettings.Token.symbol}`;
    const logData = {
      id: 0,                                                              // uint64
      timestamp: Math.round(new Date().getTime() / 1000),                 // uint32
      from: eosioFromAcc,                                                 // uint64
      quantity: logAsset,                                                 // uint64
      chain_id: TestSettings.chainId,                                     // uint8
      eth_address: accounts[1].substring(2) + '000000000000000000000000'  // address
    }
    const logDataHexByAbi = '0x' + eosjs.Serialize.serializeActionData(eosioGetContractByAbi(TestSettings.eosioAbi), 'useless', 'logteleport', logData, new TextEncoder(), new TextDecoder());
    
    // Create example log data manually // logteleport(uint64_t id, uint32_t timestamp, name from, asset quantity, uint8_t chain_id, checksum256 eth_address)
    const sb = new eosjs.Serialize.SerialBuffer({
      textEncoder: new TextEncoder,
      textDecoder: new TextDecoder
    });
    sb.pushNumberAsUint64(0);
    sb.pushUint32(Math.round(new Date().getTime() / 1000));
    sb.pushName(eosioFromAcc);
    sb.pushAsset(logAsset);
    sb.push(TestSettings.chainId);
    sb.pushArray(fromHexString(accounts[1].substring(2) + '000000000000000000000000'));
    const logDataHex = '0x' + toHexString(sb.array.slice(0, 69))

    // Check if serialization by abi file and manually has the same results // Note: Second way is tested to use it in other js implementations
    assert.equal(logDataHex.toLowerCase(), logDataHexByAbi.toLowerCase(), 'Generated example of a logteleport action hex does not match the definition in the abi file')
    
    // Check wrong signatures
    let falseSignatures = [];
    for(let i = 0; i < TestSettings.threshold; i++) {
      const sig = signWithKey(TestSettings.oracles[i].keys.ethPrivate, ethUtil.keccak(Buffer(['1', '2', '3', '4'])))
      falseSignatures.push(sig);
    }
    await catchRevert(instance.claim.call(logDataHex, falseSignatures, {from: accounts[1]}), 'Claim with false signatures')
    
    // Sign the example log data
    const logDataBuffer = Buffer.from(logDataHex.substring(2), 'hex')
    const logDataKeccak = ethUtil.keccak(logDataBuffer)
    let signatures = [];
    for(let i = 0; i < TestSettings.threshold; i++) {
      const sig = signWithKey(TestSettings.oracles[i].keys.ethPrivate, logDataKeccak)
      signatures.push(sig);
    }

    // Pay out the teleported tokens
    await instance.claim(logDataHex, signatures, {from: accounts[2]});  // Claim by a different account is allowed
    assert.equal((await instance.balanceOf.call(accounts[2])).valueOf(), 0, 'Wrong account got funds')
    const receiveBalance = await instance.balanceOf.call(accounts[1]) 
    assert.equal((await instance.balanceOf.call(accounts[1])).valueOf(), fullToken1 * (10 ** TestSettings.Token.decimals), 'Account 1 does not got the right amount of funds')
  });

  it('Send token within the chain', async () => {
    const instance = await TeleportToken.deployed();

    // Check transfer tokens to yourself
    await instance.transfer(accounts[1], tokenAmount1, {from: accounts[1]})
    assert.equal((await instance.balanceOf.call(accounts[1])).valueOf(), tokenAmount1, 'Token amount changed by sending to yourself')
    
    // Check further unallowed transfer actions
    await catchRevert(instance.transfer(accounts[2], tokenAmount1 + 3, {from: accounts[1]}), 'It is possible to send more tokens than available for an account')
    assert.equal((await instance.balanceOf.call(accounts[2])).valueOf(), 0, 'It is possible to get more tokens from a sender than his balance is')
    await catchRevert(instance.transfer(accounts[1], tokenAmount1, {from: accounts[3]}), 'It is possible to send tokens without a balance')

    // Transfer tokens to another account
    const balance1 = fullToken1 * (10 ** TestSettings.Token.decimals)
    const sendAmount = balance1 / 5
    await instance.transfer(accounts[2], sendAmount, {from: accounts[1]})
    tokenAmount1 = balance1 - sendAmount
    assert.equal((await instance.balanceOf.call(accounts[2])).valueOf(), sendAmount, 'Wrong account got funds')
    assert.equal((await instance.balanceOf.call(accounts[1])).valueOf(), tokenAmount1, 'Token amount of sender account is not reduced')
  })

  it('Send token by authorized account within the chain', async () => {
    const instance = await TeleportToken.deployed();
    const approveAmount = tokenAmount1 / 5
    
    // Approve some tokens from account 1 for account 3
    await instance.approve(accounts[3], approveAmount, {from: accounts[1]})
    assert.equal((await instance.balanceOf.call(accounts[3])).valueOf(), 0, 'Account should get rights not funds')
    assert.equal((await instance.balanceOf.call(accounts[1])).valueOf(), tokenAmount1, 'Account lost funds')
    
    // Send tokens to account 4 
    const sendAmount = approveAmount / 2
    await instance.transferFrom(accounts[1], accounts[4], sendAmount, {from: accounts[3]})
    tokenAmount1 -= sendAmount
    assert.equal((await instance.balanceOf.call(accounts[3])).valueOf(), 0, 'Account should not get funds by sending them to someone else')
    assert.equal((await instance.balanceOf.call(accounts[1])).valueOf(), tokenAmount1, 'Owner has wrong balance amount')
    assert.equal((await instance.balanceOf.call(accounts[4])).valueOf(), sendAmount, 'Receiver got not the right amount of funds')
    
    // Check unauthorized transferFrom actions
    await catchRevert(instance.transferFrom(accounts[1], accounts[5], 1, {from: accounts[2]}), 'It is possible to send tokens without the rights')
    await catchRevert(instance.transferFrom(accounts[1], accounts[5], sendAmount + 3, {from: accounts[3]}), 'It is possible to send more tokens than approved')

    // Remove approve amount
    await instance.approve(accounts[3], 0, {from: accounts[1]})
    assert.equal((await instance.balanceOf.call(accounts[3])).valueOf(), 0, 'Account should not get funds by removing the approve')
    assert.equal((await instance.balanceOf.call(accounts[1])).valueOf(), tokenAmount1, 'Owner has wrong balance amount after removing approve')
    await catchRevert(instance.transferFrom(accounts[1], accounts[5], 1, {from: accounts[3]}), 'Can not remove the right to transfer tokens')
  })
  
  it('Teleport to eosio chain', async () => {
    const instance = await TeleportToken.deployed();

    // Teleport tokens
    const sendAmount = tokenAmount1 / 2
    tokenAmount1 -= sendAmount
    const receiveChainId = TestSettings.chainId + 1
    await instance.teleport('fraugertrud', sendAmount, receiveChainId, {from: accounts[1]});
    assert.equal((await instance.balanceOf.call(accounts[1])).valueOf(), tokenAmount1, 'Balance of account got not reduced')

    await catchRevert(instance.teleport('fraugertrud', sendAmount, receiveChainId, {from: accounts[6]}), 'Can teleport without any balance')
  })

  it('Transfer ownership', async () => {
    const instance = await TeleportToken.deployed();

    // Check current ownership
    let owner = await instance.owner();
    let newOwner = await instance.newOwner();
    assert.equal(owner, accounts[0], 'Old owner is not account 0')
    assert.equal(owner, accounts[0], 'NewOwner is at the beginning not account 0')

    // Check unauthorized transfer of ownership
    await catchRevert(instance.transferOwnership.call(accounts[5], {from: accounts[3]}), "Unauthorized transferOwnership")

    // Transfer ownership
    await instance.transferOwnership(accounts[5], {from:accounts[0]});
    owner = await instance.owner();
    newOwner = await instance.newOwner();
    assert.equal(owner, accounts[0], 'TransferOwnership but owner should still be account 0')
    assert.equal(newOwner, accounts[5], 'TransferOwnership but new owner is not account 5')

    // Check unaothorized acceptation of ownership
    await catchRevert(instance.acceptOwnership.call({from: accounts[3]}), "Unauthorized acceptOwnership")
    await catchRevert(instance.acceptOwnership.call({from: accounts[0]}), "Unauthorized acceptOwnership by old owner")

    // Accept ownership
    await instance.acceptOwnership.call({from: accounts[5]})
    owner = await instance.owner();
    newOwner = await instance.newOwner();
    assert.equal(owner, accounts[0], 'AcceptOwnership the new owner is not account 5')
    assert.equal(newOwner, accounts[5], 'AcceptOwnership the newOwner variable must be account 5, too')
  })
});
