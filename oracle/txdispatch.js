(() => {
    const config = JSON.parse(process.argv[2]);

    const {Api, JsonRpc, Serialize} = require('eosjs');
    const { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig');
    const fetch = require('node-fetch');
    const { TextDecoder, TextEncoder } = require('text-encoding');

    const signatureProvider = new JsSignatureProvider([config.eos.privateKey]);
    const rpc = new JsonRpc(config.eos.endpoint, {fetch});
    const eos_api = new Api({ rpc, signatureProvider, textDecoder: new TextDecoder(), textEncoder: new TextEncoder() });

    process.on('message', async (msg) => {
        console.log('CHILD got message:', msg);

        const actions = JSON.parse(msg);

        try {
            console.log(actions);
            const res = await eos_api.transact({actions}, {
                blocksBehind: 3,
                expireSeconds: 180
            });

            process.send(JSON.stringify({ type:'success', actions, txid: res.transaction_id }));
        }
        catch (e) {
            if (e.message.indexOf('Oracle has already signed') === -1){
                console.error(`Error pushing confirmation ${e.message}`);
                process.send(JSON.stringify({ type:'error', actions, message: e.message }));
            }
            else {
                console.log(`Already signed ${e.message}`)
            }
        }
    });
})()
