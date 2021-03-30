<template>
  <div>
    <div v-if="showDialog" persistent transition-show="flip-down" transition-hide="flip-up">
      <div class="wax-login d-flex p-2 justify-content-center" style="border: 1px solid white;border-radius: 20px">
        <div class="p-5 w-50">
          <p>If you already have a WAX account, click below to login using either WAX Cloud Wallet or your local wallet</p>
          <b-button @click="loginWax">Login</b-button>
        </div>
        <div class="p-5 w-50">
          <p>If you do not have an existing WAX account, click below to create one</p>
          <p>When you have created the account, come back and log in to proceed</p>
          <p><a href="#" @click="showVideo">View a video on how to set up a WAX account</a></p>

          <b-button @click="newWax">Create account</b-button>
        </div>
      </div>
    </div>
    <q-dialog v-model="baseShowVideo" persistent transition-show="flip-down" transition-hide="flip-up">
      <q-layout view="Lhh lpR fff" container style="background-color:#333">
        <q-header class="bg-primary">
          <q-toolbar style="padding-left: 40px">
            <q-toolbar-title>Creating a WAX account</q-toolbar-title>
            <font-awesome-icon icon="times" style="float:right;cursor:pointer" @click="hideVideo" />
          </q-toolbar>
        </q-header>

        <q-page-container>
          <q-page padding>
            <video src="/videos/cloud_wallet.mp4" id="tutorial_video" />
          </q-page>
        </q-page-container>
      </q-layout>
    </q-dialog>
  </div>
</template>

<style lang="scss">
  #tutorial_video {
    width: 100%;
  }
  @media (min-width: 600px) {
    .q-dialog__inner--minimized > div {
      max-width: 75%;
    }
  }
</style>

<script>
import { mapGetters } from 'vuex'
import { BButton } from 'bootstrap-vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

export default {
  name: 'LoginWax',
  components: {
    'b-button': BButton,
    'font-awesome-icon': FontAwesomeIcon
  },
  computed: {
    ...mapGetters({
      getAccountName: 'ual/getAccountName'
    }),
    showDialog () {
      return this.baseShowDialog && !this.getAccountName.wax
    }
  },
  methods: {
    async loginWax () {
      await this.$store.dispatch('ual/renderLoginModal', 'wax', { root: true })
    },
    async newWax () {
      window.open('https://wallet.wax.io', '_blank')
    },
    showVideo (e) {
      // console.log(e)
      e.preventDefault()
      this.baseShowDialog = false
      this.baseShowVideo = true
      this.$nextTick(() => {
        const video = document.getElementById('tutorial_video')
        video.play()
        video.addEventListener('ended', () => {
          this.baseShowVideo = false
          this.baseShowDialog = true
          console.log('tutorial video finished')
        })
      })
      return false
    },
    hideVideo () {
      this.baseShowVideo = false
      this.baseShowDialog = true
    }
  },
  data () {
    return {
      baseShowDialog: true,
      baseShowVideo: false
    }
  }
}
</script>
