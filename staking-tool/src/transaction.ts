import { RedeemScriptType } from "./constant";
import * as bitcoin from "bitcoinjs-lib";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import Bignumber from "bignumber.js";
import { buildOPReturnScript, CLTVScript, parseCLTVScript, finalCLTVScripts } from "./script";
import { Provider } from "./provider";
import coinSelect from "coinselect-segwit";
import split from "coinselect-segwit/split";
import * as ecc from "tiny-secp256k1";
import ECPairFactory from "ecpair";
import { CoreChainNetworks, FeeSpeedType } from "./constant";
import { getAddressType } from "./address";

// Initialize the elliptic curve library
const ECPair = ECPairFactory(ecc);

// Verify validator's signature
const validatorSignature = (pubkey: Buffer, msghash: Buffer, signature: Buffer): boolean => ECPair.fromPublicKey(pubkey).verify(msghash, signature);

/**
 * Interface for fee parameters
 */
export interface FeeParams {
  fee?: FeeSpeedType | string; // Fee rate for the transaction
}

/**
 * Interface for network parameters
 */
export interface NetworkParams {
  bitcoinNetwork: string; // Bitcoin network type
  coreNetwork: string; // Core Chain network type
  bitcoinRpc: string; // Bitcoin RPC endpoint
}

/**
 * Interface for stake parameters
 */
export type StakeParams = {
  amount: string; // Amount to stake
  lockTime: number; // Lock time for the transaction
  validatorAddress: string; // Validator's address
  rewardAddress: string; // Reward address
  type: RedeemScriptType; // Redeem script type
  witness?: boolean; // Whether to use witness
  publickey: string; // Public key of the signing private key
} & NetworkParams &
  FeeParams;

/**
 * Interface for sign stake parameters
 */
export type SignStakeParams = {
  unsignedRawTransaction: string; // Raw transaction as hex
  account: string; // Address address (signer)
  privateKey: string; // Private key
  bitcoinNetwork: string; // Bitcoin network type
  lockTime: number; // Lock time
}
/**
 * Sign a raw stake transaction
 */
export const signStakeTransaction = async ({ unsignedRawTransaction, account, privateKey, bitcoinNetwork, lockTime }: SignStakeParams) => {
  const network = bitcoinNetwork == "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
  const keyPair = ECPair.fromWIF(privateKey, network);

  let addressType = getAddressType(account, network);
  const psbtUnsigned = bitcoin.Psbt.fromHex(unsignedRawTransaction);
  
  
  if (addressType.includes("p2tr")) {
    const signer = keyPair.tweak(bitcoin.crypto.taggedHash("TapTweak", toXOnly(keyPair.publicKey)));
    psbtUnsigned.signAllInputs(signer);
  } else {
    psbtUnsigned.signAllInputs(keyPair);
  }

  if (!addressType.includes("p2tr") && !psbtUnsigned.validateSignaturesOfAllInputs(validatorSignature)) {
    throw new Error("signature is invalid");
  }

  psbtUnsigned.finalizeAllInputs();

  //const txId = await provider.broadcast(psbt.extractTransaction().toHex());
  
  let witness = false;
  const stakeAccount = getStakeAccount(privateKey, lockTime, witness, network);
  console.log("Stake account:", stakeAccount);
  console.log("Signed raw transaction:", psbtUnsigned.extractTransaction().toHex());
}
/**
 * Builds a stake transaction
 * @param {StakeParams} params - Stake parameters
 * @returns {Promise<{ txId: string; scriptAddress: string; cltvScript: string; }>} - Transaction ID, script address, and CLTV script
 */
