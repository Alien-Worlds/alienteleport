#include "teleporteos.hpp"

using namespace alienworlds;

teleporteos::teleporteos(name s, name code, datastream<const char *> ds)
  : contract(s, code, ds),
   _stats(get_self(), get_self().value) {}

ACTION teleporteos::ini(const asset min, const asset fixfee, const double varfee, const bool freeze, const uint32_t threshold, const uint8_t chain_id){
  require_auth(get_self());

  check(min.symbol == TOKEN_SYMBOL, "Wrong token symbol of min amount");
  check(fixfee.symbol == TOKEN_SYMBOL, "Wrong token symbol of fee");
  check(threshold > 0, "Needed confirmation amount has to be grater than 0");
  check(varfee <= 0.2 && varfee >= 0, "Variable fee has to be between 0 and 0.20");

  check(_stats.find(TOKEN_SYMBOL.raw()) == _stats.end(), "Already initialized");

  // Get the amount of oracles if this contract overrides an old contract 
  oracles_table _oracles(get_self(), get_self().value);
  uint64_t oracleCount;
  for (auto itr = _oracles.begin(); itr != _oracles.end(); ++itr) {
    ++oracleCount;
  }

  auto stat = _stats.emplace(get_self(), [&](auto &s) {
    s.symbol = TOKEN_SYMBOL;
    s.tokencontr = TOKEN_CONTRACT;
    s.min = min.amount;
    s.fixfee = fixfee.amount;
    s.varfee = varfee;
    s.collected = 0;
    s.fin = freeze;
    s.fout = freeze;
    s.foracles = freeze;
    s.fcancel = freeze;
    s.oracles = oracleCount;
    s.threshold = threshold;
    s.version = 1;
    s.id = chain_id;
  });

  uint64_t fee = calc_fee(stat, min.amount);
  check(fee < min.amount, "Fees are too high relative to the minimum amount of token transfers");
}

/* Notifications for token transfer */
void teleporteos::transfer(name from, name to, asset quantity, string memo) {
  if (to == get_self() && TOKEN_SYMBOL == quantity.symbol) {
    auto stat = _stats.find(TOKEN_SYMBOL.raw());
    check(quantity.amount >= stat->min, "Transfer is below minimum token amount");
    check(!stat->fin, "Token transfer is currently deactivated");

    addDeposit(from, quantity);
  }
}

ACTION teleporteos::withdraw(name account, asset quantity) {
  require_auth(account);

  deposits_table _deposits(get_self(), get_self().value);
  auto deposit = _deposits.find(account.value);
  check(deposit != _deposits.end(), "Deposit not found, please transfer the tokens first");
  check(deposit->quantity >= quantity, "Withdraw amount exceeds deposit");

  auto stat = _stats.find(TOKEN_SYMBOL.raw());
  check(!stat->fout, "Withdraw is currently deactivated");

  if (deposit->quantity == quantity) {
    _deposits.erase(deposit);
  } else {
    _deposits.modify(*deposit, same_payer, [&](auto &d) { d.quantity -= quantity; });
  }

  string memo = "Return of deposit";
  action(permission_level{get_self(), "active"_n}, TOKEN_CONTRACT, "transfer"_n,
         make_tuple(get_self(), account, quantity, memo))
      .send();
}

