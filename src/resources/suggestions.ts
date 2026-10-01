type Suggestion = {
  need: { id: string; cardId: string };
  recommendation: { id: string; score: number; outcome: string | null };
};

export function selectSuggestions<T extends Suggestion>(rows: T[], cardId?: string, showAll = false): T[] {
  const counts = new Map<string, number>();
  return rows.filter(row => (!cardId || row.need.cardId === cardId) && row.recommendation.outcome !== "dismissed")
    .sort((a, b) => b.recommendation.score - a.recommendation.score || a.recommendation.id.localeCompare(b.recommendation.id))
    .filter(row => {
      const count = (counts.get(row.need.id) ?? 0) + 1;
      counts.set(row.need.id, count);
      return showAll || count <= 3;
    });
}
