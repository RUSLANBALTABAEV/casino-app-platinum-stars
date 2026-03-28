"""
Python Telegram bot powered by aiogram.

The bot syncs Telegram users with the mini-app backend, exposes helper commands,
and routes promo-code logic through REST endpoints.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, Optional

import aiohttp
from aiohttp import web as aio_web
from aiogram import Bot, Dispatcher, F
from aiogram.exceptions import TelegramBadRequest
from aiogram.client.default import DefaultBotProperties
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    CallbackQuery,
    BotCommand,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
    SuccessfulPayment,
    PreCheckoutQuery,
)
from dotenv import load_dotenv

load_dotenv()

def ensure_https(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    trimmed = url.strip()
    if not trimmed:
        return None
    if trimmed.startswith(("http://", "https://")):
        return trimmed
    return f"https://{trimmed.lstrip('/')}"


DEFAULT_MINI_APP_URL = None

def is_valid_webapp_url(url: Optional[str]) -> bool:
    if not url:
        return False
    u = url.strip()
    if not u.startswith("https://"):
        return False
    invalid_hosts = ("t.me", "telegram.org", "telegram.me")
    for h in invalid_hosts:
        if u == f"https://{h}" or u.startswith(f"https://{h}/") or u.startswith(f"https://www.{h}"):
            return False
    return True


def webapp_button(text: str, path: str, base_url: Optional[str] = None) -> "InlineKeyboardButton":
    url = base_url or MINI_APP_URL
    full = f"{url}{path}" if url else None
    if full and is_valid_webapp_url(full):
        return InlineKeyboardButton(text=text, web_app=WebAppInfo(url=full))
    fallback = full or "https://t.me"
    return InlineKeyboardButton(text=text, url=fallback)


BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
BACKEND_BASE_URL_RAW = os.getenv("BACKEND_BASE_URL")
if not BACKEND_BASE_URL_RAW:
    raise RuntimeError("BACKEND_BASE_URL is not configured.")
BACKEND_BASE_URL = BACKEND_BASE_URL_RAW
MINI_APP_URL = ensure_https(os.getenv("TELEGRAM_MINI_APP_URL") or DEFAULT_MINI_APP_URL)
SUPPORT_CHAT_URL = ensure_https(os.getenv("SUPPORT_CHAT_URL") or None)
SUPPORT_USERNAME = os.getenv("SUPPORT_USERNAME", "platinumstar_manager")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "platinis")
RECEIPTS_CHANNEL_ID = os.getenv("RECEIPTS_CHANNEL_ID")
TOPUP_URL = ensure_https(os.getenv("TOPUP_URL") or None)
WITHDRAW_URL = ensure_https(os.getenv("WITHDRAW_URL") or None)
INTERNAL_SECRET = os.getenv("BACKEND_INTERNAL_SECRET", "")
BOT_INTERNAL_PORT = int(os.getenv("BOT_INTERNAL_PORT", "8081"))

# ─── Подписка и капча ────────────────────────────────────────────────
REQUIRED_CHANNEL = "@Platinumstar_channel"
# Хранит реферальный код пока пользователь не прошёл капчу и проверку подписки
pending_captcha: dict[int, dict] = {}  # user_id -> {"referral_code": ..., "mini_url": ...}

if not BOT_TOKEN:
    raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured.")


class ApiClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self._session: Optional[aiohttp.ClientSession] = None
        self._timeout = aiohttp.ClientTimeout(total=10)

    async def startup(self) -> None:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=self._timeout)

    async def shutdown(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    async def post(self, path: str, payload: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> tuple[int, Dict[str, Any]]:
        assert self._session, "ApiClient session not started"
        url = f"{self.base_url}{path}"
        try:
            async with self._session.post(url, json=payload, headers=headers) as response:
                try:
                    data = await response.json(content_type=None)
                except (aiohttp.ContentTypeError, json.JSONDecodeError):
                    text = await response.text()
                    logging.warning("POST %s returned non-JSON response (status %s): %s", url, response.status, text)
                    return response.status, {"error": "Invalid response from backend", "raw": text}
                return response.status, data
        except asyncio.TimeoutError:
            logging.error("POST %s timed out", url)
            return 0, {"error": "Request timed out"}
        except aiohttp.ClientError as exc:
            logging.error("POST %s failed: %s", url, exc)
            return 0, {"error": "Backend unavailable"}

    async def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> tuple[int, Dict[str, Any]]:
        assert self._session, "ApiClient session not started"
        url = f"{self.base_url}{path}"
        try:
            async with self._session.get(url, params=params) as response:
                try:
                    data = await response.json(content_type=None)
                except (aiohttp.ContentTypeError, json.JSONDecodeError):
                    text = await response.text()
                    logging.warning("GET %s returned non-JSON response (status %s): %s", url, response.status, text)
                    return response.status, {"error": "Invalid response from backend", "raw": text}
                return response.status, data
        except asyncio.TimeoutError:
            logging.error("GET %s timed out", url)
            return 0, {"error": "Request timed out"}
        except aiohttp.ClientError as exc:
            logging.error("GET %s failed: %s", url, exc)
            return 0, {"error": "Backend unavailable"}


api_client = ApiClient(BACKEND_BASE_URL)
bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode="HTML"))
dp = Dispatcher()

def is_holiday_season(now: Optional[datetime] = None) -> bool:
    current = now or datetime.now()
    if current.month == 12:
        return current.day >= 10
    if current.month == 1:
        return current.day <= 20
    return False


def build_main_keyboard(mini_app_url: Optional[str], support_username: Optional[str] = None) -> InlineKeyboardMarkup:
    launch_url = ensure_https(mini_app_url) or MINI_APP_URL
    keyboard_rows: list[list[InlineKeyboardButton]] = []

    if launch_url and is_valid_webapp_url(launch_url):
        keyboard_rows.append([
            InlineKeyboardButton(text="🎄 Играть", web_app=WebAppInfo(url=launch_url))
        ])
    else:
        keyboard_rows.append([
            InlineKeyboardButton(text="🎄 Играть", url=launch_url if launch_url else "https://t.me")
        ])

    keyboard_rows.append([
        InlineKeyboardButton(text="❄️ Баланс", callback_data="balance"),
        InlineKeyboardButton(text="👥 Онлайн", callback_data="online")
    ])
    keyboard_rows.append([
        InlineKeyboardButton(text="🎁 Подарок дня", callback_data="daily_gift"),
        InlineKeyboardButton(text="🧩 Задания", callback_data="tasks")
    ])
    keyboard_rows.append([
        InlineKeyboardButton(text="🎒 Инвентарь", callback_data="inventory"),
        InlineKeyboardButton(text="🛍 Магазин NFT", callback_data="shop"),
        InlineKeyboardButton(text="💎 Продать NFT", callback_data="sell_nft")
    ])
    keyboard_rows.append([
        InlineKeyboardButton(text="🔗 Реф. ссылка", callback_data="referral_link")
    ])
    keyboard_rows.append([
        InlineKeyboardButton(text="📸 Предоставить чек", callback_data="provide_receipt")
    ])
    keyboard_rows.append([
        InlineKeyboardButton(text="✨ Меню", callback_data="main_menu"),
        InlineKeyboardButton(text="⛄️ Помощь", callback_data="help_menu")
    ])
    support_row = []
    if support_username:
        support_row.append(InlineKeyboardButton(text="💬 Поддержка", url=f"https://t.me/{support_username.lstrip('@')}"))
    support_row.append(InlineKeyboardButton(text="👥 Группа", url="https://t.me/Platinumstar_channel"))
    keyboard_rows.append(support_row)
    keyboard_rows.append([
        InlineKeyboardButton(text="🎄 О проекте", callback_data="about_project")
    ])

    return InlineKeyboardMarkup(inline_keyboard=keyboard_rows)


# ─── Проверка подписки на канал ──────────────────────────────────────

async def check_channel_subscription(user_id: int) -> bool:
    """Проверяет подписку пользователя на REQUIRED_CHANNEL."""
    try:
        member = await bot.get_chat_member(chat_id=REQUIRED_CHANNEL, user_id=user_id)
        return member.status in ("member", "administrator", "creator")
    except Exception as e:
        logging.warning(f"Subscription check failed for {user_id}: {e}")
        return False


# ─── /start — капча → подписка → профиль ─────────────────────────────

async def handle_start(message: Message) -> None:
    from_user = message.from_user
    if not from_user:
        return

    referral_code = None
    if message.text and message.text.startswith("/start"):
        parts = message.text.split(maxsplit=1)
        if len(parts) > 1:
            referral_code = parts[1].strip()

    # Сохраняем реферальный код до завершения проверок
    pending_captcha[from_user.id] = {"referral_code": referral_code}

    captcha_keyboard = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ Я не робот", callback_data="captcha_confirm")
    ]])

    await message.answer(
        "👋 Добро пожаловать в <b>Platinum Stars</b>!\n\n"
        "Для продолжения подтвердите, что вы не робот:",
        reply_markup=captcha_keyboard
    )


async def callback_captcha_confirm(callback: CallbackQuery) -> None:
    """Пользователь нажал 'Я не робот' — проверяем подписку на канал."""
    from_user = callback.from_user
    if not from_user:
        await callback.answer()
        return

    await callback.answer()

    is_subscribed = await check_channel_subscription(from_user.id)

    if not is_subscribed:
        sub_keyboard = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="📢 Подписаться на канал", url=f"https://t.me/Platinumstar_channel")],
            [InlineKeyboardButton(text="✅ Я подписался", callback_data="check_sub_and_start")]
        ])
        await callback.message.edit_text(
            f"⚠️ Для использования бота необходимо подписаться на наш канал!\n\n"
            f"📢 Канал: {REQUIRED_CHANNEL}\n\n"
            "После подписки нажмите кнопку «Я подписался».",
            reply_markup=sub_keyboard
        )
        return

    await finish_start(callback.message, from_user)


async def callback_check_sub_and_start(callback: CallbackQuery) -> None:
    """Пользователь нажал 'Я подписался' — повторно проверяем подписку."""
    from_user = callback.from_user
    if not from_user:
        await callback.answer()
        return

    is_subscribed = await check_channel_subscription(from_user.id)

    if not is_subscribed:
        await callback.answer("❌ Вы ещё не подписались на канал!", show_alert=True)
        return

    await callback.answer()
    await finish_start(callback.message, from_user)


async def finish_start(message: Message, from_user) -> None:
    """Финальный шаг — синхронизация профиля и показ меню."""
    pending = pending_captcha.pop(from_user.id, {})
    referral_code = pending.get("referral_code")

    payload = {
        "user": {
            "id": from_user.id,
            "first_name": from_user.first_name,
            "last_name": from_user.last_name,
            "username": from_user.username,
            "language_code": from_user.language_code,
            "is_premium": from_user.is_premium,
            "photo_url": getattr(from_user, "photo_url", None),
        }
    }

    status, data = await api_client.post("/api/bot/sync", payload)
    if status != 200 or not isinstance(data, dict) or data.get("error"):
        logging.error("Profile sync failed: status=%s payload=%s", status, data)
        await message.answer("Не удалось синхронизировать профиль. Попробуйте позже.")
        return

    # Реферал начисляется только после прохождения капчи и подписки
    if referral_code:
        try:
            referral_status, referral_data = await api_client.post(
                "/api/bot/referral",
                {"telegramId": from_user.id, "code": referral_code}
            )
            if referral_status == 200 and referral_data.get("success"):
                await message.answer(
                    f"✅ Реферальный код <code>{referral_code}</code> успешно применён! "
                    "Вы получите награду после выполнения условий программы."
                )
            elif referral_status == 200 and referral_data.get("error"):
                error_msg = referral_data.get("error", "")
                if "уже был использован" in error_msg or "Неверный" in error_msg:
                    pass
                else:
                    logging.warning(f"Referral code error: {error_msg}")
        except Exception as e:
            logging.error(f"Failed to process referral code: {e}")

    mini_url = ensure_https(data.get("miniAppUrl")) or MINI_APP_URL

    holiday_active = is_holiday_season()
    greeting_prefix = "❄️ " if holiday_active else ""
    holiday_note = "\n\n❄️ Новогодний режим активен: снежинки, подарки и зимние награды!" if holiday_active else ""

    await message.answer(
        f"{greeting_prefix}Привет! Добро пожаловать в <b>Platinum Stars</b>.\n\n"
        "Запускайте мини-приложение, участвуйте в заданиях спонсоров и зарабатывайте звёзды. "
        "А ещё не забудьте про 🎁 ежедневный подарок."
        f"{holiday_note}",
        reply_markup=build_main_keyboard(mini_url, SUPPORT_USERNAME),
    )


async def handle_balance_request(telegram_id: int) -> Optional[str]:
    status, data = await api_client.get(
        "/api/bot/balance",
        params={"telegramId": telegram_id},
    )
    if status != 200 or not isinstance(data, dict) or data.get("error"):
        logging.error("Balance request failed: status=%s payload=%s", status, data)
        return data.get("error", "Не удалось получить баланс.") if isinstance(data, dict) else "Не удалось получить баланс."

    balance = data.get("balance", {}) if isinstance(data, dict) else {}
    available = balance.get("available", 0)
    reserved = balance.get("reserved", 0)
    total = available + reserved
    return f"💰 <b>Ваш баланс</b>\n\nДоступно: {available} ★\nЗарезервировано: {reserved} ★\nВсего: {total} ★"


async def command_balance(message: Message) -> None:
    if not message.from_user:
        return
    text = await handle_balance_request(message.from_user.id)
    if text:
        await message.answer(text)


async def callback_balance(callback: CallbackQuery) -> None:
    if not callback.from_user:
        return
    text = await handle_balance_request(callback.from_user.id)
    if text:
        if callback.message:
            await callback.message.answer(text)
        await callback.answer("Баланс обновлён")


async def command_promo(message: Message) -> None:
    if not message.from_user or not message.text:
        return

    parts = message.text.split(maxsplit=1)
    if len(parts) < 2:
        await message.answer("Использование: <code>/promo ВАШ_КОД</code>")
        return

    code = parts[1].strip().upper()
    status, data = await api_client.post(
        "/api/bot/promo",
        {"telegramId": message.from_user.id, "code": code},
    )

    if status == 200 and data.get("success"):
        reward = data.get("reward", 0)
        if reward:
            await message.answer(f"Промокод активирован! Вы получили {reward} ★")
        else:
            await message.answer("Промокод активирован.")
    else:
        await message.answer(data.get("error", "Не удалось активировать промокод."))


async def fetch_shop_items(telegram_id: int) -> list[dict[str, Any]]:
    status, data = await api_client.get(
        "/api/bot/nft-shop",
        params={"telegramId": telegram_id, "limit": 8},
    )
    if status != 200 or not isinstance(data, dict) or data.get("error"):
        logging.error("Shop request failed: status=%s payload=%s", status, data)
        return []
    return data.get("items", []) if isinstance(data, dict) else []


def build_shop_keyboard(items: list[dict[str, Any]]) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    for item in items:
        item_id = item.get("id")
        price_stars = item.get("priceStars")
        price_bonus = item.get("priceBonus")
        if not item_id:
            continue
        if price_stars:
            rows.append([
                InlineKeyboardButton(
                    text=f"Купить {price_stars} ★",
                    callback_data=f"shop_buy:{item_id}:STARS"
                )
            ])
        if price_bonus:
            rows.append([
                InlineKeyboardButton(
                    text=f"Купить {price_bonus} ✨",
                    callback_data=f"shop_buy:{item_id}:BONUS"
                )
            ])
    rows.append([webapp_button("🎒 Инвентарь", "/inventory")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


async def command_shop(message: Message) -> None:
    if not message.from_user:
        return
    items = await fetch_shop_items(message.from_user.id)
    if not items:
        await message.answer("🛍 Магазин NFT пока пуст. Загляните позже!")
        return

    lines = ["🛍 <b>Магазин NFT</b>\nВыберите подарок и нажмите «Купить»."]
    for item in items:
        name = item.get("name", "NFT")
        rarity = item.get("rarity", "—")
        price_stars = item.get("priceStars")
        price_bonus = item.get("priceBonus")
        price_parts = []
        if price_stars:
            price_parts.append(f"{price_stars} ★")
        if price_bonus:
            price_parts.append(f"{price_bonus} ✨")
        price_text = " / ".join(price_parts) if price_parts else "—"
        lines.append(f"• {name} — {rarity} ({price_text})")

    await message.answer("\n".join(lines), reply_markup=build_shop_keyboard(items))


async def callback_shop(callback: CallbackQuery) -> None:
    if not callback.from_user or not callback.message:
        await callback.answer()
        return
    items = await fetch_shop_items(callback.from_user.id)
    if not items:
        await callback.message.answer("🛍 Магазин NFT пока пуст. Загляните позже!")
        await callback.answer()
        return
    lines = ["🛍 <b>Магазин NFT</b>\nВыберите подарок и нажмите «Купить»."]
    for item in items:
        name = item.get("name", "NFT")
        rarity = item.get("rarity", "—")
        price_stars = item.get("priceStars")
        price_bonus = item.get("priceBonus")
        price_parts = []
        if price_stars:
            price_parts.append(f"{price_stars} ★")
        if price_bonus:
            price_parts.append(f"{price_bonus} ✨")
        price_text = " / ".join(price_parts) if price_parts else "—"
        lines.append(f"• {name} — {rarity} ({price_text})")

    await callback.message.answer("\n".join(lines), reply_markup=build_shop_keyboard(items))
    await callback.answer()


async def callback_shop_buy(callback: CallbackQuery) -> None:
    if not callback.from_user or not callback.data or not callback.message:
        await callback.answer()
        return
    parts = callback.data.split(":")
    if len(parts) < 3:
        await callback.answer("Не удалось прочитать покупку.")
        return
    gift_id = parts[1]
    currency = parts[2]

    status, data = await api_client.post(
        "/api/bot/nft-shop",
        {"telegramId": callback.from_user.id, "giftId": gift_id, "currency": currency},
    )
    if status != 200 or not isinstance(data, dict) or data.get("error"):
        await callback.answer(data.get("error", "Не удалось купить NFT."), show_alert=True)
        return

    gift = data.get("gift", {}) if isinstance(data, dict) else {}
    balance = data.get("balance", {}) if isinstance(data, dict) else {}
    name = gift.get("name", "NFT")
    available = balance.get("available", 0)
    bonus_available = balance.get("bonusAvailable", 0)

    await callback.message.answer(
        f"✅ Покупка успешна!\n\n{name}\n"
        f"Баланс: {available} ★\nБонус: {bonus_available} ✨"
    )
    await callback.answer("NFT добавлен в инвентарь")


async def handle_inventory_request(telegram_id: int) -> tuple[str, Optional[InlineKeyboardMarkup]]:
    status, data = await api_client.get(
        "/api/bot/nfts",
        params={"telegramId": telegram_id, "limit": 20},
    )
    if status != 200 or not isinstance(data, dict) or data.get("error"):
        logging.error("Inventory request failed: status=%s payload=%s", status, data)
        return (
            data.get("error", "Не удалось получить инвентарь.") if isinstance(data, dict) else "Не удалось получить инвентарь.",
            None
        )

    items = data.get("items", []) if isinstance(data, dict) else []
    total = data.get("total", len(items)) if isinstance(data, dict) else len(items)
    lines = ["🎒 <b>Инвентарь</b>"]

    if not items:
        lines.append("\nПока пусто — выбивайте NFT из кейсов и игр!")
    else:
        lines.append(f"\nВсего: {total}")
        for item in items:
            name = item.get("name", "NFT")
            rarity = item.get("rarity", "—")
            price_stars = item.get("priceStars")
            price_text = f" · {price_stars} ★" if price_stars else ""
            lines.append(f"• {name} — {rarity}{price_text}")
        if total > len(items):
            lines.append(f"\nПоказано {len(items)} из {total}.")

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [webapp_button("🎒 Открыть инвентарь", "/inventory")],
            [InlineKeyboardButton(text="💎 Продать NFT", callback_data="sell_nft")]
        ]
    )
    return "\n".join(lines), keyboard


async def command_inventory(message: Message) -> None:
    if not message.from_user:
        return
    text, keyboard = await handle_inventory_request(message.from_user.id)
    await message.answer(text, reply_markup=keyboard)


async def callback_inventory(callback: CallbackQuery) -> None:
    if not callback.from_user or not callback.message:
        await callback.answer()
        return
    text, keyboard = await handle_inventory_request(callback.from_user.id)
    await callback.message.answer(text, reply_markup=keyboard)
    await callback.answer()


async def build_sell_nft_message(telegram_id: int) -> tuple[str, Optional[InlineKeyboardMarkup]]:
    status, data = await api_client.get(
        "/api/bot/nfts",
        params={"telegramId": telegram_id, "limit": 20},
    )
    if status != 200 or not isinstance(data, dict) or data.get("error"):
        logging.error("Sell NFT request failed: status=%s payload=%s", status, data)
        return (
            data.get("error", "Не удалось получить инвентарь.") if isinstance(data, dict) else "Не удалось получить инвентарь.",
            None
        )

    items = data.get("items", []) if isinstance(data, dict) else []
    lines = ["💎 <b>Продажа NFT</b>"]

    if not items:
        lines.append("\nИнвентарь пуст. Сначала выбейте NFT!")
        return "\n".join(lines), None

    keyboard_rows: list[list[InlineKeyboardButton]] = []
    for item in items:
        gift_id = item.get("id")
        name = item.get("name", "NFT")
        price_stars = item.get("priceStars")
        if not gift_id or not price_stars:
            continue
        lines.append(f"• {name} — {price_stars} ★")
        keyboard_rows.append([
            InlineKeyboardButton(text=f"Продать за {price_stars} ★", callback_data=f"sell_nft:{gift_id}")
        ])

    if not keyboard_rows:
        lines.append("\nНет NFT с ценой для продажи.")
        return "\n".join(lines), None

    return "\n".join(lines), InlineKeyboardMarkup(inline_keyboard=keyboard_rows)


async def command_sell_nft(message: Message) -> None:
    if not message.from_user:
        return
    text, keyboard = await build_sell_nft_message(message.from_user.id)
    await message.answer(text, reply_markup=keyboard)


async def callback_sell_nft(callback: CallbackQuery) -> None:
    if not callback.from_user or not callback.message:
        await callback.answer()
        return
    text, keyboard = await build_sell_nft_message(callback.from_user.id)
    await callback.message.answer(text, reply_markup=keyboard)
    await callback.answer()


async def callback_sell_nft_confirm(callback: CallbackQuery) -> None:
    if not callback.from_user or not callback.data or not callback.message:
        await callback.answer()
        return
    parts = callback.data.split(":")
    if len(parts) < 2:
        await callback.answer("Не удалось прочитать NFT.")
        return
    user_gift_id = parts[1]

    status, data = await api_client.post(
        "/api/bot/nft-sell",
        {"telegramId": callback.from_user.id, "userGiftId": user_gift_id},
    )
    if status != 200 or not isinstance(data, dict) or data.get("error"):
        await callback.answer(data.get("error", "Не удалось продать NFT."), show_alert=True)
        return

    gift = data.get("gift", {}) if isinstance(data, dict) else {}
    balance = data.get("balance", {}) if isinstance(data, dict) else {}
    name = gift.get("name", "NFT")
    price = gift.get("priceStars", 0)
    available = balance.get("available", 0)
    bonus_available = balance.get("bonusAvailable", 0)

    await callback.message.answer(
        f"✅ NFT продан!\n\n{name}\nПолучено: {price} ★\n"
        f"Баланс: {available} ★\nБонус: {bonus_available} ✨"
    )
    await callback.answer("Звёзды зачислены")

async def command_tasks(message: Message) -> None:
    status, data = await api_client.get("/api/bot/tasks")
    if status != 200 or not isinstance(data, dict):
        logging.error("Tasks request failed: status=%s payload=%s", status, data)
        await message.answer("Не удалось получить список заданий. Попробуйте позже.")
        return

    tasks = data.get("tasks", []) if isinstance(data, dict) else []
    if not tasks:
        await message.answer("Активных заданий пока нет. Загляните позже!")
        return

    lines = []
    for task in tasks:
        title = task.get("title", "Задание")
        reward = task.get("reward", 0)
        description = task.get("description")
        link = task.get("link")
        block = [f"• <b>{title}</b>", f"Бонус: {reward} ★"]
        if description:
            block.append(description)
        if link:
            block.append(f"<a href=\"{link}\">Ссылка</a>")
        lines.append("\n".join(block))

    await message.answer("\n\n".join(lines))


async def command_help(message: Message) -> None:
    await message.answer(format_help_text())


async def command_menu(message: Message) -> None:
    await message.answer(
        "Главное меню:",
        reply_markup=build_main_keyboard(MINI_APP_URL, SUPPORT_USERNAME),
    )


async def command_topup(message: Message) -> None:
    lines = [
        "<b>💳 Как пополнить баланс</b>",
        "",
        "<b>Способ 1: Банковский перевод</b>",
        "1. Откройте мини-приложение и перейдите в 'Кошелёк'",
        "2. Выберите 'Банковский перевод'",
        "3. Укажите количество звёзд и получите реквизиты",
        "4. Переведите деньги на указанный счёт",
        "5. Нажмите кнопку '📸 Предоставить чек' ниже или отправьте фото чека боту",
        "",
        "<b>Способ 2: Telegram Stars</b>",
        "Моментальное пополнение через встроенные покупки в мини-приложении",
    ]
    if TOPUP_URL:
        lines.append(f"\n<a href='{TOPUP_URL}'>Альтернативный способ пополнения</a>")

    keyboard = [
        [webapp_button("💰 Открыть кошелёк", "/wallet")],
        [InlineKeyboardButton(text="📸 Предоставить чек", callback_data="provide_receipt")]
    ]

    await message.answer(
        "\n".join(lines),
        disable_web_page_preview=True,
        reply_markup=InlineKeyboardMarkup(inline_keyboard=keyboard),
    )


async def command_about(message: Message) -> None:
    about_text = """
