#include "teleporteos.hpp"

using namespace alienworlds;

teleporteos::teleporteos(name s, name code, datastream<const char *> ds) : contract(s, code, ds),
                                                                           _deposits(get_self(), get_self().value),
                                                                           _oracles(get_self(), get_self().value),
                                                                           _receipts(get_self(), get_self().value),
                                                                           _completions(get_self(), get_self().value),
                                                                           _teleports(get_self(), get_self().value) {}

/* Notifications for tlm transfer */
void teleporteos::transfer(name from, name to, asset quantity, string memo) {
    if (to == get_self()) {
        check(quantity.amount >= 1000'0000, "Transfer is below minimum");

        auto deposit = _deposits.find(from.value);
        if (deposit == _deposits.end()){
            _deposits.emplace(get_self(), [&](auto &d){
                d.account = from;
                d.quantity = quantity;
            });
        }
        else {
            _deposits.modify(deposit, get_self(), [&](auto &d){
                d.quantity += quantity;
            });
        }
    }
}

void teleporteos::withdraw(name account, asset quantity) {
    require_auth(account);

    auto deposit = _deposits.find(account.value);
    check(deposit != _deposits.end(), "Deposit not found, please transfer the tokens first");
    check(deposit->quantity >= quantity, "Withdraw amount exceeds deposit");

    if (deposit->quantity == quantity){
        _deposits.erase(deposit);
    }
    else {
        _deposits.modify(*deposit, same_payer, [&](auto &d){
            d.quantity -= quantity;
        });
    }

    string memo = "Return of deposit";
    action(
        permission_level{get_self(), "active"_n},
        TOKEN_CONTRACT, "transfer"_n,
        make_tuple(get_self(), account, quantity, memo)
    ).send();
}

void teleporteos::teleport(name from, asset quantity, uint8_t chain_id, checksum256 eth_address) {
    require_auth(from);

    check(quantity.is_valid(), "Amount is not valid");
    check(quantity.amount > 0, "Amount cannot be negative");
    check(quantity.symbol.is_valid(), "Invalid symbol name");
    check(quantity.amount >= 1000'0000, "Transfer is below minimum");

    auto deposit = _deposits.find(from.value);
    check(deposit != _deposits.end(), "Deposit not found, please transfer the tokens first");
    check(deposit->quantity >= quantity, "Not enough deposited");

    // tokens owned by this contract are inaccessible so just remove the deposit record
    if (deposit->quantity == quantity){
        _deposits.erase(deposit);
    }
    else {
        _deposits.modify(*deposit, same_payer, [&](auto &d){
            d.quantity -= quantity;
        });
    }

    uint64_t next_teleport_id = _teleports.available_primary_key();
    uint32_t now = current_time_point().sec_since_epoch();
    _teleports.emplace(from, [&](auto &t){
        t.id = next_teleport_id;
        t.time = now;
        t.account = from;
        t.quantity = quantity;
        t.chain_id = chain_id;
        t.eth_address = eth_address;
        t.claimed = false;
    });

    action(
        permission_level{get_self(), "active"_n},
        get_self(), "logteleport"_n,
        make_tuple(next_teleport_id, now, from, quantity, chain_id, eth_address)
    ).send();
}

void teleporteos::logteleport(uint64_t id, uint32_t timestamp, name from, asset quantity, uint8_t chain_id, checksum256 eth_address) {
    // Logs the teleport id for the oracle to listen to
    require_auth(get_self());
}

void teleporteos::sign(name oracle_name, uint64_t id, string signature) {
    // Signs receipt of tokens, these signatures must be passed to the eth blockchain
    // in the claim function on the eth contract
    require_oracle(oracle_name);

    auto teleport = _teleports.find(id);
    check(teleport != _teleports.end(), "Teleport not found");

    auto find_res = std::find(teleport->oracles.begin(), teleport->oracles.end(), oracle_name);
    check(find_res == teleport->oracles.end(), "Oracle has already signed");

    _teleports.modify(*teleport, get_self(), [&](auto &t){
        t.oracles.push_back(oracle_name);
        t.signatures.push_back(signature);
    });
}

void teleporteos::received(name oracle_name, name to, checksum256 ref, asset quantity) {
    require_oracle(oracle_name);

    // check it has not already been completed
    auto comp_ind = _completions.get_index<"byref"_n>();
    auto completion = comp_ind.find(ref);
    check(completion == comp_ind.end(), "This reference has already completed");

    auto ref_ind = _receipts.get_index<"byref"_n>();
    auto receipt = ref_ind.find(ref);

    check(quantity.amount > 0, "Quantity cannot be negative");
    check(quantity.is_valid(), "Asset not valid");

    if (receipt == ref_ind.end()) {
        _receipts.emplace(get_self(), [&](auto &r){
            r.id = _receipts.available_primary_key();
            r.ref = ref;
            r.to = to;
            r.confirmations = 1;
            r.quantity = quantity;
            vector<name> approvers;
            approvers.push_back(oracle_name);
            r.approvers = approvers;
        });
    }
    else {
        check(receipt->quantity == quantity, "Quantity mismatch");
        check(receipt->to == to, "Account mismatch");
        auto existing = find (receipt->approvers.begin(), receipt->approvers.end(), oracle_name);
        check (existing == receipt->approvers.end(), "Oracle has already approved");

        if (receipt->confirmations >= ORACLE_CONFIRMATIONS - 1) { // check for one less because of this confirmation
            // fully confirmed, send tokens and mark as completed
            _completions.emplace(get_self(), [&](auto &c){
                c.id = _receipts.available_primary_key();
                c.ref = ref;
            });

            string memo = "Teleport from Ethereum";
            action(
               permission_level{get_self(), "active"_n},
               TOKEN_CONTRACT, "transfer"_n,
               make_tuple(get_self(), to, quantity, memo)
            ).send();
        }

        _receipts.modify(*receipt, get_self(), [&](auto &r){
            r.confirmations = receipt->confirmations + 1;
            r.approvers.push_back(oracle_name);
        });
    }
}

void teleporteos::regoracle(name oracle_name) {
    require_auth(get_self());

    check(is_account(oracle_name), "Oracle account does not exist");

    _oracles.emplace(get_self(), [&](auto &o){
      o.account = oracle_name;
    });
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

void teleporteos::delcomps() {
    require_auth(get_self());

    auto comp = _completions.begin();
    while (comp != _completions.end()) {
        comp = _completions.erase(comp);
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
