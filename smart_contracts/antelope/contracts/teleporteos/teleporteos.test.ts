import {
  ContractDeployer,
  assertRowsEqual,
  AccountManager,
  Account,
  assertEOSErrorIncludesMessage,
  assertMissingAuthority,
  UpdateAuth,
} from 'lamington';
import * as chai from 'chai';

import { Teleporteos } from './teleporteos';
import { EosioToken } from '../eosio.token/eosio.token';

const ethToken =
  '2222222222222222222222222222222222222222222222222222222222222222';

let teleporteos: Teleporteos;
let alienworldsToken: EosioToken;

let sender1: Account;
let sender2: Account;
let oracle1: Account;
let oracle2: Account;
let oracle3: Account;
let removedOracle: Account;
let oracle4: Account;
let oracle5: Account;

describe('teleporteos', async () => {
  before(async () => {
    await seedAccounts();
  });
  context('regoracle', async () => {
    context('without correct auth', async () => {
      it('should fail with auth error', async () => {
        await assertMissingAuthority(
          teleporteos.regoracle(oracle1.name, { from: sender1 })
        );
      });
    });
    context('with correct auth', async () => {
      it('should succeed for oracle1', async () => {
        await teleporteos.regoracle(oracle1.name, {
          from: teleporteos.account,
        });
      });
      it('should succeed to add another oracle', async () => {
        await teleporteos.regoracle(oracle2.name, {
          from: teleporteos.account,
        });
      });
      it('should succeed to add another oracle', async () => {
        await teleporteos.regoracle(oracle3.name, {
          from: teleporteos.account,
        });
      });
      it('should succeed to add another oracle', async () => {
        await teleporteos.regoracle(removedOracle.name, {
          from: teleporteos.account,
        });
      });
      it('should succeed to add another oracle', async () => {
        await teleporteos.regoracle(oracle4.name, {
          from: teleporteos.account,
        });
      });
      it('should succeed to add another oracle', async () => {
        await teleporteos.regoracle(oracle5.name, {
          from: teleporteos.account,
        });
      });
      it('should update oracles table', async () => {
        await assertRowsEqual(teleporteos.oraclesTable(), [
          { account: oracle1.name },
          { account: oracle2.name },
          { account: oracle3.name },
          { account: removedOracle.name },
          { account: oracle4.name },
          { account: oracle5.name },
        ]);
      });
    });
  });
  context('unregoracle', async () => {
    context('with incorrect auth', async () => {
      it('should fail with auth error', async () => {
        await assertMissingAuthority(
          teleporteos.unregoracle(removedOracle.name, { from: sender1 })
        );
      });
    });
    context('with correct auth', async () => {
      it('should succeed', async () => {
        await teleporteos.unregoracle(removedOracle.name, {
          from: teleporteos.account,
        });
      });
      it('should update oracles table', async () => {
        await assertRowsEqual(teleporteos.oraclesTable(), [
          { account: oracle1.name },
          { account: oracle2.name },
          { account: oracle3.name },
          { account: oracle4.name },
          { account: oracle5.name },
        ]);
      });
    });
  });
  context('received from BSC/ETH', async () => {
    context('with unregistered oracle', async () => {
      it('should fail', async () => {
        await assertEOSErrorIncludesMessage(
          teleporteos.received(
            sender1.name,
            sender1.name,
            '1111111111111111111111111111111111111111111111111111111111111111',
            '123.0000 TLM',
            2,
            true,
            {
              from: sender1,
            }
          ),
          'Account is not an oracle'
        );
      });
    });
    context('with registered oracle3', async () => {
      context('with wrong auth', async () => {
        it('should fail with auth error', async () => {
          await assertMissingAuthority(
            teleporteos.received(
              oracle3.name,
              sender1.name,
              '1111111111111111111111111111111111111111111111111111111111111111',
              '123.0000 TLM',
              2,
              true,
              {
                from: sender1,
              }
            )
          );
        });
      });
      context('with correct auth', async () => {
        it('should succeed', async () => {
          await teleporteos.received(
            oracle3.name,
            sender1.name,
            '1111111111111111111111111111111111111111111111111111111111111111',
            '123.0000 TLM',
            2,
            true,
            {
              from: oracle3,
            }
          );
        });
        it('should insert into receipt table', async () => {
          await assertRowsEqual(teleporteos.receiptsTable(), [
            {
              approvers: [oracle3.name],
              chain_id: 2,
              completed: false,
              confirmations: 1,
              date: new Date(),
              id: 0,
              quantity: '123.0000 TLM',
              ref: '1111111111111111111111111111111111111111111111111111111111111111',
              to: sender1.name,
            },
          ]);
        });
      });
    });
    context('with another registered oracle1', async () => {
      it('should add another receipt to existing', async () => {
        await teleporteos.received(
          oracle1.name,
          sender1.name,
          '1111111111111111111111111111111111111111111111111111111111111111',
          '123.0000 TLM',
          2,
          true,
          {
            from: oracle1,
          }
        );
      });
    });
    context('with mismatch quantity', async () => {
      it('should fail with Quantity mismatch error', async () => {
        await assertEOSErrorIncludesMessage(
          teleporteos.received(
            oracle3.name,
            sender1.name,
            '1111111111111111111111111111111111111111111111111111111111111111',
            '0.1230 TLM',
            2,
            true,
            {
              from: oracle3,
            }
          ),
          'Quantity mismatch'
        );
      });
    });
    context('with account mismatch', async () => {
      it('should fail with account mismatch error', async () => {
        await assertEOSErrorIncludesMessage(
          teleporteos.received(
            oracle3.name,
            sender2.name,
            '1111111111111111111111111111111111111111111111111111111111111111',
            '123.0000 TLM',
            2,
            true,
            {
              from: oracle3,
            }
          ),
          'Account mismatch'
        );
      });
    });
    context('with already signed oracle', async () => {
      it('should fail with already approved error', async () => {
        await assertEOSErrorIncludesMessage(
          teleporteos.received(
            oracle3.name,
            sender1.name,
            '1111111111111111111111111111111111111111111111111111111111111111',
            '123.0000 TLM',
            2,
            true,
            {
              from: oracle3,
            }
          ),
          'Oracle has already approved'
        );
      });
    });
    context('with 5 full approvals', async () => {
      before(async () => {
        await teleporteos.received(
          oracle2.name,
          sender1.name,
          '1111111111111111111111111111111111111111111111111111111111111111',
          '123.0000 TLM',
          2,
          true,
          {
            from: oracle2,
          }
        );

        await teleporteos.received(
          oracle4.name,
          sender1.name,
          '1111111111111111111111111111111111111111111111111111111111111111',
          '123.0000 TLM',
          2,
          true,
          {
            from: oracle4,
          }
        );
        await teleporteos.received(
          oracle5.name,
          sender1.name,
          '1111111111111111111111111111111111111111111111111111111111111111',
          '123.0000 TLM',
          2,
          true,
          {
            from: oracle5,
          }
        );
      });
      it('should transfer tokens', async () => {
        await assertRowsEqual(
          alienworldsToken.accountsTable({ scope: sender1.name }),
          [
            {
              balance: '1000123.0000 TLM',
            },
          ]
        );
      });
      it('should update receipt table', async () => {
        await assertRowsEqual(teleporteos.receiptsTable(), [
          {
            approvers: [
              oracle1.name,
              oracle2.name,
              oracle3.name,
              oracle4.name,
              oracle5.name,
            ],
            chain_id: 2,
            completed: true,
            confirmations: 5,
            date: new Date(),
            id: 0,
            quantity: '123.0000 TLM',
            ref: '1111111111111111111111111111111111111111111111111111111111111111',
            to: sender1.name,
          },
        ]);
      });
    });
  });
  context('recrepair', async () => {
    before(async () => {
      await teleporteos.received(
        oracle1.name,
        sender1.name,
        '1111111111111111111111111111111111111111111111111111111111111112',
        '0.1230 TLM',
        2,
        true,
        {
          from: oracle1,
        }
      );
    });
    context('with wrong auth', async () => {
      it('should fail', async () => {
        await assertMissingAuthority(
          teleporteos.repairrec(1, '123.0000 TLM', [oracle1.name], true, {
            from: sender1,
          })
        );
      });
    });
    context('wirth correct auth', async () => {
      context('with non-existing receipt', async () => {
        it('should fail', async () => {
          await assertEOSErrorIncludesMessage(
            teleporteos.repairrec(4, '123.0000 TLM', [oracle1.name], true, {
              from: teleporteos.account,
            }),
            'Receipt does not exist.'
          );
        });
      });
    });
    context('with existing receipt', async () => {
      context('with invalid quantity', async () => {
        it('should fail', async () => {
          await assertEOSErrorIncludesMessage(
            teleporteos.repairrec(1, '123.0000', [oracle1.name], true, {
              from: teleporteos.account,
            }),
            'Asset not valid'
          );
        });
      });
      context('with negative quantity', async () => {
        it('should fail', async () => {
          await assertEOSErrorIncludesMessage(
            teleporteos.repairrec(1, '-123.0000 TLM', [oracle1.name], true, {
              from: teleporteos.account,
            }),
            'Quantity cannot be negative'
          );
        });
      });
      context('with valid params', async () => {
        it('should succeed', async () => {
          await teleporteos.repairrec(
            1,
            '124.0000 TLM',
            [oracle1.name],
            false,
            {
              from: teleporteos.account,
            }
          );
        });
        it('should update the receipts table', async () => {
          await assertRowsEqual(teleporteos.receiptsTable(), [
            {
              approvers: [
                oracle1.name,
                oracle2.name,
                oracle3.name,
                oracle4.name,
                oracle5.name,
              ],
              chain_id: 2,
              completed: true,
              confirmations: 5,
              date: new Date(),
              id: 0,
              quantity: '123.0000 TLM',
              ref: '1111111111111111111111111111111111111111111111111111111111111111',
              to: sender1.name,
            },
            {
              approvers: [oracle1.name],
              chain_id: 2,
              completed: false,
              confirmations: 1,
              date: new Date(),
              id: 1,
              quantity: '124.0000 TLM',
              ref: '1111111111111111111111111111111111111111111111111111111111111112',
              to: sender1.name,
            },
          ]);
        });
      });
    });
  });
  context('teleport', async () => {
    context('without valid auth', async () => {
      it('should fail with auth error', async () => {
        await assertMissingAuthority(
          teleporteos.teleport(sender1.name, '123.0000 TLM', 2, ethToken, {
            from: sender2,
          })
        );
      });
    });
    context('with valid auth', async () => {
      context('with invalid quantity', async () => {
        it('should fail with valid error', async () => {
          await assertEOSErrorIncludesMessage(
            teleporteos.teleport(sender1.name, '123.0000', 2, ethToken, {
              from: sender1,
            }),
            'Amount is not valid'
          );
        });
      });
      context('with amount below minimum', async () => {
        it('should fail with below min error error', async () => {
          await assertEOSErrorIncludesMessage(
            teleporteos.teleport(sender1.name, '23.0000 TLM', 2, ethToken, {
              from: sender1,
            }),
            'Transfer is below minimum of 100 TLM'
          );
        });
      });
      context('with no available deposit', async () => {
        it('should fail with no deposit error', async () => {
          await assertEOSErrorIncludesMessage(
            teleporteos.teleport(sender1.name, '123.0000 TLM', 2, ethToken, {
              from: sender1,
            }),
            'Deposit not found'
          );
        });
      });
      context('with not enough deposit', async () => {
        before(async () => {
          await alienworldsToken.transfer(
            sender1.name,
            teleporteos.account.name,
            '120.0000 TLM',
            'teleport test',
            { from: sender1 }
          );
        });
        it('should fail with not enough deposit error', async () => {
          await assertEOSErrorIncludesMessage(
            teleporteos.teleport(sender1.name, '123.0000 TLM', 2, ethToken, {
              from: sender1,
            }),
            'Not enough deposited'
          );
        });
      });
      context('with enough deposit', async () => {
        before(async () => {
          await alienworldsToken.transfer(
            sender1.name,
            teleporteos.account.name,
            '104.0000 TLM',
            'teleport test extra amount',
            { from: sender1 }
          );
        });
        it('should succeed', async () => {
          await teleporteos.teleport(
            sender1.name,
            '123.0000 TLM',
            2,
            ethToken,
            {
              from: sender1,
            }
          );
        });
        it('should update table', async () => {
          let {
            rows: [item],
          } = await teleporteos.teleportsTable();
          chai.expect(item.account).equal(sender1.name);
          chai.expect(item.chain_id).equal(2);
          chai.expect(item.id).equal(0);
          chai.expect(item.quantity).equal('123.0000 TLM');
          chai.expect(item.eth_address).equal(ethToken);
          chai.expect(item.oracles).empty;
          chai.expect(item.signatures).empty;
          chai.expect(item.claimed).false;
        });
      });
    });
  });
  context('refund receipt', async () => {
    context('without valid auth', async () => {
      it('should fail with auth error', async () => {
        await assertMissingAuthority(
          teleporteos.refundrec(
            0,
            '2222222222222222222222222222222222222222222222222222222222222222',
            { from: oracle1 }
          )
        );
      });
    });
    context('with non-exitent receipt', async () => {
      it('should fail with non-existing error', async () => {
        await assertEOSErrorIncludesMessage(
          teleporteos.refundrec(
            10,
            '2222222222222222222222222222222222222222222222222222222222222222',
            { from: teleporteos.account }
          ),
          'Receipt not found'
        );
      });
    });
    context('for a completed receipt', async () => {
      it('should fail with completed error', async () => {
        await assertEOSErrorIncludesMessage(
          teleporteos.refundrec(
            0,
            '2222222222222222222222222222222222222222222222222222222222222222',
            { from: teleporteos.account }
          ),
          'Receipt has already been completed'
        );
      });
    });
    context('for a receipt with not enough confirmations', async () => {
      it('should fail with not enough confirmations error', async () => {
        await assertEOSErrorIncludesMessage(
          teleporteos.refundrec(
            1,
            '2222222222222222222222222222222222222222222222222222222222222222',
            { from: teleporteos.account }
          ),
          'Not enough confirmations'
        );
      });
    });
    context('for a receipt with enough confirmations', async () => {
      before(async () => {
        await teleporteos.received(
          oracle1.name,
          '',
          '1111111111111111111111111111111111111111111111111111111111111113',
          '666.0000 TLM',
          2,
          true,
          {
            from: oracle1,
          }
        );
        await teleporteos.received(
          oracle2.name,
          '',
          '1111111111111111111111111111111111111111111111111111111111111113',
          '666.0000 TLM',
          2,
          true,
          {
            from: oracle2,
          }
        );
        await teleporteos.received(
          oracle3.name,
          '',
          '1111111111111111111111111111111111111111111111111111111111111113',
          '666.0000 TLM',
          2,
          true,
          {
            from: oracle3,
          }
        );
        await teleporteos.received(
          oracle4.name,
          '',
          '1111111111111111111111111111111111111111111111111111111111111113',
          '666.0000 TLM',
          2,
          true,
          {
            from: oracle4,
          }
        );
      });
      it('last oracle should fail due to inline transfer', async () => {
        await assertEOSErrorIncludesMessage(
          teleporteos.received(
            oracle5.name,
            '',
            '1111111111111111111111111111111111111111111111111111111111111113',
            '666.0000 TLM',
            2,
            true,
            {
              from: oracle5,
            }
          ),
          'to account does not exist'
        );
      });
      it('should succeed', async () => {
        teleporteos.refundrec(
          2,
          '2222222222222222222222222222222222222222222222222222222222222222',
          { from: teleporteos.account }
        );
      });
      it('should update receipts table', async () => {
        let { rows } = await teleporteos.receiptsTable();
        let item = rows[2];

        chai.expect(item.id).equal(2);
        chai.expect(item.to).equal('');

        chai.expect(item.chain_id).equal(2);
        chai.expect(item.approvers.length).equal(4);
      });
      it('should insert a teleport into the table', async () => {
        let { rows } = await teleporteos.teleportsTable();
        let item = rows[1];
        chai.expect(item.id).equal(1);
        chai.expect(item.chain_id).equal(2);
        chai.expect(item.quantity).equal('666.0000 TLM');
        chai
          .expect(item.eth_address)
          .equal(
            '2222222222222222222222222222222222222222222222222222222222222222'
          );
      });
    });
  });
});

