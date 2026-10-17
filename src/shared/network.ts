/** Converts user-friendly host names to Chrome DevTools URL patterns. */
export function blockedUrlPatterns(items: string[]): string[] {
  const output = new Set<string>();
  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    if (item.includes('://') || item.includes('*')) { output.add(item); continue; }
    const host = item.replace(/^\.+/, '').replace(/\/$/, '');
    output.add(`*://${host}/*`);
    if (!host.startsWith('*.')) output.add(`*://*.${host}/*`);
  }
  return [...output];
}
