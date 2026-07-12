export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
    const firstNewline = trimmed.indexOf('\n');
    if (firstNewline !== -1) {
      return trimmed.slice(firstNewline + 1, trimmed.length - 3).trim();
    }
  }
  return text;
}
