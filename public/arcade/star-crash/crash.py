import math
import random
from typing import Optional

from js import document, window
from pyodide.ffi import create_proxy

import crash_ui

STATE = {
  "balance": 300,
  "bet": 50,
  "running": False,
  "cashed_out": False,
  "multiplier": 1.0,
  "crash_point": 0.0,
  "start_time": 0.0,
  "animation_proxy": None,
  "history": [],
  "round_index": 1,
  "last_cashout": None
}

EVENT_PROXIES = []

canvas = crash_ui.elements["canvas"]
CTX = canvas.getContext("2d")
canvas_width = 0
canvas_height = 0


def resize_canvas() -> None:
  global canvas_width, canvas_height
  rect = canvas.getBoundingClientRect()
  canvas.width = math.floor(rect.width * window.devicePixelRatio)
  canvas.height = math.floor(rect.height * window.devicePixelRatio)
  canvas.style.width = f"{rect.width}px"
  canvas.style.height = f"{rect.height}px"
  canvas_width = canvas.width
  canvas_height = canvas.height
  draw_chart(STATE["multiplier"])


def format_multiplier(value: float) -> str:
  return f"x{value:.2f}"


def format_stars(value: int) -> str:
  return f"{value:,}".replace(",", " ")


def update_balance_display() -> None:
  crash_ui.elements["balance"].textContent = f"{format_stars(STATE['balance'])} ★"


def update_bet_display() -> None:
  crash_ui.elements["betDisplay"].textContent = f"{STATE['bet']} ★"


def set_status(text: str, status: Optional[str] = None) -> None:
  crash_ui.elements["statusBadge"].textContent = text
  badge = crash_ui.elements["statusBadge"]
  badge.classList.remove("status-live", "status-prep", "status-crash", "status-win")
  if status:
    badge.classList.add(f"status-{status}")


def random_crash_point() -> float:
  roll = random.random()
  crash_value = 1 / (1 - roll)
  return round(min(max(crash_value, 1.2), 15.0), 2)


def draw_chart(multiplier: float) -> None:
  CTX.save()
  CTX.clearRect(0, 0, canvas_width, canvas_height)

  CTX.scale(window.devicePixelRatio, window.devicePixelRatio)

  width = canvas_width / window.devicePixelRatio
  height = canvas_height / window.devicePixelRatio

  CTX.fillStyle = "rgba(12,16,28,0.65)"
  CTX.fillRect(0, 0, width, height)

  CTX.strokeStyle = "rgba(255,255,255,0.12)"
  CTX.lineWidth = 1
  CTX.beginPath()
  for i in range(6):
    y = height - (i * (height / 5)) - 24
    CTX.moveTo(48, y)
    CTX.lineTo(width - 24, y)
  CTX.stroke()

  CTX.strokeStyle = "rgba(59,130,246,0.9)"
  CTX.lineWidth = 2.4
  CTX.beginPath()
  CTX.moveTo(48, height - 48)

  max_multiplier = max(multiplier, 2.0)
  segments = 60
  for step in range(1, segments + 1):
    progress = step / segments
    x = 48 + progress * (width - 72)
    y_multiplier = max_multiplier * progress
    y = height - 48 - (y_multiplier * 20)
    if y < 48:
      y = 48
    CTX.lineTo(x, y)
  CTX.stroke()

  CTX.restore()


def update_multiplier_display(value: float) -> None:
  crash_ui.elements["multiplierLabel"].textContent = format_multiplier(value)
  draw_chart(value)


def add_history_entry(result: str, payout: int) -> None:
  feed = crash_ui.elements["history"]
  placeholder = feed.querySelector(".history-placeholder")
  if placeholder:
    feed.removeChild(placeholder)

  card = document.createElement("div")
  card.className = "history-entry"

  title = document.createElement("strong")
  title.textContent = f"Раунд #{STATE['round_index']}"
  card.appendChild(title)

  status = document.createElement("span")
  status.style.fontSize = "12px"
  status.style.color = "rgba(244,244,245,0.65)"
  status.textContent = result
  card.appendChild(status)

  if payout:
    win = document.createElement("span")
    win.style.color = "rgba(16,185,129,0.9)"
    win.style.fontSize = "12px"
    win.textContent = f"Выплата: {format_stars(payout)} ★"
    card.appendChild(win)

  feed.prepend(card)
  STATE["history"].append({"result": result, "payout": payout})
  if len(STATE["history"]) > 6:
    STATE["history"].pop(0)
    last = feed.lastElementChild
    if last:
      feed.removeChild(last)


