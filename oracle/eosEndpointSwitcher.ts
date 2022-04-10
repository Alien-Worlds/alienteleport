import { Api, JsonRpc } from "eosjs";
import { SignatureProvider } from "eosjs/dist/eosjs-api-interfaces";
import { GetInfoResult } from 'eosjs/dist/eosjs-rpc-interfaces';
import fetch from "cross-fetch";

export class EosApi{

    constructor(private chainId: string, endpointList: Array<string>, private signatureProvider: SignatureProvider, private timeout = 10000){
        if(endpointList.length <= 0){
            throw('No list of entpoints defined')
        }
        this.gotRightInfo = Array(endpointList.length).fill(false)
        this.endpointList = endpointList.map(ep => {
            const lastIndex = ep.length - 1
            return ep[lastIndex] == '/' ? ep.substring(0, lastIndex) : ep
        })  
    }

    private api: Api | null = null
    private epId = -1
    private rpc : JsonRpc | null = null
    private endpointList: Array<string> = []
    private endpoint: string = this.endpointList[0]
    private lastInfo: GetInfoResult | null = null
    private gotRightInfo: Array<boolean> = []

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
                if(await this.checkInfo()){
                    this.gotRightInfo[this.epId] = true
                    // console.log('Use new endpoint', this.endpoint);
                    return
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
                if(this.lastInfo.chain_id != this.chainId){
                    console.log('Delete endpoint because it uses another eosio chain', this.endpoint)
                    this.endpointList.splice(this.epId, 1)
                    this.gotRightInfo.splice(this.epId, 1)
                    this.epId--
                    return false
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