ACTION teleporteos::teleport(name from, asset quantity, uint8_t chain_id, checksum256 eth_address) {
  require_auth(from);

  check(quantity.is_valid(), "Amount is not valid");

  auto stat = _stats.find(TOKEN_SYMBOL.raw());
  check(quantity.amount >= stat->min, "Transfer is below minimum token amount");
  check(!stat->fin, "Teleport is currently deactivated");

  deposits_table _deposits(get_self(), get_self().value);
  auto deposit = _deposits.find(from.value);
  check(deposit != _deposits.end(), "Deposit not found, please transfer the tokens first");
  check(deposit->quantity >= quantity, "Not enough deposited");

  check(hasId(chain_id, stat), "This chain id is not available");

  // Reduce the deposit amount by the teleport amount and delete the deposit if it would be zero
  if (deposit->quantity == quantity) {
    _deposits.erase(deposit);
  } else {
    _deposits.modify(*deposit, same_payer, [&](auto &d) { d.quantity -= quantity; });
  }

  // Pay fee
  uint64_t fee = calc_fee(stat, quantity.amount);
  _stats.modify(*stat, get_self(), [&](auto &s) {
    s.collected += fee;
  });
  quantity.amount -= fee;

  // Emplace teleport
  teleports_table _teleports(get_self(), get_self().value);
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

inline bool teleporteos::hasId(uint8_t chain_id, stats_table::const_iterator stat){
  auto itr = stat->chains.find(chain_id);
  return itr != stat->chains.end();
}

ACTION teleporteos::addchain(string name, string abbreviation, uint8_t chain_id, string net_id, string teleaddr, string tokenaddr){
  require_auth(get_self());
  auto stat = _stats.find(TOKEN_SYMBOL.raw());
  check(!hasId(chain_id, stat), "This chain is already listed");

  chainData chain;
  chain.name = name;
  chain.abbreviation = abbreviation;
  chain.net_id = net_id;
  chain.teleaddr = teleaddr;
  chain.tokenaddr = tokenaddr;

  std::pair<map<uint8_t,chainData>::iterator,bool> ret;
  _stats.modify(*stat, get_self(), [&](auto &s) {
    ret = s.chains.insert(std::pair<uint8_t,chainData>(chain_id, chain));
  });
  check(ret.second != false, "This chain is already listed");
}

ACTION teleporteos::rmchain(uint8_t chain_id){
  require_auth(get_self());
  auto stat = _stats.find(TOKEN_SYMBOL.raw());
  
  _stats.modify(*stat, get_self(), [&](auto &s) {
    s.chains.erase(chain_id);
  });
}

/* Cancels a teleport after 30 days and no claim */
ACTION teleporteos::cancel(uint64_t id) {
  teleports_table _teleports(get_self(), get_self().value);
  auto teleport = _teleports.find(id);
  check(teleport != _teleports.end(), "Teleport not found");

  require_auth(teleport->account);
  check(!teleport->claimed, "Teleport is already claimed");

  /* wait 32 days to give time to mark as claimed */
  uint32_t thirty_two_days = 60 * 60 * 24 * 32;
  uint32_t now = current_time_point().sec_since_epoch();
  check((teleport->time + thirty_two_days) < now, "Teleport has not expired");

  // Refund the teleport and mark it as cancelled
  cancels_table _cancels(get_self(), get_self().value);
  auto existing = _cancels.find(id);
  check(existing == _cancels.end(), "Teleport has already been cancelled");

  auto stat = _stats.find(TOKEN_SYMBOL.raw());
  check(!stat->fcancel, "Cancelation is deactivated");

  _cancels.emplace(teleport->account, [&](auto &c) { c.teleport_id = id; });

  string memo = "Cancel teleport";
  action(permission_level{get_self(), "active"_n}, TOKEN_CONTRACT, "transfer"_n,
         make_tuple(get_self(), teleport->account, teleport->quantity, memo))
      .send();
}

ACTION teleporteos::logteleport(uint64_t id, uint32_t timestamp, name from, asset quantity, uint8_t chain_id, checksum256 eth_address) {
  // Logs the teleport id for the oracle to listen to
  require_auth(get_self());
}

ACTION teleporteos::sign(name oracle_name, uint64_t id, string signature) {
  // Signs receipt of tokens, these signatures must be passed to the eth
  // blockchain in the claim function on the eth contract
  require_oracle(oracle_name);
  auto stat = _stats.find(TOKEN_SYMBOL.raw());
  check(!stat->foracles, "Oracle actions are freezed");

  teleports_table _teleports(get_self(), get_self().value);
  auto teleport = _teleports.find(id);
  check(teleport != _teleports.end(), "Teleport not found");

  auto find_res = std::find(teleport->oracles.begin(), teleport->oracles.end(), oracle_name);
  check(find_res == teleport->oracles.end(), "Oracle has already signed");

  for(auto &sig : teleport->signatures){
    check(sig != signature, "Already signed with this signature");
  }

  _teleports.modify(*teleport, get_self(), [&](auto &t) {
    t.oracles.push_back(oracle_name);
    t.signatures.push_back(signature);
  });
}

// Receiving token from BSC/ETH
ACTION teleporteos::received(name oracle_name, name to, checksum256 ref, asset quantity, uint8_t chain_id, bool confirmed) {
  require_oracle(oracle_name);
  auto stat = _stats.find(TOKEN_SYMBOL.raw());
  check(!stat->foracles, "Oracle actions are freezed");

  receipts_table _receipts(get_self(), get_self().value);
  auto ref_ind = _receipts.get_index<"byref"_n>();
  auto receipt = ref_ind.find(ref);

  check(quantity.amount > 0, "Quantity cannot be negative");
  check(quantity.is_valid(), "Asset not valid");

  check(hasId(chain_id, stat), "This chain id is not available");

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
      check(!receipt->completed, "This teleport is already completed");

      check(receipt->quantity == quantity, "Quantity mismatch");
      check(receipt->to == to, "Account mismatch");
      auto existing = find(receipt->approvers.begin(), receipt->approvers.end(), oracle_name);
      check(existing == receipt->approvers.end(), "Oracle has already approved");
      bool completed = false;


      if (receipt->confirmations >= stat->threshold - 1) { // check for one less because of this confirmation
        // Pay fee
        uint64_t fee = calc_fee(stat, quantity.amount);
        _stats.modify(*stat, get_self(), [&](auto &s) {
          s.collected += fee;
        });
        quantity.amount -= fee;
        
        // Pay out recipient
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

ACTION teleporteos::repairrec(uint64_t id, asset quantity, vector<name> approvers, bool completed) {
  require_auth(get_self());

  receipts_table _receipts(get_self(), get_self().value);
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
ACTION teleporteos::claimed(name oracle_name, uint64_t id, checksum256 to_eth, asset quantity) {
  require_oracle(oracle_name);

  auto stat = _stats.find(TOKEN_SYMBOL.raw());
  check(!stat->foracles, "Oracle actions are freezed");

  teleports_table _teleports(get_self(), get_self().value);
  auto teleport = _teleports.find(id);
  check(teleport != _teleports.end(), "Teleport not found");

  check(teleport->quantity == quantity, "Quantity mismatch");
  check(teleport->eth_address == to_eth, "Account mismatch");
  check(!teleport->claimed, "Already marked as claimed");

  _teleports.modify(*teleport, same_payer, [&](auto &t) { t.claimed = true; });
}

ACTION teleporteos::regoracle(name oracle_name) {
  require_auth(get_self());

  check(is_account(oracle_name), "Oracle account does not exist");

  oracles_table _oracles(get_self(), get_self().value);
  _oracles.emplace(get_self(), [&](auto &o) { o.account = oracle_name; });

  auto stat = _stats.find(TOKEN_SYMBOL.raw());
  _stats.modify(*stat, same_payer, [&](auto &s) { s.oracles++; });
}

ACTION teleporteos::unregoracle(name oracle_name) {
  require_auth(get_self());

  oracles_table _oracles(get_self(), get_self().value);
  auto oracle = _oracles.find(oracle_name.value);
  check(oracle != _oracles.end(), "Oracle does not exist");

  _oracles.erase(oracle);
  
  auto stat = _stats.find(TOKEN_SYMBOL.raw());
  _stats.modify(*stat, same_payer, [&](auto &s) { 
    s.oracles--;
  });
}

ACTION teleporteos::delreceipts(time_point_sec to_date) {
  require_auth(get_self());

  receipts_table _receipts(get_self(), get_self().value);
  auto receipt = _receipts.begin();
  while (receipt != _receipts.end()) {
    if(receipt->date < to_date){
      receipt = _receipts.erase(receipt);
    } else {
      receipt++;
    }
  }
}

ACTION teleporteos::delteles(uint64_t to_id) {
  require_auth(get_self());
  teleports_table _teleports(get_self(), get_self().value);
  auto del_to = _teleports.find(to_id);
  check(del_to != _teleports.end(), "Teleport id not found");

  // Delete all cancels and regarding teleports which id is less than to_id
  cancels_table _cancels(get_self(), get_self().value);
  auto ci = _cancels.begin();
  while (ci != _cancels.end() && ci->teleport_id < to_id) {
    auto tp = _teleports.find(ci->teleport_id);
    if(tp != _teleports.end()){
      _teleports.erase(tp);
    }
    ci = _cancels.erase(ci);
  }

  // Delete all remaining teleports which are claimed and id is less than to_id  
  auto tp = _teleports.begin();
  while (tp != del_to) {
    if(tp->claimed){
      tp = _teleports.erase(tp);
    } else {
      tp++;
    }
  }
}

ACTION teleporteos::freeze(const bool in, const bool out, const bool oracles, const bool cancel){
  require_auth(get_self());
  auto stat = _stats.find(TOKEN_SYMBOL.raw());
  _stats.modify(*stat, same_payer, [&](auto &s) { 
    s.fin = in; 
    s.fout = out; 
    s.foracles = oracles;
    s.fcancel = cancel;
  });
}

ACTION teleporteos::setmin(const asset min){
  require_auth(get_self());
  
  check(min.symbol == TOKEN_SYMBOL, "Wrong token");

  auto stat = _stats.find(TOKEN_SYMBOL.raw());
  uint64_t fee = calc_fee(stat, min.amount);
  check(fee < min.amount, "Fees are too high relative to the minimum amount of token transfers");

  _stats.modify(*stat, same_payer, [&](auto &s) { 
    s.min = min.amount;
  });
}

ACTION teleporteos::setfee(const asset fixfee, const double varfee){
  require_auth(get_self());
  auto stat = _stats.find(TOKEN_SYMBOL.raw());
  check(fixfee.symbol == TOKEN_SYMBOL, "Wrong token");
  check(varfee <= 0.2 && varfee >= 0, "Variable fee has to be between 0 and 0.20");

  // Pay off all oracles first
  auto rest = paymentsToOracles(stat);

  // Set new fee and remaining collected
  _stats.modify(*stat, same_payer, [&](auto &s) { 
    s.fixfee = fixfee.amount;
    s.varfee = varfee;
    s.collected = rest;
  });

  uint64_t fee = calc_fee(stat, stat->min);
  check(fee < stat->min, "Fees are too high relative to the minimum amount of token transfers");
}

ACTION teleporteos::setthreshold(const uint32_t threshold){
  require_auth(get_self());
  check(threshold > 0, "Needed confirmation amount has to be grater than 0");
  auto stat = _stats.find(TOKEN_SYMBOL.raw());
  _stats.modify(*stat, same_payer, [&](auto &s) { 
    s.threshold = threshold;
  });
}

ACTION teleporteos::payoracles(){
  auto stat = _stats.find(TOKEN_SYMBOL.raw());
  auto rest = paymentsToOracles(stat);
  _stats.modify(*stat, same_payer, [&](auto &s) { 
    s.collected = rest;
  });
}

/* Private */

void teleporteos::require_oracle(const name account) {
  require_auth(account);
  oracles_table _oracles(get_self(), get_self().value);
  _oracles.get(account.value, "Account is not an oracle");
}

uint64_t teleporteos::calc_fee(stats_table::const_iterator stat, const uint64_t amount){
  uint64_t fee = ((uint64_t)(amount * stat->varfee)) + stat->fixfee;
  if(fee > amount){
    fee = amount;
  }
  return fee;
}

void teleporteos::addDeposit(const name from, const asset quantity){
  deposits_table _deposits(get_self(), get_self().value);
  auto deposit = _deposits.find(from.value);
  if (deposit == _deposits.end()) {
    _deposits.emplace(get_self(), [&](auto &d) {
      d.account = from;
      d.quantity = quantity;
    });
  } else {
    _deposits.modify(deposit, get_self(), [&](auto &d) { d.quantity += quantity; });
  }
}

uint64_t teleporteos::paymentsToOracles(stats_table::const_iterator stat){
  if(stat->collected == 0 || stat->oracles == 0){
    return stat->collected;
  }
  uint64_t quantity = stat->collected / stat->oracles;
  uint64_t rest = stat->collected - (quantity * stat->oracles);
  if(quantity != 0){
    oracles_table _oracles(get_self(), get_self().value);
    for (auto itr = _oracles.cbegin(); itr != _oracles.cend(); itr++) {
      addDeposit(itr->account, asset(quantity, stat->symbol));
    }
  }
  return rest;
}