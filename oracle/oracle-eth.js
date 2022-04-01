#!/usr/bin/env node
"use strict";
/*
This oracle listens to the ethereum blockchain for `Teleport` events.

When an event is received, it will call the `received` action on the EOS chain
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractEthTeleportData = exports.extractEthClaimedData = void 0;
process.title = "oracle-eth ".concat(process.env['CONFIG']);
var fs_1 = __importDefault(require("fs"));
var ethers_1 = require("ethers");
var eosio_helpers_1 = require("eosio-helpers");
var yargs_1 = __importDefault(require("yargs"));
var config = require(process.env['CONFIG'] || '../config');
var provider = new ethers_1.ethers.providers.StaticJsonRpcProvider(config.eth.endpoint);
var network = config.eth.network;
var blocks_file_name = ".oracle_".concat(network, "_block-").concat(config.eth.oracleAccount);
var DEFAULT_BLOCKS_TO_WAIT = 5;
var claimed_topic = '0xf20fc6923b8057dd0c3b606483fcaa038229bb36ebc35a0040e3eaa39cf97b17';
var teleport_topic = '0x622824274e0937ee319b036740cd0887131781bc2032b47eac3e88a1be17f5d5';
var precision = 4;
var await_confirmation = function (txid) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, new Promise(function (resolve) { return __awaiter(void 0, void 0, void 0, function () {
                var resolved;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            resolved = false;
                            _a.label = 1;
                        case 1:
                            if (!!resolved) return [3 /*break*/, 3];
                            provider.getTransactionReceipt(txid).then(function (receipt) {
                                if (receipt && receipt.confirmations > DEFAULT_BLOCKS_TO_WAIT) {
                                    console.log("TX ".concat(txid, " has ").concat(receipt.confirmations, " confirmations"));
                                    resolve(receipt);
                                    resolved = true;
                                }
                            });
                            return [4 /*yield*/, (0, eosio_helpers_1.Sleep)(10000)];
                        case 2:
                            _a.sent();
                            return [3 /*break*/, 1];
                        case 3: return [2 /*return*/];
                    }
                });
            }); })];
    });
}); };
/**
 * Loads a block number from a saved file if one exists or throws an error.
 * @returns a saved block number from a file
 */
