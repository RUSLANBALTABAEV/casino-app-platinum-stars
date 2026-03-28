export interface LotteryDistributionDefinition {
  place: number;
  share: number;
}

export interface LotteryPoolDefinition {
  id: string;
  name: string;
  participantLimit: number;
  ticketCost: number;
  prizePercent: number;
  distribution: LotteryDistributionDefinition[];
}

export interface LotteryConfig {
  pools: LotteryPoolDefinition[];
}

export function getDefaultLotteryConfig(): LotteryConfig {
  return {
    pools: [
      {
        id: 'nova-10',
        name: 'Nova 10',
        participantLimit: 10,
        ticketCost: 5,
        prizePercent: 0.82,
        distribution: [
          { place: 1, share: 0.7 },
          { place: 2, share: 0.3 }
        ]
      },
      {
        id: 'quantum-15',
        name: 'Quantum 15',
        participantLimit: 15,
        ticketCost: 9,
        prizePercent: 0.88,
        distribution: [
          { place: 1, share: 0.6 },
          { place: 2, share: 0.25 },
          { place: 3, share: 0.15 }
        ]
      },
      {
        id: 'apex-25',
        name: 'Apex 25',
        participantLimit: 25,
        ticketCost: 12,
        prizePercent: 0.9,
        distribution: [
          { place: 1, share: 0.5 },
          { place: 2, share: 0.25 },
          { place: 3, share: 0.15 },
          { place: 4, share: 0.1 }
        ]
      }
    ]
  };
}











