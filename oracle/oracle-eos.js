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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var eosjs_1 = require("eosjs");
var eosjs_jssig_1 = require("eosjs/dist/eosjs-jssig");
var text_encoding_1 = require("text-encoding");
var ethereumjs_util_1 = require("ethereumjs-util");
var EndpointSwitcher_1 = require("./EndpointSwitcher");
var yargs_1 = __importDefault(require("yargs"));
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
// /**
//  * Check if two Uint8Arrays are equal
//  * @param a Frist array
//  * @param b Seconf array
//  * @returns True or false
//  */
// function arraysEqual(a: Uint8Array, b: Uint8Array) {
//     if (a === b) return true
//     if (a == null || b == null) return false
//     if (a.length !== b.length) return false
//     for (var i = 0; i < a.length; ++i) {
//       if (a[i] !== b[i]) return false
//     }
//     return true
//   }
var EosOracle = /** @class */ (function () {
    function EosOracle(config, signatureProvider) {
        this.config = config;
        this.signatureProvider = signatureProvider;
        this.running = false;
        this.irreversible_time = 0;
        this.eos_api = new EndpointSwitcher_1.EosApi(this.config.eos.netId, this.config.eos.endpoints, this.signatureProvider);
    }
    /**
     * Send sign a teleport. Repeats itself until a defined amount of tries are reached
     * @param id Teleport id
     * @param signature Signature of this oracle
     * @param tries Already passed tries
     */
    EosOracle.prototype.sendSignAction = function (id, signature, tries) {
        if (tries === void 0) { tries = 0; }
        return __awaiter(this, void 0, void 0, function () {
            var result, e_1, retry;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 7]);
                        console.log("Teleport id ".concat(id, ", try to send signature ").concat(tries, "."));
                        return [4 /*yield*/, this.eos_api.getAPI().transact({
                                actions: [{
                                        account: this.config.eos.teleportContract,
                                        name: 'sign',
                                        authorization: [{
                                                actor: this.config.eos.oracleAccount,
                                                permission: this.config.eos.oraclePermission || 'active',
                                            }],
                                        data: {
                                            oracle_name: this.config.eos.oracleAccount,
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
                        if (!(tries < this.config.eos.endpoints.length && retry)) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.eos_api.nextEndpoint()];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, this.sendSignAction(id, signature, tries)];
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
    };
    /**
     * Get table rows
     * @param lower_bound Start teleport id
     * @param limit Amount of requested rows
     * @param json True for entries in json format and false for raw (string) format
     * @returns Teleport table rows result
     */
    EosOracle.prototype.getTableRows = function (lower_bound, limit, json) {
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
                            throw new Error("Got no result by endpoint ".concat(this.eos_api.getEndpoint(), "."));
                        }
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 6]);
                        retries++;
                        return [4 /*yield*/, this.eos_api.getRPC().get_table_rows({
                                json: json,
                                code: this.config.eos.teleportContract,
                                scope: this.config.eos.teleportContract,
                                table: 'teleports',
                                lower_bound: lower_bound,
                                limit: limit
                            })];
                    case 3:
                        teleport_res = _a.sent();
                        return [3 /*break*/, 6];
                    case 4:
                        e_2 = _a.sent();
                        console.log(e_2);
                        return [4 /*yield*/, this.eos_api.nextEndpoint()];
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
    };
    /**
     * Serialize the table entry of a teleport
     * @param teleport Parameters of a teleport table entry
     * @param logSize Trim the serialized data to this size
     * @returns Serialized data as Uint8Array
     */
    EosOracle.serializeLogData = function (teleport, logSize) {
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
    };
    /**
     * Get signature for teleport data
     * @param logData Serialized teleport table entry
     * @returns Signature
     */
    EosOracle.signTeleport = function (logData, privateKey) {
        return __awaiter(this, void 0, void 0, function () {
            var logDataKeccak, ethPriKey, sig;
            return __generator(this, function (_a) {
                logDataKeccak = (0, ethereumjs_util_1.keccak)(Buffer.from(logData));
                ethPriKey = Buffer.from(privateKey, "hex");
                sig = (0, ethereumjs_util_1.ecsign)(logDataKeccak, ethPriKey);
                (0, ethereumjs_util_1.toRpcSig)(sig.v, sig.r, sig.s);
                return [2 /*return*/, (0, ethereumjs_util_1.toRpcSig)(sig.v, sig.r, sig.s)];
            });
        });
    };
    /**
     * Get an amount of teleport entries as json, severall times from different endpoints for verification and the lowest amount of entries provided over all used endpoints
     * @param request.lowerId Get endpoints beginning by this teleport id number
     * @param request.amount Amount of requested teleports
     * @returns teleport array in json format, array of teleport arrays in row format and minimum amount of provided entries
     */
    EosOracle.prototype.getNextTeleports = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var chain_data, lowest_amount, verify_data, initialEndpoint, i, vData;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getTableRows(request.lowerId, request.amount, true)];
                    case 1:
                        chain_data = _a.sent();
                        lowest_amount = chain_data.rows.length;
                        verify_data = [];
                        if (!(lowest_amount > 0)) return [3 /*break*/, 6];
                        initialEndpoint = this.eos_api.getEndpoint();
                        i = 1;
                        _a.label = 2;
                    case 2:
                        if (!(i < this.config.eos.epVerifications)) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.eos_api.nextEndpoint()];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, this.getTableRows(request.lowerId, request.amount, false)];
                    case 4:
                        vData = (_a.sent()).rows;
                        verify_data.push(vData);
                        if (initialEndpoint == this.eos_api.getEndpoint()) {
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
    };
    /**
     * Update the current block time and the last irreversible block time
     */
    EosOracle.prototype.updateTimes = function () {
        return __awaiter(this, void 0, void 0, function () {
            var minIrrTime, lowestIrr, epStart, verifications, info, irr_time, irr_block, t, e_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        minIrrTime = this.irreversible_time;
                        lowestIrr = undefined;
                        epStart = this.eos_api.getEndpoint();
                        verifications = 0;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 8]);
                        return [4 /*yield*/, this.eos_api.getRPC().get_info()];
                    case 2:
                        info = _a.sent();
                        irr_time = void 0;
                        if (!info.last_irreversible_block_time) return [3 /*break*/, 3];
                        // Get last irreversible block time if available
                        irr_time = new Date(info.last_irreversible_block_time + 'Z').getTime();
                        return [3 /*break*/, 6];
                    case 3:
                        if (!info.last_irreversible_block_num) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.eos_api.getRPC().get_block(info.last_irreversible_block_num)];
                    case 4:
                        irr_block = _a.sent();
                        irr_time = new Date(irr_block.timestamp + 'Z').getTime();
                        return [3 /*break*/, 6];
                    case 5: throw ('No time parameter given by ' + this.eos_api.getEndpoint());
                    case 6:
                        if (typeof irr_time == 'number') {
                            t = Math.floor(irr_time / 1000);
                            if (t < minIrrTime) {
                                throw ("Irreversible time is lower than possible, occurred by using ".concat(this.eos_api.getEndpoint()));
                            }
                            else if (lowestIrr === undefined || t < lowestIrr) {
                                // New lowest possible irreversible time
                                lowestIrr = t;
                            }
                        }
                        else {
                            throw ("Time parameter is not a number, occurred by using ".concat(this.eos_api.getEndpoint()));
                        }
                        verifications++;
                        return [3 /*break*/, 8];
                    case 7:
                        e_3 = _a.sent();
                        console.log('⚡️ ' + e_3);
                        // Get next endpoint and check if all endpoints are already checked
                        this.eos_api.nextEndpoint();
                        if (epStart == this.eos_api.getEndpoint()) {
                            throw ('Could not get last irreversible block time from any endpoint. ⛔');
                        }
                        return [3 /*break*/, 8];
                    case 8:
                        if (verifications < this.config.eos.epVerifications) return [3 /*break*/, 1];
                        _a.label = 9;
                    case 9:
                        // Set new time values
                        if (lowestIrr) {
                            this.irreversible_time = lowestIrr;
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Sign all teleports
     * @param signProcessData.lowerId Id of teleport to start from. Will be updated by the handled amount of teleports.
     * @param signProcessData.amount Amount of requested teleports
     */
    EosOracle.prototype.signAllTeleportsUntilNow = function (signProcessData) {
        return __awaiter(this, void 0, void 0, function () {
            var waitForIrr, lastHandledId, _a, chain_data, verify_data, lowest_amount, rowIndex, item, logData, logDataHex, isVerifyed, i, signature;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        waitForIrr = 0;
                        lastHandledId = signProcessData.lowerId;
                        return [4 /*yield*/, this.getNextTeleports(signProcessData)];
                    case 1:
                        _a = _b.sent(), chain_data = _a.chain_data, verify_data = _a.verify_data, lowest_amount = _a.lowest_amount;
                        rowIndex = 0;
                        _b.label = 2;
                    case 2:
                        if (!(rowIndex < lowest_amount)) return [3 /*break*/, 8];
                        item = chain_data.rows[rowIndex];
                        // Check if already claimed anf if the required amount of signes is already reached
                        if (item.claimed) {
                            console.log("Teleport id ".concat(item.id, ", is already claimed. \u2714\uFE0F"));
                            lastHandledId = item.id + 1;
                            return [3 /*break*/, 7];
                        }
                        // Check if the required amount of signes is already reached
                        if (item.oracles.length >= this.config.confirmations) {
                            console.log("Teleport id ".concat(item.id, ", has already sufficient confirmations. \u2714\uFE0F"));
                            lastHandledId = item.id + 1;
                            return [3 /*break*/, 7];
                        }
                        // Check if this oracle account has already signed
                        if (item.oracles.find(function (oracle) { return oracle == _this.config.eos.oracleAccount; }) != undefined) {
                            console.log("Teleport id ".concat(item.id, ", has already signed. \u2714\uFE0F"));
                            lastHandledId = item.id + 1;
                            return [3 /*break*/, 7];
                        }
                        logData = EosOracle.serializeLogData(item, 69);
                        logDataHex = toHexString(logData);
                        isVerifyed = true;
                        for (i = 0; i < this.config.eos.epVerifications - 1; i++) {
                            if (logDataHex != verify_data[i][rowIndex].slice(0, logData.length * 2)) {
                                console.error("Verification failed by ".concat(this.eos_api.getEndpoint(), ". \u26A0\uFE0F"));
                                isVerifyed = false;
                            }
                            // console.log(`Teleport id ${item.id}, verified ${i + 1} times`)
                        }
                        // Check time
                        if (item.time > this.irreversible_time) {
                            waitForIrr = item.time - this.irreversible_time;
                            lastHandledId = item.id;
                            return [3 /*break*/, 8];
                        }
                        if (!!isVerifyed) return [3 /*break*/, 3];
                        console.error("Teleport id ".concat(item.id, ", skip this one. \u274C"));
                        return [3 /*break*/, 6];
                    case 3: return [4 /*yield*/, EosOracle.signTeleport(logData, this.config.eth.privateKey)
                        // Send signature to eosio chain
                    ];
                    case 4:
                        signature = _b.sent();
                        // Send signature to eosio chain
                        return [4 /*yield*/, this.sendSignAction(item.id, signature)];
                    case 5:
                        // Send signature to eosio chain
                        _b.sent();
                        _b.label = 6;
                    case 6:
                        lastHandledId = item.id + 1;
                        _b.label = 7;
                    case 7:
                        rowIndex++;
                        return [3 /*break*/, 2];
                    case 8:
                        // Set next teleport id and get the next teleports
                        signProcessData.lowerId = lastHandledId;
                        if (!this.running) return [3 /*break*/, 14];
                        if (!(waitForIrr > 0)) return [3 /*break*/, 11];
                        // Wait maximal 180 seconds
                        if (waitForIrr > EosOracle.maxWait) {
                            waitForIrr = EosOracle.maxWait;
                        }
                        console.log("Wait ".concat(waitForIrr, " seconds until teleport id ").concat(signProcessData.lowerId, " is irreversible."));
                        return [4 /*yield*/, EosOracle.WaitWithAnimation(waitForIrr)];
                    case 9:
                        _b.sent();
                        return [4 /*yield*/, this.signAllTeleportsUntilNow(signProcessData)];
                    case 10:
                        _b.sent();
                        return [3 /*break*/, 14];
                    case 11:
                        if (!(chain_data.more == true)) return [3 /*break*/, 14];
                        return [4 /*yield*/, this.updateTimes()];
                    case 12:
                        _b.sent();
                        return [4 /*yield*/, this.signAllTeleportsUntilNow(signProcessData)];
                    case 13:
                        _b.sent();
                        _b.label = 14;
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Wait for a defined amount of time and show remaining seconds
     * @param s Seconds to wait
     */
    EosOracle.WaitWithAnimation = function (s, info) {
        if (info === void 0) { info = ""; }
        return __awaiter(this, void 0, void 0, function () {
            var i;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        process.stdout.write(info + "\n\x1b[?25l");
                        i = 0;
                        _a.label = 1;
                    case 1:
                        if (!(i < s)) return [3 /*break*/, 4];
                        process.stdout.write("\uD83D\uDCA4 ".concat(i, " s / ").concat(s, " s \uD83D\uDCA4"));
                        return [4 /*yield*/, sleep(1000)];
                    case 2:
                        _a.sent();
                        process.stdout.write("\r\x1b[K");
                        _a.label = 3;
                    case 3:
                        i++;
                        return [3 /*break*/, 1];
                    case 4:
                        process.stdout.moveCursor(0, -1); // up one line
                        process.stdout.clearLine(1); // from cursor to end
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Run the process of signing eosio chain teleports to eth chain
     * @param id Teleport id to start from
     * @param requestAmount Amount of requested teleports per request
     */
    EosOracle.prototype.run = function (id, requestAmount, waitCycle) {
        if (id === void 0) { id = 0; }
        if (requestAmount === void 0) { requestAmount = 100; }
        if (waitCycle === void 0) { waitCycle = EosOracle.maxWait; }
        return __awaiter(this, void 0, void 0, function () {
            var signProcessData, e_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("Starting EOS watcher for ETH oracle ".concat(this.config.eth.oracleAccount));
                        // Create an object to change the current id on each run
                        this.running = true;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 8, , 9]);
                        signProcessData = { lowerId: id, amount: requestAmount };
                        _a.label = 2;
                    case 2:
                        if (!this.running) return [3 /*break*/, 7];
                        return [4 /*yield*/, this.eos_api.nextEndpoint()];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, this.updateTimes()];
                    case 4:
                        _a.sent();
                        return [4 /*yield*/, this.signAllTeleportsUntilNow(signProcessData)];
                    case 5:
                        _a.sent();
                        return [4 /*yield*/, EosOracle.WaitWithAnimation(waitCycle, 'All available teleports signed')];
                    case 6:
                        _a.sent();
                        return [3 /*break*/, 2];
                    case 7: return [3 /*break*/, 9];
                    case 8:
                        e_4 = _a.sent();
                        console.error('⚡️ ' + e_4);
                        return [3 /*break*/, 9];
                    case 9:
                        console.log('Thread closed 💀');
                        return [2 /*return*/];
                }
            });
        });
    };
    EosOracle.maxWait = 180; // The max amount of seconds to wait to check an entry again if it is irreversible now
    return EosOracle;
}());
// Handle params from console
var argv = yargs_1.default
    .version().alias('version', 'v')
    .option('id', {
    alias: 'n',
    description: 'Teleport id to start from',
    type: 'number'
})
    .option('amount', {
    alias: 'a',
    description: 'Amount of handled teleports per requests',
    type: 'number'
})
    .option('signs', {
    alias: 's',
    description: 'Amount of signatures until this oracle will sign too',
    type: 'number'
})
    .option('waiter', {
    alias: 'w',
    description: 'Seconds to wait after finishing all current teleports',
    type: 'number'
})
    .option('config', {
    alias: 'c',
    description: 'Path of config file',
    type: 'string'
})
    .help().alias('help', 'h').argv;
// Load config and set title
var config_path = argv.config || process.env['CONFIG'] || './config';
process.title = "oracle-eos ".concat(config_path);
var configFile = require(config_path);
// Configure eosjs specific propperties
var signatureProvider = new eosjs_jssig_1.JsSignatureProvider([configFile.eos.privateKey]);
var eosOracle = new EosOracle(configFile, signatureProvider);
// Get time to wait for each round by config file or comsole parameters
var waitCycle = undefined;
if (typeof configFile.eos.waitCycle == 'number') {
    waitCycle = configFile.eos.waitCycle;
}
if (argv.waiter) {
    waitCycle = argv.waiter;
}
// Run the process
eosOracle.run(argv.id, argv.amount, waitCycle);
