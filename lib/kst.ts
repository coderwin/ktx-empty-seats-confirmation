export function kstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

export function kstToday() {
  const { year, month, day } = kstParts();
  return `${year}-${month}-${day}`;
}

export function kstTomorrow() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const { year, month, day } = kstParts(tomorrow);
  return `${year}-${month}-${day}`;
}

export function compactDate(isoDate: string) {
  return isoDate.replace(/-/g, "");
}

export function hhmmToCompact(time: string) {
  const [hour = "00", minute = "00"] = time.split(":");
  return `${hour}${minute}00`;
}

export function compactTimeToHhmm(value: string) {
  const padded = value.padStart(6, "0");
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
}

export function formatDateLabel(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${Number(month)}/${Number(day)} (${year})`;
}

export function isPastDate(isoDate: string) {
  return isoDate < kstToday();
}

export function formatCheckedAt(epochMs: number | null) {
  if (!epochMs) return "아직 확인 전";
  const { hour, minute, second } = kstParts(new Date(epochMs));
  return `${hour}:${minute}:${second}`;
}
