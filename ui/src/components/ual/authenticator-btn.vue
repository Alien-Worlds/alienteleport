<template>
  <q-item
    v-if="authenticator"
    :style="'background-color:' + style.background"
    @click="handleClick()"
    clickable
    v-ripple
    class="rounded-borders q-mb-sm text-center"
  >
    <q-item-section avatar>
      <img :src="style.icon" height="30" />
    </q-item-section>
    <q-item-section class="text-left" :style="'color:' + style.textColor">{{ name }}</q-item-section>
    <q-item-section side>
      <div v-if="!authenticator.initError" style="width:30px">
        <q-spinner v-if="!authenticator.isLoading() && isClicked" size="30px" :style="'color:' + style.textColor" />
        <q-spinner-dots
          v-if="authenticator.isLoading() && !isClicked"
          size="30px"
          :style="'color:' + style.textColor"
        ></q-spinner-dots>
      </div>
    </q-item-section>
  </q-item>
</template>

<script>
export default {
  name: 'authenticatorBtn',
  props: ['authenticator'],
  data () {
    return {
      name: '',
      style: {},
      isClicked: false
    }
  },
  methods: {
    handleClick () {
      this.isClicked = true
      this.$emit('login', this.authenticator)
    }
  },
  mounted () {
    if (this.authenticator) {
      this.style = this.authenticator.getStyle()
      this.name = this.style.text
    }
  }
}
</script>

<style></style>
