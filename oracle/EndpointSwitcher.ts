import { Api, JsonRpc } from "eosjs";
import { SignatureProvider } from "eosjs/dist/eosjs-api-interfaces";
import { GetInfoResult } from 'eosjs/dist/eosjs-rpc-interfaces';
import fetch from "cross-fetch";
import { ethers } from "ethers";

export class EosApi {

    private api: Api | null = null
    private epId = -1
    private rpc : JsonRpc | null = null
    private endpointList: Array<string> = []
    private endpoint: string = this.endpointList[0]
    private lastInfo: GetInfoResult | null = null
    private gotRightInfo: Array<boolean> = []

    constructor(private netId: string, endpointList: Array<string>, private signatureProvider: SignatureProvider, private timeout = 10000){
        if(endpointList.length <= 0){
            throw('No list of eosio entpoints defined')
        }
        this.gotRightInfo = Array(endpointList.length).fill(false)
        this.endpointList = endpointList.map(ep => {
            const lastIndex = ep.length - 1
            return ep[lastIndex] == '/' ? ep.substring(0, lastIndex) : ep
        })
    }

    /**
     * Set the next endpoint for RPC and API
     */
    async nextEndpoint(){
        for(let i = 0; i < this.endpointList.length; i++){
            this.epId++;
            if(this.epId >= this.endpointList.length){
                this.epId = 0
            }
            this.endpoint = this.endpointList[this.epId]
            
            this.getAPI()
            if(!this.gotRightInfo[this.epId]){

                const info = await this.checkInfo() 
                if(info === true){
                    this.gotRightInfo[this.epId] = true
                    return
                } else if(info === null){
                    i--
                }
            } else {
                // console.log('Use next endpoint', this.endpoint);
                return
            }
        }
        throw('No usable endpoints.')
    }

    getEndpoint(){
        return this.endpoint
    }

    private async checkInfo() {
        try{
            this.lastInfo = await this.getRPC().get_info();
            if(this.lastInfo.chain_id != this.netId){
                console.log('Delete endpoint because it uses another eosio chain', this.endpoint)
                this.endpointList.splice(this.epId, 1)
                this.gotRightInfo.splice(this.epId, 1)
                this.epId--
                return null
            } 
        } catch {
            console.log('Can not connect to endpoint', this.endpoint)
            return false
        }
        return true
    }

    getRPC(){
        if(this.rpc && this.rpc.endpoint == this.getEndpoint()) {            
            return this.rpc
        } else {
            this.rpc = new JsonRpc(this.getEndpoint(), {fetch: (ep: string, options) =>{
                return fetch(ep, {
                    ...options,
                    timeout: this.timeout
                })
            }});
            return this.rpc
        }
    }

    getAPI(){
        if(this.api) {
            return this.api
        } else {
            this.api = new Api({ rpc: this.getRPC(), signatureProvider: this.signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });
            return this.api
        }
    }

    get_lastInfo(){
        return this.lastInfo;
    }

    get_EndpointAmount(){
        return this.endpointList.length
    }
}

export class EthApi{
    private epId = -1
    private providers : Array<ethers.providers.StaticJsonRpcProvider> = []
    private endpointList: Array<string> = []
    private endpoint = this.endpointList[0]
    private lastInfo: ethers.providers.Network | null = null
    private gotRightInfo: Array<boolean> = []
    private netId: undefined | number = undefined
    constructor(netIdStr: string | undefined, endpointList: Array<string>, private timeout = 10000){
        if(endpointList.length <= 0){
            throw('No list of eth entpoints defined')
        }
        if(netIdStr){
            this.netId = Number(netIdStr)
        }
        this.gotRightInfo = Array(endpointList.length).fill(false)
        this.endpointList = endpointList.map(ep => {
            const lastIndex = ep.length - 1
            return ep[lastIndex] == '/' ? ep.substring(0, lastIndex) : ep
        })
    }

    getEndpoint(){
        return this.endpoint
    }

    getProvider(){
        return  this.providers[this.epId]
    }

    private async checkInfo() {
        try{
            this.lastInfo = await this.providers[this.epId].getNetwork()

            console.log('netId', this.netId);
            console.log('this.lastInfo.chainId', this.lastInfo.chainId);
            
            if(this.netId !== undefined && this.netId != this.lastInfo.chainId){
                console.log('Delete endpoint because it uses another eosio chain', this.endpoint)
                this.endpointList.splice(this.epId, 1)
                this.gotRightInfo.splice(this.epId, 1)
                this.providers.splice(this.epId, 1)
                this.epId--
                return null
            } 
        } catch (e) {
            console.log('Can not connect to endpoint')
            return false
        }
        return true
    }

    /**
     * Set the next endpoint for RPC and API
     */
    async nextEndpoint(){
        for(let i = 0; i < this.endpointList.length; i++){
            // set next endpoint url
            this.epId++;
            if(this.epId >= this.endpointList.length){
                this.epId = 0
            }
            this.endpoint = this.endpointList[this.epId]
            
            // Create new provider if it is undefined
            if(!this.providers[this.epId]){
                this.providers[this.epId] = new ethers.providers.StaticJsonRpcProvider(this.endpoint)
            }

            // Check info of the rovider if it was never checked before
            if(!this.gotRightInfo[this.epId]){
                const info = await this.checkInfo() 
                if(info === true){
                    this.gotRightInfo[this.epId] = true
                    return
                } else if(info === null){
                    i--
                }
            } else {
                console.log('Use next endpoint', this.endpoint) //-
                return
            }
        }
        throw('No usable endpoints.')
    }
    
    get_lastInfo(){
        return this.lastInfo;
    }

    get_EndpointAmount(){
        return this.endpointList.length
    }
}