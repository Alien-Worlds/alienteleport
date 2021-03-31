export function setError (state, payload) {
  state.error = payload
}

export function setInfo (state, payload) {
    state.info = payload
}

export function setProcessing (state, payload) {
    state.processing = payload
}

export function clearProcessing (state, payload) {
    state.processing = {
        from: '',
        to: '',
        amount: 0,
        message: ''
    }
}
