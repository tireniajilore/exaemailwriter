export interface FetchedDocument {
  title: string;
  url: string;
  text: string;
  highlights?: string[];
}

export function buildContentSummary(
  docs: FetchedDocument[],
  mode: "normal" | "fallback"
): string {
  const maxDocs = 6;
  const limitedDocs = docs.slice(0, maxDocs);

  if (mode === "normal") {
    return limitedDocs.map((doc, i) => {
      const content = doc.highlights && doc.highlights.length > 0
        ? doc.highlights.slice(0, 3).join('\n').slice(0, 300)
        : doc.text.slice(0, 300);

      return `Source ${i + 1}: ${doc.title}\nURL: ${doc.url}\n${content}`;
    }).join('\n\n---\n\n');
  }

  if (mode === "fallback") {
    return limitedDocs.map((doc, i) => {
      const excerpt = doc.text.slice(0, 2200);
      return `Source ${i + 1}: ${doc.title}\nURL: ${doc.url}\n${excerpt}`;
    }).join('\n\n---\n\n');
  }

  return '';
}
