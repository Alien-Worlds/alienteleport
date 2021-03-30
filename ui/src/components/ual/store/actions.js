
export async function renderLoginModal ({ commit }, network) {
  commit('setShouldRenderLoginModal', true)
  commit('setCurrentNetwork', network)
  commit('bar_msg', `Log into ${network} network`)
}

export async function logout ({ state, commit }, network) {
  if (network) {
    logoutNetwork({ state, commit, network })
  } else {
    for (const network in state.SESSION) {
      logoutNetwork({ state, commit, network })
    }
  }
}
async function logoutNetwork ({ state, commit, network }) {
  const { authenticatorName } = state.SESSION[network]
  const activeAuth = state.UAL[network].authenticators.find(a => a.getStyle().text === authenticatorName)
  // const activeAuth = state.activeAuthenticator
  if (activeAuth) {
    // console.log(activeAuth)

    activeAuth
      .logout()
      .then(() => {
        commit('setActiveAuthenticator', { authenticator: null, network })
        commit('setAccountName', { network, accountName: null })
        commit('setSESSION', { data: { accountName: null, authenticatorName: null }, network })
      })
      .catch(e => {
        console.log(`An error occured while attempting to logout from authenticator: ${activeAuth.getStyle().text}`, e)
      })
  } else {
    console.log('No active authenticator found, you must be logged in before logging out.')
  }
}

export async function waitForAuthenticatorToLoad (_ = {}, authenticator) {
  return new Promise(resolve => {
    if (!authenticator.isLoading()) {
      resolve()
      return
    }
    const authenticatorIsLoadingCheck = setInterval(() => {
      if (!authenticator.isLoading()) {
        clearInterval(authenticatorIsLoadingCheck)
        resolve()
      }
    }, 250)
  })
}
export async function attemptAutoLogin ({ state, commit, dispatch }) {
  for (const network in state.SESSION) {
    await attemptAutoLoginNetwork({ state, commit, dispatch, network })
  }
}
async function attemptAutoLoginNetwork ({ state, commit, dispatch, network }) {
  if (typeof state.SESSION === 'undefined' || typeof state.SESSION[network] === 'undefined' || state.SESSION[network] === null) {
    return
  }
  const { accountName, authenticatorName } = state.SESSION[network]
  console.log('attemptAutoLogin', accountName, authenticatorName, network, state.SESSION[network])

  return new Promise((resolve, reject) => {
    if (accountName && authenticatorName) {
      commit('setAccountName', accountName)
      console.log(`have account name and authenticator name ${accountName} ${authenticatorName}`)
      // dispatch('user/loggedInRoutine', accountName, { root: true })

      window.setTimeout(async () => {
        console.log('Timeout firing', state.UAL)
        const authenticator = state.UAL[network].authenticators.find(a => a.getStyle().text === authenticatorName)
        console.log('authenticator loaded', authenticator)
        if (!authenticator) {
          console.log(`Could not find authenticator ${authenticatorName}`)
          commit('setSESSION', { data: { accountName: null, authenticatorName: null }, network })
          resolve()
          return
        }
        await authenticator.reset()
        await authenticator.init()
        await dispatch('waitForAuthenticatorToLoad', authenticator)
        console.log('Authenticator loaded')
        if (authenticator.initError) {
          console.log(
              `Attempt to auto login with authenticator ${authenticatorName} failed.`
          )
          authenticator.reset()
          // await dispatch('attemptAutoLogin')

          commit('setSESSION', { data: { accountName: null, authenticatorName: null }, network })
          reject(authenticator.initError)
          return
        }

        console.log(`Auto login for ${accountName}`)

        authenticator
          .login(accountName)
          .then(async () => {
            console.log('Login successful')
            await commit('setSESSION', { data: { accountName, authenticatorName }, network })
            commit('setActiveAuthenticator', { authenticator, network })
            // commit('setAccountName', accountName)
            await commit('setAccountName', { network, accountName })
            resolve()
            // dispatch('user/loggedInRoutine', accountName, { root: true })
          })
          .catch(e => {
            commit('setSESSION', { data: { accountName: null, authenticatorName: null }, network })
            console.log('auto login error', e, e.cause)
            resolve()
          })
      }, 500)
    } else {
      console.log('cannot autologin')
      resolve()
    }
  })
}

export async function transact ({ state, dispatch, commit }, payload) {
  const { actions, network, options } = payload
  console.log('payload', payload)
  console.log(`Sending transaction on ${network}`, actions)
  const { accountName, authenticatorName, permission } = state.SESSION[network]
  console.log(`transact with stored state ${authenticatorName} ${accountName}@${permission}`)
  // commit('setSigningOverlay', { show: true, status: 0, msg: 'Waiting for Signature', isShowCloseButton: false })
  const activeAuthenticator = state.activeAuthenticator[network]
  let user
  for (let u = 0; u < activeAuthenticator.users.length; u++) {
    if (await activeAuthenticator.users[u].getAccountName() === accountName) {
      user = activeAuthenticator.users[u]
    }
  }
  console.log('Users', user, activeAuthenticator.users)
  const copiedActions = actions.map((action, index) => {
    if (!action.authorization) {
      action.authorization = [{ actor: accountName, permission }]
    }
    return action
  })
  let res = null
  try {
    const optionsCombined = Object.assign({ blocksBehind: 3, expireSeconds: 30, broadcast: true }, options)
    console.log('options for transact', options)
    res = await user.signTransaction({ actions: copiedActions }, optionsCombined)
    // afterTransact()
  } catch (e) {
    const [errMsg, errCode] = parseUalError(e)
    throw new Error(errMsg, errCode)
  }
  await commit('setSigningOverlay', { show: false, status: 0 })

  return res
}

export function hideSigningOverlay ({ commit }, ms = 10000) {
  return new Promise(resolve => {
    setTimeout(() => {
      commit('setSigningOverlay', { show: false, status: 0 })
      resolve()
    }, ms)
  })
}

function parseUalError (error) {
  let cause = 'unknown cause'
  let errorCode = ''
  if (error.cause) {
    cause = error.cause.reason || error.cause.message || 'Report this error to the eosDAC devs to enhance the UX'
    errorCode = error.cause.code || error.cause.errorCode
  } else if (error.message) {
    cause = error.message
    errorCode = error.code
  }
  return [cause, errorCode]
}
