'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedUsers() {
  const demoUsers = [
    {
      telegramId: 821000001n,
      username: 'demo_runner',
      firstName: 'Ирина',
      lastName: 'Раннер',
      languageCode: 'ru',
      status: 'STANDARD',
      statusExpiresAt: null,
      isBanned: false,
      balance: {
        available: 1250,
        reserved: 120,
        lifetimeEarn: 1800,
        lifetimeSpend: 550
      },
      transactions: [
        {
          type: 'DEPOSIT',
          amount: 500,
          currency: 'RUB',
          provider: 'YOOKASSA',
          status: 'COMPLETED',
          meta: { source: 'seed' }
        },
        {
          type: 'REWARD',
          amount: 250,
          currency: 'STARS',
          provider: 'MANUAL',
          status: 'COMPLETED',
          meta: { task: 'welcome-quest' }
        }
      ]
    },
    {
      telegramId: 821000002n,
      username: 'vip_player',
      firstName: 'Андрей',
      lastName: 'Премиум',
      languageCode: 'ru',
      status: 'PREMIUM',
      statusExpiresAt: new Date(Date.now() + 14 * 24 * 3600_000),
      isBanned: false,
      balance: {
        available: 3600,
        reserved: 420,
        lifetimeEarn: 5400,
        lifetimeSpend: 1600
      },
      transactions: [
        {
          type: 'DEPOSIT',
          amount: 1990,
          currency: 'RUB',
          provider: 'YOOKASSA',
          status: 'COMPLETED',
          meta: { bundle: 'premium' }
        },
        {
          type: 'REWARD',
          amount: 500,
          currency: 'STARS',
          provider: 'TELEGRAM_STARS',
          status: 'COMPLETED',
          meta: { referralCode: 'WELCOME100' }
        }
      ]
    },
    {
      telegramId: 821000003n,
      username: 'sanctioned_user',
      firstName: 'Мария',
      lastName: 'Мутная',
      languageCode: 'ru',
      status: 'STANDARD',
      statusExpiresAt: null,
      isBanned: true,
      balance: {
        available: 150,
        reserved: 0,
        lifetimeEarn: 450,
        lifetimeSpend: 300
      },
      transactions: [
        {
          type: 'WITHDRAWAL',
          amount: 300,
          currency: 'STARS',
          provider: 'MANUAL',
          status: 'FAILED',
          meta: { reason: 'fraud_check' }
        }
      ]
    }
  ];

  for (const entry of demoUsers) {
    const {
      telegramId,
      username,
      firstName,
      lastName,
      languageCode,
      status,
      statusExpiresAt,
      isBanned,
      balance,
      transactions
    } = entry;

    const user = await prisma.user.upsert({
      where: { telegramId },
      update: {
        username,
        firstName,
        lastName,
        languageCode,
        status,
        statusExpiresAt,
        isPremium: status === 'PREMIUM',
        isBanned
      },
      create: {
        telegramId,
        username,
        firstName,
        lastName,
        languageCode,
        status,
        statusExpiresAt,
        isPremium: status === 'PREMIUM',
        isBanned
      }
    });

    await prisma.starBalance.upsert({
      where: { userId: user.id },
      update: {
        available: balance.available,
        reserved: balance.reserved,
        lifetimeEarn: balance.lifetimeEarn,
        lifetimeSpend: balance.lifetimeSpend,
        bonusAvailable: 0,
        bonusReserved: 0,
        bonusLifetimeEarn: 0,
        bonusLifetimeSpend: 0
      },
      create: {
        userId: user.id,
        available: balance.available,
        reserved: balance.reserved,
        lifetimeEarn: balance.lifetimeEarn,
        lifetimeSpend: balance.lifetimeSpend,
        bonusAvailable: 0,
        bonusReserved: 0,
        bonusLifetimeEarn: 0,
        bonusLifetimeSpend: 0
      }
    });

    for (const [index, tx] of (transactions ?? []).entries()) {
      const txId = `seed-${user.id}-${index}`;
      await prisma.transaction.upsert({
        where: { id: txId },
        update: {},
        create: {
          id: txId,
          userId: user.id,
          type: tx.type,
          amount: tx.amount,
          currency: tx.currency ?? 'RUB',
          provider: tx.provider,
          status: tx.status,
          meta: tx.meta ?? {}
        }
      });
    }
  }
}

async function seedSystemSettings() {
  const economyConfig = {
    exchangeRates: {
      STAR_TO_RUB: 0.2,
      STAR_TO_USD: 0.003,
      STAR_TO_EUR: 0.0027
    },
    paymentOptions: [
      {
        id: 'starter',
        stars: 500,
        amount: 99,
        currency: 'RUB',
        label: '500 ★',
        caption: 'Быстрый старт'
      },
      {
        id: 'booster',
        stars: 1200,
        amount: 199,
        currency: 'RUB',
        label: '1 200 ★',
        caption: 'Популярный выбор'
      },
      {
        id: 'vip',
        stars: 2500,
        amount: 349,
        currency: 'RUB',
        label: '2 500 ★',
        caption: 'Для активных игроков'
      },
      {
        id: 'ultra',
        stars: 5000,
        amount: 599,
        currency: 'RUB',
        label: '5 000 ★',
        caption: 'Максимальный буст'
      }
    ],
    customPurchase: {
      minStars: 100,
      maxStars: 50000,
      rubPerStar: 0.2
    },
    telegramPurchase: {
      minStars: 10,
      maxStars: 50000,
      presets: [100, 250, 500, 1000]
    }
  };

  await prisma.systemSetting.upsert({
    where: { key: 'economy:config' },
    create: {
      key: 'economy:config',
      value: economyConfig,
      description: 'Базовая конфигурация экономики и вариантов пополнения'
    },
    update: {
      value: economyConfig,
      description: 'Базовая конфигурация экономики и вариантов пополнения'
    }
  });

  await prisma.systemSetting.upsert({
    where: { key: 'referral:reward' },
    create: {
      key: 'referral:reward',
      value: 50,
      description: 'Размер бонуса за активированного приглашённого (в звёздах)'
    },
    update: {
      value: 50,
      description: 'Размер бонуса за активированного приглашённого (в звёздах)'
    }
  });
}

