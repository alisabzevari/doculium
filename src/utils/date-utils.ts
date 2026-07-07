export function parseDateFromText(text: string): string | null {
  const patterns = [
    /(\d{4})-(\d{2})-(\d{2})/,
    /(\d{2})\/(\d{2})\/(\d{4})/,
    /(\d{2})\.(\d{2})\.(\d{4})/,
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i,
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (pattern.toString().includes('January')) {
        const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        const monthIdx = months.indexOf(match[1].toLowerCase());
        const day = parseInt(match[2]);
        const year = parseInt(match[3]);
        if (monthIdx >= 0) {
          return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      } else if (pattern.toString().includes('(January|February')) {
        const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        const monthIdx = months.indexOf(match[2].toLowerCase());
        const day = parseInt(match[1]);
        const year = parseInt(match[3]);
        if (monthIdx >= 0) {
          return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      } else {
        return match[0];
      }
    }
  }

  return null;
}

export function extractYear(text: string): number {
  const yearMatch = text.match(/\b(20\d{2})\b/);
  return yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
}
