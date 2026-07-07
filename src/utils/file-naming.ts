export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

export function generateFilename(
  title: string,
  date: string | null,
  category: string,
  ext: string,
): string {
  const parts: string[] = [];

  if (date) {
    parts.push(date.slice(0, 10));
  }

  const clean = title
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase()
    .slice(0, 60);

  parts.push(clean);
  parts.push(category.toLowerCase());

  return `${parts.join('-')}${ext}`;
}
