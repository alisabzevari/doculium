import { type CSSResult, unsafeCSS } from 'lit';

let _cachedStyles: CSSResult | null = null;

export function getGlobalStyles(): CSSResult {
  if (!_cachedStyles) {
    _cachedStyles = unsafeCSS(':host { display: contents; }');
  }
  return _cachedStyles;
}
