import * as hethers from 'hethers/packages/ethers/lib/ethers.js';
import {
	AccountCreateTransaction,
	PrivateKey,
	Hbar,
	Client,
	Key as HederaKey,
	TransactionId,
	FileCreateTransaction, FileAppendTransaction, ContractCreateTransaction, PublicKey,
	AccountId
} from "@hashgraph/sdk";
import {Key} from "@hashgraph/proto";
import * as fs from 'fs';
import 'dotenv/config';

// main
(async () => {
	const provider = hethers.providers.getDefaultProvider('previewnet');
	const client = Client.forPreviewnet();
	let clientWallet = hethers.Wallet.createRandom();
	const accountCreate = await (await new AccountCreateTransaction()
		.setKey(HederaKey._fromProtobufKey(Key.create({
			ECDSASecp256k1: hethers.utils.arrayify(clientWallet._signingKey().compressedPublicKey)
		})))
		.setTransactionId(TransactionId.generate(process.env.PREVIEWNET_ACCOUNT_ID))
		.setInitialBalance(new Hbar(50))
		.setNodeAccountIds([client._network.getNodeAccountIdsForExecute()[0]])
		.freeze()
		.sign(PrivateKey.fromString(process.env.PREVIEWNET_PRIVATE_KEY)))
		.execute(client);
	const receipt = await accountCreate.getReceipt(client);
	const createdAcc = receipt.accountId || "0.0.0";
	console.log(`Using account ${createdAcc}`);
	/**
	 * Connect account
	 */
	clientWallet = clientWallet
		.connect(provider)
		.connectAccount(createdAcc.toString());

	const gasLimitOverride = {gasLimit: 300000};
	const nodeID = AccountId.fromString("0.0.3");
	// const erc20Bytecode = fs.readFileSync('assets/bytecode/ERC20Token.bin').toString();
	// const abi = JSON.parse(fs.readFileSync('assets/abi/ERC20Token.abi.json').toString());
	// const tokenContracts = [];
	// for (let i = 1; i <= 2; i++) {
	// 	const tokenName = process.env[`TOKEN${i}_NAME`];
	// 	const tokenSymbol = process.env[`TOKEN${i}_SYMBOL`];
	// 	const tokenSupply = process.env[`TOKEN${i}_SUPPLY`];
	// 	const contract = new hethers.ContractFactory(abi, erc20Bytecode, clientWallet);
	// 	const c = await contract.deploy(tokenName, tokenSymbol, hethers.BigNumber.from(tokenSupply), gasLimitOverride);
	// 	tokenContracts.push(c);
	// 	console.log('Deployed token contract for', tokenSymbol, 'at:', c.address);
	// }
	const signingKey = PrivateKey.fromStringECDSA(clientWallet._signingKey().privateKey);
	const uniswapV2FactoryBytecode = fs.readFileSync('assets/bytecode/UniswapV2Factory.bin');
	const uniswapV2FactoryAbi = JSON.parse(fs.readFileSync('assets/abi/UniswapV2Factory.abi.json').toString());
	const _uniswapV2cf = new hethers.ContractFactory(uniswapV2FactoryAbi, uniswapV2FactoryBytecode, clientWallet);
	// console.log(uniswap);

	// const splitContents = splitInChunks(uniswapV2FactoryBytecode, 4096);
	// console.log(`Contract chunks ${splitContents.length}`);
	// const fileCreate = await new FileCreateTransaction()
	// 	.setContents(splitContents[0])
	// 	.setKeys([PublicKey.fromString(clientWallet._signingKey().compressedPublicKey)])
	// 	.setNodeAccountIds([nodeID])
	// 	.setTransactionId(TransactionId.generate(createdAcc))
	// 	.freeze()
	// 	.sign(signingKey);
	// const fcResponse = await fileCreate.execute(client);
	// const fcReceipt = await fcResponse.getReceipt(client);
	// const fileID = fcReceipt.fileId.toString();
	// console.log(`Created file ${fileID}`);
	// for(let el of splitContents.slice(1)) {
	// 	const fileAppend = await new FileAppendTransaction()
	// 		.setContents(el)
	// 		.setFileId(fileID)
	// 		.setNodeAccountIds([nodeID])
	// 		.setTransactionId(TransactionId.generate(createdAcc))
	// 		.freeze()
	// 		.sign(signingKey);
	// 	await fileAppend.execute(client);
	// }
	//
	// const contractCreate = await new ContractCreateTransaction()
	// 	.setBytecodeFileId(fileID)
	// 	.setGas(4000000)
	// 	.setConstructorParameters(hethers.utils.arrayify(_uniswapV2cf.interface.encodeDeploy([clientWallet.address])))
	// 	.setNodeAccountIds([nodeID])
	// 	.setTransactionId(TransactionId.generate(createdAcc))
	// 	.freeze()
	// 	.sign(signingKey);
	// const ccResp = await contractCreate.execute(client);
	// const ccReceipt = await ccResp.getReceipt(client);
	// console.log(ccReceipt);
	// INVALID_SOLIDITY_ADDRESS - more zeroes in

	console.log(`Fee to saver ${clientWallet.address}`);
	const uniswapV2Factory = await _uniswapV2cf.deploy(hethers.utils.getAddress(clientWallet.address), gasLimitOverride);
	console.log('UniswapV2Factory:', uniswapV2Factory);
	console.log(uniswapV2Factory);
	// TODO: factory.createPair
	// TODO: periphery - add liquidity
	// TODO: getCreate2Address from hethers
})();

// 0x0000000000000000000000000000000001c4bdb6 - previewnet RPT
// 0x0000000000000000000000000000000001c4bdb8 - previewnet PNDT

// 000000000000000000000000000000000000009cdb
// concatenated wallet - 0000000000000000000000000000000000000000000000000000000000009cdb
function splitInChunks(data, chunkSize) {
	var chunks = [];
	var num = 0;
	while (num <= data.length) {
		var slice = data.slice(num, chunkSize + num);
		num += chunkSize;
		chunks.push(slice);
	}
	return chunks;
}