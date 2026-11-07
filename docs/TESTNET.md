# Testnet log

Everything here can be checked on a NEAR testnet explorer (for example
`https://testnet.nearblocks.io/txns/<hash>`). Accounts are throwaway faucet accounts under
`slaythebear.testnet`. Keys live outside the repo, in the deployer's `~/.near-credentials`.

## Early checks (8 Nov 2026, first contract build)

These ran against `dev.slaythebear.testnet`, an unlocked development instance of the first
contract build (Bear commit/reveal design, since replaced). The drand verification code and the
meta-transaction path are unchanged in the current build.

### drand verified on-chain

Round 1 opened by a hit, settled after the deadline with quicknet round 33761623
(`scripts/early-checks.ts settle`):

| Attempt | Result |
|---|---|
| Real signature with one byte flipped | rejected, `bad_beacon` |
| Valid signature of round 33761622 passed as 33761623 | rejected, `bad_beacon` |
| Round 33761622 with its own valid signature | rejected, `wrong_beacon_round` |
| Real beacon for 33761623 | settled, tx `DBZJmfCFMMBauhd2WP5SKC762ie4zo6E52LpnnsGi7dY`, 13.0 TGas burnt in total |

The settlement stored `randomness = 314ddce4…6405`, which equals sha256 of the beacon
signature `b44325de…4699`. The BLS pairing check on-chain fits easily: 13 TGas against a
300 TGas limit.

### Gas-free play with a function-call key

`guest-check.slaythebear.testnet` was created with 0.01 NEAR and a single function-call key
limited to the game contract (tx `HYFpWAMqPUamqUvX6GW9griHCcaGQSqWEYJpeX2vwZuv`). It signed
delegate actions; `slaythebear.testnet` relayed them and paid the gas:

| Move | Tx | Gas |
|---|---|---|
| claim_pouch (relayed) | `2RhqE5RCuHXZF5kp8F9aDuRzc8H1dMc184FFt6tkoJ24` | 3.95 TGas |
| hit 50 $SLAY (relayed) | `FDeScyaBVZdp1jXtiGJTCR4t2YWMWiXEJn5PRTdtYRyX` | 4.10 TGas |

The contract credited the pouch to and recorded the hit for `guest-check`, not the relayer.
The guest's NEAR balance stayed at 0.01 before and after.

### Other measurements

| What | Tx | Gas |
|---|---|---|
| Deploy 373,504-byte wasm and `new()` in one tx | `2f5dqUradVbKsHyQk7et9Es1ymidoBJukbbEgmRYHQva` | 31.1 TGas |
| claim_pouch (direct) | `GGx7PNycSuA9SJ4v4LUb6oN1c7vewfDwy8VyaTaBTXqu` | 3.0 TGas |
| First hit, which also opens the round | `BhEDHN5GJ2sDM4ZoSLu8WpVhEdCxx2mW5hnbxmaaGUke` | 3.8 TGas |

Testnet gas price at the time: 100,000,000 yoctoNEAR per gas, so a relayed hit costs the
relayer about 0.0004 NEAR. A caller needs about 0.3 NEAR of balance to attach 300 TGas,
because NEAR reserves prepaid gas at a pessimistic price; settling with 50 TGas is enough.
