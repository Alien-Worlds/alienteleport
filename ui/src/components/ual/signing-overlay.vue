<template>
  <q-dialog v-model="getSigningOverlay.show" maximized no-esc-dismiss no-backdrop-dismiss>
    <div class="fit row items-center justify-center">
      <q-btn
        v-if="isShowCloseButton"
        round
        icon="close"
        @click="$store.commit('ual/setSigningOverlay', { show: false })"
        class="absolute-top-right q-mt-md q-mr-md"
        color="accent"
      />
      <div class="text-center">
        <transition appear enter-active-class="animated fadeInDown" mode="out-in">
          <div key="i0" v-if="getSigningOverlay.status === 0">
            <q-icon name="vpn_key" color="secondary" size="80px" class="bounce" />
          </div>
          <div key="i1" v-if="getSigningOverlay.status === 1">
            <q-icon name="check_circle_outline" color="positive" size="80px" />
          </div>
          <div key="i2" v-if="getSigningOverlay.status === 2">
            <q-icon name="error_outline" color="negative" size="80px" />
          </div>
        </transition>
        <transition appear enter-active-class="animated fadeInUp" mode="out-in">
          <div
            class="text-weight-bold text-center"
            :class="getMessageClass"
            :key="`msg${getSigningOverlay.status}`"
            style="max-width:300px"
          >
            {{ getSigningOverlay.msg }}
          </div>
        </transition>
      </div>
    </div>
  </q-dialog>
</template>

<script>
import { mapGetters } from 'vuex'
export default {
  computed: {
    ...mapGetters({
      getSigningOverlay: 'ual/getSigningOverlay'
    }),
    getMessageClass () {
      let res
      switch (this.getSigningOverlay.status) {
        case 0:
          res = 'text-white'
          break
        case 1:
          res = 'text-positive'
          break
        case 2:
          res = 'text-negative'
          break
        default:
          break
      }
      return res
    },
    isShowCloseButton () {
      return this.getSigningOverlay.isShowCloseButton
    }
  }
}
</script>
