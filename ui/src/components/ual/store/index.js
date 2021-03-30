import state from './state'
import * as getters from './getters'
import * as mutations from './mutations'
import * as actions from './actions'
import VuexPersistence from 'vuex-persist'

const vuexLocal = new VuexPersistence({
  storage: window.localStorage,
  filter: (mutation) => { console.log('mutation', mutation) }
})

export default {
  namespaced: true,
  getters,
  mutations,
  actions,
  state,
  plugins: [vuexLocal.plugin]
}
