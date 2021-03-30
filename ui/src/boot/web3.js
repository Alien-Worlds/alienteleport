
import Web3 from 'web3'

export default async ({ Vue }) => {
  const getWeb3 = async () => {
    // Check for injected web3 (mist/metamask)
    try {
      var web3js = window.web3
      if (typeof web3js !== 'undefined') {
        var web3 = new Web3(web3js.currentProvider)
        await window.ethereum.enable()
        // console.log(web3)
        return {
          injectedWeb3: await web3.eth.net.isListening(),
          web3
        }
      } else {
        // web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:7545')) GANACHE FALLBACK
        throw new Error('Unable to connect to Metamask, window.web3 is undefined')
      }
    } catch (e) {
      console.error(`Error enabling Metamask ${e.message}`)
      return null
    }
  }

  Vue.prototype.$web3 = getWeb3
}
