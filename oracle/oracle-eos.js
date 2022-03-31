"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
var eosjs_1 = require("eosjs");
var eosjs_jssig_1 = require("eosjs/dist/eosjs-jssig");
var text_encoding_1 = require("text-encoding");
var ethereumjs_util_1 = require("ethereumjs-util");
var eosEndpointSwitcher_1 = require("./eosEndpointSwitcher");
// Load config and set title
var config_file = process.env['CONFIG'] || './config';
var config = require(config_file);
process.title = "oracle-eos ".concat(config_file);
// Configure eosjs specific propperties
var signatureProvider = new eosjs_jssig_1.JsSignatureProvider([config.eos.privateKey]);
var eos_api = new eosEndpointSwitcher_1.EosApi(config.eos.chainId, config.eos.endpoints, signatureProvider);
/**
 * Convert an Uint8Array to an hex in string format
 * @param bytes Uint8Array
 * @returns Hex in string format
 */
function toHexString(bytes) {
    return bytes.reduce(function (str, byte) { return str + byte.toString(16).padStart(2, '0'); }, '');
}
/**
 * Convert a hex in string format to an Uint8Array
 * @param hexString Hex in string format
 * @returns Uint8Array
 */
function fromHexString(hexString) {
    var str = hexString.match(/.{1,2}/g);
    return str == null ? new Uint8Array() : new Uint8Array(str.map(function (byte) { return parseInt(byte, 16); }));
}
/**
 * Use this function with await to let the thread sleep for the defined amount of time
 * @param ms Milliseconds
 */
var sleep = function (ms) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, new Promise(function (resolve) {
                setTimeout(resolve, ms);
            })];
    });
}); };
/**
 * Send sign a teleport. Repeats itself until a defined amount of tries are reached
 * @param id Teleport id
 * @param signature Signature of this oracle
 * @param tries Already passed tries
 */
function sendSignAction(id, signature, tries) {
    if (tries === void 0) { tries = 0; }
    return __awaiter(this, void 0, void 0, function () {
        var result, e_1, retry;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 7]);
                    console.log("Teleport id ".concat(id, ", try to send signature ").concat(tries, "."));
                    return [4 /*yield*/, eos_api.getAPI().transact({
                            actions: [{
                                    account: config.eos.teleportContract,
                                    name: 'sign',
                                    authorization: [{
                                            actor: config.eos.oracleAccount,
                                            permission: config.eos.oraclePermission || 'active',
                                        }],
                                    data: {
                                        oracle_name: config.eos.oracleAccount,
                                        id: id,
                                        signature: signature
                                    },
                                }]
                        }, {
                            blocksBehind: 3,
                            expireSeconds: 30,
                        })];
                case 1:
                    result = _a.sent();
                    return [3 /*break*/, 7];
                case 2:
                    e_1 = _a.sent();
                    console.error("\nCaught exception: ".concat(e_1, " \n"));
                    retry = true;
                    if (e_1 instanceof eosjs_1.RpcError) {
                        if ('code' in e_1.json) {
                            switch (e_1.json.code) {
                                case 401: // Unauthorized 
                                    retry = false;
                                    break;
                            }
                        }
                    }
                    tries++;
                    if (!(tries < config.eos.endpoints.length && retry)) return [3 /*break*/, 5];
                    return [4 /*yield*/, eos_api.nextEndpoint()];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, sendSignAction(id, signature, tries)];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 5:
                    console.error("Teleport id ".concat(id, ", skip sign action. \u274C"));
                    _a.label = 6;
                case 6: return [2 /*return*/];
                case 7:
                    console.log("Teleport id ".concat(id, ", successful send sign action. \u2714\uFE0F"));
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Get table rows
 * @param lower_bound Start teleport id
 * @param limit Amount of requested rows
 * @param json True for entries in json format and false for raw (string) format
 * @returns Teleport table rows result
 */
