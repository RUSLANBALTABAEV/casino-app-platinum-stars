#!/usr/bin/env python3
"""
Скрипт для получения chat_id канала Telegram.

Использование:
1. Добавьте бота как администратора в канал
2. Отправьте любое сообщение в канал
3. Запустите этот скрипт: python get_channel_id.py
4. Скрипт покажет chat_id канала
"""

import os
import sys
import asyncio
from aiogram import Bot
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
if not BOT_TOKEN:
    print("Ошибка: TELEGRAM_BOT_TOKEN не установлен в .env")
    sys.exit(1)

async def get_channel_id():
    bot = Bot(token=BOT_TOKEN)
    
    try:
        # Получаем последние обновления
        updates = await bot.get_updates(limit=10)
        
        print("Поиск каналов в последних обновлениях...")
        print("-" * 50)
        
        found_channels = []
        
        for update in updates:
            if update.channel_post:
                chat = update.channel_post.chat
                chat_id = chat.id
                chat_title = chat.title or "Без названия"
                chat_username = getattr(chat, 'username', None)
                
                channel_info = {
                    'id': chat_id,
                    'title': chat_title,
                    'username': chat_username
                }
                
                if channel_info not in found_channels:
                    found_channels.append(channel_info)
                    print(f"Канал найден:")
                    print(f"  Название: {chat_title}")
                    if chat_username:
                        print(f"  Username: @{chat_username}")
                    print(f"  Chat ID: {chat_id}")
                    print("-" * 50)
        
        if not found_channels:
            print("Каналы не найдены в последних обновлениях.")
            print("\nПопробуйте:")
            print("1. Добавьте бота как администратора в канал")
            print("2. Отправьте любое сообщение в канал")
            print("3. Запустите скрипт снова")
        else:
            print(f"\nНайдено каналов: {len(found_channels)}")
            print("\nИспользуйте chat_id в переменной окружения RECEIPTS_CHANNEL_ID")
            
    except Exception as e:
        print(f"Ошибка: {e}")
    finally:
        await bot.session.close()

if __name__ == "__main__":
    asyncio.run(get_channel_id())