<b>🌟 Platinum Stars</b>

Играй, выполняй задания и зарабатывай звёзды!

<b>🎮 Что такое Platinum Stars?</b>
Это инновационная игровая платформа в Telegram, где ты можешь:
• Играть в увлекательные игры
• Выполнять задания спонсоров
• Зарабатывать звёзды
• Обменивать их на реальные призы

<b>💎 Преимущества:</b>
• Полностью бесплатные игры
• Реальные награды
• Простой и удобный интерфейс
• Поддержка 24/7

<b>🚀 Начни прямо сейчас!</b>
Запусти мини-приложение и окунись в мир развлечений!
"""
    await message.answer(about_text, reply_markup=build_main_keyboard(MINI_APP_URL, SUPPORT_USERNAME))


async def command_withdraw(message: Message) -> None:
    lines = [
        "<b>Вывод средств</b>",
        "1. Завершите все активные попытки и убедитесь, что звёзды на балансе.",
        "2. В мини-приложении откройте раздел 'Вывод'.",
        "3. Укажите реквизиты и сумму, подтвердите заявку.",
        "4. Служба поддержки уведомит о статусе перевода.",
    ]
    if WITHDRAW_URL:
        lines.append(f"<a href='{WITHDRAW_URL}'>Страница статуса выводов</a>")
    if SUPPORT_CHAT_URL:
        lines.append(f"Возникли вопросы? <a href='{SUPPORT_CHAT_URL}'>Напишите поддержке</a>.")
    await message.answer(
        "\n".join(lines),
        disable_web_page_preview=True,
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[[webapp_button("💸 Оформить вывод", "/wallet")]]
        ),
    )


async def handle_receipt(message: Message) -> None:
    if not message.from_user:
        return

    file_id = None
    file_type = None

    if message.document:
        file_id = message.document.file_id
        file_type = message.document.mime_type or "document"
    elif message.photo:
        file_id = message.photo[-1].file_id
        file_type = "photo"

    if not file_id:
        await message.answer(
            "📸 Пожалуйста, отправьте фото или документ с чеком о переводе.\n\n"
            "Если у вас есть активный запрос на пополнение, чек будет автоматически привязан к нему.\n\n"
            "💡 <b>Совет:</b> Убедитесь, что на чеке видно:\n"
            "• Номер счёта получателя\n"
            "• Сумму перевода\n"
            "• Дату и время операции"
        )
        return

    processing_msg = await message.answer("⏳ Обрабатываю чек...")

    user_info = {
        "telegramId": message.from_user.id,
        "firstName": message.from_user.first_name,
        "lastName": message.from_user.last_name,
        "username": message.from_user.username,
        "phoneNumber": getattr(message.from_user, "phone_number", None),
    }

    status, data = await api_client.post(
        "/api/bot/deposit-receipt",
        {
            "telegramId": message.from_user.id,
            "fileId": file_id,
            "fileType": file_type,
            "userInfo": user_info,
        },
    )

    try:
        await processing_msg.delete()
    except:
        pass

    if status == 200 and data.get("success"):
        deposit_request_id = data.get("depositRequestId")
        channel_id = RECEIPTS_CHANNEL_ID or "3250676900"

        if channel_id.startswith("+"):
            try:
                chat_info = await bot.get_chat(chat_id=channel_id)
                if chat_info and hasattr(chat_info, 'id'):
                    channel_id = str(chat_info.id)
            except Exception as e:
                logging.warning(f"Failed to resolve invite link {channel_id} to chat_id: {e}")

        try:
            user_name = message.from_user.first_name or "Пользователь"
            user_username = f"@{message.from_user.username}" if message.from_user.username else "без username"
            user_phone = user_info.get("phoneNumber", "не указан")

            receipt_caption = (
                f"👤 <b>От:</b> {user_name} ({user_username})\n"
                f"📱 <b>Телефон:</b> {user_phone}\n"
                f"🆔 <b>ID:</b> {message.from_user.id}\n"
            )
            if deposit_request_id:
                receipt_caption += f"📋 <b>Запрос:</b> {deposit_request_id}\n"

            channel_ids_to_try = [channel_id]
            if channel_id.isdigit() and not channel_id.startswith("-"):
                channel_ids_to_try.append(f"-100{channel_id}")

            send_success = False
            last_error = None
            for try_channel_id in channel_ids_to_try:
                try:
                    if message.document:
                        await bot.send_document(chat_id=try_channel_id, document=file_id, caption=receipt_caption, parse_mode="HTML")
                    elif message.photo:
                        await bot.send_photo(chat_id=try_channel_id, photo=file_id, caption=receipt_caption, parse_mode="HTML")
                    send_success = True
                    break
                except Exception as try_error:
                    last_error = try_error
                    continue

            if not send_success:
                raise last_error or Exception("Failed to send to any channel format")
        except Exception as e:
            logging.error(f"Failed to send receipt to channel {channel_id}: {e}")

        if deposit_request_id:
            await message.answer(
                f"✅ <b>Чек успешно получен!</b>\n\n"
                f"📋 Чек привязан к вашему запросу на пополнение.\n\n"
                f"⏳ Администратор проверит перевод в ближайшее время.\n"
                f"🔔 Вы получите уведомление о результате проверки.",
                reply_markup=InlineKeyboardMarkup(
                    inline_keyboard=[[webapp_button("💰 Открыть кошелёк", "/wallet")]]
                )
            )
        else:
            await message.answer(
                "✅ <b>Чек получен!</b>\n\n"
                "⏳ Администратор проверит перевод и зачислит звёзды.\n"
                "🔔 Вы получите уведомление о результате проверки.",
                reply_markup=InlineKeyboardMarkup(
                    inline_keyboard=[[webapp_button("💰 Открыть кошелёк", "/wallet")]]
                )
            )
    else:
        error_msg = data.get("error", "Не удалось обработать чек. Попробуйте позже.")
        await message.answer(
            f"❌ <b>Ошибка обработки чека</b>\n\n"
            f"{error_msg}\n\n"
            f"💡 Попробуйте:\n"
            f"• Отправить фото чека ещё раз\n"
            f"• Убедиться, что фото чёткое и читаемое\n"
            f"• Проверить, что у вас есть активный запрос на пополнение"
        )


async def callback_main_menu(callback: CallbackQuery) -> None:
    new_keyboard = build_main_keyboard(MINI_APP_URL, SUPPORT_USERNAME)
    try:
        await callback.message.edit_reply_markup(reply_markup=new_keyboard)
        await callback.answer("Меню обновлено")
    except TelegramBadRequest as e:
        if "message is not modified" in str(e):
            await callback.answer("Меню уже открыто")
        else:
            logging.warning("callback_main_menu edit failed: %s", e)
            await callback.answer()


async def check_user_subscription(telegram_id: int, sponsor_link: Optional[str]) -> bool:
    if not sponsor_link:
        return True

    import re
    match = re.search(r'(?:t\.me/|@)([a-zA-Z0-9_]+)', sponsor_link)
    if not match:
        return True

    channel_username = match.group(1).lstrip('@')

    try:
        member = await bot.get_chat_member(chat_id=f"@{channel_username}", user_id=telegram_id)
        return member.status in ["member", "administrator", "creator"]
    except Exception as e:
        logging.warning(f"Failed to check subscription for @{channel_username}: {e}.")
        return True


async def callback_tasks(callback: CallbackQuery) -> None:
    if not callback.message or not callback.from_user:
        await callback.answer()
        return

    status, data = await api_client.get("/api/bot/tasks")
    if status != 200 or not isinstance(data, dict):
        logging.error("Tasks callback failed: status=%s payload=%s", status, data)
        await callback.message.answer("❌ Не удалось получить список заданий. Попробуйте позже.")
        await callback.answer()
        return

    tasks = data.get("tasks", []) if isinstance(data, dict) else []
    if not tasks:
        await callback.message.answer("📋 <b>Доступные задания</b>\n\nАктивных заданий пока нет. Загляните позже!")
        await callback.answer()
        return

    lines = ["📋 <b>Доступные задания</b>\n"]
    buttons = []

    for task in tasks[:10]:
        title = task.get("title", "Задание")
        reward = task.get("reward", 0)
        description = task.get("description", "")
        sponsor_link = task.get("sponsorLink")
        is_subscribed = await check_user_subscription(callback.from_user.id, sponsor_link)
        status_icon = "✅" if is_subscribed else "🔒"

        task_line = f"{status_icon} <b>{title}</b> — {reward} ★"
        if description:
            task_line += f"\n   {description[:100]}"
        if sponsor_link:
            task_line += f"\n   <a href=\"{sponsor_link}\">Ссылка на спонсора</a>"
        if not is_subscribed:
            task_line += "\n   ⚠️ Подпишитесь на спонсора для выполнения"

        lines.append(task_line)

    buttons.append([webapp_button("🎮 Открыть в мини-приложении", "/tasks")])

    await callback.message.answer(
        "\n\n".join(lines),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons) if buttons else None,
        disable_web_page_preview=True
    )
    await callback.answer()

async def callback_daily_gift(callback: CallbackQuery) -> None:
    if not callback.message:
        await callback.answer()
        return

    text = (
        "🎁 <b>Ежедневный подарок</b>\n\n"
        "Забирайте подарок каждый день — серия увеличивает награду.\n"
        "Откройте мини-приложение и зайдите в раздел <b>Подарок</b>."
    )
    buttons = [[webapp_button("🎁 Открыть подарки", "/gift")]]
    await callback.message.answer(text, reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons))
    await callback.answer()

async def command_online(message: Message) -> None:
    status, data = await api_client.get("/api/bot/online")
    if status != 200 or not isinstance(data, dict):
        await message.answer("Не удалось получить онлайн. Попробуйте позже.")
        return

    if data.get("error"):
        await message.answer(data.get("error", "Не удалось получить онлайн."))
        return

    online = data.get("online", 0)
    window_seconds = data.get("windowSeconds", 90)
    await message.answer(f"👥 <b>Онлайн:</b> {online}\n\n(за последние {window_seconds} сек.)")


async def callback_online(callback: CallbackQuery) -> None:
    if not callback.message:
        await callback.answer()
        return
    await callback.answer()

    status, data = await api_client.get("/api/bot/online")
    if status != 200 or not isinstance(data, dict):
        await callback.message.answer("Не удалось получить онлайн. Попробуйте позже.")
        return
    if data.get("error"):
        await callback.message.answer(data.get("error", "Не удалось получить онлайн."))
        return

    online = data.get("online", 0)
    window_seconds = data.get("windowSeconds", 90)
    await callback.message.answer(f"👥 <b>Онлайн:</b> {online}\n\n(за последние {window_seconds} сек.)")


async def callback_promo(callback: CallbackQuery) -> None:
    await callback.answer("Отправьте команду /promo КОД, чтобы активировать промокод", show_alert=True)


def format_help_text() -> str:
    return "\n".join(
        [
            "<b>Доступные команды</b>",
            "/start — запуск и синхронизация профиля.",
            "/balance — показать текущий баланс.",
            "/online — сколько пользователей онлайн.",
            "/promo &lt;КОД&gt; — активировать промокод.",
            "/tasks — последние задания спонсоров.",
            "/inventory — ваш инвентарь NFT.",
            "/shop — магазин NFT.",
            "/sellnft — продать NFT и пополнить баланс.",
            "/about — о проекте Platinum Stars.",
            "/topup — способы пополнения.",
            "/withdraw — как вывести звёзды.",
            "/help — справка по командам.",
        ]
    )


async def callback_help(callback: CallbackQuery) -> None:
    if callback.message:
        await callback.message.answer(format_help_text())
    await callback.answer()


async def callback_about(callback: CallbackQuery) -> None:
    about_text = """
