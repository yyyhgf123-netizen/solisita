"""
Solisita Content Agent — Semantic Product Description Rewriter
================================================================
Architecture:
  1. ShopifyAuth      — API 鉴权 & GraphQL client
  2. ProductFetcher   — 批量拉取 & 筛选候选商品
  3. DeepSeekClient   — AI 推理 (DeepSeek V4 Pro, OpenAI-compatible)
  4. ContentUpdater   — 解析结果 & 批量回写 Shopify

Execution modes:
  dry-run  → preview rewritten descriptions (no write)
  apply    → preview + write back to Shopify

Usage:
  python scripts/content-agent.py
  python scripts/content-agent.py --mode apply --limit 3
  python scripts/content-agent.py --mode dry-run --filter-tags "Gold-Tone"
"""

import os, sys, json, time, re, argparse, textwrap
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urljoin

import requests
from dotenv import load_dotenv

# ═══════════════════════════════════════════════════════════════
# Config
# ═══════════════════════════════════════════════════════════════

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

@dataclass
class Config:
    deepseek_api_key:    str = os.getenv('DEEPSEEK_API_KEY', '')
    deepseek_model:      str = os.getenv('DEEPSEEK_MODEL', 'deepseek-chat')
    deepseek_base_url:   str = os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1')

    shop_domain:         str = os.getenv('SHOPIFY_SHOP_DOMAIN', 'bgikuj-su.myshopify.com')
    shop_token:          str = os.getenv('SHOPIFY_ACCESS_TOKEN', '')
    shop_api_version:    str = os.getenv('SHOPIFY_API_VERSION', '2024-04')

    execution_mode:      str = os.getenv('EXECUTION_MODE', 'dry-run')
    product_limit:       int = int(os.getenv('PRODUCT_LIMIT', '5'))
    min_desc_length:     int = int(os.getenv('MIN_DESC_LENGTH', '100'))
    max_desc_length:     int = int(os.getenv('MAX_DESC_LENGTH', '800'))
    skip_title_words:    str = os.getenv('SKIP_TITLE_WORDS', '')
    filter_tags:         str = os.getenv('FILTER_TAGS', '')

    @property
    def shop_api_url(self) -> str:
        return f'https://{self.shop_domain}/admin/api/{self.shop_api_version}'

    @property
    def shop_graphql_url(self) -> str:
        return f'https://{self.shop_domain}/admin/api/{self.shop_api_version}/graphql.json'


# ═══════════════════════════════════════════════════════════════
# Module 1 — ShopifyAuth & GraphQL client
# ═══════════════════════════════════════════════════════════════

class ShopifyError(Exception):
    pass

class ShopifyClient:
    def __init__(self, config: Config):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({
            'X-Shopify-Access-Token': config.shop_token,
            'Content-Type': 'application/json',
        })

    def graphql(self, query: str, variables: dict = None) -> dict:
        payload = {'query': query}
        if variables:
            payload['variables'] = variables

        resp = self.session.post(
            self.config.shop_graphql_url,
            json=payload,
            timeout=30
        )

        if resp.status_code != 200:
            raise ShopifyError(f'Shopify returned {resp.status_code}: {resp.text[:300]}')

        body = resp.json()

        if 'errors' in body:
            msgs = [e.get('message', str(e)) for e in body['errors']]
            raise ShopifyError(f'GraphQL errors: {"; ".join(msgs)}')

        # Check cost header for rate-limit awareness
        cost = resp.headers.get('X-GraphQL-Cost-Requested-ActualQueryCost', '')
        remaining = resp.headers.get('X-GraphQL-Cost-ThrottleStatus-CurrentlyAvailable', '')
        if remaining:
            print(f'  [API] cost={cost}  remaining={remaining}')

        return body['data']


# ═══════════════════════════════════════════════════════════════
# Module 2 — ProductFetcher
# ═══════════════════════════════════════════════════════════════

@dataclass
class ProductCandidate:
    id:          str          # gid://shopify/Product/...
    title:       str
    handle:      str
    description: str
    product_type: str
    tags:        list[str] = field(default_factory=list)
    price:       str = ''
    desc_length: int = 0


