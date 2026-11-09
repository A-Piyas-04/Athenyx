"use client";

import { useEffect, useMemo, useState } from "react";

function formatRelative(date: Date, now: number): string {
  const seconds = Math.round((now - date.getTime()) / 1000);
  if (seconds < 45) return "just now";

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];

  for (const [unit, unitSeconds] of units) {
    if (Math.abs(seconds) >= unitSeconds) {
      return formatter.format(-Math.round(seconds / unitSeconds), unit);
    }
  }
  return formatter.format(-seconds, "second");
}

/**
 * Shows a relative timestamp ("3 hours ago") with the absolute time on hover.
 * The absolute form renders first so server and client markup agree.
 */
export function RelativeTime({
  date,
  className,
}: {
  date: Date | string;
  className?: string;
}) {
  const value = useMemo(
    () => (typeof date === "string" ? new Date(date) : date),
    [date],
  );
  const absolute = value.toLocaleString();
  const [label, setLabel] = useState(absolute);

  useEffect(() => {
    const update = () => setLabel(formatRelative(value, Date.now()));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <time dateTime={value.toISOString()} title={absolute} className={className}>
      {label}
    </time>
  );
}