export const buildStakeTransaction = async ({
  witness,
  lockTime,
  publickey,
  amount,
  validatorAddress,
  rewardAddress,
  bitcoinNetwork,
  coreNetwork,
  type,
  bitcoinRpc,
  fee,
}: StakeParams): Promise<{
  unsignedRawTransaction: string;
  scriptAddress: string;
  redeemScript: string;
}> => {
  const chainId = CoreChainNetworks[coreNetwork].chainId;
  const network = bitcoinNetwork == "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;

  const provider = new Provider({
    network,
    bitcoinRpc,
  });

  const bytesFee = await provider.getFeeRate(fee);
  const publicKeyBuffer = Buffer.from(publickey, 'hex');
  const keyPair = ECPair.fromPublicKey(publicKeyBuffer);
  // Generate P2WPKH address from the public key
  const { address } = bitcoin.payments.p2wpkh({ pubkey: publicKeyBuffer, network });
  if (!address) {
    throw new Error("Failed to generate P2WPKH address");
  }

  const account = address;

  let addressType = getAddressType(account, network);

  //We only support  P2PKH  P2WPKH P2SH-P2WPKH P2TR address
  let payment;
  if (addressType === "p2pkh") {
    payment = bitcoin.payments.p2pkh({
      pubkey: keyPair.publicKey,
      network,
    });
  } else if (addressType === "p2wpkh") {
    payment = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network,
    });
  } else if (addressType === "p2sh-p2wpkh") {
    payment = bitcoin.payments.p2sh({
      redeem: bitcoin.payments.p2wpkh({
        pubkey: keyPair.publicKey,
        network,
      }),
      network,
    });
  } else if (addressType === "p2tr") {
    bitcoin.initEccLib(ecc);
    payment = bitcoin.payments.p2tr({
      internalPubkey: toXOnly(keyPair.publicKey),
      network,
    });
  }

  if (!payment) {
    throw new Error("payment is undefined");
  }

  if (payment?.address !== account) {
    throw new Error("payment does not match the account.");
  }

  if (!payment.output) {
    throw new Error("failed to create redeem script");
  }

  const res = await provider.getUTXOs(account!);

  const rawTxMap: Record<string, string> = {};

  if (addressType === "p2pkh") {
    for (let i = 0; i < res.length; i++) {
      const utxo = res[i];
      if (!rawTxMap[utxo.txid]) {
        const hex = await provider.getRawTransaction(utxo.txid);
        rawTxMap[utxo.txid] = hex;
      }
    }
  }

  const utxos = res.map((utxo) => ({
    ...utxo,
    ...(addressType.includes("p2pkh") && {
      nonWitnessUtxo: Buffer.from(rawTxMap[utxo.txid], "hex"),
    }),
    ...((addressType.includes("p2wpkh") || addressType.includes("p2tr")) && {
      witnessUtxo: {
        script: addressType.includes("p2sh") ? payment!.redeem!.output! : payment!.output!,
        value: utxo.value,
      },
    }),
    ...(addressType.includes("p2sh") && {
      redeemScript: payment!.redeem!.output,
    }),
    ...(addressType.includes("p2tr") && {
      isTaproot: true,
    }),
    sequence: 0xffffffff - 1,
  }));

  //time lock script
  let redeemScript;

  //P2PKH
  if (type === RedeemScriptType.PUBLIC_KEY_HASH_SCRIPT) {
    redeemScript = CLTVScript.P2PKH({
      lockTime,
      pubkey: keyPair.publicKey,
    });
  } else {
    //P2PK
    redeemScript = CLTVScript.P2PK({
      lockTime,
      pubkey: keyPair.publicKey,
    });
  }

  const lockScript = (witness ? bitcoin.payments.p2wsh : bitcoin.payments.p2sh)({
    redeem: {
      output: redeemScript,
    },
    network,
  }).output;

  // Address for lock script
  const scriptAddress: string = bitcoin.address.fromOutputScript(lockScript!, network);

  const targets = [
    //time lock output
    {
      value: new Bignumber(amount).toNumber(),
      script: lockScript,
    },
    //OP_RETURN
    {
      script: buildOPReturnScript({
        chainId,
        validatorAddress,
        rewardAddress, // 20 bytes
        redeemScript: redeemScript.toString("hex"),
        coreFee: 0,
        isMultisig: false,
        lockTime,
        redeemScriptType: type,
      }),
      value: 0,
    },
  ];

  let { inputs, outputs } = coinSelect(utxos, targets, bytesFee, account);

  if (!inputs) {
    throw new Error("insufficient balance 2");
  }

  const psbt = new bitcoin.Psbt({
    network,
  });

  inputs?.forEach((input) =>
    psbt.addInput({
      hash: typeof input.txid === "string" ? input.txid : Buffer.from(input.txid),
      index: input.vout,
      ...(input.nonWitnessUtxo
        ? {
            nonWitnessUtxo: Buffer.from(input.nonWitnessUtxo),
          }
        : {}),
      ...(input.witnessUtxo
        ? {
            witnessUtxo: {
              script: Buffer.from(input.witnessUtxo.script),
              value: input.witnessUtxo.value,
            },
          }
        : {}),
      ...(input.redeemScript ? { redeemScript: Buffer.from(input.redeemScript) } : {}),
      ...(input.witnessScript ? { witnessScript: Buffer.from(input.witnessScript) } : {}),
      ...(input.isTaproot ? { tapInternalKey: payment!.internalPubkey } : {}),
    })
  );
  const changeAddress = account;
  outputs?.forEach((output) => {
    if (!output.address && !output.script) {
      output.address = changeAddress;
    }
    psbt.addOutput({
      ...(output.script ? { script: Buffer.from(output.script) } : { address: output.address! }),
      value: output.value ?? 0,
    });
  });

  const unsignedRawTransaction = psbt.toHex();

  //const txId = await provider.broadcast(psbt.extractTransaction().toHex());

  return {
    unsignedRawTransaction,
    scriptAddress,
    redeemScript: redeemScript.toString("hex"),
  };
};

