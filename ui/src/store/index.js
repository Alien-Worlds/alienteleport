import Vue from 'vue'
import Vuex from 'vuex'
import createPersistedState from 'vuex-persistedstate'

import ual from 'components/ual/store'
import global from './global'

Vue.use(Vuex)

const store = new Vuex.Store({
    modules: {
        global,
        ual
    },
    plugins: [
        // ...storeExtension.plugins,
        createPersistedState({
            key: 'ual',
            paths: ['ual.SESSION']
        })
    ]
})

export default store