async function seedAccounts() {
  teleporteos = await ContractDeployer.deployWithName<Teleporteos>(
    'contracts/teleporteos/teleporteos',
    'teleporteos'
  );

  alienworldsToken = await ContractDeployer.deployWithName<EosioToken>(
    'contracts/eosio.token/eosio.token',
    'alien.worlds'
  );

  sender1 = await AccountManager.createAccount('sender1');
  sender2 = await AccountManager.createAccount('sender2');
  oracle1 = await AccountManager.createAccount('oracle1');
  oracle2 = await AccountManager.createAccount('oracle2');
  oracle3 = await AccountManager.createAccount('oracle3');
  removedOracle = await AccountManager.createAccount('remoracle');
  oracle4 = await AccountManager.createAccount('oracle4');
  oracle5 = await AccountManager.createAccount('oracle5');

  await issueTokens();
  await updateAuths();
}

async function updateAuths() {
  await UpdateAuth.execUpdateAuth(
    [{ actor: teleporteos.account.name, permission: 'owner' }],
    teleporteos.account.name,
    'active',
    'owner',
    UpdateAuth.AuthorityToSet.explicitAuthorities(
      1,
      [
        {
          permission: {
            actor: teleporteos.account.name,
            permission: 'eosio.code',
          },
          weight: 1,
        },
      ],
      [{ key: teleporteos.account.publicKey!, weight: 1 }]
    )
  );

  // await UpdateAuth.execLinkAuth(
  //   landholders.account.active,
  //   landholders.account.name,
  //   eosioToken.account.name,
  //   'transfer',
  //   'distribpay'
  // );
}

async function issueTokens() {
  try {
    await alienworldsToken.create(
      alienworldsToken.account.name,
      '1000000000.0000 TLM',
      {
        from: alienworldsToken.account,
      }
    );

    await alienworldsToken.issue(
      alienworldsToken.account.name,
      '10000000.0000 TLM',
      'initial deposit',
      {
        from: alienworldsToken.account,
      }
    );
  } catch (e: any) {
    if (e.json.error.what != 'eosio_assert_message assertion failure') {
      throw e;
    }
  }

  await alienworldsToken.transfer(
    alienworldsToken.account.name,
    sender1.name,
    '1000000.0000 TLM',
    'inital balance',
    { from: alienworldsToken.account }
  );

  await alienworldsToken.transfer(
    alienworldsToken.account.name,
    teleporteos.account.name,
    '1000000.0000 TLM',
    'inital balance',
    { from: alienworldsToken.account }
  );
}
