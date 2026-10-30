'use strict';

/** `act` objects for `logteleport` on the teleport contract, in trace order. */
function findLogTeleportActs(traces, teleportContract) {
  const acts = [];
  for (const trace of traces) {
    switch (trace[0]) {
      case 'transaction_trace_v0':
        for (const action of trace[1].action_traces) {
          switch (action[0]) {
            case 'action_trace_v0':
            case 'action_trace_v1':
              if (action[1].act.account === teleportContract && action[1].act.name === 'logteleport') {
                acts.push(action[1].act);
              }
              break;
          }
        }
    }
  }
  return acts;
}

module.exports = { findLogTeleportActs };
