import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { Settings } from '@/lib/types';
import { queryAnthropic } from '@/lib/providers/anthropic';
import { queryOpenAI } from '@/lib/providers/openai';
import { queryPerplexity } from '@/lib/providers/perplexity';

interface BootstrapRequest {
  domain?: string;
  count?: number;
}

interface PromptCandidate {
  name: string;
  content: string;
  category?: string | null;
  best_page_url?: string | null;
}

interface ModelOutput {
  discoveries: string[];
  prompts: PromptCandidate[];
}

interface ParsedPage {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  snippet: string;
}

interface SiteContext {
  summary: string;
  suggestedTerms: string[];
  locationCandidates: string[];
}

const MAX_PAGES = 5;
const DEFAULT_PROMPT_COUNT = 30;
const MIN_PROMPT_COUNT = 10;
const MAX_PROMPT_COUNT = 40;
const FETCH_TIMEOUT_MS = 8000;

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'been', 'being', 'below', 'between', 'both',
  'because', 'before', 'cannot', 'could', 'every', 'from', 'have', 'having', 'into',
  'just', 'like', 'many', 'more', 'most', 'other', 'over', 'same', 'some', 'such',
  'than', 'that', 'their', 'there', 'these', 'they', 'this', 'those', 'through',
  'under', 'very', 'what', 'when', 'where', 'which', 'while', 'with', 'your',
  'http', 'https', 'www', 'home', 'page', 'contact', 'privacy', 'terms', 'cookie',
]);

function clampCount(value: number | undefined): number {
  if (!value || Number.isNaN(value)) return DEFAULT_PROMPT_COUNT;
  return Math.min(MAX_PROMPT_COUNT, Math.max(MIN_PROMPT_COUNT, Math.floor(value)));
}

function normalizeWebsiteInput(input: string): { domain: string; baseUrl: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    const domain = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const protocol = parsed.protocol === 'http:' ? 'http:' : 'https:';
    return {
      domain,
      baseUrl: `${protocol}//${parsed.hostname}`,
    };
  } catch {
    return null;
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFirstMatch(html: string, regex: RegExp): string {
  const match = regex.exec(html);
  return match ? stripTags(match[1]) : '';
}

function extractMetaDescription(html: string): string {
  const metaTags = html.match(/<meta[^>]*>/gi) || [];

  for (const tag of metaTags) {
    const nameMatch = /name=["']([^"']+)["']/i.exec(tag);
    const propertyMatch = /property=["']([^"']+)["']/i.exec(tag);
    const contentMatch = /content=["']([^"']+)["']/i.exec(tag);

    const key = (nameMatch?.[1] || propertyMatch?.[1] || '').toLowerCase();
    if (!contentMatch?.[1]) continue;

    if (key === 'description' || key === 'og:description') {
      return contentMatch[1].trim();
    }
  }

  return '';
}

function extractHeadings(html: string, limit = 4): string[] {
  const output: string[] = [];
  const headingRegex = /<(h1|h2)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null = null;

  while ((match = headingRegex.exec(html)) !== null && output.length < limit) {
    const cleaned = stripTags(match[2]);
    if (cleaned && !output.includes(cleaned)) output.push(cleaned);
  }

  return output;
}

function canonicalizeUrl(url: URL): string {
  const cloned = new URL(url.toString());
  cloned.hash = '';
  cloned.search = '';
  if (cloned.pathname !== '/') cloned.pathname = cloned.pathname.replace(/\/+$/, '');
  return `${cloned.origin}${cloned.pathname}`;
}

function extractInternalLinks(html: string, baseUrl: string, limit: number): string[] {
  const links = new Set<string>();
  const base = new URL(baseUrl);
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null = null;

  while ((match = linkRegex.exec(html)) !== null && links.size < limit) {
    const href = match[1].trim();
    if (!href || href.startsWith('#')) continue;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;

    try {
      const parsed = new URL(href, base);
      if (parsed.hostname !== base.hostname) continue;
      if (/\.(pdf|jpg|jpeg|png|webp|gif|zip|svg|js|css)$/i.test(parsed.pathname)) continue;

      const canonical = canonicalizeUrl(parsed);
      if (canonical !== canonicalizeUrl(base)) links.add(canonical);
    } catch {
      continue;
    }
  }

  return Array.from(links).slice(0, limit);
}

async function fetchHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'GEOTracker/1.0',
      },
    });

    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    const html = await response.text();
    return html.slice(0, 400_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPrimaryHtml(baseUrl: string): Promise<{ url: string; html: string } | null> {
  const firstTry = await fetchHtml(baseUrl);
  if (firstTry) return { url: baseUrl, html: firstTry };

  if (baseUrl.startsWith('https://')) {
    const fallbackUrl = baseUrl.replace(/^https:\/\//i, 'http://');
    const secondTry = await fetchHtml(fallbackUrl);
    if (secondTry) return { url: fallbackUrl, html: secondTry };
  }

  return null;
}

function parsePage(url: string, html: string): ParsedPage {
  const title = extractFirstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription = extractMetaDescription(html);
  const headings = extractHeadings(html);
  const snippet = stripTags(html).slice(0, 650);

  return {
    url,
    title,
    metaDescription,
    headings,
    snippet,
  };
}

async function buildSiteSnapshot(baseUrl: string): Promise<ParsedPage[]> {
  const primary = await fetchPrimaryHtml(baseUrl);
  if (!primary) return [];

  const pages: ParsedPage[] = [parsePage(primary.url, primary.html)];
  const links = extractInternalLinks(primary.html, primary.url, MAX_PAGES - 1);

  for (const link of links) {
    const html = await fetchHtml(link);
    if (!html) continue;
    pages.push(parsePage(link, html));
  }

  return pages;
}

function topTerms(text: string, count: number): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || [];
  const frequencies = new Map<string, number>();

  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;
    frequencies.set(word, (frequencies.get(word) || 0) + 1);
  }

  return Array.from(frequencies.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([word]) => word);
}

function slugToTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((value) => value.trim())
    .filter((value) => value.length >= 3);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function buildForbiddenTerms(domain: string, pages: ParsedPage[]): string[] {
  const terms: string[] = [];
  terms.push(domain.toLowerCase());

  const domainRoot = domain.replace(/\.[a-z0-9-]+$/i, '');
  terms.push(...slugToTokens(domainRoot));
  terms.push(domainRoot.toLowerCase());

  const homepageTitle = pages[0]?.title || '';
  if (homepageTitle) {
    const titleRoot = homepageTitle.split(/[-|:]/)[0]?.trim() || homepageTitle.trim();
    terms.push(...slugToTokens(titleRoot));
    terms.push(titleRoot.toLowerCase());
  }

  return unique(terms.filter((term) => term.length >= 3));
}

function hasForbiddenTerm(text: string, forbiddenTerms: string[]): boolean {
  const lower = text.toLowerCase();
  return forbiddenTerms.some((term) => {
    const normalized = term.toLowerCase().trim();
    if (!normalized) return false;
    return lower.includes(normalized);
  });
}

function extractLocationCandidates(pages: ParsedPage[], forbiddenTerms: string[]): string[] {
  const source = pages
    .map((page) => [page.title, page.metaDescription, ...page.headings].join(' | '))
    .join(' | ');

  const matches = source.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2}\b/g) || [];
  const clean = matches
    .map((value) => value.trim())
    .filter((value) => value.length >= 3)
    .filter((value) => !hasForbiddenTerm(value, forbiddenTerms))
    .filter((value) => !STOP_WORDS.has(value.toLowerCase()));

  return unique(clean).slice(0, 6);
}

