const PREFIX = "Returned error: VM Exception while processing transaction: ";

async function tryCatch(promise, message, alertMsg = null) {
    try {
        await promise;
        throw null;
    }
    catch (error) {
        if(alertMsg){
            assert(error, alertMsg);
            assert(error.message.startsWith(PREFIX + message), alertMsg);
        } else {
            assert(error, "Expected an error but did not get one");
            assert(error.message.startsWith(PREFIX + message), "Expected an error starting with '" + PREFIX + message + "' but got '" + error.message + "' instead");    
        }
    }
};

module.exports = {
    catchRevert            : async function(promise, alertMsg) {await tryCatch(promise, "revert", alertMsg);},
    catchOutOfGas          : async function(promise, alertMsg) {await tryCatch(promise, "out of gas", alertMsg);},
    catchInvalidJump       : async function(promise, alertMsg) {await tryCatch(promise, "invalid JUMP", alertMsg);},
    catchInvalidOpcode     : async function(promise, alertMsg) {await tryCatch(promise, "invalid opcode", alertMsg);},
    catchStackOverflow     : async function(promise, alertMsg) {await tryCatch(promise, "stack overflow", alertMsg);},
    catchStackUnderflow    : async function(promise, alertMsg) {await tryCatch(promise, "stack underflow", alertMsg);},
    catchStaticStateChange : async function(promise, alertMsg) {await tryCatch(promise, "static state change", alertMsg);},
};