function getTableRows(lower_bound, limit, json) {
    if (json === void 0) { json = true; }
    return __awaiter(this, void 0, void 0, function () {
        var retries, teleport_res, gotTeleport, e_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    retries = 0;
                    teleport_res = null;
                    gotTeleport = false;
                    _a.label = 1;
                case 1:
                    if (retries >= 10) {
                        throw new Error("Got no result by endpoint ".concat(eos_api.getEndpoint(), "."));
                    }
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 6]);
                    retries++;
                    return [4 /*yield*/, eos_api.getRPC().get_table_rows({
                            json: json,
                            code: config.eos.teleportContract,
                            scope: config.eos.teleportContract,
                            table: 'teleports',
                            lower_bound: lower_bound,
                            // upper_bound: 100,
                            limit: limit
                        })];
                case 3:
                    teleport_res = _a.sent();
                    return [3 /*break*/, 6];
                case 4:
                    e_2 = _a.sent();
                    console.log(e_2);
                    return [4 /*yield*/, eos_api.nextEndpoint()];
                case 5:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 6:
                    if (teleport_res == null || 'rows' in teleport_res == false) {
                        console.log("Got no teleports. Try ".concat(retries, "."));
                    }
                    else {
                        gotTeleport = true;
                    }
                    _a.label = 7;
                case 7:
                    if (!gotTeleport) return [3 /*break*/, 1];
                    _a.label = 8;
                case 8: return [2 /*return*/, teleport_res];
            }
        });
    });
}
/**
 * Serialize the table entry of a teleport
 * @param teleport Parameters of a teleport table entry
 * @param logSize Trim the serialized data to this size
 * @returns Serialized data as Uint8Array
 */
function serializeLogData(teleport, logSize) {
    // Serialize the values
    var sb = new eosjs_1.Serialize.SerialBuffer({
        textEncoder: new text_encoding_1.TextEncoder,
        textDecoder: new text_encoding_1.TextDecoder
    });
    sb.pushNumberAsUint64(teleport.id);
    sb.pushUint32(teleport.time);
    sb.pushName(teleport.account);
    sb.pushAsset(teleport.quantity);
    sb.push(teleport.chain_id);
    sb.pushArray(fromHexString(teleport.eth_address));
    return sb.array.slice(0, logSize);
}
/**
 * Get signature for teleport data
 * @param logData Serialized teleport table entry
 * @returns Signature
 */
function signTeleport(logData) {
    return __awaiter(this, void 0, void 0, function () {
        var logDataKeccak, ethPriKey, sig;
        return __generator(this, function (_a) {
            logDataKeccak = (0, ethereumjs_util_1.keccak)(Buffer.from(logData));
            ethPriKey = Buffer.from(config.eth.privateKey, "hex");
            sig = (0, ethereumjs_util_1.ecsign)(logDataKeccak, ethPriKey);
            (0, ethereumjs_util_1.toRpcSig)(sig.v, sig.r, sig.s);
            return [2 /*return*/, (0, ethereumjs_util_1.toRpcSig)(sig.v, sig.r, sig.s)];
        });
    });
}
/**
 * Get the parameters which are defined via console
 * @returns Parameters
 */
function getConsoleParams() {
    var id = 0;
    if (typeof process.argv[2] !== 'undefined') {
        // Get id by console parameter
        switch (process.argv[2]) {
            case 'id':
                if (typeof process.argv[3] == 'undefined') {
                    console.error("Missing id number.");
                    process.exit(1);
                }
                id = parseInt(process.argv[3]);
                if (isNaN(id)) {
                    console.error("Start id must be a number.");
                    process.exit(1);
                }
                break;
            default:
                console.error("Undefined console parameter.");
                process.exit(1);
        }
    }
    return { id: id };
}
/**
  * Get an amount of teleport entries as json, severall times from different endpoints for verification and the lowest amount of entries provided over all used endpoints
 * @param request.lowerId Get endpoints beginning by this teleport id number
 * @param request.amount Amount of requested teleports
 * @returns teleport array in json format, array of teleport arrays in row format and minimum amount of provided entries
 */
function getNextTeleports(request) {
    return __awaiter(this, void 0, void 0, function () {
        var chain_data, lowest_amount, verify_data, initialEndpoint, i, vData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getTableRows(request.lowerId, request.amount, true)];
                case 1:
                    chain_data = _a.sent();
                    lowest_amount = chain_data.rows.length;
                    verify_data = [];
                    initialEndpoint = eos_api.getEndpoint();
                    i = 1;
                    _a.label = 2;
                case 2:
                    if (!(i < config.eos.epVerifications)) return [3 /*break*/, 6];
                    return [4 /*yield*/, eos_api.nextEndpoint()];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, getTableRows(request.lowerId, request.amount, false)];
                case 4:
                    vData = (_a.sent()).rows;
                    verify_data.push(vData);
                    if (initialEndpoint == eos_api.getEndpoint()) {
                        console.error('No available endpoints for verification. ⛔');
                        process.exit(1);
                    }
                    // Handle only to the lowest amount of entries  
                    if (lowest_amount > vData.length) {
                        lowest_amount = vData.length;
                    }
                    _a.label = 5;
                case 5:
                    i++;
                    return [3 /*break*/, 2];
                case 6: return [2 /*return*/, { chain_data: chain_data, verify_data: verify_data, lowest_amount: lowest_amount }];
            }
        });
    });
}
/**
 * Sign all teleports
 * @param signProcessData.lowerId Id of teleport to start from. Will be updated by the handled amount of teleports.
 * @param signProcessData.amount Amount of requested teleports
 */
