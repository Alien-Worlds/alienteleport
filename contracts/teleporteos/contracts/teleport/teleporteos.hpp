#include <eosio/asset.hpp>
#include <eosio/eosio.hpp>
#include <eosio/transaction.hpp>
#include <math.h>

using namespace eosio;
using namespace std;

#define TOKEN_CONTRACT_STR "alien.worlds"
#define TOKEN_CONTRACT name(TOKEN_CONTRACT_STR)
#define TOKEN_SYMBOL symbol("TLM", 4)

namespace alienworlds {
class [[eosio::contract("teleporteos")]] teleporteos : public contract {
private:

  struct [[eosio::table("stats")]] stats_item {
    symbol symbol;          // Symbol for the token
    uint64_t min;           // Minimum amount for token teleport
    uint64_t fixfee;        // Fix fee for teleports and receipts
    double varfee;          // Variable fee for teleports and receipts
    uint64_t collected;     // Collected fees which are not payed off yet
    uint32_t oracles;       // Amount of oracles
    uint32_t threshold;     // Amount of oracle confirmations which are needed to confirm a received teleport 
    bool fin;               // Freeze incoming funds
    bool fout;              // Freeze outgoing funds
    bool foracles;          // Freeze oracles
    bool fcancel;           // Freeze cancel action

    uint64_t primary_key() const { return symbol.raw(); }
  };
  typedef multi_index<name("stats"), stats_item> stats_table;

  /* Represents a user deposit before teleporting */
  struct [[eosio::table("deposits")]] deposit_item {
    name account;
    asset quantity;

    uint64_t primary_key() const { return account.value; }
  };
  typedef multi_index<name("deposits"), deposit_item> deposits_table;

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
      name("teleports"), teleport_item,
      indexed_by<name("byaccount"), const_mem_fun<teleport_item, uint64_t,
                                              &teleport_item::by_account>>>
      teleports_table;

  struct [[eosio::table("cancels")]] cancel_item {
    uint64_t teleport_id;

    uint64_t primary_key() const { return teleport_id; }
  };
  typedef multi_index<name("cancels"), cancel_item> cancels_table;

  /* Oracles authorised to send receipts */
  struct [[eosio::table("oracles")]] oracle_item {
    name account;

    uint64_t primary_key() const { return account.value; }
  };
  typedef multi_index<name("oracles"), oracle_item> oracles_table;

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
      name("receipts"), receipt_item,
      indexed_by<name("byref"), const_mem_fun<receipt_item, checksum256, &receipt_item::by_ref>>,
      indexed_by<name("byto"), const_mem_fun<receipt_item, uint64_t, &receipt_item::by_to>>>
      receipts_table;

  stats_table _stats;
  deposits_table _deposits;
  oracles_table _oracles;
  receipts_table _receipts;
  teleports_table _teleports;
  cancels_table _cancels;

  void require_oracle(const name account);

  /**
   * @brief Calc fee amount
   * 
   * @param stat Status table entry
   * @param amount Initial amount
   * @return Fee amount
   */
  uint64_t calc_fee(stats_table::const_iterator stat, const uint64_t amount);

  /**
   * @brief Add amount to a deposit. Create an entry if necessary
   * 
   * @param from Deposit account
   * @param quantity Asset of the deposit amount
   */
  void addDeposit(const name from, const asset quantity);

  /**
   * @brief Send payments to all oracles
   * @param stat 
   */
  void paymentsToOracles(stats_table::const_iterator stat);

public:
  using contract::contract;

  teleporteos(name s, name code, datastream<const char *> ds);

  /**
   * @brief Initialize this contract
   * 
   * @param min Minimum amount for a token transfer
   * @param fixfee Fix fee for teleports and receipts
   * @param varfee Variable fee for teleports and receipts
   * @param freeze Freeze all freezable actions
   */
  ACTION ini(const asset min, const asset fixfee, const double varfee, const bool freeze, const uint32_t threshold);

  /* Fungible token transfer (only trilium) */
  [[eosio::on_notify(TOKEN_CONTRACT_STR "::transfer")]] void transfer(name from, name to, asset quantity, string memo);

  ACTION teleport(name from, asset quantity, uint8_t chain_id, checksum256 eth_address);
  ACTION logteleport(uint64_t id, uint32_t timestamp, name from, asset quantity, uint8_t chain_id, checksum256 eth_address);
  ACTION sign(name oracle_name, uint64_t id, string signature);
  ACTION repairrec(uint64_t id, asset quantity, vector<name> approvers, bool completed);
  ACTION withdraw(name from, asset quantity);
  /**
   * @brief Cancel a teleport which is not claimed yet and 32 days old. Consider, you will not get back payed fees 
   * 
   * @param id Teleport id
   */
  ACTION cancel(uint64_t id);
  ACTION received(name oracle_name, name to, checksum256 ref, asset quantity, uint8_t chain_id, bool confirmed);
  ACTION claimed(name oracle_name, uint64_t id, checksum256 to_eth, asset quantity);
  ACTION regoracle(name oracle_name);
  ACTION unregoracle(name oracle_name);
  ACTION sign(string signature);

  /**
   * @brief Delete all receipt entries until a specific date
   * Note: Oracles have to ignore old receipts to avoid double spending
   * 
   * @param to_date 
   */
  ACTION delreceipts(time_point_sec to_date);

  /**
   * @brief Delete claimed and canceled teleports in teleport and cancel table
   * Note: The last entry cannot be deleted, so the deletion causes no further risk of double spending
   * 
   * @param to_id Delete all entries until this id.
   */
  ACTION delteles(uint64_t to_id);

  /**
   * @brief Freeze specific actions
   * 
   * @param in Freeze incoming funds 
   * @param out Freeze outgoing funds
   * @param oracles Freeze oracles
   * @param cancel Freeze cancel action
   */
  ACTION freeze(const bool in, const bool out, const bool oracles, const bool cancel);

  /**
   * @brief Change the minimum amount for a token transfer
   * 
   * @param min Minimum amount
   */
  ACTION setmin(const asset min);

  /**
   * @brief Change fee 
   * 
   * @param fee New fee
   * @return ACTION 
   */
  ACTION setfee(const asset fixfee, const double varfee);

  /**
   * @brief Change the amount of needed confirmations
   * 
   * @param confirms New amount of needed confirations
   */
  ACTION setthreshold(const uint32_t threshold);

  /**
   * @brief Pay out the collected fees to the oracles. Everyone can run this action
   */
  ACTION payoracles();
};
} // namespace alienworlds
