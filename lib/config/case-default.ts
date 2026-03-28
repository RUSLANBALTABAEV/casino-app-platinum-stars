export interface CaseItemDefinition {
  id: string;
  name: string;
  rarity: string;
  weight: number;
  chance?: number;
  color?: string;
  stars?: number;
  description?: string;
  nftGiftId?: string;
}

export interface CaseDefinition {
  id: string;
  name: string;
  price: number;
  currency?: 'STARS' | 'BONUS';
  description?: string;
  badge?: string;
  artwork?: string;
  items: CaseItemDefinition[];
}

export interface CaseGameConfig {
  cases: CaseDefinition[];
}

export const DEFAULT_CASES_CONFIG: CaseGameConfig = {
  cases: [
    {
      id: 'astro',
      name: 'Astro Explorer',
      artwork: '/chests/chest_1.png',
      badge: 'Legendary Drop',
      price: 120,
      description:
        'Соберите экипировку первооткрывателя и найдите легендарные артефакты галактики.',
      items: [
        {
          id: 'astro-helm',
          name: 'Шлем пионера',
          rarity: 'Эпический',
          weight: 6,
          chance: 6,
          color: '#c084fc'
        },
        {
          id: 'astro-cloak',
          name: 'Плащ кометы',
          rarity: 'Редкий',
          weight: 14,
          chance: 14,
          color: '#38bdf8'
        },
        {
          id: 'astro-magnetar',
          name: 'Карманный магнитар',
          rarity: 'Легендарный',
          weight: 2,
          chance: 2,
          color: '#fbbf24'
        },
        {
          id: 'astro-compass',
          name: 'Астро-компас',
          rarity: 'Необычный',
          weight: 22,
          chance: 22,
          color: '#60a5fa'
        },
        {
          id: 'astro-dust',
          name: 'Пыль звёзд',
          rarity: 'Обычный',
          weight: 56,
          chance: 56,
          color: '#f4f4f5'
        }
      ]
    },
    {
      id: 'nova',
      name: 'Nova Elite',
      artwork: '/chests/chest_2.png',
      badge: 'Premier Club',
      price: 220,
      description: 'Премиум-набор для лидеров сезонов. Бонусы и увеличенные звёздные призы.',
      items: [
        {
          id: 'nova-emblem',
          name: 'Знак Новы',
          rarity: 'Легендарный',
          weight: 4,
          chance: 4,
          color: '#f97316'
        },
        {
          id: 'nova-booster',
          name: 'Звёздный бустер',
          rarity: 'Эпический',
          weight: 10,
          chance: 10,
          color: '#c084fc'
        },
        {
          id: 'nova-stars-500',
          name: '500 ★',
          rarity: 'Редкий',
          weight: 16,
          chance: 16,
          color: '#facc15',
          stars: 500
        },
        {
          id: 'nova-stars-200',
          name: '200 ★',
          rarity: 'Необычный',
          weight: 28,
          chance: 28,
          color: '#fde68a',
          stars: 200
        },
        {
          id: 'nova-stars-95',
          name: '95 ★',
          rarity: 'Обычный',
          weight: 42,
          chance: 42,
          color: '#fff7ed',
          stars: 95
        }
      ]
    },
    {
      id: 'guardian',
      name: 'Guardian Arsenal',
      artwork: '/chests/chest_3.png',
      badge: 'Arena Gear',
      price: 160,
      description: 'Снаряжение защитника арен: усилители защиты и редкие жетоны.',
      items: [
        {
          id: 'guardian-shield',
          name: 'Щит света',
          rarity: 'Эпический',
          weight: 8,
          chance: 8,
          color: '#22d3ee'
        },
        {
          id: 'guardian-drone',
          name: 'Армейский дрон',
          rarity: 'Редкий',
          weight: 18,
          chance: 18,
          color: '#38bdf8'
        },
        {
          id: 'guardian-token',
          name: 'Жетон арены',
          rarity: 'Редкий',
          weight: 20,
          chance: 20,
          color: '#a5b4fc'
        },
        {
          id: 'guardian-stim',
          name: 'Боевой стим',
          rarity: 'Необычный',
          weight: 24,
          chance: 24,
          color: '#f4f4f5'
        },
        {
          id: 'guardian-stars-75',
          name: '75 ★',
          rarity: 'Обычный',
          weight: 30,
          chance: 30,
          color: '#fde68a',
          stars: 75
        }
      ]
    },
    {
      id: 'starlounge',
      name: 'Star Lounge',
      artwork: '/chests/chest_4.png',
      badge: 'Daily Mix',
      price: 90,
      description: 'Кейс для быстрого пополнения коллекции и бонусов на ежедневные миссии.',
      items: [
        {
          id: 'lounge-avatar',
          name: 'Аватар премиум',
          rarity: 'Редкий',
          weight: 12,
          chance: 12,
          color: '#fbbf24'
        },
        {
          id: 'lounge-ticket',
          name: 'Билет лотереи',
          rarity: 'Необычный',
          weight: 20,
          chance: 20,
          color: '#60a5fa'
        },
        {
          id: 'lounge-stars-45',
          name: '45 ★',
          rarity: 'Обычный',
          weight: 40,
          chance: 40,
          color: '#fde68a',
          stars: 45
        },
        {
          id: 'lounge-stars-25',
          name: '25 ★',
          rarity: 'Обычный',
          weight: 28,
          chance: 28,
          color: '#fef3c7',
          stars: 25
        }
      ]
    },
    {
      id: 'nebula',
      name: 'Nebula Mirage',
      artwork: '/chests/chest_5.png',
      badge: 'Seasonal',
      price: 140,
      description: 'Ротация сезонных эффектов и визуальных улучшений.',
      items: [
        {
          id: 'nebula-trail',
          name: 'След туманности',
          rarity: 'Эпический',
          weight: 7,
          chance: 7,
          color: '#a855f7'
        },
        {
          id: 'nebula-frame',
          name: 'Рамка профиля «Nebula»',
          rarity: 'Редкий',
          weight: 16,
          chance: 16,
          color: '#6366f1'
        },
        {
          id: 'nebula-boost',
          name: 'Буст +10% к заданиям',
          rarity: 'Необычный',
          weight: 26,
          chance: 26,
          color: '#38bdf8'
        },
        {
          id: 'nebula-stars-60',
          name: '60 ★',
          rarity: 'Обычный',
          weight: 32,
          chance: 32,
          color: '#fde68a',
          stars: 60
        },
        {
          id: 'nebula-stars-30',
          name: '30 ★',
          rarity: 'Обычный',
          weight: 19,
          chance: 19,
          color: '#fef08a',
          stars: 30
        }
      ]
    },
    {
      id: 'quantum',
      name: 'Quantum Vault',
      artwork: '/chests/chest_6.png',
      badge: 'Mythic Drop',
      price: 260,
      description: 'Эксклюзивные предметы и шанс на крупный выигрыш звезд.',
      items: [
        {
          id: 'quantum-core',
          name: 'Квантовое ядро',
          rarity: 'Мифический',
          weight: 1.5,
          chance: 1.5,
          color: '#fde047'
        },
        {
          id: 'quantum-emote',
          name: 'Эмоция «Гравитация»',
          rarity: 'Легендарный',
          weight: 4,
          chance: 4,
          color: '#fb7185'
        },
        {
          id: 'quantum-stars-1000',
          name: '1 000 ★',
          rarity: 'Легендарный',
          weight: 6,
          chance: 6,
          color: '#facc15',
          stars: 1000
        },
        {
          id: 'quantum-stars-400',
          name: '400 ★',
          rarity: 'Редкий',
          weight: 18,
          chance: 18,
          color: '#fde68a',
          stars: 400
        },
        {
          id: 'quantum-stars-180',
          name: '180 ★',
          rarity: 'Необычный',
          weight: 24,
          chance: 24,
          color: '#fef08a',
          stars: 180
        },
        {
          id: 'quantum-module',
          name: 'Модуль ускорения',
          rarity: 'Редкий',
          weight: 18.5,
          chance: 18.5,
          color: '#22d3ee'
        }
      ]
    },
    {
      id: 'eclipse',
      name: 'Eclipse Forge',
      artwork: '/chests/chest_1.png',
      badge: 'Epic Craft',
      price: 180,
      description: 'Коллекция из темной материи: скины и бусты для режима Раннер.',
      items: [
        {
          id: 'eclipse-skin',
          name: 'Скин «Лунная тень»',
          rarity: 'Легендарный',
          weight: 3,
          chance: 3,
          color: '#a855f7'
        },
        {
          id: 'eclipse-trail',
          name: 'Трассер «Eclipse»',
          rarity: 'Эпический',
          weight: 9,
          chance: 9,
          color: '#6366f1'
        },
        {
          id: 'eclipse-boost',
          name: 'Буст +20% к раннеру',
          rarity: 'Редкий',
          weight: 22,
          chance: 22,
          color: '#38bdf8'
        },
        {
          id: 'eclipse-stars-120',
          name: '120 ★',
          rarity: 'Необычный',
          weight: 28,
          chance: 28,
          color: '#fde68a',
          stars: 120
        },
        {
          id: 'eclipse-stars-70',
          name: '70 ★',
          rarity: 'Обычный',
          weight: 38,
          chance: 38,
          color: '#fef08a',
          stars: 70
        }
      ]
    },
    {
      id: 'aurora',
      name: 'Aurora Harmony',
      artwork: '/chests/chest_2.png',
      badge: 'Support Pack',
      price: 110,
      description: 'Комбо из промо-ускорителей, рефералок и тематических аксессуаров.',
      items: [
        {
          id: 'aurora-promo',
          name: 'Промо-буст на 24 часа',
          rarity: 'Редкий',
          weight: 18,
          chance: 18,
          color: '#60a5fa'
        },
        {
          id: 'aurora-referral',
          name: 'Реферальный ваучер',
          rarity: 'Необычный',
          weight: 26,
          chance: 26,
          color: '#34d399'
        },
        {
          id: 'aurora-stars-80',
          name: '80 ★',
          rarity: 'Обычный',
          weight: 34,
          chance: 34,
          color: '#fde68a',
          stars: 80
        },
        {
          id: 'aurora-stars-40',
          name: '40 ★',
          rarity: 'Обычный',
          weight: 22,
          chance: 22,
          color: '#fef9c3',
          stars: 40
        }
      ]
    },
    {
      id: 'bonus-snow',
      name: 'Bonus Snowfall',
      artwork: '/chests/chest_4.png',
      badge: 'Bonus Case',
      price: 35,
      currency: 'BONUS',
      description: 'Открывается за бонусные монеты и может принести подарки Telegram.',
      items: [
        {
          id: 'bonus-stars-60',
          name: '60 ★',
          rarity: 'Редкий',
          weight: 30,
          chance: 30,
          color: '#facc15',
          stars: 60
        },
        {
          id: 'bonus-gift-snow',
          name: 'Подарок «Снежная искра»',
          rarity: 'Эпический',
          weight: 10,
          chance: 10,
          color: '#38bdf8',
          nftGiftId: 'gift-snowflake'
        },
        {
          id: 'bonus-gift-comet',
          name: 'Подарок «Комета»',
          rarity: 'Легендарный',
          weight: 3,
          chance: 3,
          color: '#fbbf24',
          nftGiftId: 'gift-comet'
        },
        {
          id: 'bonus-stars-25',
          name: '25 ★',
          rarity: 'Обычный',
          weight: 57,
          chance: 57,
          color: '#fde68a',
          stars: 25
        }
      ]
    }
  ]
};

export function getDefaultCaseConfig(): CaseGameConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CASES_CONFIG)) as CaseGameConfig;
}









