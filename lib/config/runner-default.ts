export interface RunnerPayoutDefinition {
  threshold: number;
  reward: number;
  label?: string;
}

export interface RunnerConfig {
  attemptCost: number;
  payouts: RunnerPayoutDefinition[];
  freeAttemptsPerDay?: number;
  cooldownSeconds?: number;
}

export function getDefaultRunnerConfig(): RunnerConfig {
  return {
    attemptCost: 6,
    freeAttemptsPerDay: 1,
    cooldownSeconds: 45,
    payouts: [
      { threshold: 900, reward: 6, label: 'Разогрев' },
      { threshold: 1400, reward: 14, label: 'Гиперразгон' },
      { threshold: 2000, reward: 30, label: 'Луч сезона' },
      { threshold: 2600, reward: 55, label: 'Сверхновая' }
    ]
  };
}