function buildContext(domain: string, pages: ParsedPage[], forbiddenTerms: string[]): SiteContext {
  const pageSummaries = pages.map((page, index) => {
    const headings = page.headings.length ? page.headings.join(' | ') : 'n/a';
    const title = page.title || 'n/a';
    const description = page.metaDescription || 'n/a';
    const path = (() => {
      try {
        return new URL(page.url).pathname || '/';
      } catch {
        return '/';
      }
    })();

    return [
      `Page ${index + 1} (${path})`,
      `Title: ${title}`,
      `Description: ${description}`,
      `Headings: ${headings}`,
      `Snippet: ${page.snippet}`,
    ].join('\n');
  });

  const mergedText = pages
    .map((page) => `${page.title} ${page.metaDescription} ${page.headings.join(' ')} ${page.snippet}`)
    .join(' ');

  const suggestedTerms = topTerms(mergedText, 22).filter((term) => !hasForbiddenTerm(term, forbiddenTerms));
  const locationCandidates = extractLocationCandidates(pages, forbiddenTerms);

  return {
    summary: [
      `Domain: ${domain}`,
      `Pages analyzed: ${pages.length}`,
      pageSummaries.join('\n\n'),
    ].join('\n\n'),
    suggestedTerms: suggestedTerms.slice(0, 16),
    locationCandidates,
  };
}

function parseModelOutput(raw: string): ModelOutput | null {
  const attempts: string[] = [];
  attempts.push(raw.trim());

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    attempts.push(raw.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate) as Partial<ModelOutput>;
      if (!Array.isArray(parsed.prompts)) continue;

      return {
        discoveries: Array.isArray(parsed.discoveries)
          ? parsed.discoveries.filter((item): item is string => typeof item === 'string')
          : [],
        prompts: parsed.prompts.filter(
          (item): item is PromptCandidate =>
            !!item &&
            typeof item === 'object' &&
            typeof item.name === 'string' &&
            typeof item.content === 'string'
        ),
      };
    } catch {
      continue;
    }
  }

  return null;
}

function normalizePromptCandidates(
  candidates: PromptCandidate[],
  count: number,
  forbiddenTerms: string[]
): PromptCandidate[] {
  const seen = new Set<string>();
  const normalized: PromptCandidate[] = [];

  for (const candidate of candidates) {
    const content = candidate.content.trim();
    if (!content) continue;
    if (hasForbiddenTerm(content, forbiddenTerms) || hasForbiddenTerm(candidate.name, forbiddenTerms)) continue;

    const normalizedKey = content.toLowerCase();
    if (seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);

    const fallbackName = content.length > 56 ? `${content.slice(0, 53).trim()}...` : content;
    normalized.push({
      name: candidate.name.trim() || fallbackName,
      content,
      category: candidate.category?.trim() || null,
      best_page_url: candidate.best_page_url?.trim() || null,
    });

    if (normalized.length >= count) break;
  }

  return normalized;
}

