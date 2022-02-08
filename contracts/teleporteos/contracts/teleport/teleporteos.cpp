#include "teleporteos.hpp"

using namespace alienworlds;

teleporteos::teleporteos(name s, name code, datastream<const char *> ds)
    : contract(s, code, ds), _deposits(get_self(), get_self().value),
      _oracles(get_self(), get_self().value),
      _receipts(get_self(), get_self().value),
      _teleports(get_self(), get_self().value),
      _cancels(get_self(), get_self().value) {}

/* Notifications for tlm transfer */
void teleporteos::transfer(name from, name to, asset quantity, string memo) {
  if (to == get_self()) {
    check(quantity.amount >= 100'0000, "Transfer is below minimum of 100 TLM");

    auto deposit = _deposits.find(from.value);
    if (deposit == _deposits.end()) {
      _deposits.emplace(get_self(), [&](auto &d) {
        d.account = from;
        d.quantity = quantity;
      });
    } else {
      _deposits.modify(deposit, get_self(),
                       [&](auto &d) { d.quantity += quantity; });
    }
  }
}

void teleporteos::withdraw(name account, asset quantity) {
  require_auth(account);

  auto deposit = _deposits.find(account.value);
  check(deposit != _deposits.end(),
        "Deposit not found, please transfer the tokens first");
  check(deposit->quantity >= quantity, "Withdraw amount exceeds deposit");

  if (deposit->quantity == quantity) {
    _deposits.erase(deposit);
  } else {
    _deposits.modify(*deposit, same_payer,
                     [&](auto &d) { d.quantity -= quantity; });
  }

  string memo = "Return of deposit";
  action(permission_level{get_self(), "active"_n}, TOKEN_CONTRACT, "transfer"_n,
         make_tuple(get_self(), account, quantity, memo))
      .send();
}

void teleporteos::teleport(name from, asset quantity, uint8_t chain_id,
                           checksum256 eth_address) {
  require_auth(from);

  check(quantity.is_valid(), "Amount is not valid");
  check(quantity.amount >= 100'0000, "Transfer is below minimum of 100 TLM");

  auto deposit = _deposits.find(from.value);
  check(deposit != _deposits.end(),
        "Deposit not found, please transfer the tokens first");
  check(deposit->quantity >= quantity, "Not enough deposited");

  // tokens owned by this contract are inaccessible so just remove the deposit
  // record
  if (deposit->quantity == quantity) {
    _deposits.erase(deposit);
  } else {
    _deposits.modify(*deposit, same_payer,
                     [&](auto &d) { d.quantity -= quantity; });
  }

  uint64_t next_teleport_id = _teleports.available_primary_key();
  uint32_t now = current_time_point().sec_since_epoch();
  _teleports.emplace(from, [&](auto &t) {
    t.id = next_teleport_id;
    t.time = now;
    t.account = from;
    t.quantity = quantity;
    t.chain_id = chain_id;
    t.eth_address = eth_address;
    t.claimed = false;
  });

  action(
      permission_level{get_self(), "active"_n}, get_self(), "logteleport"_n,
      make_tuple(next_teleport_id, now, from, quantity, chain_id, eth_address))
      .send();
}

/* Cancels a teleport after 30 days and no claim */
void teleporteos::cancel(uint64_t id) {
  auto teleport = _teleports.find(id);
  check(teleport != _teleports.end(), "Teleport not found");

  require_auth(teleport->account);
  check(!teleport->claimed, "Teleport is already claimed");

  /* wait 32 days to give time to mark as claimed */
  uint32_t thirty_two_days = 60 * 60 * 24 * 32;
  uint32_t now = current_time_point().sec_since_epoch();
  check((teleport->time + thirty_two_days) < now, "Teleport has not expired");

  // Refund the teleport and mark it as cancelled
  auto existing = _cancels.find(id);
  check(existing == _cancels.end(), "Teleport has already been cancelled");

  _cancels.emplace(teleport->account, [&](auto &c) { c.teleport_id = id; });

  string memo = "Cancel teleport";
  action(permission_level{get_self(), "active"_n}, TOKEN_CONTRACT, "transfer"_n,
         make_tuple(get_self(), teleport->account, teleport->quantity, memo))
      .send();
}

void teleporteos::logteleport(uint64_t id, uint32_t timestamp, name from,
                              asset quantity, uint8_t chain_id,
                              checksum256 eth_address) {
  // Logs the teleport id for the oracle to listen to
  require_auth(get_self());
}

void teleporteos::sign(name oracle_name, uint64_t id, string signature) {
  // Signs receipt of tokens, these signatures must be passed to the eth
  // blockchain in the claim function on the eth contract
  require_oracle(oracle_name);

  auto teleport = _teleports.find(id);
  check(teleport != _teleports.end(), "Teleport not found");

  auto find_res = std::find(teleport->oracles.begin(), teleport->oracles.end(),
                            oracle_name);
  check(find_res == teleport->oracles.end(), "Oracle has already signed");

  _teleports.modify(*teleport, get_self(), [&](auto &t) {
    t.oracles.push_back(oracle_name);
    t.signatures.push_back(signature);
  });
}

// Receiving TLM from BSC/ETH
void teleporteos::received(name oracle_name, name to, checksum256 ref,
                           asset quantity, uint8_t chain_id, bool confirmed) {
  require_oracle(oracle_name);

  auto ref_ind = _receipts.get_index<"byref"_n>();
  auto receipt = ref_ind.find(ref);

  check(quantity.amount > 0, "Quantity cannot be negative");
  check(quantity.is_valid(), "Asset not valid");

  if (receipt == ref_ind.end()) {
    _receipts.emplace(get_self(), [&](auto &r) {
      r.id = _receipts.available_primary_key();
      r.date = current_time_point();
      r.ref = ref;
      r.chain_id = chain_id;
      r.to = to;
      r.quantity = quantity;

      vector<name> approvers;
      if (confirmed) {
        r.confirmations = 1;
        approvers.push_back(oracle_name);
      }
      r.approvers = approvers;
    });
  } else {
    if (confirmed) {
      check(!receipt->completed, "This teleport has already completed");

      check(receipt->quantity == quantity, "Quantity mismatch");
      check(receipt->to == to, "Account mismatch");
      auto existing = find(receipt->approvers.begin(), receipt->approvers.end(),
                           oracle_name);
      check(existing == receipt->approvers.end(),
            "Oracle has already approved");
      bool completed = false;

      if (receipt->confirmations >=
          ORACLE_CONFIRMATIONS -
              1) { // check for one less because of this confirmation
        string memo = "Teleport";
        action(permission_level{get_self(), "active"_n}, TOKEN_CONTRACT,
               "transfer"_n, make_tuple(get_self(), to, quantity, memo))
            .send();

        completed = true;
      }

      _receipts.modify(*receipt, get_self(), [&](auto &r) {
        r.confirmations = receipt->confirmations + 1;
        r.approvers.push_back(oracle_name);
        r.completed = completed;
      });
    } else {
      check(false, "Another oracle has already registered teleport");
    }
  }
}

void teleporteos::repairrec(uint64_t id, asset quantity, vector<name> approvers,
                            bool completed) {
  require_auth(get_self());

  auto receipt = _receipts.require_find(id, "Receipt does not exist.");

  check(quantity.amount > 0, "Quantity cannot be negative");
  check(quantity.is_valid(), "Asset not valid");

  _receipts.modify(*receipt, get_self(), [&](receipt_item &r) {
    r.confirmations = approvers.size();
    r.approvers = approvers;
    r.quantity = quantity;
    r.completed = completed;
  });
}

/*
 * Marks a teleport as claimed
 */
void teleporteos::claimed(name oracle_name, uint64_t id, checksum256 to_eth,
                          asset quantity) {
  require_oracle(oracle_name);

  auto teleport = _teleports.find(id);
  check(teleport != _teleports.end(), "Teleport not found");

  check(teleport->quantity == quantity, "Quantity mismatch");
  check(teleport->eth_address == to_eth, "Account mismatch");
  check(!teleport->claimed, "Already marked as claimed");

  _teleports.modify(*teleport, same_payer, [&](auto &t) { t.claimed = true; });
}

void teleporteos::regoracle(name oracle_name) {
  require_auth(get_self());

  check(is_account(oracle_name), "Oracle account does not exist");

  _oracles.emplace(get_self(), [&](auto &o) { o.account = oracle_name; });
}

void teleporteos::unregoracle(name oracle_name) {
  require_auth(get_self());

  auto oracle = _oracles.find(oracle_name.value);
  check(oracle != _oracles.end(), "Oracle does not exist");

  _oracles.erase(oracle);
}

void teleporteos::delreceipts() {
  require_auth(get_self());

  auto receipt = _receipts.begin();
  while (receipt != _receipts.end()) {
    receipt = _receipts.erase(receipt);
  }
}

void teleporteos::delteles() {
  require_auth(get_self());

  auto tp = _teleports.begin();
  while (tp != _teleports.end()) {
    tp = _teleports.erase(tp);
  }
}

/* Private */

void teleporteos::require_oracle(name account) {
  require_auth(account);
  _oracles.get(account.value, "Account is not an oracle");
}
