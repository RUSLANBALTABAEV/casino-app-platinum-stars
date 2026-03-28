import random
from typing import Any, Dict, List, Optional, Tuple

from js import document
from pyodide.ffi import create_proxy

import lottery_ui

DEFAULT_LOTTERY_CONFIG: Dict[str, Any] = {
  "pools": [
    {
      "id": "nova-10",
      "name": "Nova 10",
      "participantLimit": 10,
      "ticketCost": 5,
      "prizePercent": 0.82,
      "distribution": [
        {"place": 1, "share": 0.7},
        {"place": 2, "share": 0.3}
      ]
    },
    {
      "id": "quantum-15",
      "name": "Quantum 15",
      "participantLimit": 15,
      "ticketCost": 9,
      "prizePercent": 0.88,
      "distribution": [
        {"place": 1, "share": 0.6},
        {"place": 2, "share": 0.25},
        {"place": 3, "share": 0.15}
      ]
    },
    {
      "id": "apex-25",
      "name": "Apex 25",
      "participantLimit": 25,
      "ticketCost": 12,
      "prizePercent": 0.9,
      "distribution": [
        {"place": 1, "share": 0.5},
        {"place": 2, "share": 0.25},
        {"place": 3, "share": 0.15},
        {"place": 4, "share": 0.1}
      ]
    }
  ]
}

LOTTERY_POOLS: Dict[str, Dict[str, Any]] = {}
POOL_ORDER: List[str] = []

STATE: Dict[str, Any] = {
  "balance": 120,
  "selected_pool": "",
  "pools": {}
}

EVENT_PROXIES: List[Any] = []
POOL_PROXIES: List[Any] = []

NAMES = [
  "Astra", "Nova", "Zenith", "Lyra", "Altair", "Orion", "Vega", "Phoenix", "Kest", "Mira",
  "Seren", "Onyx", "Aria", "Lumos", "Quill", "Vesper", "Helix", "Styx", "Echo", "Nyx"
]


def clamp(value: float, lower: float, upper: float) -> float:
  return max(lower, min(value, upper))


def coerce_positive_int(value: Any, fallback: int) -> int:
  try:
    parsed = int(float(value))
    if parsed > 0:
      return parsed
  except Exception:
    pass
  return fallback


def coerce_share(value: Any, fallback: float) -> float:
  try:
    parsed = float(value)
    if parsed > 1:
      parsed /= 100.0
    if parsed >= 0:
      return clamp(parsed, 0.0, 1.0)
  except Exception:
    pass
  return fallback


