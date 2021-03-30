export default {
  showLoginModal: false,
  signingOverlay: {
    show: false,
    status: '', // 0=wait for sig, 1=success, 2=error
    msg: '',
    isShowCloseButton: true
  },
  activeAuthenticator: {},
  authenticatorUser: {},
  currentNetwork: null,
  UAL: {},
  accountName: {
    wax: null,
    ethereum: null
  },
  chainId: {
    wax: null,
    ethereum: null
  },
  SESSION: {
    wax: {
      accountName: null,
      authenticatorName: null,
      timestamp: null
    },
    ethereum: {
      accountName: null,
      authenticatorName: null,
      timestamp: null
    }
  },
  paymentInfo: null
}