/**
 * Interface for sign redeem parameters
 */
export type SignRedeemParams = {
  unsignedRawTransaction: string; // Raw transaction as hex
  privateKey: string; // Private key
  bitcoinNetwork: string; // Bitcoin network type
  lockTime: number; // Lock time
}

export const signRedeemTransaction = async ({ unsignedRawTransaction, privateKey, bitcoinNetwork, lockTime }: SignRedeemParams) => {
  const network = bitcoinNetwork == "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
  const keyPair = ECPair.fromWIF(privateKey, network);

  const psbtUnsigned = bitcoin.Psbt.fromHex(unsignedRawTransaction);

  psbtUnsigned.txInputs.forEach((input, idx) => {
    psbtUnsigned.signInput(idx, keyPair);
  });
 
  console.log("tx inputs length", psbtUnsigned.txInputs.length);

  if (!psbtUnsigned.validateSignaturesOfAllInputs(validatorSignature)) {
    throw new Error("signature is invalid");
  }

  psbtUnsigned.txInputs.forEach((input, idx) => {
    psbtUnsigned.finalizeInput(idx, finalCLTVScripts);
  });
  let witness = false;
  const stakeAccount = getStakeAccount(privateKey, lockTime, witness, network);
  
  console.log("Stake account:", stakeAccount);
  console.log("Signed raw transaction:", psbtUnsigned.extractTransaction().toHex());
}

/**
 * Interface for redeem parameters
 */
export type RedeemParams = {
  account: string; // Source address
  redeemScript: Buffer | string; // Redeem script
  destAddress: string; // Destination address
  bitcoinRpc: string; // Bitcoin RPC endpoint
} & FeeParams;

/**
 * Builds an unsigned redeem transaction
 * @param {RedeemParams} params - Redeem parameters
 * @returns {Promise<{ txId: string }>} - Transaction ID
 */