class ProductFetcher:
    QUERY = """
    query($first: Int!, $after: String) {
      products(first: $first, after: $after, query: "status:active") {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            title
            handle
            description
            productType
            tags
            variants(first: 1) {
              edges {
                node {
                  price
                }
              }
            }
          }
        }
      }
    }
    """

    def __init__(self, client: ShopifyClient, config: Config):
        self.client = client
        self.config = config
        self.candidates: list[ProductCandidate] = []

    def fetch_all(self) -> list[ProductCandidate]:
        print('\n┌─── Phase 1: Fetching Products ─────────────┐')
        all_products = []
        has_next, cursor = True, None

        while has_next:
            variables = {'first': 50, 'after': cursor}
            data = self.client.graphql(self.QUERY, variables)
            page = data['products']
            for edge in page['edges']:
                node = edge['node']
                price = node['variants']['edges'][0]['node']['price'] if node['variants']['edges'] else '0'
                desc = (node['description'] or '').strip()
                all_products.append(ProductCandidate(
                    id=node['id'],
                    title=node['title'],
                    handle=node['handle'],
                    description=desc,
                    product_type=node['productType'] or '',
                    tags=node['tags'] or [],
                    price=price,
                    desc_length=len(desc),
                ))
            has_next = page['pageInfo']['hasNextPage']
            cursor = page['pageInfo']['endCursor']

        print(f'  Fetched {len(all_products)} active products')
        self._filter(all_products)
        return self.candidates

    def _filter(self, products: list[ProductCandidate]) -> None:
        skip_words = [w.strip().lower() for w in self.config.skip_title_words.split(',') if w.strip()]
        filter_tags = [t.strip() for t in self.config.filter_tags.split(',') if t.strip()]

        for p in products:
            if skip_words and any(w in p.title.lower() for w in skip_words):
                continue
            if filter_tags and not any(ft in p.tags for ft in filter_tags):
                continue
            # Include if description is at least min_desc_length and not over max_desc_length
            # (max_desc_length of 0 means no upper bound)
            if p.desc_length >= self.config.min_desc_length:
                if self.config.max_desc_length == 0 or p.desc_length <= self.config.max_desc_length:
                    self.candidates.append(p)

        if self.config.product_limit > 0:
            self.candidates = self.candidates[:self.config.product_limit]

        print(f'  Candidates for rewrite: {len(self.candidates)}')
        for c in self.candidates:
            print(f'    - {c.title} ({c.desc_length} chars)')


# ═══════════════════════════════════════════════════════════════
# Module 3 — DeepSeekClient
# ═══════════════════════════════════════════════════════════════

