import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotionError, readNotionRecipes } from './notion-reader';

const sourceId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const databaseId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const pageId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const tableId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const rich = (value: string) => [{ type: 'text', plain_text: value, text: { content: value }, annotations: { bold: false } }];
let blockNumber = 0;
const block = (type: string, value: string) => ({ object: 'block', id: `00000000-0000-0000-0000-${String(++blockNumber).padStart(12, '0')}`, type, has_children: false, last_edited_time: '2026-10-19T12:00:00Z', [type]: { rich_text: rich(value) } });
const row = (amount: string, ingredient: string) => ({ ...block('table_row', ''), table_row: { cells: [rich(amount), rich(ingredient)] } });
const list = (results: unknown[], extra = {}) => ({ object: 'list', results, has_more: false, next_cursor: null, ...extra });
const metadata = () => ({ object: 'data_source', id: sourceId, last_edited_time: '2026-10-19T12:00:00Z', properties: { Name: { type: 'title', title: {} } } });
const page = (title = 'Chili') => ({ object: 'page', id: pageId, last_edited_time: '2026-10-19T12:00:00Z', parent: { type: 'data_source_id', data_source_id: sourceId }, properties: { Name: { type: 'title', title: rich(title) } } });
function fixture(count = 21) {
  const rows = [row('Amount', 'Ingredient'), ...Array.from({ length: count }, (_, i) => row(i === 0 ? '½ cup' : '', `Ingredient ${i + 1}`))];
  const blocks = [
    block('heading_2', 'Ingredients'),
    { object: 'block', id: tableId, type: 'table', has_children: true, table: { table_width: 2, has_column_header: true, has_row_header: false } },
    block('heading_2', 'Instructions'), block('heading_3', 'Sauce'),
    block('numbered_list_item', 'Mix ½ cup.\nKeep warm.'), block('numbered_list_item', 'Stir.'),
    block('heading_3', 'Salmon'), block('numbered_list_item', 'Bake.'),
    block('heading_3', 'Assembly'), block('numbered_list_item', 'Serve.'),
    block('heading_3', 'Recipe notes'), block('bulleted_list_item', 'Keep leftovers chilled.'),
    block('paragraph', 'First paragraph.'), block('paragraph', 'Second paragraph.'),
  ];
  return { rows, blocks };
}

