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
// import {Console} from 'console';

// const console = new Console({stderr: fs.createWriteStream('err-log.log'), stdout: fs.createWriteStream('logs.log')});

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
		.setInitialBalance(new Hbar(200))
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
	const _uniswapV2FactoryBytecode = fs.readFileSync('assets/bytecode/UniswapV2Factory.bin').toString();
	const _uniswapV2FactoryAbi = JSON.parse(fs.readFileSync('assets/abi/UniswapV2Factory.abi.json').toString());
	const _uniswapV2Factory = new hethers.ContractFactory(_uniswapV2FactoryAbi, _uniswapV2FactoryBytecode, clientWallet);

	const uniswapV2Factory  = await _uniswapV2Factory.deploy(hethers.constants.AddressZero, gasLimitOverride);
	console.log('UniswapV2Factory address:', uniswapV2Factory.address);

	await uniswapV2Factory.createPair(tokenContracts[0].address, tokenContracts[1].address, gasLimitOverride);
	// const pairAddress = await uniswapV2Factory.getPair(tokenContracts[0].address, tokenContracts[1].address, gasLimitOverride);
	// console.log('Pair address:', pairAddress.toString());
	const _uniswapV2RouterBytecode = fs.readFileSync('assets/bytecode/UniswapV2Router.bin').toString();
	const _uniswapV2RouterAbi = JSON.parse(fs.readFileSync('assets/abi/UniswapV2Router.abi.json').toString());
	const _routerContractFactory = new hethers.ContractFactory(_uniswapV2RouterAbi, _uniswapV2RouterBytecode, clientWallet);

	const WETH_ADDRESS = tokenContracts[0].address;
	const uniswapV2Router = await _routerContractFactory.deploy(uniswapV2Factory.address, WETH_ADDRESS, gasLimitOverride);
	console.log('UniswapV2Router address:', uniswapV2Router.address);
	for(let tokenContract of tokenContracts) {
		const factoryApprove = await tokenContract.approve(uniswapV2Factory.address, 1000, gasLimitOverride);
		console.log('factoryApprove', factoryApprove);
		const routerApprove = await tokenContract.approve(uniswapV2Router.address, 1000, gasLimitOverride);
		console.log('routerApprove', routerApprove);
		const walletApprove = await tokenContract.approve(clientWallet.address, 1000, gasLimitOverride);
		console.log('walletApprove', walletApprove);
	}
	const today = new Date();
	const oneHourAfter = new Date();
	oneHourAfter.setHours(today.getHours() + 1);

	try {
		const liquidityAddTx = await uniswapV2Router.addLiquidity(
			tokenContracts[0].address,
			tokenContracts[1].address,
			100,
			100,
			10,
			10,
			clientWallet.address,
			oneHourAfter.getTime(), // deadline
			gasLimitOverride);
		console.log('Waiting for liquidityAddTx');
		const awaited = await liquidityAddTx.wait();
		console.log(awaited);
	}catch (error) {
		console.log(`Adding liquidity failed:`);
		console.log(error);
		const tx = await provider.getTransaction(error.transaction.transactionId);
		console.log(tx);
	}

	// TODO: periphery - add liquidity - separate contract; add liquidity (https://github.com/Uniswap/v2-periphery)
	// TODO: getCreate2Address from hethers


	// TODO:  inspect hethers bug - when calling a contract method without a gas limit override, we get:
	/**
	 * (node:431316) UnhandledPromiseRejectionWarning: Error: invalid BigNumber value (argument="value", value=undefined, code=INVALID_ARGUMENT, version=bignumber/5.5.0)
	 *     at Logger.makeError (/home/yoan/WebstormProjects/hedera-uniswap-interaction/node_modules/hethers/packages/logger/lib/index.js:186:21)
	 *     at Logger.throwError (/home/yoan/WebstormProjects/hedera-uniswap-interaction/node_modules/hethers/packages/logger/lib/index.js:195:20)
	 *     at Logger.throwArgumentError (/home/yoan/WebstormProjects/hedera-uniswap-interaction/node_modules/hethers/packages/logger/lib/index.js:198:21)
	 *     at Function.BigNumber.from (/home/yoan/WebstormProjects/hedera-uniswap-interaction/node_modules/hethers/packages/bignumber/lib/bignumber.js:241:23)
	 *     at numberify (/home/yoan/WebstormProjects/hedera-uniswap-interaction/node_modules/hethers/packages/transactions/lib/index.js:342:34)
	 *     at Wallet.<anonymous> (/home/yoan/WebstormProjects/hedera-uniswap-interaction/node_modules/hethers/packages/abstract-signer/lib/index.js:189:66)
	 *     at step (/home/yoan/WebstormProjects/hedera-uniswap-interaction/node_modules/hethers/packages/abstract-signer/lib/index.js:67:23)
	 *     at Object.next (/home/yoan/WebstormProjects/hedera-uniswap-interaction/node_modules/hethers/packages/abstract-signer/lib/index.js:48:53)
	 *     at fulfilled (/home/yoan/WebstormProjects/hedera-uniswap-interaction/node_modules/hethers/packages/abstract-signer/lib/index.js:39:58)
	 *     at processTicksAndRejections (internal/process/task_queues.js:97:5)
	 * (node:431316) UnhandledPromiseRejectionWarning: Unhandled promise rejection. This error originated either by throwing inside of an async function without a catch block, or by rejecting a promise which was not handled with .catch(). To terminate the node process on unhandled promise rejection, use the CLI flag `--unhandled-rejections=strict` (see https://nodejs.org/api/cli.html#cli_unhandled_rejections_mode). (rejection id: 3)
	 * (node:431316) [DEP0018] DeprecationWarning: Unhandled promise rejections are deprecated. In the future, promise rejections that are not handled will terminate the Node.js process with a non-zero exit code.
	 */
})();

