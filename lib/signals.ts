import { Signal } from './types';

// Extract all URLs from text
function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const matches = text.match(urlRegex) || [];
  return [...new Set(matches)]; // Remove duplicates
}

// Check if domain is mentioned in text (case-insensitive)
function isDomainMentioned(text: string, domain: string): boolean {
  if (!domain) return false;

  // Normalize domain (remove protocol and www)
  const normalizedDomain = domain
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');

  const lowerText = text.toLowerCase();

  // Check for domain mention
  return lowerText.includes(normalizedDomain);
}

// Check if domain is cited (appears in URLs)
function isDomainCited(urls: string[], domain: string): boolean {
  if (!domain || urls.length === 0) return false;

  const normalizedDomain = domain
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');

  return urls.some((url) => {
    const lowerUrl = url.toLowerCase();
    return lowerUrl.includes(normalizedDomain);
  });
}

// Extract context around domain mentions
function extractContext(text: string, domain: string, contextLength = 100): string[] {
  if (!domain) return [];

  const normalizedDomain = domain
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');

  const lowerText = text.toLowerCase();
  const contexts: string[] = [];

  let searchPos = 0;
  while (searchPos < lowerText.length) {
    const index = lowerText.indexOf(normalizedDomain, searchPos);
    if (index === -1) break;

    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + normalizedDomain.length + contextLength);
    const context = text.slice(start, end).trim();

    // Add ellipsis if truncated
    const prefix = start > 0 ? '...' : '';
    const suffix = end < text.length ? '...' : '';
    contexts.push(prefix + context + suffix);

    searchPos = index + normalizedDomain.length;
  }

  return contexts;
}

export function extractSignals(responseText: string, trackedDomain: string): Signal {
  const urls = extractUrls(responseText);
  const mentioned = isDomainMentioned(responseText, trackedDomain);
  const cited = isDomainCited(urls, trackedDomain);
  const context = extractContext(responseText, trackedDomain);

  return {
    mentioned,
    cited,
    urls,
    context,
  };
}