def end_round(crashed: bool) -> None:
  STATE["running"] = False
  crash_ui.buttons["start"].disabled = False
  crash_ui.buttons["cashout"].disabled = True
  STATE["round_index"] += 1
  if crashed:
    set_status("Краш", "crash")
  else:
    set_status("Ожидание", "prep")


def animation_frame(timestamp):
  if not STATE["running"]:
    return

  elapsed = (timestamp - STATE["start_time"]) / 1000
  growth = 1.0 + elapsed * 1.4
  multiplier = min(growth, STATE["crash_point"])
  STATE["multiplier"] = multiplier
  update_multiplier_display(multiplier)

  if multiplier >= STATE["crash_point"]:
    crash_ui.showToast("Crash! Корабль обрушился.")
    add_history_entry(f"Crash на {format_multiplier(STATE['crash_point'])}", 0)
    end_round(True)
    return

  STATE["animation_proxy"] = window.requestAnimationFrame(ANIMATION_PROXY)


def start_round(_event=None) -> None:
  if STATE["running"]:
    return

  bet_input = crash_ui.elements["betInput"]
  try:
    bet_value = int(bet_input.value)
  except Exception:
    bet_value = STATE["bet"]

  bet_value = max(1, min(500, bet_value))

  if bet_value > STATE["balance"]:
    crash_ui.showToast("Недостаточно звёзд для ставки.")
    return

  STATE["bet"] = bet_value
  crash_ui.elements["betInput"].value = str(bet_value)
  update_bet_display()

  STATE["balance"] -= bet_value
  update_balance_display()

  STATE["running"] = True
  STATE["cashed_out"] = False
  STATE["multiplier"] = 1.0
  STATE["crash_point"] = random_crash_point()
  STATE["start_time"] = window.performance.now()

  crash_ui.buttons["start"].disabled = True
  crash_ui.buttons["cashout"].disabled = False
  set_status("В полёте", "live")
  crash_ui.showToast("Раунд запущен!")

  update_multiplier_display(1.0)
  STATE["animation_proxy"] = window.requestAnimationFrame(ANIMATION_PROXY)


def cashout(_event=None) -> None:
  if not STATE["running"] or STATE["cashed_out"]:
    return

  payout = int(STATE["bet"] * STATE["multiplier"])
  STATE["balance"] += payout
  update_balance_display()
  crash_ui.showToast(f"Вы забрали {format_stars(payout)} ★!")
  add_history_entry(f"Cashout на {format_multiplier(STATE['multiplier'])}", payout)
  STATE["cashed_out"] = True
  end_round(False)


def apply_chip(event) -> None:
  value = event.currentTarget.dataset.bet
  if not value:
    return
  crash_ui.elements["betInput"].value = value
  STATE["bet"] = int(value)
  update_bet_display()


def sync_bet_input(_event=None) -> None:
  try:
    value = int(crash_ui.elements["betInput"].value)
  except Exception:
    value = STATE["bet"]
  value = max(1, min(500, value))
  crash_ui.elements["betInput"].value = str(value)
  STATE["bet"] = value
  update_bet_display()


def clear_history(_event=None) -> None:
  STATE["history"].clear()
  feed = crash_ui.elements["history"]
  feed.innerHTML = ""
  placeholder = document.createElement("p")
  placeholder.className = "history-placeholder"
  placeholder.textContent = "Запустите раунд, чтобы увидеть результаты."
  feed.appendChild(placeholder)
  crash_ui.showToast("История очищена")


def setup() -> None:
  resize_canvas()
  update_balance_display()
  update_bet_display()
  set_status("Ожидание", "prep")

  start_proxy = create_proxy(start_round)
  cashout_proxy = create_proxy(cashout)
  clear_proxy = create_proxy(clear_history)
  input_proxy = create_proxy(sync_bet_input)
  resize_proxy = create_proxy(lambda _event=None: resize_canvas())

  EVENT_PROXIES.extend([start_proxy, cashout_proxy, clear_proxy, input_proxy, resize_proxy])

  crash_ui.buttons["start"].addEventListener("click", start_proxy)
  crash_ui.buttons["cashout"].addEventListener("click", cashout_proxy)
  crash_ui.buttons["clearHistory"].addEventListener("click", clear_proxy)
  crash_ui.elements["betInput"].addEventListener("change", input_proxy)
  window.addEventListener("resize", resize_proxy)

  for chip in crash_ui.buttons["chips"]:
    proxy = create_proxy(apply_chip)
    EVENT_PROXIES.append(proxy)
    chip.addEventListener("click", proxy)


ANIMATION_PROXY = create_proxy(animation_frame)

setup()