function signAllTeleportsUntilNow(signProcessData) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, chain_data, verify_data, lowest_amount, rowIndex, item, logData, logDataHex, isVerifyed, i, signature;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getNextTeleports(signProcessData)];
                case 1:
                    _a = _b.sent(), chain_data = _a.chain_data, verify_data = _a.verify_data, lowest_amount = _a.lowest_amount;
                    rowIndex = 0;
                    _b.label = 2;
                case 2:
                    if (!(rowIndex < lowest_amount)) return [3 /*break*/, 7];
                    item = chain_data.rows[rowIndex];
                    // Check if already claimed anf if the required amount of signes is already reached
                    if (item.claimed) {
                        console.log("Teleport id ".concat(item.id, ", is already claimed. \u2714\uFE0F"));
                        return [3 /*break*/, 6];
                    }
                    // Check if the required amount of signes is already reached
                    if (item.oracles.length >= config.confirmations) {
                        console.log("Teleport id ".concat(item.id, ", has already sufficient confirmations. \u2714\uFE0F"));
                        return [3 /*break*/, 6];
                    }
                    // Check if this oracle account has already signed
                    if (item.oracles.find(function (oracle) { return oracle == config.eos.oracleAccount; }) != undefined) {
                        console.log("Teleport id ".concat(item.id, ", has already signed. \u2714\uFE0F"));
                        return [3 /*break*/, 6];
                    }
                    logData = serializeLogData(item, 69);
                    logDataHex = toHexString(logData);
                    isVerifyed = true;
                    for (i = 0; i < config.eos.epVerifications - 1; i++) {
                        if (logDataHex != verify_data[i][rowIndex].slice(0, logData.length * 2)) {
                            console.error("Verification failed by ".concat(eos_api.getEndpoint(), ". \u26A0\uFE0F"));
                            isVerifyed = false;
                        }
                        // console.log(`Teleport id ${item.id}, verified ${i + 1} times`);
                    }
                    if (!!isVerifyed) return [3 /*break*/, 3];
                    console.error("Teleport id ".concat(item.id, ", skip this one. \u274C"));
                    return [3 /*break*/, 6];
                case 3: return [4 /*yield*/, signTeleport(logData)
                    // Send signature to eosio chain
                ];
                case 4:
                    signature = _b.sent();
                    // Send signature to eosio chain
                    return [4 /*yield*/, sendSignAction(item.id, signature)];
                case 5:
                    // Send signature to eosio chain
                    _b.sent();
                    _b.label = 6;
                case 6:
                    rowIndex++;
                    return [3 /*break*/, 2];
                case 7:
                    // Set last handled teleport id and get next teleports
                    signProcessData.lowerId += lowest_amount;
                    if (!(chain_data.more == true)) return [3 /*break*/, 9];
                    return [4 /*yield*/, signAllTeleportsUntilNow(signProcessData)];
                case 8:
                    _b.sent();
                    _b.label = 9;
                case 9: return [2 /*return*/];
            }
        });
    });
}
/**
 * Wait 5 seconds
 */
function WaitAnimation() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    process.stdout.write('All available teleports signed\x1b[?25l');
                    return [4 /*yield*/, sleep(1000)];
                case 1:
                    _a.sent();
                    process.stdout.write(' 💤');
                    return [4 /*yield*/, sleep(1000)];
                case 2:
                    _a.sent();
                    process.stdout.write(' 💤');
                    return [4 /*yield*/, sleep(1000)];
                case 3:
                    _a.sent();
                    process.stdout.write(' 💤');
                    return [4 /*yield*/, sleep(1000)];
                case 4:
                    _a.sent();
                    process.stdout.write(' ↩️');
                    return [4 /*yield*/, sleep(1000)];
                case 5:
                    _a.sent();
                    process.stdout.write("\r\x1b[K");
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Run the process of signing eosio chain teleports to eth chain
 */
var run = function () { return __awaiter(void 0, void 0, void 0, function () {
    var params, signProcessData;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                console.log("Starting EOS watcher for ETH oracle ".concat(config.eth.oracleAccount));
                params = getConsoleParams();
                signProcessData = { lowerId: params.id, amount: 100 };
                _a.label = 1;
            case 1:
                if (!true) return [3 /*break*/, 4];
                eos_api.nextEndpoint();
                return [4 /*yield*/, signAllTeleportsUntilNow(signProcessData)];
            case 2:
                _a.sent();
                return [4 /*yield*/, WaitAnimation()];
            case 3:
                _a.sent();
                return [3 /*break*/, 1];
            case 4: return [2 /*return*/];
        }
    });
}); };
run();