type Handler = (url: URL, options: RequestInit, call: number) => Response | undefined;
function mockNotion(f = fixture(), override?: Handler) {
  const counts = new Map<string, number>();
  const fetcher = vi.fn(async (input: string | URL | Request, options: RequestInit = {}) => {
    const url = new URL(String(input));
    const key = `${options.method} ${url.pathname}`;
    const call = (counts.get(key) || 0) + 1;
    counts.set(key, call);
    const overridden = override?.(url, options, call);
    if (overridden) return overridden;
    if (url.pathname === `/v1/data_sources/${sourceId}`) return Response.json(metadata());
    if (url.pathname === `/v1/data_sources/${databaseId}`) return Response.json({}, { status: 404 });
    if (url.pathname === `/v1/databases/${databaseId}`) return Response.json({ object: 'database', id: databaseId, data_sources: [{ id: sourceId }] });
    if (url.pathname === `/v1/data_sources/${sourceId}/query`) return Response.json(list([page()]));
    if (url.pathname === `/v1/blocks/${pageId}/children`) return Response.json(list(f.blocks));
    if (url.pathname === `/v1/blocks/${tableId}/children`) return Response.json(list(f.rows));
    throw new Error('Unexpected request');
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('bounded Notion recipe reader', () => {
  it.each([21, 12, 11])('reads all %i ordered rows and preserves fractions, subsection steps and notes', async count => {
    const fetcher = mockNotion(fixture(count));
    const result = await readNotionRecipes('ntn_private', `collection://${sourceId}`);
    expect(result.dataSourceId).toBe(sourceId);
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0].ingredients).toHaveLength(count);
    expect(result.recipes[0].ingredients[0]).toEqual({ amount: '½ cup', ingredient: 'Ingredient 1' });
    expect(result.recipes[0].ingredients.at(-1)?.ingredient).toBe(`Ingredient ${count}`);
    expect(result.recipes[0].instructions).toContain('### Sauce\n\n1. Mix ½ cup.\nKeep warm.\n\n2. Stir.');
    expect(result.recipes[0].instructions).toContain('### Salmon\n\n1. Bake.');
    expect(result.recipes[0].instructions).toContain('### Recipe notes\n\n- Keep leftovers chilled.\n\nFirst paragraph.\n\nSecond paragraph.');
    for (const [url, options] of fetcher.mock.calls) {
      expect(new URL(String(url)).origin).toBe('https://api.notion.com');
      expect(options?.redirect).toBe('manual');
      expect(options?.headers).toMatchObject({ 'Notion-Version': '2025-09-03', Authorization: 'Bearer ntn_private' });
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      expect(['GET', 'POST']).toContain(options?.method);
    }
  });

  it.each(['https://www.notion.so/Recipes-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb?v=123', `https://notion.so/${databaseId}`, `https://app.notion.com/${databaseId}`])('resolves a single-source database URL %s', async source => {
    mockNotion();
    const result = await readNotionRecipes('token', source);
    expect(result.sourceUrl).toBe('https://www.notion.so/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    expect(result.recipes[0].pageId).toBe(pageId);
  });

  it('paginates inventory, blocks and ingredient rows on both full reads', async () => {
    const f = fixture();
    const fetcher = mockNotion(f, (url, options) => {
      if (url.pathname.endsWith('/query')) {
        const cursor = JSON.parse(String(options.body)).start_cursor;
        return Response.json(cursor ? list([page()]) : list([], { has_more: true, next_cursor: 'page-two' }));
      }
      if (url.pathname.endsWith('/children')) {
        const values = url.pathname.includes(pageId) ? f.blocks : f.rows;
        return Response.json(url.searchParams.has('start_cursor') ? list(values.slice(2)) : list(values.slice(0, 2), { has_more: true, next_cursor: 'rows-two' }));
      }
      return undefined;
    });
    expect((await readNotionRecipes('token', sourceId)).recipes[0].ingredients).toHaveLength(21);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/query'))).toHaveLength(4);
  });

  it.each(['https://evil.test/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', `http://notion.so/${sourceId}`, `https://notion.so.evil.test/${sourceId}`, `https://x@notion.so/${sourceId}`, `https://notion.so:8443/${sourceId}`, 'collection://not-an-id', 'not-an-id'])('rejects unsafe/invalid source before making requests: %s', async source => {
    const fetcher = mockNotion();
    await expect(readNotionRecipes('token', source)).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects ambiguous databases', async () => {
    mockNotion(fixture(), url => url.pathname.startsWith('/v1/databases/') ? Response.json({ object: 'database', id: databaseId, data_sources: [{ id: sourceId }, { id: pageId }] }) : undefined);
    await expect(readNotionRecipes('token', databaseId)).rejects.toThrow('exactly one');
  });

  it.each([sourceId, databaseId])('accepts unchanged content with distinct response request IDs for %s', async source => {
    mockNotion(fixture(), (url, _options, call) => {
      if (url.pathname === `/v1/data_sources/${sourceId}`) return Response.json({ ...metadata(), request_id: `source-request-${call}` });
      if (url.pathname === `/v1/databases/${databaseId}`) return Response.json({ object: 'database', id: databaseId, data_sources: [{ id: sourceId }], request_id: `database-request-${call}` });
      if (url.pathname.endsWith('/query')) return Response.json(list([page()], { request_id: `query-request-${call}` }));
      return undefined;
    });
    expect((await readNotionRecipes('token', source)).recipes[0].ingredients).toHaveLength(21);
  });

  it.each([401, 403, 404])('redacts upstream access failure %i', async status => {
    mockNotion(fixture(), url => url.pathname.endsWith('/query') ? Response.json({ message: 'ntn_secret user@example.com recipe private' }, { status }) : undefined);
    const error = await readNotionRecipes('ntn_secret', sourceId).catch(error => error);
    expect(error).toBeInstanceOf(NotionError);
    expect(error.status).toBe(400);
    expect(error.message).not.toMatch(/ntn_secret|user@example.com|recipe private/);
  });

  it('honors bounded Retry-After before retrying rate limits', async () => {
    vi.useFakeTimers();
    const fetcher = mockNotion(fixture(), (url, _options, call) => url.pathname.endsWith('/query') && call === 1 ? Response.json({}, { status: 429, headers: { 'Retry-After': '1' } }) : undefined);
    const pending = readNotionRecipes('token', sourceId);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/query'))).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).recipes).toHaveLength(1);
  });

  it('fails immediately when Retry-After exceeds the overall deadline', async () => {
    mockNotion(fixture(), () => Response.json({ message: 'private' }, { status: 429, headers: { 'Retry-After': '9999' } }));
    await expect(readNotionRecipes('token', sourceId)).rejects.toMatchObject({ status: 502 });
  });

  it('bounds hanging requests with abort timeouts and redacts network errors', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('ntn_private upstream secret')));
    }));
    vi.stubGlobal('fetch', fetcher);
    const rejected = expect(readNotionRecipes('ntn_private', sourceId)).rejects.toMatchObject({ status: 502, message: 'Notion could not be reached. Try syncing again later.' });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('retries transient failures only twice', async () => {
    vi.useFakeTimers();
    const fetcher = mockNotion(fixture(), () => Response.json({ message: 'token secret' }, { status: 503 }));
    const rejected = expect(readNotionRecipes('token', sourceId)).rejects.toThrow('busy or unavailable');
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('rejects oversized successful responses before parsing them', async () => {
    mockNotion(fixture(), () => new Response('x'.repeat(2_000_001)));
    await expect(readNotionRecipes('token', sourceId)).rejects.toThrow('safe response size');
  });

  it('rejects more than 100 recipes without attempting a partial import', async () => {
    const pages = Array.from({ length: 101 }, (_, index) => ({ ...page(), id: `11111111-1111-1111-1111-${String(index).padStart(12, '0')}` }));
    mockNotion(fixture(), url => url.pathname.endsWith('/query') ? Response.json(list(pages)) : undefined);
    await expect(readNotionRecipes('token', sourceId)).rejects.toThrow('too large');
  });

  it('rejects incomplete ingredient lists even when has_more is false', async () => {
    const f = fixture();
    mockNotion(f, url => url.pathname.includes(`/blocks/${tableId}/`) ? Response.json(list(f.rows, { request_status: { type: 'incomplete' } })) : undefined);
    await expect(readNotionRecipes('token', sourceId)).rejects.toThrow('incomplete');
  });

  it('accepts a stable later name update under the same page identity', async () => {
    mockNotion(fixture(), url => url.pathname.endsWith('/query') ? Response.json(list([page('Updated chili name')])) : undefined);
    expect((await readNotionRecipes('token', sourceId)).recipes[0]).toMatchObject({ pageId, title: 'Updated chili name' });
  });

  it.each([
    { request_status: { type: 'incomplete', incomplete_reason: 'query_result_limit_reached' } },
    { has_more: true, next_cursor: null },
    { has_more: false, next_cursor: 'unexpected' },
    { has_more: 'false' },
  ])('rejects incomplete/inconsistent query pagination %j', async extra => {
    mockNotion(fixture(), url => url.pathname.endsWith('/query') ? Response.json(list([page()], extra)) : undefined);
    await expect(readNotionRecipes('token', sourceId)).rejects.toBeInstanceOf(NotionError);
  });

  it('rejects a cursor loop', async () => {
    mockNotion(fixture(), url => url.pathname.endsWith('/query') ? Response.json(list([], { has_more: true, next_cursor: 'same' })) : undefined);
    await expect(readNotionRecipes('token', sourceId)).rejects.toThrow('pagination');
  });

  it.each(['missing ingredients', 'missing instructions', 'duplicate heading', 'unknown block', 'nested steps', 'wrong table', 'empty ingredient', 'missing title', 'duplicate pages'])('rejects unsupported recipe: %s', async problem => {
    const f = fixture();
    if (problem === 'missing ingredients') f.blocks.splice(0, 2);
    if (problem === 'missing instructions') f.blocks.splice(2);
    if (problem === 'duplicate heading') f.blocks.push(block('heading_2', 'Instructions'));
    if (problem === 'unknown block') f.blocks.push(block('toggle', 'Hidden instructions'));
    if (problem === 'nested steps') f.blocks[4].has_children = true;
    if (problem === 'wrong table') f.rows[0] = row('Ingredient', 'Amount');
    if (problem === 'empty ingredient') f.rows[1] = row('1', '');
    mockNotion(f, url => {
      if (!url.pathname.endsWith('/query')) return undefined;
      if (problem === 'missing title') return Response.json(list([page('')]));
      if (problem === 'duplicate pages') return Response.json(list([page(), page()]));
      return undefined;
    });
    await expect(readNotionRecipes('token', sourceId)).rejects.toBeInstanceOf(NotionError);
  });

  it('lists the first format problem in every invalid recipe with block, section, excerpt and a fix', async () => {
    const chili = fixture();
    chili.blocks.push(block('callout', 'Keep chilled'));
    const salad = fixture();
    salad.blocks.splice(1, 0, block('paragraph', '1 cup beans'));
    const burgers = fixture();
    const saladId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const burgersId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    mockNotion(chili, url => {
      if (url.pathname.endsWith('/query')) return Response.json(list([page('Chili'), { ...page('Salad'), id: saladId }, { ...page('Valid Burgers'), id: burgersId }]));
      if (url.pathname === `/v1/blocks/${saladId}/children`) return Response.json(list(salad.blocks));
      if (url.pathname === `/v1/blocks/${burgersId}/children`) return Response.json(list(burgers.blocks));
      return undefined;
    });
    const error = await readNotionRecipes('token', sourceId).catch(error => error);
    expect(error).toBeInstanceOf(NotionError);
    expect(error.status).toBe(400);
    expect(error.message).toContain('No changes were saved.');
    expect(error.message).toContain('First problem in each recipe:');
    expect(error.message).toContain('"Chili": Block 15 (callout) in Instructions "Keep chilled"');
    expect(error.message).toContain('Use numbered steps, plain text, bullet points or Heading 3');
    expect(error.message).toContain('"Salad": Block 2 (paragraph) in Ingredients "1 cup beans"');
    expect(error.message).toContain('Keep only the Amount / Ingredient table here');
    expect(error.message).not.toContain('Valid Burgers');
  });

  it.each(['Shopping', 'Shopping'.repeat(1000)])('identifies an unexpected heading with a bounded excerpt', async heading => {
    const f = fixture();
    f.blocks[0] = block('heading_2', heading);
    mockNotion(f);
    const error = await readNotionRecipes('token', sourceId).catch(error => error);
    expect(error.message).toContain(`"Chili": Block 1 (heading 2) before Ingredients: unexpected heading ${JSON.stringify(heading.slice(0, 100))}`);
    expect(error.message.length).toBeLessThan(500);
  });

  it.each(['name', 'removed page', 'added page', 'body', 'row', 'source', 'source property named request_id'])('fails closed when %s changes during the full read', async change => {
    const f = fixture();
    mockNotion(f, (url, _options, call) => {
      if (call < 2) return undefined;
      if (url.pathname.endsWith('/query')) {
        if (change === 'name') return Response.json(list([page('New name')]));
        if (change === 'removed page') return Response.json(list([]));
        if (change === 'added page') return Response.json(list([page(), { ...page(), id: tableId }]));
      }
      if (url.pathname.includes(`/blocks/${pageId}/`) && change === 'body') return Response.json(list([...f.blocks, block('paragraph', 'Changed')]));
      if (url.pathname.includes(`/blocks/${tableId}/`) && change === 'row') return Response.json(list([...f.rows, row('2', 'New ingredient')]));
      if (url.pathname === `/v1/data_sources/${sourceId}` && change === 'source') return Response.json({ ...metadata(), last_edited_time: '2026-10-19T13:00:00Z' });
      if (url.pathname === `/v1/data_sources/${sourceId}` && change === 'source property named request_id') return Response.json({ ...metadata(), properties: { ...metadata().properties, request_id: { type: 'rich_text', rich_text: {} } } });
      return undefined;
    });
    await expect(readNotionRecipes('token', sourceId)).rejects.toThrow(/changed/);
  });

  it('returns a deliberate empty snapshot only after complete repeated inventory reads', async () => {
    const fetcher = mockNotion(fixture(), url => url.pathname.endsWith('/query') ? Response.json(list([])) : undefined);
    expect((await readNotionRecipes('token', sourceId)).recipes).toEqual([]);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/query'))).toHaveLength(2);
  });
  it('rejects redirects without forwarding credentials to another origin', async()=>{
    const fetcher=mockNotion(fixture(),()=>new Response(null,{status:302,headers:{Location:'https://untrusted.invalid'}}));
    await expect(readNotionRecipes('synthetic-token','11111111-1111-4111-8111-111111111111')).rejects.toThrow('redirected');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('manual');
  });

});
