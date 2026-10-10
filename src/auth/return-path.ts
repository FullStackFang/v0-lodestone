const LOCAL_ORIGIN = "https://lodestone.invalid";
const FALLBACK = "/lodestone";
const UNSAFE_CHARACTERS = /[\\\u0000-\u001f\u007f]/;

export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.length > 2048 || UNSAFE_CHARACTERS.test(value)) return FALLBACK;
  try {
    const url = new URL(value, LOCAL_ORIGIN);
    const pathname = decodeURIComponent(url.pathname);
    // Reject encoded separators and nested escapes before a second redirect can reinterpret them.
    if (url.origin !== LOCAL_ORIGIN || pathname.startsWith("//") || UNSAFE_CHARACTERS.test(pathname) || pathname.includes("%")) return FALLBACK;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return FALLBACK;
  }
}