async function seedStatusPlans() {
  const plans = [
    {
      slug: 'standard',
      name: 'Стандарт',
      description: 'Базовый уровень без ограничений.',
      tier: 'STANDARD',
      price: 0,
      currency: 'RUB',
      durationDays: null,
      benefits: {
        perks: ['Доступ к заданиям', 'Участие в играх'],
        limits: ['Без ускорителей наград']
      },
      isActive: true
    },
    {
      slug: 'premium',
      name: 'Премиум',
      description: 'Расширенные привилегии и ускоренный прогресс.',
      tier: 'PREMIUM',
      price: 399,
      currency: 'RUB',
      durationDays: 30,
      benefits: {
        multipliers: ['+15% к наградам', 'Ускоренное подтверждение заданий'],
        exclusives: ['Премиум-аватар', 'Закрытые турниры']
      },
      isActive: true
    }
  ];

  for (const plan of plans) {
    const { slug, ...data } = plan;
    await prisma.statusPlan.upsert({
      where: { slug },
      create: { slug, ...data },
      update: data
    });
  }
}

async function seedGameSettings() {
  const gameConfigs = [
    {
      gameType: 'RUNNER',
      key: 'config',
      value: {
        attemptCost: 25,
        rewardPer100: 12,
        streakBonus: 20
      }
    },
    {
      gameType: 'ROULETTE',
      key: 'config',
      value: {
        spinCost: 15,
        multipliers: [2, 5, 10, 25],
        jackpotChance: 0.5
      }
    },
    {
      gameType: 'LOTTERY',
      key: 'config',
      value: {
        pools: [
          { name: 'Daily', ticketCost: 10, jackpot: 500 },
          { name: 'Weekly', ticketCost: 25, jackpot: 2500 }
        ]
      }
    }
  ];

  for (const config of gameConfigs) {
    const { gameType, key, value } = config;
    await prisma.gameSetting.upsert({
      where: {
        gameType_key: {
          gameType,
          key
        }
      },
      create: {
        gameType,
        key,
        value
      },
      update: {
        value
      }
    });
  }
}

async function seedPromoCodes() {
  const promoCodes = [
    {
      code: 'WELCOME100',
      description: 'Подарок за первое открытие мини-приложения',
      starReward: 100,
      bonusPercent: 0,
      isActive: true
    },
    {
      code: 'PREMIUMTRIAL',
      description: 'Пробный премиум-набор',
      starReward: 0,
      bonusPercent: 0,
      grantsStatus: 'PREMIUM',
      statusDurationDays: 7,
      isActive: true
    }
  ];

  for (const promo of promoCodes) {
    const { code, ...data } = promo;
    await prisma.promoCode.upsert({
      where: { code },
      create: { code, ...data },
      update: data
    });
  }
}

async function seedTasks() {
  const tasks = [
    {
      slug: 'welcome-quest',
      title: 'Приветственный квест',
      description: 'Пройди обучение и узнай, как устроена экономика приложения.',
      reward: 150,
      sponsorLink: null,
      requiredProof: false,
      isActive: true
    },
    {
      slug: 'share-friend',
      title: 'Пригласи друга',
      description: 'Поделись мини-приложением и попроси друга ввести твой реферальный код.',
      reward: 200,
      sponsorLink: null,
      requiredProof: true,
      isActive: true
    },
    {
      slug: 'daily-bonus',
      title: 'Ежедневный бонус',
      description: 'Заходи каждый день и забирай гарантированную награду.',
      reward: 50,
      sponsorLink: null,
      requiredProof: false,
      isActive: true
    }
  ];

  for (const task of tasks) {
    const { slug, ...data } = task;
    await prisma.task.upsert({
      where: { slug },
      create: { slug, ...data },
      update: data
    });
  }
}

async function seedNftGifts() {
  const gifts = [
    {
      id: 'gift-snowflake',
      name: 'Снежная искра',
      rarity: 'Эпический',
      description: 'Коллекционный новогодний подарок',
      imageUrl: '/gifts/snowflake.svg',
      telegramGiftId: 'snowflake',
      isActive: true
    },
    {
      id: 'gift-comet',
      name: 'Комета',
      rarity: 'Легендарный',
      description: 'Редкий анимированный подарок',
      imageUrl: '/gifts/comet.svg',
      telegramGiftId: 'comet',
      isActive: true
    }
  ];

  for (const gift of gifts) {
    const { id, ...data } = gift;
    await prisma.nftGift.upsert({
      where: { id },
      create: { id, ...data },
      update: data
    });
  }
}

async function main() {
  console.info('🌱 Seeding database with baseline data...');
  await seedUsers();
  await seedSystemSettings();
  await seedStatusPlans();
  await seedGameSettings();
  await seedPromoCodes();
  await seedTasks();
  await seedNftGifts();
  console.info('✅ Seed completed successfully.');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
