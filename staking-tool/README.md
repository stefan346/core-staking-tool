# Readme

## How to build

```
npx webpack --config webpack.config.js
```

## How to stake & unstake bitcoins

Download electrum. Private key is expected to be in WIF format when interacting with the CLI tool.

A walkthrough using test data. Replace with your own data. Use https://www.epochconverter.com/ to get the unix epoch time.

You can broadcast your signed BTC transaction on one of the following websites:
- https://www.blockchain.com/explorer/assets/btc/broadcast-transaction
- https://live.blockcypher.com/btc/pushtx/
- https://mempool.space/tx/push

It takes 4 bitcoin confirmations before the stake shows up on stake.coredao.org/mystaking#btc.

### 1: [Offline] - Get public key
Get the public key from a private key.
```
node dist/index.js get-pubkey -privkey [private_key] -bn 2
````

### 2: [Online] - Create stake transaction
Create the unsigned raw stake transaction. The validator address is the operator address found on https://stake.coredao.org/. Check https://mempool.space/ to decide on a reasonable fee. Please backup the redeem-script on multiple USBs, discuss how to.
```
node dist/index.js stake -pubkey [public key] --amount [amount] -bn 2 -cn 2 -lt 1715904278 --rewardaddress [reward_address] --validatoraddress  [validator_address] --fee 20
```

### 3: [Offline] - Sign stake transaction
Sign the unsigned raw stake transaction.
```
node dist/index.js sign-stake -u [raw_tx_hex] -acc [account] -privkey [private_key] -bn 2 -lt 1715904278
```

Verify the transaction fee and stake account is equivalent to what was inserted upon the stake transaction creation using electrum.

In electrum go to Tools -> Load transaction -> From text and paste in the unsigned raw transaction.

### 4: [Online] - Create redeem (unstake) transaction
Create the unsigned raw redeem transaction to unstake.
```
node dist/index.js redeem --account [stake_account] --redeemscript [redeem_script] --destaddress [destination_address] --fee 20
```

### 5: [Offline] - Sign redeem (unstake) transaction
Sign the unsigned raw redeem transaction to unstake.
```
node dist/index.js sign-redeem -u [raw_tx_hex] --privatekey [private_key] -bn 2 -lt 1715904278
```

Verify the transaction fee, destination address (1 output) stake account is equivalent to what was inserted upon the stake transaction creation using electrum.

In electrum go to Tools -> Load transaction -> From text and paste in the unsigned raw transaction.
