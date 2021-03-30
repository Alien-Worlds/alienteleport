export function getShouldRenderLoginModal (state) {
  return state.showLoginModal
}

export function getSigningOverlay (state) {
  return state.signingOverlay
}

export function getActiveAuthenticator (state) {
  return state.activeAuthenticator
}

export function getAuthenticatorUser (state) {
  return state.authenticatorUser
}

export function getAuthenticators (state) {
  const authenticators = {}
  if (state.UAL) {
    for (const chainName in state.UAL) {
      authenticators[chainName] = state.UAL[chainName].getAuthenticators().availableAuthenticators
    }
  }
  return authenticators
}

export function getSESSION (state) {
  return state.SESSION
}

export function getUAL (state) {
  return state.UAL
}

export function getAccountName (state) {
  return state.accountName
}

export function getChainId (state) {
  return state.chainId
}

export function getCurrentNetwork (state) {
  return state.currentNetwork
}
