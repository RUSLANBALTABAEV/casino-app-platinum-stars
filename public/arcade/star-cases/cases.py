import random
from typing import Any, Dict, List

from js import document
from pyodide.ffi import create_proxy

import cases_ui

DEFAULT_CASE_CONFIG: Dict[str, Any] = {
  "cases": [
    {
      "id": "astro",
      "name": "Astro Explorer",
      "price": 120,
      "description": "Соберите экипировку первооткрывателя и найдите легендарные артефакты галактики.",
      "items": [
        {"name": "Шлем пионера", "rarity": "Эпический", "chance": 6, "weight": 6, "color": "#c084fc"},
        {"name": "Плащ кометы", "rarity": "Редкий", "chance": 14, "weight": 14, "color": "#38bdf8"},
        {"name": "Карманный магнитар", "rarity": "Легендарный", "chance": 2, "weight": 2, "color": "#fbbf24"},
        {"name": "Астро-компас", "rarity": "Необычный", "chance": 22, "weight": 22, "color": "#60a5fa"},
        {"name": "Пыль звёзд", "rarity": "Обычный", "chance": 56, "weight": 56, "color": "#f4f4f5"}
      ]
    },
    {
      "id": "nova",
      "name": "Nova Elite",
      "price": 220,
      "description": "Премиум-набор для лидеров сезонов. Бонусы и увеличенные шансы на звёзды.",
      "items": [
        {"name": "Знак Новы", "rarity": "Легендарный", "chance": 4, "weight": 4, "color": "#f97316"},
        {"name": "Звёздный бустер", "rarity": "Эпический", "chance": 10, "weight": 10, "color": "#c084fc"},
        {"name": "500 ★", "rarity": "Редкий", "chance": 16, "weight": 16, "color": "#facc15", "stars": 500},
        {"name": "200 ★", "rarity": "Необычный", "chance": 28, "weight": 28, "color": "#fde68a", "stars": 200},
        {"name": "95 ★", "rarity": "Обычный", "chance": 42, "weight": 42, "color": "#fff7ed", "stars": 95}
      ]
    },
    {
      "id": "guardian",
      "name": "Guardian Arsenal",
      "price": 160,
      "description": "Снаряжение защитника спонсорских арен. Усилители защиты и редкие жетоны.",
      "items": [
        {"name": "Щит света", "rarity": "Эпический", "chance": 8, "weight": 8, "color": "#22d3ee"},
        {"name": "Армейский дрон", "rarity": "Редкий", "chance": 18, "weight": 18, "color": "#38bdf8"},
        {"name": "Жетон арены", "rarity": "Редкий", "chance": 20, "weight": 20, "color": "#a5b4fc"},
        {"name": "Боевой стим", "rarity": "Необычный", "chance": 24, "weight": 24, "color": "#f4f4f5"},
        {"name": "75 ★", "rarity": "Обычный", "chance": 30, "weight": 30, "color": "#fde68a", "stars": 75}
      ]
    },
    {
      "id": "starlounge",
      "name": "Star Lounge",
      "price": 90,
      "description": "Кейс для быстрого пополнения коллекции. Бонусы для ежедневных миссий.",
      "items": [
        {"name": "Аватар премиум", "rarity": "Редкий", "chance": 12, "weight": 12, "color": "#fbbf24"},
        {"name": "Билет лотереи", "rarity": "Необычный", "chance": 20, "weight": 20, "color": "#60a5fa"},
        {"name": "45 ★", "rarity": "Обычный", "chance": 40, "weight": 40, "color": "#fde68a", "stars": 45},
        {"name": "25 ★", "rarity": "Обычный", "chance": 28, "weight": 28, "color": "#fef3c7", "stars": 25}
      ]
    }
  ]
}

CASE_CONFIG: Dict[str, Dict[str, Any]] = {}
CASE_ORDER: List[str] = []

STATE = {
  "selected_case": "astro",
  "balance": 1500,
  "inventory": {},
  "history": []
}

EVENT_PROXIES = []

def clamp(value: float, lower: float, upper: float) -> float:
  return max(lower, min(value, upper))


def coerce_positive_number(value: Any, fallback: float) -> float:
  try:
    parsed = float(value)
    if parsed > 0:
      return parsed
  except Exception:
    pass
  return fallback


