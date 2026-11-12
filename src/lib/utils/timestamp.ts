/**
 * Filename stamp in **local** time.
 *
 * Captures are named for the person reading the file, so the name should match
 * the clock on their wall. `toISOString()` produces UTC, which previously made a
 * 01:12 local capture look like it predated a 00:44 commit. Filenames drop the
 * colon separators because they are illegal on some filesystems.
 */
export function localFileStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `T${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`,
  ].join("");
}

/** Local time with an explicit UTC offset, e.g. `2026-11-12T01:12:20+01:00`. */
export function localIsoWithOffset(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
