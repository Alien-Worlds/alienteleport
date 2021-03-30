
export async function showError ({ commit }, errorMsg) {
  await commit('setError', errorMsg)
}

export async function showInfo ({ commit }, infoMsg) {
  await commit('setInfo', infoMsg)
}
