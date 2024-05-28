#!/usr/bin/env node

import * as commander from "commander";
import { stake } from "./src/stake";
import { redeem } from "./src/redeem";
import { BitcoinNetworkMap, CoreNetworkMap, FeeSpeedMap } from "./src/constant";
import { signRedeemTransaction, signStakeTransaction } from "./src/transaction";
import * as ecc from "tiny-secp256k1";
import ECPairFactory from "ecpair";
import * as bitcoin from "bitcoinjs-lib";

const ECPair = ECPairFactory(ecc);
const program = new commander.Command();

program
  .version("1.0.0")
  .description("Core chain self custody BTC staking command line tool.");
  program
  .command("get-pubkey")
  .description("Get the public key of a private key.")
  .requiredOption(
    "-privkey, --privatekey <privatekey>"
  )
  .requiredOption(
    "-bn, --bitcoinnetwork <bitcoinnetwork>",
    "The Bitcoin network to operate on, choose between 1~2. 1)Mainnet 2)Testnet."
  )
  .action(async (args) => {
    const bitcoinNetwork = BitcoinNetworkMap[args.bitcoinnetwork];
    const network = bitcoinNetwork == "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
    let keypair = ECPair.fromWIF(args.privatekey, network);
    console.log(keypair.publicKey.toString("hex"));
  });
  program
  .command("sign-stake")
  .description("Sign a stake transaction.")
  .requiredOption(
    '-u, --transaction <transaction>',
    'The unsigned raw transaction as hex to sign.'
  )
  .requiredOption(
    "-acc, --account <account>",
    "The Bitcon address used to stake."
  )
  .requiredOption(
    "-privkey, --privatekey <privatekey>"
  )
  .requiredOption(
    "-bn, --bitcoinnetwork <bitcoinnetwork>",
    "The Bitcoin network to operate on, choose between 1~2. 1)Mainnet 2)Testnet."
  )
  .requiredOption(
    "-lt, --locktime <locktime>",
    "The lock time, in unix timestamp, of the BTC assets specified at stake e.g. 1711983981"
  )
  .action(async (args) => {

    const bitcoinnetwork = BitcoinNetworkMap[args.bitcoinnetwork];
   
    await signStakeTransaction({
      unsignedRawTransaction: args.transaction,
      account: args.account,
      privateKey: args.privatekey,
      bitcoinNetwork: bitcoinnetwork,
      lockTime: args.locktime,
    });
  });
program
  .command("stake")
  .description("Stake BTC")
  .option(
    "-pubkey, --publickey <publickey>",
    "The public key used to stake and redeem the BTC assets when locktime expires."
  )
  .requiredOption(
    "-amt, --amount <amount>",
    "Amount of BTC to stake, measured in SAT."
  )

  .option(
    "-bn, --bitcoinnetwork <bitcoinnetwork>",
    "The Bitcoin network to operate on, choose between 1~2. 1)Mainnet 2)Testnet, default to 1)Mainnet."
  )
  .option(
    "-cn, --corenetwork <corenetwork>",
    "The Core network to transmit the stake transaction to, choose between 1~3. 1)Mainnet 2)Devnet 3)Testnet, default to 1)Mainnet."
  )
  .requiredOption(
    "-lt, --locktime <locktime>",
    "The unix timestamp in seconds to lock the BTC assets up to. e.g. 1711983981"
  )
  .requiredOption(
    "-raddr, --rewardaddress <rewardaddress>",
    "Core address used to claim staking rewards."
  )
  .requiredOption(
    "-vaddr, --validatoraddress <validatoraddress>",
    "Core validator address to stake to."
  )
  .option("-w, --witness", "Use segwit or not.")
  .option(
    "-br, --bitcoinrpc <bitcoinrpc>",
    "The Bitcoin RPC service to use, default to https://mempool.space/. "
  )
  .option(
    "--fee <fee>",
    "Transaction fee s)slow a)average f)fast, please choose in (s, a ,f) OR a customized number in SAT, default to a)average."
  )
  .action(async (args) => {
    const bitcoinnetwork = BitcoinNetworkMap[args.bitcoinnetwork];
    const corenetwork = CoreNetworkMap[args.corenetwork];
    const fee = FeeSpeedMap[args.fee];
    await stake({
      lockTime: args.locktime,
      amount: args.amount,
      validatorAddress: args.validatoraddress,
      rewardAddress: args.rewardaddress,
      publickey: args.publickey,
      bitcoinNetwork: bitcoinnetwork,
      coreNetwork: corenetwork,
      witness: args.witness,
      bitcoinRpc: args.bitcoinrpc,
      fee: fee || args.fee,
    });
  });

program
.command("sign-redeem")
.description("Sign an unsigned redeem transaction")
.requiredOption(
  '-u, --transaction <transaction>',
  'The unsigned raw transaction as hex to sign.'
)
.requiredOption(
  "-privkey, --privatekey <privatekey>",
  "The private key associated --publickey in the stake action. Hex format."
)
.requiredOption(
  "-bn, --bitcoinnetwork <bitcoinnetwork>",
  "The Bitcoin network to operate on, choose between 1~2. 1)Mainnet 2)Testnet."
)
.requiredOption(
  "-lt, --locktime <locktime>",
  "The lock time, in unix timestamp, of the BTC assets specified at stake e.g. 1711983981"
)
.action(async (args) => {
  const bitcoinnetwork = BitcoinNetworkMap[args.bitcoinnetwork];
  await signRedeemTransaction({
    unsignedRawTransaction: args.transaction,
    privateKey: args.privatekey,
    bitcoinNetwork: bitcoinnetwork,
    lockTime: args.locktime,
  });
});
program
  .command("redeem")
  .description("Redeem BTC")
  .requiredOption(
    "-acc, --account <account>",
    "The locked P2SH/P2WSH script address."
  )
  .requiredOption(
    "-r, --redeemscript <redeemscript>",
    "The redeem script which was returned in the stake action."
  )
  .requiredOption(
    "-d, --destaddress <destaddress>",
    "The Bitcoin address to receive the redeemed BTC assets."
  )
  .option(
    "-br, --bitcoinrpc <bitcoinrpc>",
    "The Bitcoin RPC service to use, default to https://mempool.space/. "
  )
  .option(
    "--fee <fee>",
    "Transaction fee s)slow a)average f)fast, please choose in (s, a ,f) OR a customized number in SAT, default to a)average."
  )
  .action(async (args) => {
    const fee = FeeSpeedMap[args.fee];

    await redeem({
      account: args.account,
      redeemScript: args.redeemscript,
      destAddress: args.destaddress,
      bitcoinRpc: args.bitcoinRpc,
      fee: fee || args.fee,
    });
  });

program.parse(process.argv);
