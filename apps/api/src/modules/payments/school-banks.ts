/** Verified routing identities; provider acceptance is checked on the actual payout.
 * Sources: Xendit V3 payout guide (BDO), BPI correspondent-bank guide,
 * Metrobank correspondent-bank directory. Do not infer account ownership here.
 */
export const schoolBanks = [
  { code: 'BNORPHMM', name: 'BDO Unibank' },
  { code: 'BOPIPHMM', name: 'Bank of the Philippine Islands (BPI)' },
  { code: 'MBTCPHMM', name: 'Metrobank' },
] as const