SYSTEM_PROMPT = textwrap.dedent("""\
You are the senior copywriter for Solisita, a UK-based jewellery brand.

Your task is to rewrite the product description below. Follow these rules strictly.

━━━ VOICE & TONE ━━━
- Use pure British English spelling and phrasing (colour, jewellery, centre, favourite).
- Elegant, conversational, understated — as if talking to a close friend.
- "Clean Girl" aesthetic: minimalist, effortless, refined. Never loud or pushy.
- Absolutely NO aggressive sales language: avoid "BUY NOW", "DON'T MISS OUT",
  "LIMITED TIME", "MUST HAVE", exclamation marks, or ALL-CAPS hype.
- Channel the understated confidence of Abbott Lyon and the seasonal storytelling of Orelia.

━━━ THREE-PART STRUCTURE (MANDATORY) ━━━

You MUST structure every description in exactly three paragraphs, in this order:

PARAGRAPH 1 — THE HOOK (1–2 sentences):
- Open with an emotional, atmospheric scene that places the product in everyday life.
- Use phrases like 'Your new everyday staple', 'Understated elegance',
  'Effortless refinement for everyday wear', 'A piece you will reach for daily'.
- This is the "Abbott Lyon" moment — warm, personal, never salesy.

PARAGRAPH 2 — THE DETAILS (all facts — MANDATORY):
- Translate ALL raw material, dimension, and weight data from the input into
  graceful, informative prose. Example: transform "Gold-Tone Copper Alloy" into
  "Crafted from premium gold-tone copper alloy with a durable, tarnish-resistant finish".
- YOU MUST INCLUDE EVERY dimension number present in the input (cm, mm, g, etc.).
  If the input says "17.5 cm + 3 cm Extension", BOTH numbers MUST appear.
  If the input says "Approx. 7 g", the weight MUST appear.
- Missing a single factual number from the input is a HARD FAILURE and will
  cause your output to be rejected. This is the most critical quality gate.

PARAGRAPH 3 — THE STYLING (1 sentence):
- Offer one styling tip in the voice of Orelia: understated, seasonal, aspirational.
- Examples: 'Style it solo for a refined look or stack with delicate chains.',
  'Pairs beautifully with soft neutrals and a crisp white shirt.',
  'The perfect finish for a polished, everyday uniform.'
- Keep it light — never prescriptive or bossy.

━━━ CATEGORY-STRICT KEYWORD SYNCHRONISATION ━━━
- You MUST accurately identify the product's specific category from its Title and Tags
  (e.g. bracelet, ring, necklace, earrings, jewellery set, bangle).
- Every long-tail SEO keyword you generate MUST match the exact product category.
- Example: if the product is a bracelet, all keywords must reference "bracelet"
  or "bangle" — NEVER inject "ring", "necklace", "earrings" or any other category.
- If the product is a set, keywords may reference the set type or "jewellery set".
- This is a HARD RULE. Violating it will cause the output to be rejected.

━━━ OUTPUT FORMAT ━━━
Return ONLY a valid JSON object with this exact structure:
{
  "description": "Paragraph 1: The Hook\n\nParagraph 2: The Details\n\nParagraph 3: The Styling",
  "keywords_used": ["keyword1", "keyword2", "keyword3"]
}

- Keep the total description between 150–250 words.
- \\n\\n separates paragraphs. Do NOT use bullet points or markdown.
- Do NOT include markdown code fences, explanations, or any text outside the JSON object.""")

# ── Fact-extraction helper: pull numeric dimensions from raw description ──

FACT_NUMBER_PATTERN = re.compile(
    r'(?:(?:Approx\.?\s*)?\d+(?:\.\d+)?\s*(?:cm|mm|g|kg|grams|inches|in|oz)\b)',
    re.IGNORECASE
)

def extract_fact_numbers(description: str) -> list[str]:
    return FACT_NUMBER_PATTERN.findall(description or '')


@dataclass
class RewriteResult:
    product:   ProductCandidate
    new_desc:  str
    keywords:  list[str]
    raw_json:  str
    success:   bool = True
    error:     str = ''
    retries:   int = 0


# Category cross-check map: for each product type, which words are FORBIDDEN
# in keywords and description. "Jewellery Set" has no restrictions.
CATEGORY_FORBIDDEN_MAP = {
    'Bracelet':       ['ring', 'necklace', 'earring', 'earrings', 'pendant'],
    'Ring':           ['bracelet', 'necklace', 'earring', 'earrings', 'pendant', 'bangle'],
    'Necklace':       ['bracelet', 'ring', 'earring', 'earrings', 'bangle'],
    'Earrings':       ['bracelet', 'ring', 'necklace', 'pendant', 'bangle'],
    'Earring':        ['bracelet', 'ring', 'necklace', 'pendant', 'bangle'],
    'Jewellery Set':  [],  # Sets can contain any category — no restrictions
    'Set':            [],
}

MAX_RETRIES = 3


