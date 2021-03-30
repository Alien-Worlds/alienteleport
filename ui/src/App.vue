<template>
  <div id="q-app">
    <ual vi-if="appName" :appName="appName" :chains="chains" :authenticators="authenticators"/>
    <router-view />
  </div>
</template>
<script>

import ual from 'components/ual/ual'
import { Scatter } from 'ual-scatter'
import { Wax } from '@eosdacio/ual-wax'
import { Anchor } from 'ual-anchor'

export default {
    name: 'App',
    components: {
        ual
    },
    methods: {
        splitEndpoint (endpoint) {
            const [protocol, hostPort] = endpoint.split('://')
            const [host, portStr] = hostPort.split(':')
            let port = parseInt(portStr)
            if (isNaN(port)) {
                port = (protocol === 'https') ? 443 : 80
            }

            return {
                protocol,
                host,
                port
            }
        }
    },
    data () {
        const appName = 'Alien Worlds'
        const endpointsWax = [process.env.waxEndpoint]
        // const network = 'wax'

        const chainsWax = [{
            chainId: process.env.waxChainId,
            rpcEndpoints: [this.splitEndpoint(endpointsWax[0])]
        }]

        const authenticatorsWax = [
            new Wax(chainsWax, { appName }),
            new Scatter(chainsWax, { appName }),
            new Anchor(chainsWax, { appName })
        ]

        const chains = {
            wax: chainsWax
        }
        const authenticators = {
            wax: authenticatorsWax
        }

        return {
            appName,
            chains,
            authenticators
        }
    }
}
</script>