function buildFallback(
  domain: string,
  pages: ParsedPage[],
  count: number,
  forbiddenTerms: string[],
  locationCandidates: string[]
): ModelOutput {
  const mergedText = pages
    .map((page) => `${page.title} ${page.metaDescription} ${page.headings.join(' ')} ${page.snippet}`)
    .join(' ');
  const terms = topTerms(mergedText, 24).filter((term) => !hasForbiddenTerm(term, forbiddenTerms));
  const primaryTerm = terms[0] || domain;
  const secondaryTerm = terms[1] || 'services';
  const audienceTerm = terms[2] || 'businesses';
  const locations = locationCandidates.length > 0 ? locationCandidates : ['Paris', 'London', 'New York'];

  const templates: Array<{
    category: string;
    make: (termA: string, termB: string, audience: string, location: string) => string;
  }> = [
    {
      category: 'informational',
      make: (termA, _termB, audience, location) => `What should ${audience} know before choosing ${termA} in ${location}?`,
    },
    {
      category: 'commercial',
      make: (termA, termB, audience, location) => `What are the best ${termA} providers offering ${termB} for ${audience} in ${location}?`,
    },
    {
      category: 'transactional',
      make: (termA, _termB, audience, location) => `I need ${termA} for ${audience} in ${location}. Which company should I contact first?`,
    },
    {
      category: 'comparison',
      make: (termA, termB, audience, location) => `Compare top ${termA} options in ${location} and explain how ${termB} differs for ${audience}.`,
    },
    {
      category: 'local',
      make: (termA, termB, audience, location) => `What does ${termA} usually include for ${audience} in ${location}, and how is ${termB} handled?`,
    },
  ];

  const prompts: PromptCandidate[] = [];
  let index = 0;
  while (prompts.length < count) {
    const template = templates[index % templates.length];
    const termA = terms[index % Math.max(terms.length, 1)] || primaryTerm;
    const termB = terms[(index + 1) % Math.max(terms.length, 1)] || secondaryTerm;
    const location = locations[index % locations.length];
    const content = template.make(termA, termB, audienceTerm, location);
    const name = `${template.category}: ${termA}`.slice(0, 60);
    prompts.push({
      name,
      content,
      category: template.category,
      best_page_url: null,
    });
    index++;
  }

  const discoveries: string[] = [];
  if (terms.length > 0) discoveries.push(`Top repeated topics: ${terms.slice(0, 5).join(', ')}`);
  discoveries.push(`Generated fallback prompts from ${pages.length} scanned pages.`);
  discoveries.push('Run a GEO batch now to validate mention and citation rates.');

  return { discoveries, prompts };
}

