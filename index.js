import * as hethers from 'hethers/packages/ethers/lib/ethers.js';
import {
	AccountCreateTransaction,
	PrivateKey,
	Hbar,
	Client,
	Key as HederaKey,
	TransactionId,
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
	const erc20Bytecode = fs.readFileSync('assets/bytecode/ERC20Token.bin').toString();
	const abi = JSON.parse(fs.readFileSync('assets/abi/ERC20Token.abi.json').toString());
	const tokenContracts = [];
	for (let i = 1; i <= 2; i++) {
		const tokenName = process.env[`TOKEN${i}_NAME`];
		const tokenSymbol = process.env[`TOKEN${i}_SYMBOL`];
		const tokenSupply = process.env[`TOKEN${i}_SUPPLY`];
		const contract = new hethers.ContractFactory(abi, erc20Bytecode, clientWallet);
		const c = await contract.deploy(tokenName, tokenSymbol, hethers.BigNumber.from(tokenSupply), gasLimitOverride);
		tokenContracts.push(c);
		console.log('Deployed token contract for', tokenSymbol, 'at:', c.address);
	}
	const uniswapV2FactoryBytecode = fs.readFileSync('assets/bytecode/UniswapV2Factory.bin').toString();
	const uniswapV2FactoryAbi = JSON.parse(fs.readFileSync('assets/abi/UniswapV2Factory.abi.json').toString());
	const _uniswapV2Factory_factory = new hethers.ContractFactory(uniswapV2FactoryAbi, uniswapV2FactoryBytecode, clientWallet);

	console.log(`Fee to saver ${clientWallet.address}`);
	const uniswapV2Factory  = await _uniswapV2Factory_factory.deploy(clientWallet.address, gasLimitOverride);
	console.log('UniswapV2Factory address:', uniswapV2Factory.address);

	const pairCreationResponse = await uniswapV2Factory.createPair(tokenContracts[0].address, tokenContracts[1].address, gasLimitOverride);
	console.log(pairCreationResponse);


	// TODO: factory.createPair
	// TODO: periphery - add liquidity - separate contract; add liquidity (https://github.com/Uniswap/v2-periphery)
	// TODO: getCreate2Address from hethers
})();

