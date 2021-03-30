<template>
  <div>
    <q-dialog v-model="getShouldRenderLoginModal" persistent transition-show="flip-down" transition-hide="flip-up">
      <q-card class="text-white" style="width:350px">
        <q-bar class="bg-secondary">
          <div>{{ bar_msg }}</div>
          <q-space />
          <q-btn
            dense
            flat
            icon="close"
            @click="closeModal"
          >
            <q-tooltip content-class="bg-secondary text-white">{{$t('ual.close')}}</q-tooltip>
          </q-btn>
        </q-bar>
        <q-card-section>
          <q-carousel
            v-model="slide"
            transition-prev="scale"
            transition-next="scale"
            animated
            control-color="red"
            class="no-padding"
          >
            <q-carousel-slide name="wallet_selection" class="no-padding">
              <div v-if="getAuthenticators[getCurrentNetwork] && getAuthenticators[getCurrentNetwork].length" class="column no-wrap">
                <authenticator-btn
                  v-for="(authenticator, i) in getAuthenticators[getCurrentNetwork]"
                  :authenticator="authenticator"
                  :key="`${i}auth`"
                  @login="handleAuthenticatorSelection"
                />
              </div>
              <div v-else class="text-black">
                {{getCurrentNetwork}}
                {{$t('ual.no_authenticators')}}
              </div>
            </q-carousel-slide>
            <q-carousel-slide name="accountname_input" class="column no-wrap justify-between">
              <div class="text-black">{{$t('ual.input_account')}}</div>
              <q-input
                type="text"
                v-model="accountname"
                autofocus
                @keyup.enter.native="connectAuthenticator(authenticator)"
              />

              <div class="column">
                <q-btn
                  label="continue"
                  color="primary"
                  class="full-width"
                  @click="connectAuthenticator(authenticator)"
                />
                <q-btn label="back" flat color="primary" class="q-mt-sm" @click="resetUI" />
              </div>
            </q-carousel-slide>

            <q-carousel-slide name="accountname_select" class="column no-wrap justify-between">
              <q-list bordered separator>
                <q-item clickable v-for="(account, a) in accountname_options" :key="a" @click="selectMultiAccount(account)" :active="account === account_selected">
                  <q-item-section>{{account.actor}}</q-item-section>
                  <q-item-section side>{{account.permission}}</q-item-section>
                </q-item>
              </q-list>
              {{account_selected}}

              <div class="column">
                <q-btn
                  label="continue"
                  color="primary"
                  class="full-width"
                  @click="connectAuthenticator(authenticator)"
                />
                <q-btn label="back" flat color="primary" class="q-mt-sm" @click="resetUI" />
              </div>
            </q-carousel-slide>
            <q-carousel-slide name="error" class="column no-wrap justify-between">
              <div class="text-red">{{ error_msg }}</div>
              <div class="column">
                <q-btn :label="$t('ual.back')" flat color="primary" class="q-mt-sm" @click="resetUI" />
              </div>
            </q-carousel-slide>
          </q-carousel>
        </q-card-section>
      </q-card>
    </q-dialog>
    <signing-overlay />
  </div>
</template>

<script>
import { UAL } from 'universal-authenticator-library'
import { mapGetters, mapActions } from 'vuex'
import authenticatorBtn from 'components/ual/authenticator-btn'
import signingOverlay from 'components/ual/signing-overlay'

export default {
  name: 'UAL',
  components: {
    authenticatorBtn,
    signingOverlay
  },
  props: ['chains', 'authenticators', 'appName', 'chainName'],
  data () {
    return {
      ual: {},

      bar_msg: '',
      error_msg: '',

      slide: 'wallet_selection',
      accountname: '',
      account_selected: '',
      accountname_options: [],

      authenticator: null
    }
  },
  computed: {
    ...mapGetters({
      getShouldRenderLoginModal: 'ual/getShouldRenderLoginModal',
      getActiveAuthenticator: 'ual/getActiveAuthenticator',
      getAuthenticators: 'ual/getAuthenticators',
      getCurrentNetwork: 'ual/getCurrentNetwork'
    })
  },
  methods: {
    ...mapActions({
      setAuthenticatorUser: 'ual/setAuthenticatorUser'
    }),
    async handleAuthenticatorSelection (authenticator) {
      this.authenticator = authenticator
      const shouldRequestAccountName = await authenticator.shouldRequestAccountName()
      if (shouldRequestAccountName) {
        this.bar_msg = authenticator.getStyle().text
        this.slide = 'accountname_input'
      } else {
        this.connectAuthenticator(authenticator)
      }
    },

    async connectAuthenticator (authenticator) {
      const authenticatorName = authenticator.getStyle().text
      this.bar_msg = this.$t('ual.connecting_to', { name: authenticatorName })

      let users
      try {
        console.log('authenticator object', authenticator)
        if (this.accountname) {
          console.log(`Logging in as ${this.accountname}`)
          users = await authenticator.login(this.accountname)
        } else {
          users = await authenticator.login()
          console.log('Logging in to authenticator', users)
        }
        if (!users || !users.length) {
          return
        }

        this.$store.commit('ual/setActiveAuthenticator', { network: this.getCurrentNetwork, authenticator })

        if (users.length > 1) {
          this.bar_msg = 'Choose account'
          this.slide = 'accountname_select'
          this.accountname_options = users.map(u => {
            return { actor: u.accountName, permission: u.permission }
          })
          return
        }

        const accountName = await users[0].getAccountName()
        this.saveSession(accountName, authenticatorName, this.getCurrentNetwork)
      } catch (err) {
        this.bar_msg = ''
        console.log(err.cause ? err.cause : err)
        let m = this.$t('ual.service_unavailable')
        if (authenticator) {
          m = authenticator.getError() || err
          m += ` ${authenticator.getStyle().text}`
          m += ` ${authenticator.getOnboardingLink()}`
        }
        this.authenticator.reset()
        this.error_msg = m
      }
    },
    async saveSession (accountName, authenticatorName, network, permission = 'active') {
      this.accountname = accountName
      this.$store.commit('ual/setSESSION', {
        network,
        data: {
          accountName,
          permission,
          authenticatorName
        }
      })
      this.$store.commit('ual/setAccountName', { network, accountName })

      // await this.$store.dispatch('user/loggedInRoutine', accountName, { root: true })
      this.$store.commit('ual/setShouldRenderLoginModal', false)
      this.resetUI()
    },
    async selectMultiAccount (e) {
      console.log('select multi')
      this.account_selected = e
      this.accountname = e.actor
      const authenticator = this.getActiveAuthenticator
      const authenticatorName = authenticator.getStyle().text
      await this.saveSession(this.account_selected.actor, authenticatorName, this.account_selected.permission)
      authenticator.login(e.actor)
    },
    resetUI () {
      this.bar_msg = this.error_msg = this.accountname = ''
      this.slide = 'wallet_selection'
    },
    closeModal () {
      this.$store.commit('ual/setShouldRenderLoginModal', false)
      this.resetUI()
    }
  },
  mounted () {
    for (const chainName in this.chains) {
      this.ual[chainName] = new UAL(this.chains[chainName], this.appName, this.authenticators[chainName])
    }

    console.log('UAL', this.ual)
    this.$store.commit('ual/setUAL', this.ual)
  },

  watch: {
    error_msg: function (newv, oldv) {
      if (newv) {
        this.slide = 'error'
      }
    }
  }
}
</script>

<style>
.authenticator_not_available {
  opacity: 0.5;
  filter: alpha(opacity=50);
  background-color: #c6c6c6 !important;
  order: 1;
}
</style>
