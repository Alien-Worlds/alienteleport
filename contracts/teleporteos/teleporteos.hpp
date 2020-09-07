#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <math.h>

using namespace eosio;
using namespace std;

#define ORACLE_CONFIRMATIONS 3
#define TOKEN_CONTRACT "alien.worlds"_n

namespace alienworlds {
    class [[eosio::contract("teleporteos")]] teleporteos : public contract {
      private:
        /* Represents a user deposit before teleporting */
        struct [[eosio::table("deposits")]] deposit_item {
          name  account;
          asset quantity;

          uint64_t primary_key() const { return account.value; }
        };
        typedef multi_index<"deposits"_n, deposit_item> deposits_table;


        /* Oracles authorised to send receipts */
        struct [[eosio::table("oracles")]] oracle_item {
          name  account;

          uint64_t primary_key() const { return account.value; }
        };
        typedef multi_index<"oracles"_n, oracle_item> oracles_table;


        /* Oracles authorised to send receipts */
        struct [[eosio::table("receipts")]] receipt_item {
          uint64_t     id;
          checksum256  ref;
          name         to;
          uint8_t      confirmations;
          asset        quantity;
          vector<name> approvers;

          uint64_t    primary_key() const { return id; }
          checksum256 by_ref() const { return ref; }
        };
        typedef multi_index<"receipts"_n, receipt_item,
            indexed_by<"byref"_n, const_mem_fun<receipt_item, checksum256, &receipt_item::by_ref>>> receipts_table;

        /* Mark completed transactions */
        struct [[eosio::table("completions")]] completion_item {
          uint64_t    id;
          checksum256 ref;

          uint64_t    primary_key() const { return id; }
          checksum256 by_ref() const { return ref; }
        };
        typedef multi_index<"completions"_n, completion_item,
            indexed_by<"byref"_n, const_mem_fun<completion_item, checksum256, &completion_item::by_ref>>> completions_table;

        deposits_table    _deposits;
        oracles_table     _oracles;
        receipts_table    _receipts;
        completions_table _completions;

        void require_oracle(name account);

      public:
        using contract::contract;

        teleporteos(name s, name code, datastream<const char *> ds);

        /* Fungible token transfer (only trilium) */
        [[eosio::on_notify("alien.worlds::transfer")]] void transfer(name from, name to, asset quantity, string memo);

        [[eosio::action]] void teleport(name from, asset quantity, string eth_address);
        [[eosio::action]] void received(name oracle_name, name to, checksum256 ref, asset quantity);
        [[eosio::action]] void addoracle(name oracle_name);
        [[eosio::action]] void delreceipts();
        [[eosio::action]] void delcomps();
    };
} // namespace alienworlds