class DeepSeekClient:
    def __init__(self, config: Config):
        self.config = config
        self.api_url = urljoin(config.deepseek_base_url.rstrip('/') + '/', 'chat/completions')

    def rewrite(self, product: ProductCandidate) -> RewriteResult:
        correction_note = ''
        src_facts = extract_fact_numbers(product.description)
        for attempt in range(1, MAX_RETRIES + 1):
            result = self._single_rewrite(product, correction_note)
            result.retries = attempt

            if not result.success:
                print(f'    ⚠️  Attempt {attempt}/{MAX_RETRIES} failed: {result.error}')
                if attempt < MAX_RETRIES:
                    correction_note = f'Your previous attempt failed: {result.error}'
                    time.sleep(2)
                continue

            cat_violation = self._validate_category(product, result)
            if cat_violation:
                print(f'    ⚠️  Attempt {attempt}/{MAX_RETRIES} — category violation: {cat_violation}')
                if attempt < MAX_RETRIES:
                    correction_note = (
                        f'YOUR PREVIOUS RESPONSE WAS REJECTED. Reason: {cat_violation}. '
                        f'CRITICAL RULE: The product is a {product.product_type}. '
                        f'Every keyword MUST contain "{product.product_type.lower()}" or a synonym of it. '
                        f'Do NOT reference any other jewellery category. This is a hard rule.'
                    )
                    print(f'    ↻ Retrying with correction ...')
                    time.sleep(2)
                else:
                    result.success = False
                    result.error = f'Category violation after {MAX_RETRIES} retries: {cat_violation}'
                    print(f'    ❌ SKIPPED: {result.error}')
                continue

            if src_facts:
                fact_violation = self._validate_facts(product, result, src_facts)
                if fact_violation:
                    print(f'    ⚠️  Attempt {attempt}/{MAX_RETRIES} — fact violation: {fact_violation}')
                    if attempt < MAX_RETRIES:
                        correction_note = (
                            f'YOUR PREVIOUS RESPONSE WAS REJECTED. Reason: {fact_violation}. '
                            f'The original description contained these dimension facts: {", ".join(src_facts)}. '
                            f'EVERY one of these MUST appear in your rewritten description. '
                            f'This is a hard requirement for quality assurance.'
                        )
                        print(f'    ↻ Retrying with fact correction ...')
                        time.sleep(2)
                    else:
                        result.success = False
                        result.error = f'Fact violation after {MAX_RETRIES} retries: {fact_violation}'
                        print(f'    ❌ SKIPPED: {result.error}')
                    continue

            print(f'    ✅ Validated (attempt {attempt})')
            return result

        return result

    def _validate_facts(self, product: ProductCandidate, result: RewriteResult, src_facts: list[str]) -> str:
        desc_lower = result.new_desc.lower()
        missing = []
        for fact in src_facts:
            norm = re.sub(r'\s+', ' ', fact.strip()).lower()
            if norm not in desc_lower:
                missing.append(f'"{fact.strip()}"')
        if missing:
            return f'missing dimension(s): {", ".join(missing)} (product: {product.title})'
        return ''

    def _validate_category(self, product: ProductCandidate, result: RewriteResult) -> str:
        forbidden = CATEGORY_FORBIDDEN_MAP.get(product.product_type)
        if forbidden is None or len(forbidden) == 0:
            return ''  # Unknown or unrestricted type — pass through

        # Use regex word-boundary matching to avoid substring false positives
        # e.g. "earrings" must NOT match the forbidden word "ring"
        for kw in result.keywords:
            kw_lower = kw.lower()
            for bad in forbidden:
                pattern = re.compile(r'\b' + re.escape(bad) + r'\b')
                if pattern.search(kw_lower):
                    return f'keyword "{kw}" contains forbidden category word "{bad}" (product type: {product.product_type})'

        # Check description (word boundary match)
        desc_lower = result.new_desc.lower()
        for bad in forbidden:
            pattern = re.compile(r'\b' + re.escape(bad) + r'\b')
            if pattern.search(desc_lower):
                return f'description contains forbidden category word "{bad}" (product type: {product.product_type})'

        return ''  # Clean

    def _single_rewrite(self, product: ProductCandidate, correction_note: str = '') -> RewriteResult:
        print(f'\n  ▶ Rewriting: {product.title} ...')

        user_message = (
            f"Product Title: {product.title}\n"
            f"Product Type: {product.product_type}\n"
            f"Price: £{product.price}\n"
            f"Tags: {', '.join(product.tags)}\n"
            f"Current Description:\n{product.description}\n"
        )
        if correction_note:
            user_message += f"\n--- CORRECTION ---\n{correction_note}"

        payload = {
            'model': self.config.deepseek_model,
            'messages': [
                {'role': 'system',    'content': SYSTEM_PROMPT},
                {'role': 'user',      'content': user_message},
            ],
            'temperature': 0.7,
            'max_tokens': 1200,
            'response_format': {'type': 'json_object'},
        }

        headers = {
            'Authorization': f'Bearer {self.config.deepseek_api_key}',
            'Content-Type': 'application/json',
        }

        try:
            resp = requests.post(
                self.api_url,
                json=payload,
                headers=headers,
                timeout=90
            )
            if resp.status_code != 200:
                return RewriteResult(
                    product=product, new_desc='', keywords=[],
                    raw_json='', success=False,
                    error=f'DeepSeek HTTP {resp.status_code}: {resp.text[:200]}'
                )

            body = resp.json()
            content = body['choices'][0]['message']['content']

            # Parse JSON from DeepSeek response
            parsed = json.loads(content)
            result = RewriteResult(
                product=product,
                new_desc=parsed.get('description', '').strip(),
                keywords=parsed.get('keywords_used', []),
                raw_json=content,
            )

            usage = body.get('usage', {})
            print(f'    tokens: in={usage.get("prompt_tokens", "?")}  out={usage.get("completion_tokens", "?")}  keywords={result.keywords}')
            return result

        except json.JSONDecodeError as e:
            return RewriteResult(
                product=product, new_desc='', keywords=[],
                raw_json=content if 'content' in locals() else '',
                success=False, error=f'JSON parse error: {e}'
            )
        except Exception as e:
            return RewriteResult(
                product=product, new_desc='', keywords=[],
                raw_json='', success=False, error=str(e)
            )


