<template>
    <q-page-container>
        <q-page>
            <div v-bind:class="['overlay', {active: showOverlay}]">
                <div class="overlaywrap">
                    <!-- ------------------Transfer From To Window, Classes change prompt information------------------- -->
                    <div v-bind:class="['type', 'transfer', 'startit', {active: showTransfer}]">
                        <div id="starttransfer">
                            <div class="icon tfs one"></div>
                            <h3 class="title">{{$t('transfer.from_to', {transferFrom, transferTo})}}</h3>
                            <div class="logo"></div>
                            <p>{{$t('transfer.liquid_balance')}}</p>
                            <div class="balance" v-if="transferFrom == 'WAX'">{{waxTlmBalance}} TLM</div>
                            <div class="balance" v-if="transferFrom != 'WAX'">{{ethTlmBalance}} TLM</div>
                            <form class="amount">
                                <h6>{{$t('transfer.input_amount')}}</h6>
                                <div class="fields">
                                    <!-- ------------------Executes Vanilla Javascript, Numbers only, MaxLength can be changed directly in the input tag------------------- -->
                                    <input type="text" placeholder="0" maxlength="20" ref="teleport_amount">
                                </div>
                                <div class="btns">
                                    <a class="button close cancel" @click="closeOverlay">{{$t('transfer.cancel')}}</a>
                                    <a class="button approve" @click="doTeleport(transferFrom)">{{$t('transfer.approve')}}</a>
                                </div>
                            </form>
                        </div>
                    </div>
                    <div v-bind:class="['type', 'error', {active: alertError}]">
                        <div class="icon"></div>
                        <h3 class="title">{{$t('dialog.error')}}</h3>
                        <p>{{alertError}}</p>
                        <a class="button invert close" @click="closeOverlay">{{$t('dialog.ok')}}</a>
                    </div>
                    <div v-bind:class="['type', 'success', {active: alertInfo}]">
                        <div class="icon"></div>
                        <h3 class="title">{{$t('dialog.success')}}</h3>
                        <p>{{alertInfo}}</p>
                        <a class="button invert close" @click="closeOverlay">{{$t('dialog.ok')}}</a>
                    </div>
                    <div v-bind:class="['type', 'processing', {active: alertProcessing.message}]">
                        <div class="logincontainer">
                            <div class="loginwrap from">
                                <div class="logowrap">
                                    <div v-bind:class="['logo', alertProcessing.from]"></div>
                                </div>
                            </div>
                            <div class="loginwrap icon">
                                <div class="tfs one"></div>
                            </div>
                            <div class="loginwrap to">
                                <div class="logowrap">
                                    <div v-bind:class="['logo', alertProcessing.to]"></div>
                                </div>
                            </div>
                        </div>
                        <div class="status">{{$t('dialog.processing')}}...</div>
                        <div class="amount">{{alertProcessing.amount}}</div>
                        <div class="notice">{{alertProcessing.message}}</div>
                        <a class="button invert close dashload" @click="closeOverlay">Go to Dashboard</a>
                    </div>

                    <div class="overlayhitbox" @click="closeOverlay"></div>
                </div>
            </div>

            <div id="container" v-bind:class="{
            notlogged: (!getAccountName.ethereum || !getAccountName.wax),
            islogged: (getAccountName.ethereum && getAccountName.wax),
            waxlog: (getAccountName.wax),
            binancelog: (getChainId.ethereum != 1 && getAccountName.ethereum),
            ethereumlog: (getChainId.ethereum == 1 && getAccountName.ethereum),
            isdashboard: showDashboard
            }">
                <div class="wrapper">
                    <div v-bind:class="['intro', 'contents', {active: !showDashboard}]">
                        <div class="logo alienworlds"></div>
                        <h1 class="title">{{$t('home.teleport')}}</h1>
                        <p>{{$t('home.transfer_between')}}</p>
                        <p class="notice enter active" v-if="!getAccountName.ethereum || !getAccountName.wax">{{$t('home.to_begin')}}</p>
                        <p class="notice accessed">{{$t('home.choose_account')}}</p>

                        <div class="logincontainer">
                            <div class="loginwrap wax">
                                <div class="logowrap">
                                    <div class="logo wax"></div>
                                </div>
                                <div class="enter active" v-if="!getAccountName.wax">
                                    <a class="button" @click="login('wax')">{{$t('home.log_in')}}</a>
                                    <p class="notice">{{$t('home.you_will_be_prompted')}}</p>
                                </div>
                                <div class="accessed active" v-if="getAccountName.wax">
                                    <p>{{$t('home.liquid_balance')}}</p>
                                    <div class="balance">{{waxTlmBalance}} TLM</div>
                                    <div v-bind:class="['transfer', {active: getAccountName.ethereum && getAccountName.wax && !unsupportedChain}]" v-if="waxTlmBalance != 0">
                                        <a class="button" @click="startTransfer('WAX', networkName)">{{$t('home.transfer')}}</a>
                                        <p class="notice" v-if="getAccountName.ethereum" v-html="$t('home.from_wax_to', {networkName})"></p>
                                    </div>
                                </div>
                            </div>
                            <div class="loginwrap icon">
                                <div class="tfs two"></div>
                            </div>
                            <div class="loginwrap eth-bsc">
                                <p v-if="unsupportedChain" class="error">This chain is not supported, please select Ethereum Mainnet or Binance Smart Chain in Metamask</p>
                                <div class="logowrap" v-if="!unsupportedChain">
                                    <div class="logo ethereum" v-if="getChainId.ethereum == 1 || !getAccountName.ethereum"></div>
                                    <div class="logo binance" v-if="getChainId.ethereum != 1 || !getAccountName.ethereum"></div>
                                </div>
                                <div class="enter active" v-if="!getAccountName.ethereum">
                                    <a class="button" @click="login('ethereum')">{{$t('home.log_in')}}</a>
                                    <p class="notice" v-html="$t('home.eth_binance_login')"></p>
                                </div>
                                <div class="accessed active" v-if="getAccountName.ethereum && !unsupportedChain">
                                    <p>{{$t('home.liquid_balance')}}</p>
                                    <div class="balance">{{ethTlmBalance}} TLM</div>
                                    <div v-bind:class="['transfer', {active: getAccountName.ethereum && getAccountName.wax && !unsupportedChain}]" v-if="ethTlmBalance != 0">
                                        <a class="button" @click="startTransfer(networkName, 'WAX')">{{$t('home.transfer')}}</a>
                                        <p class="notice" v-html="$t('home.from_to_wax', {networkName})"></p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <a class="button dashload invert" @click="doShowDashboard()">{{$t('home.dashboard')}}</a>

                    </div>

                    <!-- ------------------- DASHBOARD ------------------- -->
                    <div id="dashboard" v-bind:class="['contents', {active: showDashboardPanel}]">
                        <div class="opener">
                            <div class="tfs two"></div>
                            <a class="button introload invert" @click="doHideDashboard()">{{$t('dashboard.new_transfer')}}</a>
                        </div>
                        <div class="transactionscontainer">
                            <div class="transactionswrap">
                                <!-- -------------------Each Row needs to know if it's from or to WAX :: every other div pulls and loads the classes appropriate to the transaction ------------------- -->
                                <div v-bind:class="['transaction', tx.class, {pending: !tx.completed && !tx.claimable, claimed: (tx.class === 'fromwax' && tx.completed)}]" v-for="tx in teleports" :key="tx.id">
                                    <div class="action play"><a class="button invert">{{$t('dashboard.start_playing')}}</a></div>
                                    <div class="logo wax"></div>
                                    <div class="direction"><div class="tfs one"></div></div>
                                    <div class="amount">{{tx.quantity.replace(' TLM', '')}}</div>
                                    <div class="direction"><div class="tfs one"></div></div>
                                    <div v-bind:class="['logo', {
                                    binance: tx.chain_id != 1,
                                    ethereum: tx.chain_id == 1
                                    }]"></div>
                                    <div class="action claim" v-if="tx.claimable">
                                        <a class="button" @click="claimEth(tx.id)" v-if="tx.correct_login && tx.correct_chain">{{$t('dashboard.claim')}}</a>
                                        <span v-if="!tx.correct_login">{{$t('dashboard.login_correct_account', {account: '0x' + tx.eth_address.substr(0, 20)})}}</span>
                                        <span v-if="!tx.correct_chain">{{$t('dashboard.login_correct_chain')}}</span>
                                    </div>
                                    <div class="action" v-if="!tx.claimable && !tx.completed">{{$t('dashboard.pending')}}</div>
                                    <div class="action" v-if="tx.class !== 'fromwax' && tx.completed">{{$t('dashboard.claimed')}}</div>
                                    <div class="action" v-if="tx.class === 'fromwax' && tx.completed"><a class="button invert">{{$t('dashboard.stake_tokens')}}</a></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- -------------------Profile Bar, Doubles as the Top Header------------------- -->
                    <div class="profile">
                        <!-- -------------------Log-In and other Logging Status------------------- -->
                        <div class="login">
                            <div v-bind:class="['notlogged', {active: !getAccountName.ethereum || !getAccountName.wax}]"></div>
                            <div v-bind:class="['islogged', {active: getAccountName.ethereum && getAccountName.wax}]">
                                <a class="button logoutbtn" @click="logoutAll">{{$t('header.logout')}}</a>
                                <span class="status"></span>
                                <div class="logo wax"></div>
                                <div class="logo ethereum"></div>
                                <div class="logo binance"></div>
                            </div>
                        </div>
                        <div class="watermark"><div class="logo alienworlds"></div><div class="title">{{$t('header.teleport')}}</div></div>
                    </div>

                    <!-- -------------------Background Animated Elements------------------- -->
                    <div class="background">
                        <div class="gradients grad1"></div>
                        <div class="gradients grad2"></div>
                        <div class="gradients gradwax1"></div>
                        <div class="gradients gradwax2"></div>
                        <div class="gradients gradother1"></div>
                        <div class="gradients gradother2"></div>
                        <div class="planetbg"></div>
                        <div class="objects"><div class="grid"></div><div class="lines"></div><div class="dots"></div></div>
                        <div class="sky"></div>
                        <div class="fade"></div>
                    </div>

                    <!-- -------------------Announce bar------------------- -->
                    <div class="announcebar">
                      BSC to WAX Teleports are experiencing longer than usual travel times. Please do not Teleport time-sensitive transfers. <a href="https://alienworlds.zendesk.com/hc/en-us/articles/1500012591482-Delays-in-BSC-to-WAX-Teleport" target="_blank">Known Issue can be found here.</a>
                    </div>
                </div>
            </div>

        </q-page>
    </q-page-container>