def normalize_lottery_config(config: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
  pools_map: Dict[str, Dict[str, Any]] = {}
  order: List[str] = []

  raw_pools = config.get("pools")
  if not isinstance(raw_pools, list) or not raw_pools:
    raise ValueError("Конфигурация лотерей должна содержать хотя бы один тариф.")

  for idx, entry in enumerate(raw_pools):
    if not isinstance(entry, dict):
      continue

    raw_id = entry.get("id") or entry.get("slug") or entry.get("name")
    pool_id = str(raw_id or f"pool-{idx}").strip().lower()
    if not pool_id:
      continue

    name = str(entry.get("name") or f"Лотерея #{idx + 1}")
    participant_limit = max(2, coerce_positive_int(entry.get("participantLimit"), 10))
    ticket_cost = max(1, coerce_positive_int(entry.get("ticketCost"), 1))
    prize_percent = coerce_share(
      entry.get("prizePercent", entry.get("winnerShare", entry.get("payoutPercent", 0.8))),
      0.8
    )

    raw_distribution = entry.get("distribution")
    distribution: List[Dict[str, Any]] = []
    if isinstance(raw_distribution, list) and raw_distribution:
      for dist_idx, dist_entry in enumerate(raw_distribution):
        if not isinstance(dist_entry, dict):
          continue
        place = max(1, coerce_positive_int(dist_entry.get("place"), dist_idx + 1))
        share = coerce_share(dist_entry.get("share", dist_entry.get("percent", 0.0)), 0.0)
        if share <= 0:
          continue
        distribution.append({"place": place, "share": share})

      distribution.sort(key=lambda item: item["place"])

    pools_map[pool_id] = {
      "id": pool_id,
      "name": name,
      "participantLimit": participant_limit,
      "ticketCost": ticket_cost,
      "prizePercent": prize_percent,
      "distribution": distribution
    }
    order.append(pool_id)

  if not order:
    raise ValueError("Не удалось получить валидные лотерейные тарифы.")

  global POOL_ORDER
  POOL_ORDER = order
  return pools_map


def ensure_pool_state(pool_id: str) -> Dict[str, Any]:
  pools_state = STATE.setdefault("pools", {})
  if pool_id not in pools_state:
    pools_state[pool_id] = {
      "tickets": [],
      "history": [],
      "draw_counter": 1,
      "last_winners": []
    }
  return pools_state[pool_id]


def get_current_context() -> Tuple[str, Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
  pool_id = STATE.get("selected_pool") or ""
  pool_cfg = LOTTERY_POOLS.get(pool_id)
  pool_state = ensure_pool_state(pool_id) if pool_cfg else None
  return pool_id, pool_cfg, pool_state


def apply_lottery_config(config: Dict[str, Any]) -> bool:
  try:
    normalized = normalize_lottery_config(config)
  except Exception as error:
    print("[Lottery] Failed to apply config:", error)
    return False

  global LOTTERY_POOLS
  LOTTERY_POOLS = normalized

  STATE["pools"] = {}
  for pool_id in POOL_ORDER:
    ensure_pool_state(pool_id)

  if STATE.get("selected_pool") not in LOTTERY_POOLS:
    STATE["selected_pool"] = POOL_ORDER[0]

  build_pool_selector()
  refresh_pool_ui()
  update_balance()
  return True


def format_stars(value: int) -> str:
  return f"{value:,}".replace(",", " ")


def update_balance() -> None:
  lottery_ui.elements["balance"].textContent = f"{format_stars(STATE['balance'])} ★"


def update_pot() -> None:
  _, cfg, pool_state = get_current_context()
  if not cfg or not pool_state:
    lottery_ui.elements["pot"].textContent = "0 ★"
    return
  pot_value = len(pool_state["tickets"]) * cfg["ticketCost"]
  lottery_ui.elements["pot"].textContent = f"{format_stars(pot_value)} ★"


def update_progress() -> None:
  _, cfg, pool_state = get_current_context()
  if not cfg or not pool_state:
    lottery_ui.elements["participantCount"].textContent = "0 / 0"
    lottery_ui.elements["progressFill"].style.width = "0%"
    return

  count = len(pool_state["tickets"])
  limit = cfg["participantLimit"]
  lottery_ui.elements["participantCount"].textContent = f"{count} / {limit}"
  fill = (count / limit) * 100 if limit else 0
  lottery_ui.elements["progressFill"].style.width = f"{fill}%"


def rerender_tickets() -> None:
  _, _, pool_state = get_current_context()
  container = lottery_ui.elements["ticketList"]
  container.innerHTML = ""
  if not pool_state:
    return

  last_entries = pool_state["tickets"][-8:]
  for ticket in reversed(last_entries):
    tile = document.createElement("div")
    tile.className = "ticket-item"

    ticket_id = document.createElement("span")
    ticket_id.className = "ticket-id"
    ticket_id.textContent = f"#{ticket['id']}"
    tile.appendChild(ticket_id)

    owner = document.createElement("span")
    owner.className = "ticket-owner"
    owner.textContent = ticket["owner"]
    tile.appendChild(owner)

    container.appendChild(tile)


def render_history() -> None:
  _, _, pool_state = get_current_context()
  feed = lottery_ui.elements["history"]
  feed.innerHTML = ""

  if not pool_state or not pool_state["history"]:
    placeholder = document.createElement("p")
    placeholder.className = "history-placeholder"
    placeholder.textContent = "Участвуйте в розыгрыше, чтобы увидеть результаты."
    feed.appendChild(placeholder)
    return

  for entry in pool_state["history"]:
    card = document.createElement("div")
    card.className = "history-entry"

    title = document.createElement("strong")
    title.textContent = entry["title"]
    card.appendChild(title)

    subtitle = document.createElement("span")
    subtitle.style.fontSize = "12px"
    subtitle.style.color = "rgba(244,244,245,0.6)"
    subtitle.textContent = entry["subtitle"]
    card.appendChild(subtitle)

    feed.appendChild(card)


def update_winner_card() -> None:
  _, cfg, pool_state = get_current_context()
  if not cfg or not pool_state or not pool_state["last_winners"]:
    lottery_ui.elements["winnerName"].textContent = "Победитель ещё не определён"
    lottery_ui.elements["winnerMeta"].textContent = "Покупайте билеты, чтобы стать первым победителем!"
    return

  primary_winner = pool_state["last_winners"][0]
  lottery_ui.elements["winnerName"].textContent = primary_winner["owner"]
  lottery_ui.elements["winnerMeta"].textContent = f"Выплата: {format_stars(primary_winner['reward'])} ★"


def random_name() -> str:
  return random.choice(NAMES) + random.choice(["", " X", " Prime", " Nova", " Zero"])


def build_pool_selector() -> None:
  container = lottery_ui.elements["poolSelector"]
  container.innerHTML = ""

  for proxy in POOL_PROXIES:
    try:
      proxy.destroy()
    except Exception:
      pass
  POOL_PROXIES.clear()

  for pool_id in POOL_ORDER:
    cfg = LOTTERY_POOLS[pool_id]
    button = document.createElement("button")
    button.className = "pool-chip"
    if pool_id == STATE["selected_pool"]:
      button.classList.add("is-active")
    button.dataset.poolId = pool_id

    title = document.createElement("span")
    title.className = "pool-chip__title"
    title.textContent = cfg["name"]
    button.appendChild(title)

    meta = document.createElement("span")
    meta.className = "pool-chip__meta"
    meta.textContent = f"{cfg['participantLimit']} мест • {cfg['ticketCost']} ★"
    button.appendChild(meta)

    def on_select(event, pool_key=pool_id):
      event.preventDefault()
      select_pool(pool_key)

    proxy = create_proxy(on_select)
    button.addEventListener("click", proxy)
    POOL_PROXIES.append(proxy)
    container.appendChild(button)

  highlight_active_pool()


def highlight_active_pool() -> None:
  container = lottery_ui.elements["poolSelector"]
  for child in container.children:
    try:
      if child.classList.contains("pool-chip"):
        pool_id = child.dataset.get("poolId") if child.dataset else None
        child.classList.toggle("is-active", pool_id == STATE["selected_pool"])
    except Exception:
      continue


def select_pool(pool_id: str) -> None:
  if pool_id not in LOTTERY_POOLS:
    return
  STATE["selected_pool"] = pool_id
  refresh_pool_ui()


def refresh_pool_ui() -> None:
  pool_id, cfg, pool_state = get_current_context()
  if not cfg or not pool_state:
    return

  subtitle = lottery_ui.elements["subtitle"]
  prize_percent = int(cfg["prizePercent"] * 100)
  subtitle.textContent = (
    f"{cfg['name']} • {cfg['participantLimit']} участников • Билет {cfg['ticketCost']} ★ • "
    f"{prize_percent}% банка в призах"
  )

  lottery_ui.buttons["buyTicket"].textContent = f"Купить билет за {cfg['ticketCost']} ★"
  lottery_ui.buttons["simulate"].textContent = f"Заполнить до {cfg['participantLimit']} участников"

  update_pot()
  update_progress()
  rerender_tickets()
  render_history()
  update_winner_card()
  update_balance()
  highlight_active_pool()


def append_history(entry: Dict[str, Any]) -> None:
  _, _, pool_state = get_current_context()
  if not pool_state:
    return

  pool_state["history"].insert(0, entry)
  pool_state["history"] = pool_state["history"][:6]
  render_history()


def draw_winner() -> None:
  pool_id, cfg, pool_state = get_current_context()
  if not cfg or not pool_state:
    return

  tickets = pool_state["tickets"]
  if len(tickets) < cfg["participantLimit"]:
    return

  pot = len(tickets) * cfg["ticketCost"]
  available_tickets = tickets.copy()
  random.shuffle(available_tickets)

  winners: List[Dict[str, Any]] = []
  distribution = cfg["distribution"] if cfg["distribution"] else []

  if distribution:
    for entry in distribution:
      if not available_tickets:
        break
      ticket = available_tickets.pop()
      reward = int(pot * entry["share"])
      winners.append({
        "place": entry["place"],
        "ticket": ticket,
        "owner": ticket["owner"],
        "reward": reward
      })
  else:
    ticket = random.choice(tickets)
    reward = int(pot * cfg["prizePercent"])
    winners.append({
      "place": 1,
      "ticket": ticket,
      "owner": ticket["owner"],
      "reward": reward
    })

  if not winners:
    return

  user_winnings = sum(winner["reward"] for winner in winners if winner["owner"] == "Вы")
  if user_winnings > 0:
    STATE["balance"] += user_winnings
    lottery_ui.showToast(f"Вы выиграли {format_stars(user_winnings)} ★!")
  else:
    winner_names = ", ".join(winner["owner"] for winner in winners[:2])
    lottery_ui.showToast(f"Победители: {winner_names}")

  draw_index = pool_state["draw_counter"]
  summary_parts = []
  for winner in winners:
    summary_parts.append(
      f"{winner['owner']} — {format_stars(winner['reward'])} ★"
    )
  summary = " • ".join(summary_parts)

  append_history({
    "title": f"Тираж #{draw_index}",
    "subtitle": summary
  })

  pool_state["draw_counter"] += 1
  pool_state["tickets"] = []
  pool_state["last_winners"] = winners

  update_winner_card()
  update_pot()
  update_progress()
  rerender_tickets()


def handle_buy_ticket(_event=None) -> None:
  pool_id, cfg, pool_state = get_current_context()
  if not cfg or not pool_state:
    return

  if len(pool_state["tickets"]) >= cfg["participantLimit"]:
    lottery_ui.showToast("Тираж уже сформирован. Дождитесь розыгрыша.")
    return

  if STATE["balance"] < cfg["ticketCost"]:
    lottery_ui.showToast("Недостаточно звёзд для покупки билета.")
    return

  STATE["balance"] -= cfg["ticketCost"]

  ticket_id = f"{len(pool_state['tickets']) + 1:02d}"
  pool_state["tickets"].append({"id": ticket_id, "owner": "Вы"})

  update_balance()
  update_pot()
  update_progress()
  rerender_tickets()

  lottery_ui.showToast("Билет приобретён!")

  if len(pool_state["tickets"]) >= cfg["participantLimit"]:
    draw_winner()


def simulate_fill(_event=None) -> None:
  pool_id, cfg, pool_state = get_current_context()
  if not cfg or not pool_state:
    return

  if len(pool_state["tickets"]) >= cfg["participantLimit"]:
    lottery_ui.showToast("Тираж заполнен. Покупайте билеты в следующем.")
    return

  remaining = cfg["participantLimit"] - len(pool_state["tickets"])
  additions = min(remaining, random.randint(5, max(6, remaining)))
  for _ in range(additions):
    ticket_id = f"{len(pool_state['tickets']) + 1:02d}"
    pool_state["tickets"].append({"id": ticket_id, "owner": random_name()})

  update_pot()
  update_progress()
  rerender_tickets()

  if len(pool_state["tickets"]) >= cfg["participantLimit"]:
    draw_winner()
  else:
    lottery_ui.showToast("Добавлены новые участники.")


def clear_history(_event=None) -> None:
  _, _, pool_state = get_current_context()
  if not pool_state:
    return
  pool_state["history"] = []
  pool_state["last_winners"] = []
  pool_state["draw_counter"] = 1
  render_history()
  update_winner_card()
  lottery_ui.showToast("История очищена")


def initialize() -> None:
  apply_lottery_config(DEFAULT_LOTTERY_CONFIG)

  buy_proxy = create_proxy(handle_buy_ticket)
  simulate_proxy = create_proxy(simulate_fill)
  clear_proxy = create_proxy(clear_history)

  lottery_ui.buttons["buyTicket"].addEventListener("click", buy_proxy)
  lottery_ui.buttons["simulate"].addEventListener("click", simulate_proxy)
  lottery_ui.buttons["clearHistory"].addEventListener("click", clear_proxy)

  EVENT_PROXIES.extend([buy_proxy, simulate_proxy, clear_proxy])


initialize()
