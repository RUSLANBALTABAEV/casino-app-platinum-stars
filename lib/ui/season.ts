export function isHolidaySeason(date: Date = new Date()): boolean {
  if (process.env.NEXT_PUBLIC_FORCE_HOLIDAY === '1') {
    return true;
  }

  const month = date.getMonth(); // 0 = Jan, 11 = Dec
  const day = date.getDate();

  if (month === 11) {
    return day >= 10;
  }

  if (month === 0) {
    return day <= 20;
  }

  return false;
}
