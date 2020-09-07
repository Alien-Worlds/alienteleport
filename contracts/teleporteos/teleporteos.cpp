#include "teleporteos.hpp"

using namespace alienworlds;

teleporteos::teleporteos(name s, name code, datastream<const char *> ds) : contract(s, code, ds),
                                                                           _deposits(get_self(), get_self().value),
                                                                           _oracles(get_self(), get_self().value),
                                                                           _receipts(get_self(), get_self().value),
                                                                           _completions(get_self(), get_self().value) {}

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

void teleporteos::teleport(name from, asset quantity, string eth_address) {
    require_auth(from);

    check(quantity.is_valid(), "Amount is not valid");
    check(quantity.amount > 0, "Amount cannot be negative");
    check(quantity.symbol.is_valid(), "Invalid symbol name");
    check(quantity.amount >= 1000'0000, "Transfer is below minimum");

    auto deposit = _deposits.find(from.value);
    check(deposit != _deposits.end(), "Deposit not found, please transfer the tokens first");

    // tokens owned by this contract are inaccessible so just remove the deposit record
    _deposits.erase(deposit);
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

void teleporteos::addoracle(name oracle_name) {
    require_auth(get_self());

    check(is_account(oracle_name), "Oracle account does not exist");

    _oracles.emplace(get_self(), [&](auto &o){
        o.account = oracle_name;
    });
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

/* Private */

void teleporteos::require_oracle(name account) {
    _oracles.get(account.value, "Account is not an oracle");
}
