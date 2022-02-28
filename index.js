import * as hethers from '@hashgraph/hethers';
import {AccountCreateTransaction, Client, Hbar, Key as HederaKey, PrivateKey, TransactionId,} from "@hashgraph/sdk";
import {Key} from "@hashgraph/proto";
import * as fs from 'fs';
import 'dotenv/config';

const operator = {
	// genesis is the operator
	accountId: process.env.TESTNET_ACCOUNT_ID,
	privateKey: process.env.TESTNET_PRIVATE_KEY
	// accountId: "0.0.2",
	// privateKey: "302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137",
};
const  network = {
	"127.0.0.1:50211": "0.0.3",
};

function reconnect(contract, abi)  {
	return hethers.ContractFactory.getContract(contract.address, abi, contract.signer);
}

// main
(async () => {
	const numericTokenAmount = 10000;
	const tokenAmount = hethers.constants.WeiPerEther.mul(numericTokenAmount);

	const networkName = 'testnet';//process.env.NETWORK_NAME;
	const provider = hethers.providers.getDefaultProvider(networkName);
	const client = Client.forName(networkName);
	// const provider = new hethers.providers.HederaProvider("0.0.3", "127.0.0.1:50211", "");
	// const client = Client.forNetwork(network);

	let clientWallet = hethers.Wallet.createRandom();
	const accountCreate = await (await new AccountCreateTransaction()
		.setKey(HederaKey._fromProtobufKey(Key.create({
			ECDSASecp256k1: hethers.utils.arrayify(clientWallet._signingKey().compressedPublicKey)
		})))
		.setTransactionId(TransactionId.generate(operator.accountId))
		.setInitialBalance(new Hbar(100))
		.setNodeAccountIds([client._network.getNodeAccountIdsForExecute()[0]])
		.freeze()
		.sign(PrivateKey.fromString(operator.privateKey)))
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
	const _uniswapV2FactoryBytecode = fs.readFileSync('assets/bytecode/UniswapV2Factory.bin').toString();
	const _uniswapV2FactoryAbi = JSON.parse(fs.readFileSync('assets/abi/UniswapV2Factory.abi.json').toString());
	const _uniswapV2Factory = new hethers.ContractFactory(_uniswapV2FactoryAbi, _uniswapV2FactoryBytecode, clientWallet);

	console.log('Deploying factory...');
	const __uniswapV2Factory  = await _uniswapV2Factory.deploy(hethers.constants.AddressZero, gasLimitOverride);
	const uniswapV2Factory = reconnect(__uniswapV2Factory, _uniswapV2FactoryAbi);
	console.log('UniswapV2Factory address:', uniswapV2Factory.address);

	// token contracts
	console.log('Deploying token contracts...');
	const erc20Bytecode = fs.readFileSync('assets/bytecode/ERC20Token.bin').toString();
	const abi = JSON.parse(fs.readFileSync('assets/abi/ERC20Token.abi.json').toString());
	const pndt = await new hethers.ContractFactory(abi, erc20Bytecode, clientWallet).deploy("PDNT", "PNDT", numericTokenAmount, gasLimitOverride);
	const rpt  = await new hethers.ContractFactory(abi, erc20Bytecode, clientWallet).deploy("RPT", "RPT", numericTokenAmount, gasLimitOverride);
	const weth = await new hethers.ContractFactory(abi, erc20Bytecode, clientWallet).deploy("WETH", "WETH", numericTokenAmount, gasLimitOverride);
	console.log(`PNDT -> ${pndt.address}`);
	console.log(`RPT -> ${rpt.address}`)
	console.log(`WETH -> ${weth.address}`)

	// Create a pair and ensure address can be calculated
	console.log(`Creating pair between ${pndt.address} <-> ${rpt.address}`);
	// createPair returns the address of the pair which was created via CREATE2
	await uniswapV2Factory.createPair(pndt.address, rpt.address, gasLimitOverride);
	const createdPairAddress = await uniswapV2Factory.getPair(pndt.address,rpt.address, gasLimitOverride);
	console.log('Created Pair address:', createdPairAddress.toString());
	// ensure
	const init_code = '0x20861adeac3e9014df26311e6a92196810915610e4580335a51b892656332caa';
	const packedAdresses = new Uint8Array([
		...hethers.utils.arrayify(pndt.address),
		...hethers.utils.arrayify(rpt.address),
	]);
	const salt = hethers.utils.keccak256(packedAdresses); // abi.encodePacked(t1, t2);
	const computedPairAddress = hethers.utils.getCreate2Address(uniswapV2Factory.address , salt, init_code)
	console.log('Computed Pair address',computedPairAddress);
	if (computedPairAddress.toString() !== createdPairAddress.toString()) {
		throw new Error(`CREATE2 - Address Mismatch: ${computedPairAddress.toString()} != ${createdPairAddress.toString()}`)
	}

	// deploy router
	console.log('Deploying router...');
	const _uniswapV2RouterBytecode = fs.readFileSync('assets/bytecode/UniswapV2Router.bin').toString();
	const _uniswapV2RouterAbi = JSON.parse(fs.readFileSync('assets/abi/UniswapV2Router.abi.json').toString());
	const _routerContractFactory = new hethers.ContractFactory(_uniswapV2RouterAbi, _uniswapV2RouterBytecode, clientWallet);
	const _uniswapV2Router = await _routerContractFactory.deploy(uniswapV2Factory.address, weth.address, {gasLimit: gasLimitOverride.gasLimit*2});
	const uniswapV2Router = reconnect(_uniswapV2Router, _uniswapV2RouterAbi);
	console.log('UniswapV2Router address:', uniswapV2Router.address);

	// approve spending tokens from router/factory
	console.log('Approving router to spend tokens on behalf of the tokens owner');
	const newPndt = reconnect(pndt, abi);
	const newRpt = reconnect(rpt, abi);
	const pndtApproval = await newPndt.approve(uniswapV2Router.address, tokenAmount, gasLimitOverride);
	console.log('pndtApproval', pndtApproval);
	const rptApproval = await newRpt.approve(uniswapV2Router.address, tokenAmount, gasLimitOverride);
	console.log('rptApproval', rptApproval);

	const today = new Date();
	const oneHourAfter = new Date();
	oneHourAfter.setHours(today.getHours() + 1);
	console.log('Adding liquidity');
	try {
		// contract_revert -> was initial error when deadline was 0
		// fail_invalid -> appears when deadline is met. May either be about the timestamp or something internal after the code execution
		const liquidityAddTx = await uniswapV2Router.addLiquidity(
			pndt.address,
			rpt.address,
			tokenAmount,
			tokenAmount,
			1,
			1,
			clientWallet.address,
			oneHourAfter.getTime(),
			gasLimitOverride);
		console.log(liquidityAddTx);
		console.log('Waiting for liquidityAddTx');
		// const awaited = await liquidityAddTx.wait();
		// console.log(awaited);
	} catch (error) {
		console.error(error);
	}

	// TODO: hethers bug - contracts must be reconnected to.

	// TODO: successful addLiquidity() call
	// TODO: getCreate2Address from hethers - compare addresses -


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
	 * (node:431316) UnhandledPromiseRejectionWarning: Unhandled promise rejection. This error originated either by throwing inside an async function without a catch block, or by rejecting a promise which was not handled with .catch(). To terminate the node process on unhandled promise rejection, use the CLI flag `--unhandled-rejections=strict` (see https://nodejs.org/api/cli.html#cli_unhandled_rejections_mode). (rejection id: 3)
	 * (node:431316) [DEP0018] DeprecationWarning: Unhandled promise rejections are deprecated. In the future, promise rejections that are not handled will terminate the Node.js process with a non-zero exit code.
	 */
})();

/// Previewnet
// 0x000000000000000000000000000000000000a5d9 - RPT
// 0x000000000000000000000000000000000000a5db - PNDT
// 0x000000000000000000000000000000000000a5dd - WETH

// 0x000000000000000000000000000000000000a5df - UniswapV2Factory
// 0x000000000000000000000000000000000000a5e2 - UniswapV2Router
