#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <eosio/transaction.hpp>
#include <math.h>

using namespace eosio;
using namespace std;

#define ORACLE_CONFIRMATIONS 3
#define TOKEN_CONTRACT_STR "alien.worlds"
#define TOKEN_CONTRACT name(TOKEN_CONTRACT_STR)

namespace alienworlds {
class [[eosio::contract("teleporteos")]] teleporteos : public contract {
private:
  /* Represents a user deposit before teleporting */
  struct [[eosio::table("deposits")]] deposit_item {
    name account;
    asset quantity;

    uint64_t primary_key() const { return account.value; }
  };
  typedef multi_index<"deposits"_n, deposit_item> deposits_table;

  /* Represents a teleport in progress */
  struct [[eosio::table("teleports")]] teleport_item {
    uint64_t id;
    uint32_t time;
    name account;
    asset quantity;
    int8_t chain_id;
    checksum256 eth_address;
    vector<name> oracles;
    vector<string> signatures;
    bool claimed;

    uint64_t primary_key() const { return id; }
    uint64_t by_account() const { return account.value; }
  };
  typedef multi_index<
      "teleports"_n, teleport_item,
      indexed_by<"byaccount"_n, const_mem_fun<teleport_item, uint64_t,
                                              &teleport_item::by_account>>>
      teleports_table;

  struct [[eosio::table("cancels")]] cancel_item {
    uint64_t teleport_id;

    uint64_t primary_key() const { return teleport_id; }
  };
  typedef multi_index<"cancels"_n, cancel_item> cancels_table;

  /* Oracles authorised to send receipts */
  struct [[eosio::table("oracles")]] oracle_item {
    name account;

    uint64_t primary_key() const { return account.value; }
  };
  typedef multi_index<"oracles"_n, oracle_item> oracles_table;

  /* Oracles authorised to send receipts */
  struct [[eosio::table("receipts")]] receipt_item {
    uint64_t id;
    time_point_sec date;
    checksum256 ref;
    name to;
    uint8_t chain_id;
    uint8_t confirmations;
    asset quantity;
    vector<name> approvers;
    bool completed;

    uint64_t primary_key() const { return id; }
    uint64_t by_to() const { return to.value; }
    checksum256 by_ref() const { return ref; }
  };
  typedef multi_index<
      "receipts"_n, receipt_item,
      indexed_by<"byref"_n, const_mem_fun<receipt_item, checksum256,
                                          &receipt_item::by_ref>>,
      indexed_by<"byto"_n,
                 const_mem_fun<receipt_item, uint64_t, &receipt_item::by_to>>>
      receipts_table;

  deposits_table _deposits;
  oracles_table _oracles;
  receipts_table _receipts;
  teleports_table _teleports;
  cancels_table _cancels;

  void require_oracle(name account);

public:
  using contract::contract;

  teleporteos(name s, name code, datastream<const char *> ds);

  /* Fungible token transfer (only trilium) */
  [[eosio::on_notify(TOKEN_CONTRACT_STR "::transfer")]] void transfer(
      name from, name to, asset quantity, string memo);

  ACTION teleport(name from, asset quantity, uint8_t chain_id,
                  checksum256 eth_address);
  ACTION logteleport(uint64_t id, uint32_t timestamp, name from, asset quantity,
                     uint8_t chain_id, checksum256 eth_address);
  ACTION sign(name oracle_name, uint64_t id, string signature);
  ACTION repairrec(uint64_t id, asset quantity, vector<name> approvers,
                   bool completed);
  ACTION withdraw(name from, asset quantity);
  ACTION cancel(uint64_t id);
  ACTION received(name oracle_name, name to, checksum256 ref, asset quantity,
                  uint8_t chain_id, bool confirmed);
  ACTION claimed(name oracle_name, uint64_t id, checksum256 to_eth,
                 asset quantity);
  ACTION regoracle(name oracle_name);
  ACTION unregoracle(name oracle_name);
  ACTION sign(string signature);
  ACTION delreceipts();
  ACTION delteles();
};
} // namespace alienworlds