</template>

<script>
    import {mapGetters} from 'vuex'
    import {Serialize} from 'eosjs'

    const fromHexString = hexString =>
        new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))

    const toHexString = bytes =>
        bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '')

    let txListInterval = null

    export default {
        name: 'PageIndex',
        computed: {
            ...mapGetters({
                getAccountName: 'ual/getAccountName',
                getChainId: 'ual/getChainId',
                alertError: 'global/getError',
                alertInfo: 'global/getInfo',
                alertProcessing: 'global/getProcessing'
            })
        },
        data() {
            return {
                ethTlmBalance: '0',
                waxTlmBalance: '0',
                networkName: '',
                unsupportedChain: false,
                showDashboard: false,
                showDashboardPanel: false,
                showOverlay: false,
                showTransfer: false,
                transferFrom: '',
                transferTo: '',
                teleports: []
            }
        },
        methods: {
            async logoutAll() {
                this.$store.dispatch('ual/logout', 'wax')
                this.$store.dispatch('ual/logout', 'ethereum')
            },
            async logout(network) {
                console.log('logout of network ', network)
                this.$store.dispatch('ual/logout', network)
            },
            async login(network) {
                if (network === 'ethereum') {
                    const {injectedWeb3, web3} = await this.$web3()
                    // console.log(injectedWeb3, web3)

                    if (injectedWeb3) {
                        const ethAccount = await web3.eth.getAccounts()
                        this.$store.commit('ual/setAccountName', {network: 'ethereum', accountName: ethAccount[0]})
                        const chainId = await web3.eth.getChainId()
                        this.$store.commit('ual/setChainId', {network: 'ethereum', chainId})

                        this.updateBalances()

                        window.ethereum.on('accountsChanged', (a) => {
                            this.$store.commit('ual/setAccountName', {network: 'ethereum', accountName: a[0]})
                        })
                        window.ethereum.on('chainChanged', (chainId) => {
                            this.$store.commit('ual/setChainId', {network: 'ethereum', chainId})
                        })
                    } else {
                        console.error('Could not get injected web3')
                    }
                } else {
                    this.$store.dispatch('ual/renderLoginModal', network, {root: true})
                }
            },
            doShowDashboard() {
                this.showDashboard = true
                setTimeout(() => {
                    this.showDashboardPanel = true
                }, 550)
            },
            doHideDashboard() {
                this.showDashboardPanel = false
                setTimeout(() => {
                    this.showDashboard = false
                }, 600)
            },
            async updateBalances() {
                if (this.getAccountName.wax) {
                    console.log('getting balance', process.env.tlmContract, this.getAccountName.wax, 'TLM')
                    const balance = await this.$wax.rpc.get_currency_balance(process.env.tlmContract, this.getAccountName.wax, 'TLM')
                    this.waxTlmBalance = Number(balance[0].replace(' TLM', '')).toLocaleString()
                }
                if (this.getChainId.ethereum && this.getAccountName.ethereum) {
                    const {injectedWeb3, web3} = await this.$web3()

                    if (injectedWeb3) {
                        console.log('Reloading balances', this.getChainId.ethereum, process.env.networks)
                        if (typeof process.env.networks[this.getChainId.ethereum] === 'undefined') {
                            this.unsupportedChain = true
                        } else {
                            this.unsupportedChain = false
                            const chainData = process.env.networks[this.getChainId.ethereum]
                            console.log(this.$erc20Abi, chainData)
                            this.networkName = chainData.name
                            const tlmInstance = new web3.eth.Contract(this.$erc20Abi, chainData.tlmContract)
                            console.log(tlmInstance)
                            const balance = await tlmInstance.methods.balanceOf(this.getAccountName.ethereum).call()
                            console.log(`Balance is ${balance}`, balance)
                            this.ethTlmBalance = Number(balance / 10000).toLocaleString()
                        }
                    }
                }
            },
            startTransfer(fromNetwork, toNetwork) {
                this.showOverlay = true
                this.showTransfer = true
                this.transferFrom = fromNetwork
                this.transferTo = toNetwork
            },
            async doTeleport(fromNetwork) {
                const qty = parseFloat(this.$refs.teleport_amount.value)
                this.showTransfer = false

                if (fromNetwork === 'WAX'){
                    const destinationChainId = process.env.networks[this.getChainId.ethereum].destinationChainId
                    const toClass = process.env.networks[this.getChainId.ethereum].className
                    await this.$store.commit('global/setProcessing', {from: 'wax', to: toClass, amount: qty, message: this.$t('transfer.waiting_approval_transfer')})
                    this.showOverlay = true

                    await this.teleportWaxEth(qty, destinationChainId, this.getAccountName.ethereum)

                    this.updateBalances()
                    this.loadTeleports()
                }
                else {
                    const fromClass = process.env.networks[this.getChainId.ethereum].className
                    await this.$store.commit('global/setProcessing', {from: fromClass, to: 'wax', amount: qty, message: this.$t('transfer.waiting_approval_transfer')})
                    this.showOverlay = true

                    await this.teleportEthWax(qty, 0, this.getAccountName.wax)

                    this.updateBalances()
                    this.loadTeleports()
                }

                if (!txListInterval){
                    txListInterval = setInterval(this.loadTeleports, 5000)
                }

            },
            async teleportWaxEth(quantity, destinationChainId, destinationAddress) {
                const actions = [{
                    account: process.env.tlmContract,
                    name: 'transfer',
                    authorization: [{
                        actor: this.getAccountName.wax,
                        permission: 'active'
                    }],
                    data: {
                        from: this.getAccountName.wax,
                        to: process.env.teleportContract,
                        quantity: `${quantity.toFixed(4)} TLM`,
                        memo: 'Teleport'
                    }
                }, {
                    account: process.env.teleportContract,
                    name: 'teleport',
                    authorization: [{
                        actor: this.getAccountName.wax,
                        permission: 'active'
                    }],
                    data: {
                        from: this.getAccountName.wax,
                        quantity: `${quantity.toFixed(4)} TLM`,
                        chain_id: destinationChainId,
                        eth_address: destinationAddress.replace('0x', '') + '000000000000000000000000'
                    }
                }]
                try {
                    // console.log(actions)
                    const res = await this.$store.dispatch('ual/transact', {actions, network: 'wax'})
                    // alert('Success!')
                    await this.$store.commit('global/setInfo', this.$t('dialog.first_stage_wax'))
                    await this.$store.commit('global/clearProcessing', null)
                    this.showOverlay = true
                }
                catch (e){
                    await this.$store.commit('global/setError', e.message)
                    await this.$store.commit('global/clearProcessing', null)
                    this.showOverlay = true
                    // alert(e.message)
                }
            },
            async teleportEthWax(quantity, destinationChainId, destinationAddress) {
                const {injectedWeb3, web3} = await this.$web3()

                if (injectedWeb3) {
                    const chainData = process.env.networks[this.getChainId.ethereum]
                    const tlmInstance = new web3.eth.Contract(this.$erc20Abi, chainData.tlmContract)
                    try {
                        const resp = await tlmInstance.methods.teleport(this.getAccountName.wax, quantity * 10000, 0).send({from: this.getAccountName.ethereum})
                        console.log(resp)
                        await this.$store.commit('global/setInfo', this.$t('dialog.first_stage_eth'))
                        await this.$store.commit('global/clearProcessing', null)
                        this.showOverlay = true
                    }
                    catch (e) {
                        await this.$store.commit('global/setError', e.message)
                        await this.$store.commit('global/clearProcessing', null)
                        this.showOverlay = true
                    }
                }
            },
            async getSignData(teleportId) {
                const res = await this.$wax.rpc.get_table_rows({
                    code: process.env.teleportContract,
                    scope: process.env.teleportContract,
                    table: 'teleports',
                    lower_bound: teleportId,
                    upper_bound: teleportId,
                    limit: 1
                });

                if (!res.rows.length){
                    throw new Error(this.$t('dialog.could_not_find_teleport', {teleportId}));
                }

                const teleportData = res.rows[0];
                console.log(teleportData);

                // logteleport(uint64_t id, uint32_t timestamp, name from, asset quantity, uint8_t chain_id, checksum256 eth_address)
                const sb = new Serialize.SerialBuffer({
                    textEncoder: new TextEncoder,
                    textDecoder: new TextDecoder
                });
                sb.pushNumberAsUint64(teleportData.id);
                sb.pushUint32(teleportData.time);
                sb.pushName(teleportData.account);
                sb.pushAsset(teleportData.quantity);
                sb.push(teleportData.chain_id);
                sb.pushArray(fromHexString(teleportData.eth_address));

                return {
                    claimAccount: '0x' + teleportData.eth_address,
                    data: '0x' + toHexString(sb.array.slice(0, 69)),
                    signatures: teleportData.signatures
                };
            },
            async claimEth(teleportId) {
                const {injectedWeb3, web3} = await this.$web3()

                if (injectedWeb3) {
                    const signData = await this.getSignData(teleportId)
                    console.log(JSON.stringify(signData))

                    const chainData = process.env.networks[this.getChainId.ethereum]
                    const tlmInstance = new web3.eth.Contract(this.$erc20Abi, chainData.tlmContract)
                    const resp = await tlmInstance.methods.claim(signData.data, signData.signatures).send({from: this.getAccountName.ethereum})

                    await this.$store.commit('global/setInfo', $t('dialog.tlm_claimed'))
                    this.showOverlay = true

                    this.updateBalances()
                    this.loadTeleports()

                    // console.log(resp)
                }
            },
            async loadTeleports() {
                let teleports = []

                if (this.getAccountName.wax){
                    const res = await this.$wax.rpc.get_table_rows({
                        code: process.env.teleportContract,
                        scope: process.env.teleportContract,
                        table: 'teleports',
                        index_position: 2,
                        key_type: 'i64',
                        lower_bound: this.getAccountName.wax,
                        upper_bound: this.getAccountName.wax,
                        reverse: true,
                        limit: 50
                    })
                    console.log('Res', res)
                    res.rows.forEach(r => {
                        r.class = 'fromwax'
                        r.completed = r.claimed
                        r.claimable = (r.oracles.length >= 3 && !r.completed)
                        r.correct_login = ('0x'+r.eth_address.substr(0, 40) == this.getAccountName.ethereum.toLowerCase())
                        r.correct_chain = false
                        if (this.getChainId.ethereum == 1 && r.chain_id === 1){
                            r.correct_chain = true
                        }
                        else if (this.getChainId.ethereum == 3 && r.chain_id === 1){
                            r.correct_chain = true
                        }
                        else if (this.getChainId.ethereum == 56 && r.chain_id === 2){
                            r.correct_chain = true
                        }
                        teleports.push(r)
                    })


                    const resEth = await this.$wax.rpc.get_table_rows({
                        code: process.env.teleportContract,
                        scope: process.env.teleportContract,
                        table: 'receipts',
                        index_position: 3,
                        key_type: 'i64',
                        lower_bound: this.getAccountName.wax,
                        upper_bound: this.getAccountName.wax,
                        reverse: true
                    })
                    console.log('resEth', resEth)
                    resEth.rows.forEach(r => {
                        r.class = 'towax'
                        teleports.push(r)
                    })
                }

                teleports = teleports.map(t => {
                    if (t.date){
                        t.time = this.parseDate(t.date) / 1000
                    }
                    return t
                }).sort((a, b) => (a.time < b.time)?1:-1)

                console.log(`teleports`, teleports)
                this.teleports = teleports
            },
            closeOverlay() {
                this.showOverlay = false
                this.showTransfer = false
                this.$refs.teleport_amount.value = ''
                this.$store.commit('global/setInfo', '')
                this.$store.commit('global/setError', '')
                this.$store.commit('global/clearProcessing', null)
            },
            parseDate (fullStr) {
                const [fullDate] = fullStr.split('.')
                const [dateStr, timeStr] = fullDate.split('T')
                const [year, month, day] = dateStr.split('-')
                const [hourStr, minuteStr, secondStr] = timeStr.split(':')

                const dt = new Date()
                dt.setUTCFullYear(year)
                dt.setUTCMonth(month - 1)
                dt.setUTCDate(day)
                dt.setUTCHours(hourStr)
                dt.setUTCMinutes(minuteStr)
                dt.setUTCSeconds(secondStr)

                return dt.getTime()
            }
        },
        watch: {
            getAccountName(accountName) {
                if (accountName) {
                    // console.log('Account name changed')
                    this.updateBalances()
                    this.loadTeleports()
                }
            },
            getChainId(chainId) {
                if (chainId) {
                    // console.log('Chain changed')
                    this.updateBalances()
                    this.loadTeleports()
                }
            }
        },
        async mounted () {
            this.updateBalances()
            this.loadTeleports()
        }
    }
</script>
