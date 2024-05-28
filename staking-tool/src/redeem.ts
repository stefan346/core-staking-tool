import { buildRedeemTransaction, RedeemParams } from "./transaction";

export const redeem = async ({
  account,
  redeemScript,
  destAddress,
  bitcoinRpc = "mempool",
  fee = "avg",
}: RedeemParams) => {
  if (!account) {
    throw new Error("account should not be empty");
  }

  if (!redeemScript) {
    throw new Error("redeemScript should not be empty");
  }

  if (!destAddress) {
    throw new Error("destAddress should not be empty");
  }

  const { unsignedRawTransaction } = await buildRedeemTransaction({
    account,
    redeemScript,
    destAddress,
    bitcoinRpc,
    fee,
  });
  console.log(`Unsigned raw transaction: ${unsignedRawTransaction}`);
};
