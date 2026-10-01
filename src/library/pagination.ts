const PAGE_SIZE = 24;

export function pageNumber(value: unknown): number {
  const page = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function paginate<T>(items: readonly T[], requestedPage: number) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(pageNumber(requestedPage), pages);
  return { items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: items.length, page, pages };
}