def normalize_case_item(item_config: Dict[str, Any], index: int) -> Dict[str, Any]:
  name = str(item_config.get("name") or f"Приз #{index + 1}")
  rarity = str(item_config.get("rarity") or "Неизвестно")
  weight_input = item_config.get("weight", item_config.get("chance", 1))
  weight = coerce_positive_number(weight_input, 1.0)

  chance_input = item_config.get("chance")
  chance = coerce_positive_number(chance_input, 0.0)

  color = str(item_config.get("color") or "#f4f4f5")
  normalized: Dict[str, Any] = {
    "name": name,
    "rarity": rarity,
    "weight": weight,
    "color": color
  }

  if chance > 0:
    normalized["chance"] = clamp(chance, 0.01, 100.0)

  if "stars" in item_config:
    try:
      stars_value = int(item_config["stars"])
      if stars_value >= 0:
        normalized["stars"] = stars_value
    except Exception:
      pass

  if "description" in item_config:
    normalized["description"] = str(item_config.get("description") or "")

  return normalized


def normalize_case_config(config: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
  cases_map: Dict[str, Dict[str, Any]] = {}
  order: List[str] = []

  cases = config.get("cases")
  if not isinstance(cases, list) or not cases:
    raise ValueError("Конфигурация кейсов должна содержать хотя бы один контейнер.")

  for index, entry in enumerate(cases):
    if not isinstance(entry, dict):
      continue

    raw_id = entry.get("id") or entry.get("slug") or entry.get("name")
    case_id = str(raw_id or f"case-{index}").strip().lower()
    if not case_id:
      continue

    name = str(entry.get("name") or f"Контейнер {index + 1}")
    description = str(entry.get("description") or "")
    price = coerce_positive_number(entry.get("price"), 1.0)

    raw_items = entry.get("items")
    if not isinstance(raw_items, list) or not raw_items:
      continue

    items = [normalize_case_item(item, idx) for idx, item in enumerate(raw_items)]
    cases_map[case_id] = {
      "id": case_id,
      "name": name,
      "description": description,
      "price": int(price),
      "items": items
    }
    order.append(case_id)

  if not order:
    raise ValueError("Не удалось получить валидные кейсы из конфигурации.")

  global CASE_ORDER
  CASE_ORDER = order
  return cases_map


def apply_case_config(config: Dict[str, Any]) -> bool:
  try:
    normalized = normalize_case_config(config)
  except Exception as error:
    print("[Cases] Failed to apply config:", error)
    return False

  global CASE_CONFIG
  CASE_CONFIG = normalized

  if STATE["selected_case"] not in CASE_CONFIG:
    STATE["selected_case"] = CASE_ORDER[0]

  STATE["inventory"] = {}
  STATE["history"] = []

  history_container = cases_ui.elements["history"]
  history_container.innerHTML = ""
  placeholder = document.createElement("p")
  placeholder.className = "history-placeholder"
  placeholder.textContent = "Откройте кейс, чтобы увидеть результаты."
  history_container.appendChild(placeholder)

  render_preview()
  update_balance_display()
  return True


def format_stars(value: int) -> str:
  return f"{value:,}".replace(",", " ")


def update_balance_display() -> None:
  cases_ui.elements["balance"].textContent = f"{format_stars(STATE['balance'])} ★"
  if "balanceMobile" in cases_ui.elements:
    cases_ui.elements["balanceMobile"].textContent = f"{format_stars(STATE['balance'])} ★"
  total_items = sum(STATE["inventory"].values())
  cases_ui.elements["inventory"].textContent = (
    f"{total_items} предметов" if total_items else "0 предметов"
  )
  if "inventoryMobile" in cases_ui.elements:
    cases_ui.elements["inventoryMobile"].textContent = (
      f"{total_items} предметов" if total_items else "0 предметов"
    )


def build_case_cards() -> None:
  grid = cases_ui.elements["grid"]
  grid.innerHTML = ""

  for case_id in CASE_ORDER:
    cfg = CASE_CONFIG[case_id]
    card = document.createElement("button")
    card.className = "case-card"
    if case_id == STATE["selected_case"]:
      card.classList.add("is-active")
    card.dataset.caseId = case_id

    name = document.createElement("p")
    name.className = "case-name"
    name.textContent = cfg["name"]
    card.appendChild(name)

    description = document.createElement("p")
    description.className = "case-description"
    description.textContent = cfg["description"]
    card.appendChild(description)

    meta = document.createElement("div")
    meta.className = "case-meta"
    price = cfg["price"]
    meta.innerHTML = f'<span>Стоимость</span><span>{price} ★</span>'
    card.appendChild(meta)

    def on_select(event, case_key=case_id):
      event.preventDefault()
      select_case(case_key)

    proxy = create_proxy(on_select)
    EVENT_PROXIES.append(proxy)
    card.addEventListener("click", proxy)

    grid.appendChild(card)


def render_preview() -> None:
  case_id = STATE["selected_case"]
  cfg = CASE_CONFIG.get(case_id)
  if not cfg:
    return
  elements = cases_ui.elements

  elements["previewTitle"].textContent = cfg["name"]
  elements["previewPrice"].textContent = f"Стоимость: {cfg['price']} ★"
  elements["previewDescription"].textContent = cfg["description"]

  loot_container = elements["previewLoot"]
  loot_container.innerHTML = ""

  for item in cfg["items"]:
    loot = document.createElement("div")
    loot.className = "loot-item"
    loot.style.borderColor = f"{item['color']}40"

    name = document.createElement("div")
    name.className = "loot-name"
    name.textContent = item["name"]
    loot.appendChild(name)

    rarity = document.createElement("div")
    rarity.className = "loot-rarity"
    rarity.textContent = item["rarity"]
    loot.appendChild(rarity)

    chance = document.createElement("div")
    chance.className = "loot-chance"
    chance.textContent = f"Шанс ~ {item['chance']}%"
    loot.appendChild(chance)

    loot_container.appendChild(loot)

  build_case_cards()  # refresh selection state


def select_case(case_id: str) -> None:
  STATE["selected_case"] = case_id
  render_preview()


def choose_item(items) -> dict:
  total = sum(item["weight"] for item in items)
  roll = random.uniform(0, total)
  cumulative = 0.0
  for item in items:
    cumulative += item["weight"]
    if roll <= cumulative:
      return item
  return items[-1]


def append_history(entry: dict) -> None:
  feed = cases_ui.elements["history"]
  placeholder = feed.querySelector(".history-placeholder")
  if placeholder:
    feed.removeChild(placeholder)

  item = document.createElement("div")
  item.className = "history-entry"

  title = document.createElement("strong")
  title.textContent = entry["name"]
  item.appendChild(title)

  rarity = document.createElement("span")
  rarity.textContent = entry["rarity"]
  rarity.style.color = entry["color"]
  rarity.style.fontSize = "12px"
  rarity.style.textTransform = "uppercase"
  rarity.style.letterSpacing = "0.12em"
  item.appendChild(rarity)

  meta = document.createElement("span")
  meta.className = "history-meta"
  meta.textContent = entry["description"]
  item.appendChild(meta)

  feed.prepend(item)
  STATE["history"].append(entry)
  if len(STATE["history"]) > 6:
    STATE["history"].pop(0)
    last = feed.lastElementChild
    if last:
      feed.removeChild(last)


def handle_open_case(_event=None) -> None:
  case_id = STATE["selected_case"]
  case_cfg = CASE_CONFIG.get(case_id)
  if not case_cfg:
    return

  price = case_cfg["price"]
  if STATE["balance"] < price:
    cases_ui.showToast("Недостаточно звёзд для открытия кейса")
    return

  STATE["balance"] -= price
  reward = choose_item(case_cfg["items"])

  inventory = STATE["inventory"]
  inventory_key = reward["name"]
  inventory[inventory_key] = inventory.get(inventory_key, 0) + 1

  if "stars" in reward:
    STATE["balance"] += reward["stars"]

  update_balance_display()

  entry = {
    "name": reward["name"],
    "rarity": reward["rarity"],
    "color": reward["color"],
    "description": f"Шанс {reward['chance']}% • {case_cfg['name']}"
  }
  append_history(entry)

  if "stars" in reward:
    cases_ui.showToast(f"Получено {reward['stars']} ★!")
  else:
    cases_ui.showToast(f"Получено: {reward['name']}")


def handle_clear_history(_event=None) -> None:
  STATE["history"].clear()
  feed = cases_ui.elements["history"]
  feed.innerHTML = ""
  placeholder = document.createElement("p")
  placeholder.className = "history-placeholder"
  placeholder.textContent = "Откройте кейс, чтобы увидеть результаты."
  feed.appendChild(placeholder)
  cases_ui.showToast("История очищена")


def initialize() -> None:
  update_balance_display()
  render_preview()

  open_proxy = create_proxy(handle_open_case)
  clear_proxy = create_proxy(handle_clear_history)

  EVENT_PROXIES.extend([open_proxy, clear_proxy])

  cases_ui.buttons["openCase"].addEventListener("click", open_proxy)
  cases_ui.buttons["clearHistory"].addEventListener("click", clear_proxy)


apply_case_config(DEFAULT_CASE_CONFIG)
initialize()