# ═══════════════════════════════════════════════════════════════
# Module 4 — ContentUpdater
# ═══════════════════════════════════════════════════════════════

class ContentUpdater:
    def __init__(self, client: ShopifyClient, config: Config):
        self.client = client
        self.config = config

    def apply(self, result: RewriteResult) -> bool:
        if self.config.execution_mode != 'apply':
            return self._preview(result)

        # Use inline arguments (no typed variables) to avoid GraphQL type ambiguity
        product_id = result.product.id
        desc_html = result.new_desc.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '<br>')
        merged_tags = list(set(result.product.tags + result.keywords))
        tags_json = json.dumps(merged_tags)

        mutation = f"""
        mutation {{
          productUpdate(input: {{
            id: "{product_id}",
            descriptionHtml: "{desc_html}",
            tags: {tags_json}
          }}) {{
            product {{
              id
              title
              description
            }}
            userErrors {{
              field
              message
            }}
          }}
        }}
        """

        try:
            data = self.client.graphql(mutation)
            errors = data['productUpdate']['userErrors']
            if errors:
                print(f'    ❌ Write error: {errors[0]["message"]}')
                return False
            print(f'    ✅ Written to Shopify')
            return True
        except ShopifyError as e:
            print(f'    ❌ {e}')
            return False

    def _preview(self, result: RewriteResult) -> bool:
        print(f'\n  ─── PREVIEW: {result.product.title} ───')
        print(f'  BEFORE ({result.product.desc_length} chars):')
        for line in textwrap.wrap(result.product.description or '(empty)', width=90):
            print(f'    {line}')
        print()
        print(f'  AFTER ({len(result.new_desc)} chars):')
        for line in textwrap.wrap(result.new_desc, width=90):
            print(f'    {line}')
        print(f'  Keywords: {result.keywords}')
        return True

    def update_tags_only(self, product_id: str, tags: list[str]) -> bool:
        if self.config.execution_mode != 'apply':
            print(f'  [dry-run] Would update tags for {product_id}: {tags}')
            return True

        mutation = """
        mutation($input: ProductInput!) {
          productUpdate(product: $input) {
            product { id tags }
            userErrors { field message }
          }
        }
        """
        existing = self._fetch_tags(product_id)
        merged = list(set(existing + tags))
        variables = {'input': {'id': product_id, 'tags': merged}}
        data = self.client.graphql(mutation, variables)
        errs = data['productUpdate']['userErrors']
        if errs:
            print(f'    ❌ Tag update error: {errs[0]["message"]}')
            return False
        return True

    def _fetch_tags(self, product_id: str) -> list[str]:
        query = """
        query($id: ID!) {
          product(id: $id) { tags }
        }
        """
        data = self.client.graphql(query, {'id': product_id})
        return data['product']['tags'] or []


