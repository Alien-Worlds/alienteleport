# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

Alien Teleport is a bridge for fungible tokens between an Antelope chain (WAX) and EVM chains (Ethereum, BSC, …). It is a multi-package monorepo containing the two on-chain contracts, the off-chain oracle scripts that link them, and a Quasar/Vue UI. Each subdirectory is its own independent package — there is no root build, and the root `package.json` only pins a couple of shared type deps.

## Subpackages and commands

Run commands from each subdirectory; install with `yarn` (or `npm i`) per package.

- `smart_contracts/antelope/` — EOSIO C++ contracts (`teleporteos`, `eosio.token`) built/tested with [Lamington](https://github.com/Alien-Worlds/lamington). `.lamingtonrc` pins CDT 1.8.1 / EOS 2.0.13 (Ubuntu 18.04 .debs — Lamington runs them in Docker).
  - `yarn build` → `lamington build`
  - `yarn test` → `lamington test -DIS_DEV` (runs `**/*.test.ts`, e.g. `contracts/teleporteos/teleporteos.test.ts`)
  - `yarn stop` to tear down the Lamington node
  - Run a single test file: `npx lamington test -DIS_DEV contracts/teleporteos/teleporteos.test.ts`
- `smart_contracts/evm/teleporteth/contracts/TeleportToken.sol` — standalone Solidity source; **no build tooling is checked in**. If you need to compile/deploy it, set up Hardhat/Foundry yourself or ask the user which toolchain they use.
- `oracle/` — Node.js oracle daemons. No test suite. Run with a config file:
  - `CONFIG=./config.js node oracle-eos.js`
  - `CONFIG=./config.js node oracle-eth.js`
  - Copy `config-example.js` → `config.js` first. `ecosystem.config.example.js` is a PM2 template.
  - Helper scripts: `incomplete-eos.js`, `incomplete-eth.js` (find teleports missing signatures), `txdispatch.js`, `check-eth.js`, `eth_abi.js`.
  - Note: `oracle-eth.ts` exists alongside `oracle-eth.js` — the `.js` file is the one that's run; treat the `.ts` as a partial/in-progress port unless told otherwise.
- `ui/` — Quasar v1 + Vue 2 wallet UI.
  - `yarn build` → `quasar build`
  - `yarn lint` → ESLint over `.js`/`.vue`
  - No test suite (`yarn test` is a no-op).
- `scripts/` — one-off TS utilities (`teleport.ts`, `get_sign_data.ts`). Run via `ts-node` / `tsx`.

## Architecture

End-to-end token flow is described in detail in `README.md`. Key things that aren't obvious from any single file:

- **Asymmetric design.** The Antelope contract holds the canonical state and pays for RAM; the EVM side is intentionally thin to keep gas costs down. Tokens are locked (not burned) on Antelope and minted/credited on EVM via `claim`; coming back, EVM `teleport` triggers an unlock on Antelope.
- **Antelope ↔ multiple EVMs, but EVM ↔ one Antelope.** `teleporteos` carries a `chain_id` parameter on every teleport so one Antelope contract instance can bridge to many EVM chains; each EVM contract instance binds to exactly one Antelope chain. To move EVM→EVM you must hop through Antelope.
- **Oracle quorum, not a single signer.** A configurable threshold of registered oracles must independently sign each teleport. Oracles are registered via `regoracle` (Antelope) / `regOracle` (EVM) under `federation@active`. Oracles never pay EVM gas — users pay on the EVM side, oracles only pay WAX CPU/NET.
- **Event topics the EVM oracle watches** (hardcoded in `oracle/oracle-eth.js`):
  - `teleport_topic` `0x6228…f5d5` → user-initiated EVM→Antelope. Oracle decodes (recipient, chain_id, quantity, tx_id), signs, calls `received` on `teleporteos`.
  - `claimed_topic` `0xf20f…7b17` → emitted after a successful EVM `claim`. Oracle calls `claimed` on `teleporteos` to mark the teleport finalized.
- **Antelope-side actions the oracle consumes/produces:** listens via SHiP for `logteleport` on the teleport contract, then writes back `sign` (attach oracle signature for an Antelope→EVM teleport so the user can claim on EVM), `received` (witness an EVM→Antelope teleport; threshold reached → tokens transferred to recipient), and `claimed` (mark Antelope-side record after EVM claim).
- **Repair flow caveat.** Recent commits (see `git log`) added logic to clear prior oracle signatures when teleport data is repaired — signatures over old data are no longer valid. Be careful when changing anything that affects the signed payload (fields, order, chain_id handling) — you'll invalidate stored signatures across all oracles.

## Hardcoded transfer limits

- **Antelope (`teleporteos.cpp`):** minimum transfer of **100 TLM** (`100'0000` with 4 decimals) is checked in *both* the `transfer` notification handler (`teleporteos.cpp:15`) and the `teleport` action itself (`teleporteos.cpp:56`). Token symbol/precision is fixed via the `TOKEN_CONTRACT` constant — there is no on-chain config to raise/lower the minimum without a contract change + redeploy.
- **EVM (`TeleportToken.sol`):** oracle quorum **threshold defaults to 3** (line 236), is enforced on `claim` (line 413), and `updateThreshold` caps it at a **maximum of 10** (line 426). No minimum-amount check on the EVM side.
- No per-tx maximum, no daily cap, and no rate limiting exist in either contract. Oracle set membership and the Antelope-side signature threshold are config/state, not source-level constants.

## Conventions

- Prettier configs are checked in at the root and per package — use them; don't reformat broadly.
- The Antelope C++ contract deploys under the account `other.worlds` in production (per README); tests use Lamington's auto-deployed accounts.
- When editing `teleporteos.cpp`/`.hpp`, the matching TypeScript test in the same directory is the spec — update it in lockstep.
