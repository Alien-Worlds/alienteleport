"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.EthApi = exports.EosApi = void 0;
var eosjs_1 = require("eosjs");
var cross_fetch_1 = __importDefault(require("cross-fetch"));
var ethers_1 = require("ethers");
var EosApi = /** @class */ (function () {
    function EosApi(netId, endpointList, signatureProvider, timeout) {
        if (timeout === void 0) { timeout = 10000; }
        this.netId = netId;
        this.signatureProvider = signatureProvider;
        this.timeout = timeout;
        this.api = null;
        this.epId = -1;
        this.rpc = null;
        this.endpointList = [];
        this.endpoint = this.endpointList[0];
        this.lastInfo = null;
        this.gotRightInfo = [];
        if (endpointList.length <= 0) {
            throw ('No list of eosio entpoints defined');
        }
        this.gotRightInfo = Array(endpointList.length).fill(false);
        this.endpointList = endpointList.map(function (ep) {
            var lastIndex = ep.length - 1;
            return ep[lastIndex] == '/' ? ep.substring(0, lastIndex) : ep;
        });
    }
    /**
     * Set the next endpoint for RPC and API
     */
    EosApi.prototype.nextEndpoint = function () {
        return __awaiter(this, void 0, void 0, function () {
            var i, info;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        i = 0;
                        _a.label = 1;
                    case 1:
                        if (!(i < this.endpointList.length)) return [3 /*break*/, 5];
                        this.epId++;
                        if (this.epId >= this.endpointList.length) {
                            this.epId = 0;
                        }
                        this.endpoint = this.endpointList[this.epId];
                        this.getAPI();
                        if (!!this.gotRightInfo[this.epId]) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.checkInfo()];
                    case 2:
                        info = _a.sent();
                        if (info === true) {
                            this.gotRightInfo[this.epId] = true;
                            return [2 /*return*/];
                        }
                        else if (info === null) {
                            i--;
                        }
                        return [3 /*break*/, 4];
                    case 3: 
                    // console.log('Use next endpoint', this.endpoint);
                    return [2 /*return*/];
                    case 4:
                        i++;
                        return [3 /*break*/, 1];
                    case 5: throw ('No usable endpoints.');
                }
            });
        });
    };
    EosApi.prototype.getEndpoint = function () {
        return this.endpoint;
    };
    EosApi.prototype.checkInfo = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 2, , 3]);
                        _a = this;
                        return [4 /*yield*/, this.getRPC().get_info()];
                    case 1:
                        _a.lastInfo = _c.sent();
                        if (this.lastInfo.chain_id != this.netId) {
                            console.log('Delete endpoint because it uses another eosio chain', this.endpoint);
                            this.endpointList.splice(this.epId, 1);
                            this.gotRightInfo.splice(this.epId, 1);
                            this.epId--;
                            return [2 /*return*/, null];
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        _b = _c.sent();
                        console.log('Can not connect to endpoint', this.endpoint);
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/, true];
                }
            });
        });
    };
    EosApi.prototype.getRPC = function () {
        var _this = this;
        if (this.rpc && this.rpc.endpoint == this.getEndpoint()) {
            return this.rpc;
        }
        else {
            this.rpc = new eosjs_1.JsonRpc(this.getEndpoint(), { fetch: function (ep, options) {
                    return (0, cross_fetch_1.default)(ep, __assign(__assign({}, options), { timeout: _this.timeout }));
                } });
            return this.rpc;
        }
    };
    EosApi.prototype.getAPI = function () {
        if (this.api) {
            return this.api;
        }
        else {
            this.api = new eosjs_1.Api({ rpc: this.getRPC(), signatureProvider: this.signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });
            return this.api;
        }
    };
    EosApi.prototype.get_lastInfo = function () {
        return this.lastInfo;
    };
    EosApi.prototype.get_EndpointAmount = function () {
        return this.endpointList.length;
    };
    return EosApi;
}());
exports.EosApi = EosApi;
var EthApi = /** @class */ (function () {
    function EthApi(netIdStr, endpointList, timeout) {
        if (timeout === void 0) { timeout = 10000; }
        this.timeout = timeout;
        this.epId = -1;
        this.providers = [];
        this.endpointList = [];
        this.endpoint = this.endpointList[0];
        this.lastInfo = null;
        this.gotRightInfo = [];
        this.netId = undefined;
        if (endpointList.length <= 0) {
            throw ('No list of eth entpoints defined');
        }
        if (netIdStr) {
            this.netId = Number(netIdStr);
        }
        this.gotRightInfo = Array(endpointList.length).fill(false);
        this.endpointList = endpointList.map(function (ep) {
            var lastIndex = ep.length - 1;
            return ep[lastIndex] == '/' ? ep.substring(0, lastIndex) : ep;
        });
    }
    EthApi.prototype.getEndpoint = function () {
        return this.endpoint;
    };
    EthApi.prototype.getProvider = function () {
        return this.providers[this.epId];
    };
    EthApi.prototype.checkInfo = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, e_1;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        _a = this;
                        return [4 /*yield*/, this.providers[this.epId].getNetwork()];
                    case 1:
                        _a.lastInfo = _b.sent();
                        console.log('netId', this.netId);
                        console.log('this.lastInfo.chainId', this.lastInfo.chainId);
                        if (this.netId !== undefined && this.netId != this.lastInfo.chainId) {
                            console.log('Delete endpoint because it uses another eosio chain', this.endpoint);
                            this.endpointList.splice(this.epId, 1);
                            this.gotRightInfo.splice(this.epId, 1);
                            this.providers.splice(this.epId, 1);
                            this.epId--;
                            return [2 /*return*/, null];
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        e_1 = _b.sent();
                        console.log('Can not connect to endpoint');
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/, true];
                }
            });
        });
    };
    /**
     * Set the next endpoint for RPC and API
     */
    EthApi.prototype.nextEndpoint = function () {
        return __awaiter(this, void 0, void 0, function () {
            var i, info;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        i = 0;
                        _a.label = 1;
                    case 1:
                        if (!(i < this.endpointList.length)) return [3 /*break*/, 5];
                        // set next endpoint url
                        this.epId++;
                        if (this.epId >= this.endpointList.length) {
                            this.epId = 0;
                        }
                        this.endpoint = this.endpointList[this.epId];
                        // Create new provider if it is undefined
                        if (!this.providers[this.epId]) {
                            this.providers[this.epId] = new ethers_1.ethers.providers.StaticJsonRpcProvider(this.endpoint);
                        }
                        if (!!this.gotRightInfo[this.epId]) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.checkInfo()];
                    case 2:
                        info = _a.sent();
                        if (info === true) {
                            this.gotRightInfo[this.epId] = true;
                            return [2 /*return*/];
                        }
                        else if (info === null) {
                            i--;
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        console.log('Use next endpoint', this.endpoint); //-
                        return [2 /*return*/];
                    case 4:
                        i++;
                        return [3 /*break*/, 1];
                    case 5: throw ('No usable endpoints.');
                }
            });
        });
    };
    EthApi.prototype.get_lastInfo = function () {
        return this.lastInfo;
    };
    EthApi.prototype.get_EndpointAmount = function () {
        return this.endpointList.length;
    };
    return EthApi;
}());
exports.EthApi = EthApi;
