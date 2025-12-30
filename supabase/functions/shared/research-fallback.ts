export interface FallbackDecision {
  useFallback: boolean;
  reason: "hooks_zero" | "highlights_thin" | null;
  highlightsChars: number;
}

export interface FetchedDocument {
  title: string;
  url: string;
  text: string;
  highlights?: string[];
}

export function totalHighlightsChars(docs: FetchedDocument[]): number {
  return docs.reduce((sum, doc) => {
    if (!doc.highlights || doc.highlights.length === 0) return sum;
    return sum + doc.highlights.join(' ').length;
  }, 0);
}

export function shouldUseFallback(params: {
  docs: FetchedDocument[];
  hooksCount: number;
  minHighlightsChars?: number;
}): FallbackDecision {
  const { docs, hooksCount, minHighlightsChars = 600 } = params;
  const highlightsChars = totalHighlightsChars(docs);

  if (hooksCount === 0) {
    return { useFallback: true, reason: "hooks_zero", highlightsChars };
  }

  if (highlightsChars < minHighlightsChars) {
    return { useFallback: true, reason: "highlights_thin", highlightsChars };
  }

  return { useFallback: false, reason: null, highlightsChars };
}
