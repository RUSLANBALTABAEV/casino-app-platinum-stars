export type RouletteRewardType = 'stars' | 'item';

export interface RoulettePrizeDefinition {
  id: string;
  name: string;
  rewardType: RouletteRewardType;
  value: number;
  weight: number;
  description?: string;
  primary: string;
  secondary: string;
}

export type RouletteVariant = 'wheel' | 'slots';

export interface RouletteConfig {
  spinCost: number;
  variant: RouletteVariant;
  sectors: RoulettePrizeDefinition[];
  slots?: {
    stakeOptions: number[];
    compoundPercent: number;
    nftChance: number;
    nftGiftIds?: string[];
  };
}

export function getDefaultRouletteConfig(): RouletteConfig {
  return {
    spinCost: 12,
    variant: 'wheel',
    slots: {
      stakeOptions: [10, 25, 50, 100],
      compoundPercent: 8,
      nftChance: 2,
      nftGiftIds: ['gift-snowflake', 'gift-comet']
    },
    sectors: [
      {
        id: 'stars-25',
        name: '25 ★',
        rewardType: 'stars',
        value: 25,
        weight: 1.1,
        description: 'Звёздная горсть',
        primary: 'rgba(212,175,55,0.95)',
        secondary: 'rgba(212,175,55,0.45)'
      },
      {
        id: 'item-neon-cards',
        name: 'Аксессуар: Неоновые карты',
        rewardType: 'item',
        value: 0,
        weight: 0.7,
        description: 'Коллекционный предмет',
        primary: 'rgba(99,102,241,0.8)',
        secondary: 'rgba(129,140,248,0.45)'
      },
      {
        id: 'stars-60',
        name: '60 ★',
        rewardType: 'stars',
        value: 60,
        weight: 1,
        description: 'Средний выигрыш',
        primary: 'rgba(212,175,55,0.92)',
        secondary: 'rgba(212,175,55,0.34)'
      },
      {
        id: 'item-golden-vortex',
        name: 'Эмблема: Золотой вихрь',
        rewardType: 'item',
        value: 0,
        weight: 0.6,
        description: 'Редкий визуальный эффект',
        primary: 'rgba(56,189,248,0.85)',
        secondary: 'rgba(14,165,233,0.45)'
      },
      {
        id: 'stars-120',
        name: '120 ★',
        rewardType: 'stars',
        value: 120,
        weight: 0.85,
        description: 'Увесистый приз',
        primary: 'rgba(212,175,55,0.98)',
        secondary: 'rgba(234,179,8,0.45)'
      },
      {
        id: 'item-lucky-charm',
        name: 'Талисман удачи',
        rewardType: 'item',
        value: 0,
        weight: 0.55,
        description: '+15% к бонусам на 6 часов',
        primary: 'rgba(244,114,182,0.75)',
        secondary: 'rgba(249,168,212,0.32)'
      },
      {
        id: 'stars-16',
        name: '16 ★',
        rewardType: 'stars',
        value: 16,
        weight: 1.3,
        description: 'Минорный приз',
        primary: 'rgba(212,175,55,0.72)',
        secondary: 'rgba(212,175,55,0.28)'
      },
      {
        id: 'item-platinum-set',
        name: 'Коллекция: Платиновый сет',
        rewardType: 'item',
        value: 0,
        weight: 0.45,
        description: 'Набор аксессуаров',
        primary: 'rgba(74,222,128,0.78)',
        secondary: 'rgba(34,197,94,0.32)'
      },
      {
        id: 'stars-200',
        name: '200 ★',
        rewardType: 'stars',
        value: 200,
        weight: 0.7,
        description: 'Почти джекпот',
        primary: 'rgba(212,175,55,0.99)',
        secondary: 'rgba(253,224,71,0.55)'
      },
      {
        id: 'item-casino-heart',
        name: 'Артефакт: Сердце казино',
        rewardType: 'item',
        value: 0,
        weight: 0.28,
        description: 'Легендарный предмет',
        primary: 'rgba(249,115,22,0.82)',
        secondary: 'rgba(251,191,36,0.38)'
      },
      {
        id: 'stars-8',
        name: '8 ★',
        rewardType: 'stars',
        value: 8,
        weight: 1.4,
        description: 'Минорный приз',
        primary: 'rgba(212,175,55,0.6)',
        secondary: 'rgba(212,175,55,0.24)'
      },
      {
        id: 'stars-500',
        name: 'Jackpot: 500 ★',
        rewardType: 'stars',
        value: 500,
        weight: 0.2,
        description: 'Главный приз',
        primary: 'rgba(251,191,36,0.95)',
        secondary: 'rgba(255,255,210,0.62)'
      }
    ]
  };
}