export const buildRedeemTransaction = async ({ account, redeemScript, destAddress, bitcoinRpc, fee }: RedeemParams) => {
  let network;
  let witness = false;

  if (account.length === 34 || account.length === 35) {
    const addr = bitcoin.address.fromBase58Check(account);
    network =
      addr.version === bitcoin.networks.bitcoin.pubKeyHash || addr.version === bitcoin.networks.bitcoin.scriptHash
        ? bitcoin.networks.bitcoin
        : bitcoin.networks.testnet;
  } else {
    const addr = bitcoin.address.fromBech32(account);
    network = addr.prefix === bitcoin.networks.bitcoin.bech32 ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
    witness = true;
  }

  const { options, type } = parseCLTVScript({
    witness,
    cltvScript: redeemScript,
  });

  const provider = new Provider({
    network,
    bitcoinRpc,
  });

  const bytesFee = await provider.getFeeRate(fee);

  //check private key with lock script
  const res = await provider.getUTXOs(account);

  const redeemScriptBuf = Buffer.from(redeemScript.toString("hex"), "hex");

  const script = (witness ? bitcoin.payments.p2wsh : bitcoin.payments.p2sh)({
    redeem: {
      output: redeemScriptBuf,
      network,
    },
    network,
  }).output;

  const rawTxMap: Record<string, string> = {};

  if (!witness) {
    for (let i = 0; i < res.length; i++) {
      const utxo = res[i];
      if (!rawTxMap[utxo.txid]) {
        const hex = await provider.getRawTransaction(utxo.txid);
        rawTxMap[utxo.txid] = hex;
      }
    }
  }

  const utxos = res.map((utxo) => ({
    ...utxo,
    ...(!witness && {
      nonWitnessUtxo: Buffer.from(rawTxMap[utxo.txid], "hex"),
    }),
    ...(witness && {
      witnessUtxo: {
        script: script!,
        value: utxo.value,
      },
    }),
    ...(!witness
      ? {
          redeemScript: redeemScriptBuf,
        }
      : {
          witnessScript: redeemScriptBuf,
        }),
  }));
  let { inputs, outputs } = split(
    utxos,
    [
      {
        address: destAddress,
      },
    ],
    bytesFee
  );

  if (!inputs) {
    throw new Error("insufficient balance 1");
  }

  if (!outputs) {
    throw new Error("failed to caculate transaction fee");
  }

  //Update transaction fee by re-caculating signatures
  let signatureSize = 0;
  inputs!.forEach(() => {
    if (type === RedeemScriptType.MULTI_SIG_SCRIPT && options.m && options.m >= 1) {
      signatureSize += (72 * options.m) / (witness ? 4 : 1);
    } else if (type === RedeemScriptType.PUBLIC_KEY_HASH_SCRIPT) {
      signatureSize += (72 + 66) / (witness ? 4 : 1);
    } else if (type === RedeemScriptType.PUBLIC_KEY_SCRIPT) {
      signatureSize += 72 / (witness ? 4 : 1);
    }
  });
  const signatureSizeFee = new Bignumber(signatureSize).multipliedBy(new Bignumber(bytesFee)).toNumber();

  if (outputs[0].value! < signatureSizeFee) {
    console.log("outputs[0].value", outputs[0].value);
    console.log("signatureSizeFee", signatureSizeFee);
    throw new Error("The value of the output is less than the signature size fee!");
  }

  outputs[0].value = Math.floor(outputs[0].value! - signatureSizeFee);

  const psbt = new bitcoin.Psbt({
    network,
  });

  psbt.setLocktime(options.lockTime);

  inputs?.forEach((input) =>
    psbt.addInput({
      hash: typeof input.txid === "string" ? input.txid : Buffer.from(input.txid),
      index: input.vout,
      ...(input.nonWitnessUtxo
        ? {
            nonWitnessUtxo: Buffer.from(input.nonWitnessUtxo),
          }
        : {}),
      ...(input.witnessUtxo
        ? {
            witnessUtxo: {
              script: Buffer.from(input.witnessUtxo.script),
              value: input.witnessUtxo.value,
            },
          }
        : {}),
      ...(input.redeemScript ? { redeemScript: Buffer.from(input.redeemScript) } : {}),
      ...(input.witnessScript ? { witnessScript: Buffer.from(input.witnessScript) } : {}),
      sequence: 0xffffffff - 1,
    })
  );

  outputs?.forEach((output) => {
    psbt.addOutput({
      ...(output.script ? { script: Buffer.from(output.script) } : { address: output.address! }),
      value: output.value ?? 0,
    });
  });



  //const txId = await provider.broadcast(psbt.extractTransaction().toHex());

  return {
    unsignedRawTransaction: psbt.toHex(),
  };
};


export const getStakeAccount = (
  privateKey: string,
  lockTime: number,
  witness: boolean,
  network: bitcoin.Network
) => {
  const keyPair = ECPair.fromWIF(privateKey, network);
  let redeemScript = CLTVScript.P2PKH({
    lockTime,
    pubkey: keyPair.publicKey,
  });
  const lockScript = (witness ? bitcoin.payments.p2wsh : bitcoin.payments.p2sh)({
    redeem: {
      output: redeemScript,
    },
    network,
  }).output;

  const scriptAddress: string = bitcoin.address.fromOutputScript(lockScript!, network);
  return scriptAddress;
}