<b>🌟 Platinum Stars</b>

Играй, выполняй задания и зарабатывай звёзды!

<b>🎮 Что такое Platinum Stars?</b>
Это инновационная игровая платформа в Telegram, где ты можешь:
• Играть в увлекательные игры
• Выполнять задания спонсоров
• Зарабатывать звёзды
• Обменивать их на реальные призы

<b>💎 Преимущества:</b>
• Полностью бесплатные игры
• Реальные награды
• Простой и удобный интерфейс
• Поддержка 24/7

<b>🚀 Начни прямо сейчас!</b>
Запусти мини-приложение и окунись в мир развлечений!
"""
    if callback.message:
        await callback.message.answer(about_text, reply_markup=build_main_keyboard(MINI_APP_URL, SUPPORT_USERNAME))
    await callback.answer()


async def callback_referral_link(callback: CallbackQuery) -> None:
    if not callback.from_user:
        await callback.answer("Ошибка: не удалось определить пользователя")
        return

    try:
        status, data = await api_client.get(
            "/api/bot/referral-info",
            params={"telegramId": callback.from_user.id}
        )

        if status != 200 or not isinstance(data, dict) or data.get("error"):
            error_msg = data.get("error", "Не удалось получить информацию") if isinstance(data, dict) else "Ошибка получения данных"
            await callback.answer(f"❌ {error_msg}", show_alert=True)
            return

        referral_code = data.get("referralCode", "")
        referral_link = data.get("referralLink", "")
        invited = data.get("invited", 0)
        completed = data.get("completed", 0)
        pending = data.get("pending", 0)
        reward = data.get("rewardPerFriend", 0)

        message_text = (
            f"🔗 <b>Ваша реферальная ссылка</b>\n\n"
            f"📋 <b>Код:</b> <code>{referral_code}</code>\n\n"
            f"🔗 <b>Ссылка:</b>\n<code>{referral_link}</code>\n\n"
            f"📊 <b>Статистика:</b>\n"
            f"👥 Приглашено: {invited}\n"
            f"✅ Завершено: {completed}\n"
            f"⏳ Ожидают: {pending}\n"
            f"⭐ Награда за друга: {reward} ★\n\n"
            f"💡 Поделитесь ссылкой с друзьями и получайте награды за их активность!"
        )

        if callback.message:
            await callback.message.answer(message_text, parse_mode="HTML")
        await callback.answer("Реферальная ссылка отправлена")
    except Exception as e:
        logging.error(f"Error getting referral link: {e}", exc_info=True)
        await callback.answer("❌ Ошибка при получении реферальной ссылки", show_alert=True)


async def callback_provide_receipt(callback: CallbackQuery) -> None:
    if not callback.from_user:
        await callback.answer()
        return

    await callback.answer()

    text = (
        "📸 <b>Отправка чека о переводе</b>\n\n"
        "Пожалуйста, отправьте фото или документ с чеком о банковском переводе.\n\n"
        "💡 <b>Что должно быть на чеке:</b>\n"
        "• Номер счёта получателя\n"
        "• Сумма перевода\n"
        "• Дата и время операции\n\n"
        "⏳ После отправки чека администратор проверит перевод и зачислит звёзды на ваш баланс."
    )

    if callback.message:
        await callback.message.answer(text)


async def configure_bot_metadata() -> None:
    launch_url = MINI_APP_URL

    commands = [
        BotCommand(command="start", description="Запуск и синхронизация профиля"),
        BotCommand(command="balance", description="Показать текущий баланс"),
        BotCommand(command="online", description="Сколько игроков онлайн сейчас"),
        BotCommand(command="promo", description="Активировать промокод: /promo КОД"),
        BotCommand(command="tasks", description="Показать доступные задания"),
        BotCommand(command="inventory", description="Показать инвентарь NFT"),
        BotCommand(command="shop", description="Открыть магазин NFT"),
        BotCommand(command="sellnft", description="Продать NFT и пополнить баланс"),
        BotCommand(command="about", description="О проекте Platinum Stars"),
        BotCommand(command="help", description="Справка по командам"),
    ]
    await bot.set_my_commands(commands)

    await bot.set_my_short_description("Platinum Stars — мини‑приложение с играми, заданиями и звёздами.")
    await bot.set_my_description(
        "Запускайте мини‑приложение, выполняйте задания спонсоров и зарабатывайте звёзды. "
        "Баланс синхронизирован между ботом и мини‑приложением."
    )

    if launch_url and is_valid_webapp_url(launch_url):
        await bot.set_chat_menu_button(menu_button=MenuButtonWebApp(text="Открыть мини‑приложение", web_app=WebAppInfo(url=launch_url)))
    else:
        from aiogram.types import MenuButtonDefault
        await bot.set_chat_menu_button(menu_button=MenuButtonDefault())


async def handle_pre_checkout_query(pre_checkout_query: PreCheckoutQuery) -> None:
    try:
        await bot.answer_pre_checkout_query(pre_checkout_query.id, ok=True)
        logging.info(f"Pre-checkout query answered: id={pre_checkout_query.id}, payload={pre_checkout_query.invoice_payload}")
        payload = pre_checkout_query.invoice_payload
        if payload and payload.startswith("stars_"):
            logging.info(f"Valid stars payment pre-checkout: {payload}")
        else:
            logging.warning(f"Unexpected pre-checkout payload: {payload}")
    except Exception as e:
        logging.error(f"Error answering pre-checkout query: {e}", exc_info=True)
        try:
            await bot.answer_pre_checkout_query(pre_checkout_query.id, ok=True)
        except Exception as retry_error:
            logging.error(f"Failed to answer pre-checkout query on retry: {retry_error}")


async def handle_successful_payment(message: Message) -> None:
    if not message.successful_payment or not message.from_user:
        return

    payment: SuccessfulPayment = message.successful_payment
    payload = payment.invoice_payload

    if not payload or not payload.startswith("stars_"):
        logging.warning(f"Unexpected payment payload: {payload}")
        return

    try:
        parts = payload.split("_")
        if len(parts) < 2:
            logging.warning(f"Invalid payment payload format: {payload}")
            return

        telegram_id = int(parts[1])
        stars_amount = payment.total_amount

        status, data = await api_client.post("/api/bot/payment-success", {
            "telegramId": telegram_id,
            "payload": payload,
            "stars": stars_amount,
            "currency": payment.currency,
            "telegramPaymentChargeId": payment.telegram_payment_charge_id,
            "providerPaymentChargeId": payment.provider_payment_charge_id
        })

        if status == 200:
            await message.answer(
                f"✅ <b>Платеж успешно обработан!</b>\n\n"
                f"💰 На ваш баланс зачислено: {stars_amount} ★\n\n"
                f"🎮 Используйте кнопку ниже, чтобы открыть мини-приложение и проверить баланс.",
                reply_markup=build_main_keyboard(MINI_APP_URL, SUPPORT_USERNAME)
            )
        else:
            error_msg = data.get("error", "Не удалось обработать платеж") if isinstance(data, dict) else "Ошибка обработки платежа"
            logging.error(f"Payment processing failed: status={status}, error={error_msg}")
            await message.answer(
                f"⚠️ <b>Платеж получен, но возникла ошибка при обработке.</b>\n\n"
                f"Обратитесь в поддержку, указав ID платежа: {payment.telegram_payment_charge_id}"
            )
    except Exception as e:
        logging.error(f"Error processing payment: {e}", exc_info=True)
        await message.answer("⚠️ Произошла ошибка при обработке платежа. Обратитесь в поддержку.")


# ─── NFT-подарки от пользователей ────────────────────────────────────────

async def handle_gift_received(message: Message) -> None:
    gift_obj = getattr(message, "gift", None)
    if not gift_obj or not message.from_user:
        return

    telegram_id = message.from_user.id

    sticker = (
        getattr(gift_obj, "gift", None) or
        getattr(gift_obj, "sticker", None)
    )
    sticker_id = (
        getattr(sticker, "file_unique_id", None) or
        getattr(sticker, "id", None) or
        getattr(sticker, "custom_emoji_id", None) or
        getattr(gift_obj, "id", None)
    )
    gift_id_direct = getattr(gift_obj, "id", None)
    gift_emoji = getattr(sticker, "emoji", None) or getattr(sticker, "file_id", "💎") or "💎"
    gift_name = getattr(gift_obj, "title", None) or gift_emoji

    logging.info(f"[GIFT] Received gift from telegram_id={telegram_id}: sticker_id={sticker_id}")

    try:
        status, data = await api_client.post(
            "/api/bot/nft-gift-received",
            {
                "telegramId": telegram_id,
                "stickerId": sticker_id,
                "giftId": gift_id_direct,
                "giftName": gift_name,
            },
            headers={"x-internal-secret": INTERNAL_SECRET} if INTERNAL_SECRET else {}
        )

        if status == 200 and isinstance(data, dict):
            stars_credited = data.get("starsCredited", 0)
            nft_name = data.get("giftName", gift_name)

            if stars_credited > 0:
                await message.answer(
                    f"🎁 <b>NFT-подарок получен!</b>\n\n"
                    f"💎 <b>{nft_name}</b> добавлен в ваш инвентарь\n"
                    f"⭐ Начислено: <b>{stars_credited} ★</b>\n\n"
                    f"Проверьте баланс в мини-приложении.",
                    reply_markup=build_main_keyboard(MINI_APP_URL, SUPPORT_USERNAME),
                )
            else:
                await message.answer(
                    f"🎁 <b>NFT-подарок получен!</b>\n\n"
                    f"💎 <b>{nft_name}</b> добавлен в ваш инвентарь.\n"
                    f"Откройте мини-приложение, чтобы использовать его.",
                    reply_markup=build_main_keyboard(MINI_APP_URL, SUPPORT_USERNAME),
                )
        else:
            error = data.get("error", "Ошибка") if isinstance(data, dict) else "Ошибка"
            logging.error(f"[GIFT] Backend error: status={status}, error={error}")
            await message.answer(
                "⚠️ Подарок получен, но возникла ошибка при зачислении.\n"
                "Обратитесь в поддержку — укажите ваш Telegram ID."
            )
    except Exception as exc:
        logging.error(f"[GIFT] Exception: {exc}", exc_info=True)
        await message.answer("⚠️ Ошибка при обработке подарка. Обратитесь в поддержку.")


# ─── Push-уведомления о статусе вывода ──────────────────────────────────

async def notify_withdrawal_status(
    telegram_id: int,
    status: str,
    amount: int,
    withdrawal_id: str,
) -> None:
    status_info = {
        "PENDING":  ("⏳", "Заявка принята и ожидает обработки"),
        "APPROVED": ("✅", "Заявка одобрена! Ожидайте перевод"),
        "SENT":     ("💸", f"Выплата {amount} ★ отправлена на ваш аккаунт"),
        "REJECTED": ("❌", "Заявка отклонена. Средства возвращены на баланс"),
    }
    emoji, text_status = status_info.get(status, ("ℹ️", f"Статус изменён: {status}"))
    short_id = withdrawal_id[-8:].upper()

    text = (
        f"{emoji} <b>Обновление вывода #{short_id}</b>\n\n"
        f"{text_status}\n\n"
        f"💰 Сумма: <b>{amount} ★</b>"
    )
    try:
        await bot.send_message(
            chat_id=telegram_id,
            text=text,
            reply_markup=build_main_keyboard(MINI_APP_URL, SUPPORT_USERNAME),
        )
        logging.info(f"[NOTIFY] Sent withdrawal status {status} to {telegram_id}")
    except Exception as exc:
        logging.warning(f"[NOTIFY] Failed to notify {telegram_id}: {exc}")


# ─── Внутренний HTTP-сервер ──────────────────────────────────────────────

async def _handle_internal_notify_withdrawal(request: aio_web.Request) -> aio_web.Response:
    secret = request.headers.get("x-internal-secret", "")
    if INTERNAL_SECRET and secret != INTERNAL_SECRET:
        return aio_web.json_response({"error": "Unauthorized"}, status=401)
    try:
        body = await request.json()
        telegram_id = int(body["telegramId"])
        status = str(body["status"])
        amount = int(body["amount"])
        withdrawal_id = str(body["withdrawalId"])
    except (KeyError, ValueError, TypeError) as exc:
        return aio_web.json_response({"error": f"Bad request: {exc}"}, status=400)

    asyncio.create_task(notify_withdrawal_status(telegram_id, status, amount, withdrawal_id))
    return aio_web.json_response({"ok": True})


async def _handle_nft_transfer(request: aio_web.Request) -> aio_web.Response:
    secret = request.headers.get("x-internal-secret", "")
    if INTERNAL_SECRET and secret != INTERNAL_SECRET:
        return aio_web.json_response({"error": "Unauthorized"}, status=401)
    try:
        body = await request.json()
    except Exception as exc:
        return aio_web.json_response({"error": f"Bad request: {exc}"}, status=400)

    telegram_id = body.get("telegramId")
    telegram_gift_id = body.get("telegramGiftId")
    gift_name = body.get("giftName", "NFT")
    withdrawal_id = body.get("withdrawalId", "")

    if not telegram_id or not telegram_gift_id:
        return aio_web.json_response({"error": "Missing fields"}, status=400)

    try:
        import aiohttp as aiohttp_client
        async with aiohttp_client.ClientSession() as session:
            async with session.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/transferGift",
                json={"gift_id": telegram_gift_id, "new_owner_chat_id": telegram_id},
                timeout=aiohttp_client.ClientTimeout(total=15)
            ) as resp:
                tg_result = await resp.json()

        if tg_result.get("ok"):
            try:
                await bot.send_message(
                    chat_id=telegram_id,
                    text=f"🎁 <b>NFT отправлен!</b>\n\n"
                         f"💎 <b>{gift_name}</b> успешно переведён на ваш аккаунт Telegram.\n"
                         f"Проверьте раздел «Подарки» в профиле.",
                    parse_mode="HTML"
                )
            except Exception:
                pass
            logging.info(f"[NFT-TRANSFER] OK: {gift_name} → {telegram_id}")
            return aio_web.json_response({"ok": True, "status": "sent"})
        else:
            err = tg_result.get("description", "Unknown error")
            logging.warning(f"[NFT-TRANSFER] Telegram error: {err}")
            try:
                await bot.send_message(
                    chat_id=telegram_id,
                    text=f"🎁 <b>Заявка на вывод NFT принята</b>\n\n"
                         f"💎 <b>{gift_name}</b>\n"
                         f"Администратор обработает заявку вручную в течение 24 часов.\n"
                         f"ID: <code>{withdrawal_id[-8:].upper()}</code>",
                    parse_mode="HTML"
                )
            except Exception:
                pass
            return aio_web.json_response({"ok": False, "status": "manual", "error": err})
    except Exception as exc:
        logging.error(f"[NFT-TRANSFER] Exception: {exc}", exc_info=True)
        return aio_web.json_response({"error": str(exc)}, status=500)

async def run_internal_server() -> None:
    app = aio_web.Application()
    app.router.add_post("/notify/withdrawal", _handle_internal_notify_withdrawal)
    app.router.add_post("/api/bot/nft-transfer", _handle_nft_transfer)
    app.router.add_post("/api/bot/payout-stars", _handle_nft_transfer)
    runner = aio_web.AppRunner(app)
    await runner.setup()
    site = aio_web.TCPSite(runner, "0.0.0.0", BOT_INTERNAL_PORT)
    await site.start()
    logging.info(f"[BOT] Internal notify server started on port {BOT_INTERNAL_PORT}")


# ─── Регистрация хендлеров ────────────────────────────────────────────────

dp.message.register(handle_start, CommandStart())
dp.message.register(command_balance, Command("balance"))
dp.callback_query.register(callback_balance, F.data == "balance")
dp.message.register(command_online, Command("online"))
dp.callback_query.register(callback_online, F.data == "online")
dp.message.register(command_promo, Command("promo"))
dp.message.register(command_inventory, Command("inventory"))
dp.message.register(command_shop, Command("shop"))
dp.message.register(command_sell_nft, Command("sellnft"))
dp.message.register(command_tasks, Command("tasks"))
dp.message.register(command_about, Command("about"))
dp.message.register(command_help, Command("help"))
dp.message.register(command_menu, Command("menu"))
dp.message.register(command_topup, Command("topup"))
dp.message.register(command_withdraw, Command("withdraw"))
dp.message.register(handle_receipt, F.photo | F.document)
dp.pre_checkout_query.register(handle_pre_checkout_query)
dp.message.register(handle_successful_payment, F.successful_payment)
dp.callback_query.register(callback_tasks, F.data == "tasks")
dp.callback_query.register(callback_daily_gift, F.data == "daily_gift")
dp.callback_query.register(callback_promo, F.data == "promo_prompt")
dp.callback_query.register(callback_main_menu, F.data == "main_menu")
dp.callback_query.register(callback_help, F.data == "help_menu")
dp.callback_query.register(callback_about, F.data == "about_project")
dp.callback_query.register(callback_referral_link, F.data == "referral_link")
dp.callback_query.register(callback_provide_receipt, F.data == "provide_receipt")
dp.callback_query.register(callback_inventory, F.data == "inventory")
dp.callback_query.register(callback_shop, F.data == "shop")
dp.callback_query.register(callback_shop_buy, F.data.startswith("shop_buy:"))
dp.callback_query.register(callback_sell_nft, F.data == "sell_nft")
dp.callback_query.register(callback_sell_nft_confirm, F.data.startswith("sell_nft:"))
# Капча и проверка подписки
dp.callback_query.register(callback_captcha_confirm, F.data == "captcha_confirm")
dp.callback_query.register(callback_check_sub_and_start, F.data == "check_sub_and_start")
# Входящие NFT-подарки
dp.message.register(handle_gift_received, F.gift)


async def on_startup() -> None:
    await api_client.startup()
    await bot.delete_webhook(drop_pending_updates=True)
    await configure_bot_metadata()
    logging.info("API client session started.")


async def on_shutdown() -> None:
    await api_client.shutdown()
    logging.info("API client session closed.")


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    dp.startup.register(on_startup)
    dp.shutdown.register(on_shutdown)
    await asyncio.gather(
        run_internal_server(),
        dp.start_polling(bot),
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logging.info("Bot stopped.")