# ═══════════════════════════════════════════════════════════════
# Main Pipeline
# ═══════════════════════════════════════════════════════════════

def validate_config(config: Config) -> bool:
    errors = []
    warnings = []
    if not config.deepseek_api_key or config.deepseek_api_key.startswith('sk-your-') or config.deepseek_api_key.startswith('sk-placeholder'):
        warnings.append('DEEPSEEK_API_KEY is not configured — AI rewrite will be skipped')
    if not config.shop_token:
        errors.append('SHOPIFY_ACCESS_TOKEN is not configured')

    if warnings:
        print('⚠️  Warnings:')
        for w in warnings:
            print(f'   - {w}')
        print()

    if errors:
        print('❌ Configuration errors:')
        for e in errors:
            print(f'   - {e}')
        print()
        print('   Copy .env.example to .env and fill in your credentials.')
        return False
    return True


def main():
    parser = argparse.ArgumentParser(description='Solisita Content Agent')
    parser.add_argument('--mode', choices=['dry-run', 'apply'],
                        help='dry-run=preview only, apply=write to Shopify')
    parser.add_argument('--limit', type=int,
                        help='Max products to process (default from .env)')
    parser.add_argument('--filter-tags', type=str,
                        help='Only process products with these tags (comma-separated)')
    args = parser.parse_args()

    config = Config()
    if args.mode:
        config.execution_mode = args.mode
    if args.limit is not None:
        config.product_limit = args.limit
    if args.filter_tags is not None:
        config.filter_tags = args.filter_tags

    if not validate_config(config):
        sys.exit(1)

    print('╔══════════════════════════════════════════════╗')
    print('║     Solisita Content Agent v1.0              ║')
    print('║     Mode: ' + config.execution_mode.ljust(34) + '║')
    print('╚══════════════════════════════════════════════╝')

    # ── Phase 1: Fetch ──
    shopify = ShopifyClient(config)
    fetcher = ProductFetcher(shopify, config)
    candidates = fetcher.fetch_all()

    if not candidates:
        print('\n  No candidates to process. Exiting.')
        return

    # ── Phase 2: AI Rewrite ──
    has_ai = config.deepseek_api_key and not config.deepseek_api_key.startswith('sk-your-') and not config.deepseek_api_key.startswith('sk-placeholder')

    results: list[RewriteResult] = []

    if has_ai:
        print(f'\n┌─── Phase 2: AI Rewrite ({len(candidates)} products) ─┤')
        deepseek = DeepSeekClient(config)
        for product in candidates:
            result = deepseek.rewrite(product)
            results.append(result)
            if not result.success:
                print(f'    ⚠️  Failed: {result.error}')
            time.sleep(1.5)
    else:
        print(f'\n┌─── Phase 2: Skipped (no DeepSeek API key) ──────┤')
        results = []

    # ── Phase 3: Write back ──
    print(f'\n┌─── Phase 3: Write-back ─────────────────────┐')
    updater = ContentUpdater(shopify, config)
    written, failed = 0, 0

    for r in results:
        if r.success:
            if updater.apply(r):
                written += 1
            else:
                failed += 1
        else:
            failed += 1

    # ── Summary ──
    print(f'\n╔══════════════════════════════════════════════╗')
    print(f'║  Summary: {written} written, {failed} failed              ║')
    print(f'╚══════════════════════════════════════════════╝')
    if config.execution_mode == 'dry-run':
        print('  (Dry-run mode — no changes were written to Shopify)')
        print('  To apply: python scripts/content-agent.py --mode apply')


if __name__ == '__main__':
    main()