var load_block_number_from_file = function (blocks_file) {
    if (blocks_file === void 0) { blocks_file = blocks_file_name; }
    return __awaiter(void 0, void 0, void 0, function () {
        var file_contents, block_number;
        return __generator(this, function (_a) {
            //   let block_number: string | number = 'latest';
            if (!fs_1.default.existsSync(blocks_file))
                throw new Error('block file does not exist.');
            file_contents = fs_1.default.readFileSync(blocks_file).toString();
            if (!file_contents)
                throw new Error('No blocks file');
            block_number = parseInt(file_contents);
            if (isNaN(block_number))
                throw new Error('No block number in file.');
            return [2 /*return*/, block_number];
        });
    });
};
var save_block_to_file = function (block_num, blocks_file) {
    if (blocks_file === void 0) { blocks_file = blocks_file_name; }
    return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            fs_1.default.writeFileSync(blocks_file, block_num.toString());
            return [2 /*return*/];
        });
    });
};
var extractEthClaimedData = function (data) {
    var id = data[0].toNumber();
    var to_eth = data[1].replace('0x', '') + '000000000000000000000000';
    var quantity = (data[2].toNumber() / Math.pow(10, precision)).toFixed(precision) + ' ' + config.symbol;
    return { oracle_name: config.eos.oracleAccount, id: id, to_eth: to_eth, quantity: quantity, };
};
exports.extractEthClaimedData = extractEthClaimedData;
var extractEthTeleportData = function (data, transactionHash) {
    var tokens = data[1].toNumber();
    if (tokens <= 0) {
        throw new Error('Tokens are less than or equal to 0');
    }
    var to = data[0];
    var chain_id = data[2].toNumber();
    var amount = (tokens / Math.pow(10, config.precision)).toFixed(config.precision);
    var quantity = "".concat(amount, " ").concat(config.symbol);
    var txid = transactionHash.replace(/^0x/, '');
    return { chain_id: chain_id, confirmed: true, quantity: quantity, to: to, oracle_name: config.eos.oracleAccount, ref: txid };
};
exports.extractEthTeleportData = extractEthTeleportData;
var process_claimed = function (from_block, to_block, submit_to_blockchain) { return __awaiter(void 0, void 0, void 0, function () {
    var query, res, res_1, res_1_1, _a, transactionHash, data, decodedData, eosioData, actions, eos_res, e_1, e_2_1;
    var e_2, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                query = {
                    fromBlock: from_block,
                    toBlock: to_block,
                    address: config.eth.teleportContract,
                    topics: [claimed_topic],
                };
                return [4 /*yield*/, provider.getLogs(query)];
            case 1:
                res = _c.sent();
                _c.label = 2;
            case 2:
                _c.trys.push([2, 11, 12, 17]);
                res_1 = __asyncValues(res);
                _c.label = 3;
            case 3: return [4 /*yield*/, res_1.next()];
            case 4:
                if (!(res_1_1 = _c.sent(), !res_1_1.done)) return [3 /*break*/, 10];
                _a = res_1_1.value, transactionHash = _a.transactionHash, data = _a.data;
                decodedData = ethers_1.ethers.utils.defaultAbiCoder.decode(['uint64', 'address', 'uint'], data);
                eosioData = (0, exports.extractEthClaimedData)(decodedData);
                // wait for confirmation of each transaction before continuing
                return [4 /*yield*/, await_confirmation(transactionHash)];
            case 5:
                // wait for confirmation of each transaction before continuing
                _c.sent();
                actions = [
                    {
                        account: config.eos.teleportContract,
                        name: 'claimed',
                        authorization: [
                            {
                                actor: config.eos.oracleAccount,
                                permission: config.eos.oraclePermission || 'active',
                            },
                        ],
                        data: eosioData,
                    },
                ];
                _c.label = 6;
            case 6:
                _c.trys.push([6, 8, , 9]);
                return [4 /*yield*/, (0, eosio_helpers_1.SingleRun)({
                        actions: actions,
                        eos_endpoint: config.eos.endpoints[0],
                        submit_to_blockchain: submit_to_blockchain,
                        private_keys: [{ pk: config.eos.privateKey }],
                    })];
            case 7:
                eos_res = _c.sent();
                console.log("Sent notification of claim with txid ".concat(eos_res.transaction_id, ", for ID ").concat(eosioData.id, ", account 0x").concat(eosioData.to_eth.substring(0, 40), ", quantity ").concat(eosioData.quantity));
                return [3 /*break*/, 9];
            case 8:
                e_1 = _c.sent();
                if (e_1.message.indexOf('Already marked as claimed') > -1) {
                    console.log("ID ".concat(eosioData.id, " is already claimed, account 0x").concat(eosioData.to_eth.substring(0, 40), ", quantity ").concat(eosioData.quantity));
                }
                else {
                    console.error("Error sending confirm ".concat(e_1.message));
                }
                return [3 /*break*/, 9];
            case 9: return [3 /*break*/, 3];
            case 10: return [3 /*break*/, 17];
            case 11:
                e_2_1 = _c.sent();
                e_2 = { error: e_2_1 };
                return [3 /*break*/, 17];
            case 12:
                _c.trys.push([12, , 15, 16]);
                if (!(res_1_1 && !res_1_1.done && (_b = res_1.return))) return [3 /*break*/, 14];
                return [4 /*yield*/, _b.call(res_1)];
            case 13:
                _c.sent();
                _c.label = 14;
            case 14: return [3 /*break*/, 16];
            case 15:
                if (e_2) throw e_2.error;
                return [7 /*endfinally*/];
            case 16: return [7 /*endfinally*/];
            case 17: return [2 /*return*/];
        }
    });
}); };
var process_teleported = function (from_block, to_block, submit_to_blockchain) { return __awaiter(void 0, void 0, void 0, function () {
    var query, res, res_2, res_2_1, _a, transactionHash, data, decodedData, eosioData, actions, eos_res, e_3, e_4_1;
    var e_4, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                query = {
                    fromBlock: from_block,
                    toBlock: to_block,
                    address: config.eth.teleportContract,
                    topics: [teleport_topic],
                };
                return [4 /*yield*/, provider.getLogs(query)];
            case 1:
                res = _c.sent();
                _c.label = 2;
            case 2:
                _c.trys.push([2, 13, 14, 19]);
                res_2 = __asyncValues(res);
                _c.label = 3;
            case 3: return [4 /*yield*/, res_2.next()];
            case 4:
                if (!(res_2_1 = _c.sent(), !res_2_1.done)) return [3 /*break*/, 12];
                _a = res_2_1.value, transactionHash = _a.transactionHash, data = _a.data;
                decodedData = ethers_1.ethers.utils.defaultAbiCoder.decode(['string', 'uint', 'uint'], data);
                eosioData = (0, exports.extractEthTeleportData)(decodedData, transactionHash);
                return [4 /*yield*/, await_confirmation(transactionHash)];
            case 5:
                _c.sent();
                actions = [
                    {
                        account: config.eos.teleportContract,
                        name: 'received',
                        authorization: [
                            {
                                actor: config.eos.oracleAccount,
                                permission: config.eos.oraclePermission || 'active',
                            },
                        ],
                        data: eosioData,
                    },
                ];
                _c.label = 6;
            case 6:
                _c.trys.push([6, 8, , 9]);
                return [4 /*yield*/, (0, eosio_helpers_1.SingleRun)({
                        actions: actions,
                        eos_endpoint: config.eos.endpoints[0],
                        submit_to_blockchain: submit_to_blockchain,
                        private_keys: [{ pk: config.eos.privateKey }],
                    })];
            case 7:
                eos_res = _c.sent();
                console.log("Sent notification of teleport with txid ".concat(eos_res.transaction_id));
                return [3 /*break*/, 9];
            case 8:
                e_3 = _c.sent();
                if (e_3.message.indexOf('Oracle has already approved') > -1) {
                    console.log('Oracle has already approved');
                }
                else {
                    console.error("Error sending teleport ".concat(e_3.message));
                }
                return [3 /*break*/, 9];
            case 9:
                {
                    //if (res.length) {
                    // for (let r = 0; r < res.length; r++) {
                    //   const data = ethers.utils.defaultAbiCoder.decode(
                    //     ['string', 'uint', 'uint'],
                    //     res[r].data
                    //   );
                    // console.log(res[r], data, data[1].toString())
                    //   const tokens = data[1].toNumber();
                    //   if (tokens <= 0) {
                    //     // console.error(data);
                    //     console.error('Tokens are less than or equal to 0');
                    //     continue;
                    //   }
                    //   const to = data[0];
                    //   const chain_id = data[2].toNumber();
                    //   const amount = (tokens / Math.pow(10, config.precision)).toFixed(
                    //     config.precision
                    //   );
                    //   const quantity = `${amount} ${config.symbol}`;
                    //   const txid = res[r].transactionHash.replace(/^0x/, '');
                    //   const actions: EosioAction[] = [];
                    //   actions.push({
                    //     account: config.eos.teleportContract,
                    //     name: 'received',
                    //     authorization: [
                    //       {
                    //         actor: config.eos.oracleAccount,
                    //         permission: config.eos.oraclePermission || 'active',
                    //       },
                    //     ],
                    //     data: {
                    //       oracle_name: config.eos.oracleAccount,
                    //       to,
                    //       ref: txid,
                    //       quantity,
                    //       chain_id,
                    //       confirmed: true,
                    //     },
                    //   });
                    //   // console.log(actions);
                    //   await_confirmation(res[r].transactionHash).then(async () => {
                    //     try {
                    //       const eos_res = await eos_api.transact(
                    //         { actions },
                    //         {
                    //           blocksBehind: 3,
                    //           expireSeconds: 180,
                    //         }
                    //       );
                    //       console.log(
                    //         `Sent notification of teleport with txid ${eos_res.transaction_id}`
                    //       );
                    //       // resolve();
                    //     } catch (e) {
                    //       if (e.message.indexOf('Oracle has already approved') > -1) {
                    //         console.log('Oracle has already approved');
                    //       } else {
                    //         console.error(`Error sending teleport ${e.message}`);
                    //         // reject(e);
                    //       }
                    //     }
                    //   });
                }
                return [4 /*yield*/, (0, eosio_helpers_1.Sleep)(500)];
            case 10:
                _c.sent();
                _c.label = 11;
            case 11: return [3 /*break*/, 3];
            case 12: return [3 /*break*/, 19];
            case 13:
                e_4_1 = _c.sent();
                e_4 = { error: e_4_1 };
                return [3 /*break*/, 19];
            case 14:
                _c.trys.push([14, , 17, 18]);
                if (!(res_2_1 && !res_2_1.done && (_b = res_2.return))) return [3 /*break*/, 16];
                return [4 /*yield*/, _b.call(res_2)];
            case 15:
                _c.sent();
                _c.label = 16;
            case 16: return [3 /*break*/, 18];
            case 17:
                if (e_4) throw e_4.error;
                return [7 /*endfinally*/];
            case 18: return [7 /*endfinally*/];
            case 19: return [2 /*return*/];
        }
    });
}); };
var run = function (start_ref, submit_to_blockchain) { return __awaiter(void 0, void 0, void 0, function () {
    var from_block, block, latest_block, err_1, to_block, e_5;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!true) return [3 /*break*/, 19];
                _a.label = 1;
            case 1:
                _a.trys.push([1, 17, , 18]);
                return [4 /*yield*/, provider.getBlock('latest')];
            case 2:
                block = _a.sent();
                latest_block = block.number;
                if (!!from_block) return [3 /*break*/, 8];
                if (!(start_ref === 'latest')) return [3 /*break*/, 7];
                _a.label = 3;
            case 3:
                _a.trys.push([3, 5, , 6]);
                return [4 /*yield*/, load_block_number_from_file()];
            case 4:
                from_block = _a.sent();
                // for fresh start go back 50 blocks
                from_block -= 50;
                console.log("Starting from saved block with additional previous 50 blocks for safety: ".concat(from_block, ". "));
                return [3 /*break*/, 6];
            case 5:
                err_1 = _a.sent();
                console.log(err_1);
                // could not get block from file and it wasn't specified (go back 100 blocks from latest)
                from_block = latest_block - 100;
                return [3 /*break*/, 6];
            case 6: return [3 /*break*/, 8];
            case 7:
                if (typeof start_ref === 'number') {
                    from_block = start_ref;
                }
                else {
                    from_block = config.eth.genesisBlock;
                }
                _a.label = 8;
            case 8:
                if (from_block < 0) {
                    from_block = 0;
                }
                to_block = Math.min(from_block + 100, latest_block);
                if (!(start_ref >= latest_block)) return [3 /*break*/, 10];
                console.log("Up to date at block ".concat(to_block));
                return [4 /*yield*/, (0, eosio_helpers_1.Sleep)(10000)];
            case 9:
                _a.sent();
                _a.label = 10;
            case 10:
                console.log("Getting events from block ".concat(from_block, " to ").concat(to_block));
                return [4 /*yield*/, process_claimed(from_block, to_block, submit_to_blockchain)];
            case 11:
                _a.sent();
                return [4 /*yield*/, process_teleported(from_block, to_block, submit_to_blockchain)];
            case 12:
                _a.sent();
                from_block = to_block;
                // save last block received
                return [4 /*yield*/, save_block_to_file(to_block)];
            case 13:
                // save last block received
                _a.sent();
                if (!(latest_block - from_block <= 1000)) return [3 /*break*/, 15];
                console.log('Waiting...');
                return [4 /*yield*/, (0, eosio_helpers_1.Sleep)(30000)];
            case 14:
                _a.sent();
                return [3 /*break*/, 16];
            case 15:
                console.log("Not waiting... ".concat(latest_block, " - ").concat(from_block));
                _a.label = 16;
            case 16: return [3 /*break*/, 18];
            case 17:
                e_5 = _a.sent();
                console.error(e_5.message);
                return [3 /*break*/, 18];
            case 18: return [3 /*break*/, 0];
            case 19: return [2 /*return*/];
        }
    });
}); };
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var startRef, _a, start_block, submit_to_blockchain, start_block_env;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                startRef = 'latest';
                return [4 /*yield*/, (0, yargs_1.default)(process.argv)
                        .option('start_block', {
                        alias: 's',
                        desc: 'start block to start scanning from',
                        number: true,
                        demandOption: false,
                    })
                        .option('submit_to_blockchain', {
                        alias: 'b',
                        boolean: true,
                        description: 'boolean to determine if it should submit actions to Wax blockchain',
                        default: false,
                        demandOption: false,
                    }).argv];
            case 1:
                _a = _b.sent(), start_block = _a.start_block, submit_to_blockchain = _a.submit_to_blockchain;
                if (start_block) {
                    startRef = start_block;
                }
                else if (process.env['START_BLOCK']) {
                    start_block_env = parseInt(process.env['START_BLOCK']);
                    if (isNaN(start_block_env)) {
                        console.error("You must supply start block as an integer in env");
                        process.exit(1);
                    }
                    startRef = start_block_env;
                }
                run(startRef, submit_to_blockchain);
                return [2 /*return*/];
        }
    });
}); })().catch(function (e) {
    console.error('error: ', e);
});
