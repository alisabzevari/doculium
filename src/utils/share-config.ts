export interface SharedConfig {
  aiType: string;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  tursoUrl: string;
  tursoToken: string;
}

export function encodeShareConfig(config: SharedConfig): string {
  return btoa(JSON.stringify(config));
}

export function decodeShareConfig(encoded: string): SharedConfig | null {
  try {
    return JSON.parse(atob(encoded));
  } catch {
    return null;
  }
}

export function buildShareUrl(config: SharedConfig): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`;
  return `${base}?config=${encodeURIComponent(encodeShareConfig(config))}`;
}
