import { RedeemScriptType, LOCKTIME_THRESHOLD } from "./constant";
import { buildStakeTransaction, StakeParams } from "./transaction";
import Bignumber from "bignumber.js";
import * as ecc from "tiny-secp256k1";
import ECPairFactory from "ecpair";

const ECPair = ECPairFactory(ecc);

export const stake = async ({
  witness = false,
  lockTime,
  publickey,
  amount,
  validatorAddress,
  rewardAddress,
  coreNetwork = "mainnet",
  bitcoinNetwork = "mainnet",
  bitcoinRpc = "mempool",
  fee = "avg",
}: Omit<StakeParams, "chainId" | "type">) => {
  if (!lockTime) {
    throw new Error("LockTime should not be empty");
  }

  if (new Bignumber(lockTime).lte(new Bignumber(LOCKTIME_THRESHOLD))) {
    throw new Error("lockTime should be greater than 5*1e8");
  }

  if (!publickey) {
    throw new Error("Public key should not be empty");
  }

  if (!amount) {
    throw new Error("Amount should not be empty");
  }

  if (!validatorAddress) {
    throw new Error("validatorAddress should not be empty");
  }

  if (!rewardAddress) {
    throw new Error("rewardAddress should not be empty");
  }

  const { unsignedRawTransaction, scriptAddress, redeemScript } = await buildStakeTransaction({
    witness,
    lockTime: Number(lockTime),
    publickey,
    amount,
    validatorAddress,
    rewardAddress,
    type: RedeemScriptType.PUBLIC_KEY_HASH_SCRIPT,
    bitcoinNetwork,
    coreNetwork,
    bitcoinRpc,
    fee,
  });
  console.log(`unsigned raw transaction: ${unsignedRawTransaction}`);
  console.log(`stake account address: ${scriptAddress}`);
  console.log(`redeemScript: ${redeemScript}`);
};


import { buildOPReturnScript, CLTVScript, parseCLTVScript, finalCLTVScripts } from "./script";
