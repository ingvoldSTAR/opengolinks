/** What a QR code encodes: the short URL plus a marker, so scans can be counted apart from clicks. */
export function qrTarget(host: string, slug: string): string {
  return `${shortUrl(host, slug)}?qr=1`;
}

export function shortUrl(host: string, slug: string): string {
  const local = host === "localhost" || host.startsWith("127.") || host.endsWith(".localhost");
  return `${local ? "http" : "https"}://${host}/${slug}`;
}
