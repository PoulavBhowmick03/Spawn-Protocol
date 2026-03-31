/**
 * Filecoin Synapse Payment Setup
 * Deposits USDFC + approves the Warm Storage service operator.
 * Run once before starting the swarm: npx tsx setup-filecoin.ts
 */

import 'dotenv/config';
import { Synapse, calibration } from '@filoz/synapse-sdk';
import { http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const MIN_REQUIRED = 160_000_000_000_000_000n; // 0.16 USDFC minimum

const key = process.env.FILECOIN_PRIVATE_KEY;
if (!key) { console.error('FILECOIN_PRIVATE_KEY not set'); process.exit(1); }

const privateKey = key.startsWith('0x') ? key as `0x${string}` : `0x${key}` as `0x${string}`;
const account = privateKeyToAccount(privateKey);
const rpcUrl = process.env.FILECOIN_RPC_URL || 'https://api.calibration.node.glif.io/rpc/v1';
const fmt = (n: bigint) => `${(Number(n) / 1e18).toFixed(4)} USDFC`;

console.log(`Wallet:  ${account.address}`);
console.log(`Network: Filecoin Calibration Testnet (chain 314159)\n`);

const synapse = await Synapse.create({
  chain: calibration,
  transport: http(rpcUrl),
  account,
  source: 'spawn-protocol',
});

const contractBal = await synapse.payments.balance() as bigint;
console.log(`Contract USDFC balance: ${fmt(contractBal)}`);

if (contractBal < MIN_REQUIRED) {
  console.error(`Insufficient contract balance (${fmt(contractBal)}). Run setup again or deposit manually.`);
  process.exit(1);
}

// Check + approve the Warm Storage service as payment operator
console.log('\nChecking service approval...');
try {
  const approval = await synapse.payments.serviceApproval();
  console.log('Current service approval:', approval);

  if (!approval || (approval as any).isApproved === false || (approval as any).rateAllowance === 0n) {
    console.log('Approving Warm Storage service as payment operator...');
    const hash = await synapse.payments.approveService();
    console.log(`  approveService tx: ${hash}`);
    await new Promise(r => setTimeout(r, 8000)); // wait for confirmation
  } else {
    console.log('Service already approved.');
  }
} catch (err: any) {
  // If serviceApproval() errors (not yet approved), just call approveService()
  console.log(`serviceApproval check: ${err?.message?.slice(0, 60)}`);
  console.log('Approving Warm Storage service...');
  try {
    const hash = await synapse.payments.approveService();
    console.log(`  approveService tx: ${hash}`);
    await new Promise(r => setTimeout(r, 8000));
  } catch (approveErr: any) {
    console.error(`approveService failed: ${approveErr?.message?.slice(0, 120)}`);
    process.exit(1);
  }
}

console.log('\nSetup complete — Filecoin storage is ready.');
console.log('Run: npx tsx test-filecoin.ts to verify');