async function generateWithModel(
  settings: Settings | undefined,
  domain: string,
  requestedCount: number,
  context: string,
  suggestedTerms: string[],
  locationCandidates: string[],
  forbiddenTerms: string[]
): Promise<{ output: ModelOutput | null; providerUsed: string | null }> {
  const userPrompt = [
    'Generate starter GEO prompts for this website.',
    'Primary goal: evaluate whether this website appears in generic, non-branded searches.',
    `Return JSON only with this schema: {"discoveries": string[], "prompts": [{"name": string, "content": string, "category": string, "best_page_url": string|null}]}.`,
    `Generate exactly ${requestedCount} prompts.`,
    'Categories should be one of: informational, commercial, transactional, comparison, local.',
    'Prompts must be natural user questions, specific, and non-duplicated.',
    'Do not include or mention the website/app/company name in any prompt.',
    'Do not include domain names in any prompt.',
    `Forbidden terms: ${forbiddenTerms.join(', ')}`,
    locationCandidates.length > 0
      ? `Include local intent in many prompts and use these locations when relevant: ${locationCandidates.join(', ')}`
      : 'Include local intent in many prompts and include city/region wording where natural.',
    'If you are unsure about best_page_url, set it to null.',
    suggestedTerms.length > 0 ? `Suggested terms: ${suggestedTerms.join(', ')}` : '',
    '',
    context,
  ]
    .filter(Boolean)
    .join('\n');

  if (settings?.openai_api_key) {
    try {
      const raw = await queryOpenAI(settings.openai_api_key, userPrompt, 'gpt-4o-mini');
      const parsed = parseModelOutput(raw);
      if (parsed) return { output: parsed, providerUsed: 'openai' };
    } catch (error) {
      console.error('OpenAI bootstrap generation failed:', error);
    }
  }

  if (settings?.anthropic_api_key) {
    try {
      const raw = await queryAnthropic(settings.anthropic_api_key, userPrompt, 'claude-haiku-4-20250514');
      const parsed = parseModelOutput(raw);
      if (parsed) return { output: parsed, providerUsed: 'anthropic' };
    } catch (error) {
      console.error('Anthropic bootstrap generation failed:', error);
    }
  }

  if (settings?.perplexity_api_key) {
    try {
      const raw = await queryPerplexity(settings.perplexity_api_key, userPrompt, 'sonar');
      const parsed = parseModelOutput(raw);
      if (parsed) return { output: parsed, providerUsed: 'perplexity' };
    } catch (error) {
      console.error('Perplexity bootstrap generation failed:', error);
    }
  }

  return { output: null, providerUsed: null };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as BootstrapRequest;
    const count = clampCount(body.count);

    if (!body.domain?.trim()) {
      return NextResponse.json({ error: 'domain is required' }, { status: 400 });
    }

    const normalized = normalizeWebsiteInput(body.domain);
    if (!normalized) {
      return NextResponse.json({ error: 'invalid domain' }, { status: 400 });
    }

    const pages = await buildSiteSnapshot(normalized.baseUrl);
    if (pages.length === 0) {
      return NextResponse.json({ error: 'could not fetch website' }, { status: 400 });
    }

    const forbiddenTerms = buildForbiddenTerms(normalized.domain, pages);
    const { summary, suggestedTerms, locationCandidates } = buildContext(normalized.domain, pages, forbiddenTerms);

    const db = getDb();
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Settings | undefined;
    const generated = await generateWithModel(
      settings,
      normalized.domain,
      count,
      summary,
      suggestedTerms,
      locationCandidates,
      forbiddenTerms
    );

    const fallback = buildFallback(normalized.domain, pages, count, forbiddenTerms, locationCandidates);
    const output = generated.output || fallback;
    const normalizedPrompts = normalizePromptCandidates(output.prompts, count, forbiddenTerms);

    if (normalizedPrompts.length < MIN_PROMPT_COUNT) {
      const fallbackPrompts = normalizePromptCandidates(fallback.prompts, count, forbiddenTerms);
      for (const candidate of fallbackPrompts) {
        if (normalizedPrompts.length >= count) break;
        if (normalizedPrompts.some((item) => item.content.toLowerCase() === candidate.content.toLowerCase())) continue;
        normalizedPrompts.push(candidate);
      }
    }

    if (normalizedPrompts.length === 0) {
      return NextResponse.json({ error: 'failed to generate prompts' }, { status: 500 });
    }

    const collectionName = `Auto ${normalized.domain}`;
    const insertCollection = db.prepare('INSERT INTO collections (name) VALUES (?)');
    const insertPrompt = db.prepare('INSERT INTO prompts (name, content, category) VALUES (?, ?, ?)');
    const insertPromptCollection = db.prepare(
      'INSERT OR IGNORE INTO prompt_collections (prompt_id, collection_id) VALUES (?, ?)'
    );

    const transactionResult = db.transaction((promptsToStore: PromptCandidate[]) => {
      const collectionResult = insertCollection.run(collectionName);
      const collectionId = Number(collectionResult.lastInsertRowid);

      for (const prompt of promptsToStore) {
        const promptResult = insertPrompt.run(prompt.name, prompt.content, prompt.category || null);
        const promptId = Number(promptResult.lastInsertRowid);
        insertPromptCollection.run(promptId, collectionId);
      }

      return collectionId;
    })(normalizedPrompts);

    const discoveries = (output.discoveries || []).map((item) => item.trim()).filter(Boolean).slice(0, 6);
    const defaultDiscoveries =
      discoveries.length > 0
        ? discoveries
        : [
            `Scanned ${pages.length} pages from ${normalized.domain}.`,
            `Main terms: ${suggestedTerms.slice(0, 5).join(', ') || 'n/a'}.`,
          ];

    return NextResponse.json({
      collection_id: transactionResult,
      collection_name: collectionName,
      created_prompts: normalizedPrompts.length,
      discoveries: defaultDiscoveries,
      provider_used: generated.providerUsed,
      pages_scanned: pages.length,
    });
  } catch (error) {
    console.error('Error bootstrapping prompts:', error);
    return NextResponse.json({ error: 'Failed to bootstrap prompts' }, { status: 500 });
  }
}
