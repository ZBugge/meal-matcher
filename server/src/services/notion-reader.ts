export interface NotionRecipe {
  pageId: string;
  url: string;
  title: string;
  instructions: string;
  ingredients: Array<{ amount: string; ingredient: string }>;
}

export class NotionError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = 'NotionError';
  }
}

class RecipeFormatError extends NotionError {
  constructor(message: string) { super(message, 400); }
}

type RecordValue = Record<string, unknown>;
const VERSION = '2025-09-03';
const MAX_PAGES = 100;
const MAX_BLOCKS = 10_000;
const DEADLINE_MS = 60_000;

function object(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NotionError('Notion returned an unsupported response.');
  return value as RecordValue;
}

function id(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:[a-f\d]{32}|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/i.test(value)) {
    throw new NotionError('A valid Notion database or data source ID is required.', 400);
  }
  const hex = value.replace(/-/g, '').toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sourceId(source: string): string {
  if (typeof source !== 'string' || source.length > 2048) throw new NotionError('Enter a Notion database URL or ID.', 400);
  const input = source.trim();
  if (input.startsWith('collection://')) return id(input.slice(13));
  if (!input.includes('://')) return id(input);
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || !['notion.so', 'www.notion.so', 'app.notion.com'].includes(url.hostname) || url.port || url.username || url.password) throw new Error();
    const tail = url.pathname.split('/').filter(Boolean).pop() || '';
    const match = tail.match(/([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}|[a-f\d]{32})$/i);
    if (!match) throw new Error();
    return id(match[1]);
  } catch {
    throw new NotionError('Enter a supported Notion database URL or ID.', 400);
  }
}

function text(value: unknown): string {
  if (!Array.isArray(value) || value.length > 1000) throw new NotionError('Recipe rich text is incomplete or unsupported.', 400);
  const result = value.map(item => {
    const richText = object(item);
    if (typeof richText.plain_text !== 'string') throw new NotionError('Recipe rich text is incomplete or unsupported.', 400);
    return richText.plain_text;
  }).join('');
  if (result.length > 50_000) throw new NotionError('A Notion recipe contains too much text.', 400);
  return result;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function active(value: RecordValue): void {
  if (value.archived === true || value.in_trash === true || value.is_archived === true) throw new NotionError('Notion content changed during the read. Try syncing again.', 400);
}

class Reader {
  private readonly deadline = Date.now() + DEADLINE_MS;
  private requests = 0;
  private bytes = 0;
  private blocks = 0;
  readonly snapshots = new Map<string, string>();

  constructor(private readonly token: string) {}

  async request(endpoint: string, body?: RecordValue, missingAllowed = false): Promise<RecordValue | null> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = this.deadline - Date.now();
      if (remaining <= 0 || ++this.requests > 1000) throw new NotionError('Notion sync exceeded its safe read limit. Try a smaller recipe database.');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(8000, remaining));
      let retryDelay = 250 * 2 ** attempt;
      try {
        const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
          method: body ? 'POST' : 'GET',
          headers: { Authorization: `Bearer ${this.token}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}),
          redirect: 'manual',
          signal: controller.signal,
        });
        if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new NotionError('Notion redirected the recipe request. Check the original source and integration access.', 400); }
        if (response.status === 404 && missingAllowed) { await response.body?.cancel(); return null; }
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          await response.body?.cancel();
          throw new NotionError('Notion access failed. Check the token and share the original recipe database with the integration.', 400);
        }
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = response.headers.get('retry-after');
          if (retryAfter) {
            const seconds = Number(retryAfter);
            retryDelay = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(retryAfter) - Date.now());
            if (!Number.isFinite(retryDelay)) retryDelay = 1000;
          }
          await response.body?.cancel();
          if (attempt === 2 || retryDelay >= this.deadline - Date.now()) throw new NotionError('Notion is busy or unavailable. Try syncing again later.');
        } else {
          if (!response.ok) { await response.body?.cancel(); throw new NotionError('Notion rejected the recipe request. Check the source and integration access.', 400); }
          if (!response.body) throw new NotionError('Notion returned an empty response.');
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let length = 0;
          try {
            while (true) {
              const part = await reader.read();
              if (part.done) break;
              length += part.value.byteLength;
              this.bytes += part.value.byteLength;
              if (length > 2_000_000 || this.bytes > 32_000_000) throw new NotionError('Notion sync exceeded its safe response size.');
              chunks.push(part.value);
            }
          } finally { await reader.cancel(); }
          try {
            const payload = object(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            // This identifies the HTTP response, not a content edit. Keep nested
            // properties intact so real schema/recipe changes still fail closed.
            delete payload.request_id;
            return payload;
          }
          catch (error) { if (error instanceof NotionError) throw error; throw new NotionError('Notion returned an invalid response.'); }
        }
      } catch (error) {
        if (error instanceof NotionError) throw error;
        if (attempt === 2) throw new NotionError('Notion could not be reached. Try syncing again later.');
      } finally { clearTimeout(timer); }
      if (retryDelay >= this.deadline - Date.now()) throw new NotionError('Notion sync timed out. Try syncing again later.');
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    throw new NotionError('Notion could not be reached.');
  }

  async list(endpoint: string, query = false): Promise<RecordValue[]> {
    const results: RecordValue[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const parameters = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(parameters)) search.set(key, String(value));
      const response = object(await this.request(query ? endpoint : `${endpoint}?${search}`, query ? parameters : undefined));
      if (response.object !== 'list' || !Array.isArray(response.results) || typeof response.has_more !== 'boolean') throw new NotionError('Notion returned an incomplete list.');
      if (response.request_status !== undefined && object(response.request_status).type !== 'complete') throw new NotionError('Notion returned an incomplete recipe list. No changes were applied.');
      for (const result of response.results) {
        results.push(object(result));
        if (results.length > (query ? MAX_PAGES : MAX_BLOCKS)) throw new NotionError('The Notion recipe database is too large to sync safely.', 400);
      }
      if (!response.has_more) {
        if (response.next_cursor !== null && response.next_cursor !== undefined) throw new NotionError('Notion returned inconsistent pagination.');
        break;
      }
      if (typeof response.next_cursor !== 'string' || !response.next_cursor || response.next_cursor.length > 2048 || cursors.has(response.next_cursor)) throw new NotionError('Notion returned incomplete pagination.');
      cursor = response.next_cursor;
      cursors.add(cursor);
    } while (true);
    const identifiers = results.map(result => id(result.id));
    if (new Set(identifiers).size !== identifiers.length) throw new NotionError('Notion returned duplicate content. Try syncing again.');
    return results;
  }

  async children(blockId: string): Promise<RecordValue[]> {
    const blocks = await this.list(`/blocks/${id(blockId)}/children`);
    this.blocks += blocks.length;
    if (this.blocks > MAX_BLOCKS) throw new NotionError('The Notion recipe database has too many blocks to sync safely.', 400);
    for (const block of blocks) {
      active(block);
      if (block.object !== 'block' || typeof block.type !== 'string' || typeof block.has_children !== 'boolean') throw new NotionError('Notion returned an incomplete recipe block.');
    }
    this.snapshots.set(blockId, stable(blocks));
    return blocks;
  }
}

async function resolveSource(reader: Reader, input: string): Promise<{ dataSource: RecordValue; database: RecordValue | null }> {
  let dataSource = await reader.request(`/data_sources/${input}`, undefined, true);
  let database: RecordValue | null = null;
  if (!dataSource) {
    database = object(await reader.request(`/databases/${input}`));
    active(database);
    if (database.object !== 'database' || id(database.id) !== input || !Array.isArray(database.data_sources) || database.data_sources.length !== 1) throw new NotionError('Use a database containing exactly one recipe data source.', 400);
    const dataSourceId = id(object(database.data_sources[0]).id);
    dataSource = object(await reader.request(`/data_sources/${dataSourceId}`));
    if (id(dataSource.id) !== dataSourceId) throw new NotionError('Notion returned a different data source.');
  } else if (id(dataSource.id) !== input) throw new NotionError('Notion returned a different data source.');
  active(dataSource);
  if (dataSource.object !== 'data_source' || object(object(dataSource.properties).Name).type !== 'title') throw new NotionError('The Notion data source must have a Name title property.', 400);
  return { dataSource, database };
}

function pageInfo(page: RecordValue, dataSourceId: string): { pageId: string; title: string; url: string } {
  active(page);
  const parent = object(page.parent);
  if (page.object !== 'page' || parent.type !== 'data_source_id' || id(parent.data_source_id) !== dataSourceId || typeof page.last_edited_time !== 'string') throw new NotionError('Notion returned an incomplete or mismatched recipe page.');
  const property = object(object(page.properties).Name);
  if (property.type !== 'title') throw new NotionError('Each recipe needs a Name title property.', 400);
  const title = text(property.title).trim();
  if (!title || title.length > 500) throw new NotionError('Each Notion recipe needs a title of at most 500 characters.', 400);
  const pageId = id(page.id);
  // Build a canonical URL from the trusted ID; never forward upstream/user-controlled hosts.
  return { pageId, title, url: `https://www.notion.so/${pageId.replace(/-/g, '')}` };
}

async function recipe(reader: Reader, page: RecordValue, dataSourceId: string): Promise<NotionRecipe> {
  const info = pageInfo(page, dataSourceId);
  const blocks = await reader.children(info.pageId);
  let section: 'start' | 'ingredients' | 'instructions' = 'start';
  let ingredients: NotionRecipe['ingredients'] | undefined;
  const lines: string[] = [];
  let numbered = 0;
  let steps = 0;
  const invalid = (message: string) => new RecipeFormatError(`${JSON.stringify(info.title)}: ${message}`);
  for (const [index, block] of blocks.entries()) {
    const type = block.type as string;
    const content = object(block[type]);
    const where = `Block ${index + 1} (${type.replace(/_/g, ' ')}) ${section === 'start' ? 'before Ingredients' : `in ${section === 'ingredients' ? 'Ingredients' : 'Instructions'}`}`;
    if (type !== 'table' && block.has_children) throw invalid(`${where}: nested content is unsupported. Move it onto top-level lines before refreshing.`);
    if (type === 'heading_2') {
      const heading = text(content.rich_text).trim();
      if (heading === 'Ingredients' && section === 'start') section = 'ingredients';
      else if (heading === 'Instructions' && section === 'ingredients' && ingredients) section = 'instructions';
      else throw invalid(`${where}: unexpected heading ${JSON.stringify(heading.slice(0, 100))}. Use one Heading 2 named Ingredients, then one named Instructions, in that order.`);
      continue;
    }
    if (type === 'table' && section === 'ingredients' && !ingredients) {
      if (content.table_width !== 2 || content.has_column_header !== true || content.has_row_header !== false || block.has_children !== true) throw invalid(`${where}: use a native two-column table with an Amount / Ingredient header row.`);
      const rows = await reader.children(id(block.id));
      if (rows.length < 2 || rows.length > 1001) throw invalid(`${where}: include between 1 and 1000 ingredient rows below the header.`);
      const cells = rows.map((row, rowIndex) => {
        const rowContent = object(row.table_row);
        if (row.type !== 'table_row' || row.has_children || !Array.isArray(rowContent.cells) || rowContent.cells.length !== 2) throw invalid(`${where}, table row ${rowIndex + 1}: use exactly two text cells without nested content.`);
        return rowContent.cells.map(text);
      });
      if (cells[0][0].trim() !== 'Amount' || cells[0][1].trim() !== 'Ingredient') throw invalid(`${where}: the table header must read Amount and Ingredient.`);
      ingredients = cells.slice(1).map(([amount, ingredient], rowIndex) => {
        if (!ingredient.trim()) throw invalid(`${where}, table row ${rowIndex + 2}: add an ingredient name.`);
        return { amount, ingredient };
      });
      continue;
    }
    if (type === 'paragraph' && section !== 'instructions' && text(content.rich_text) === '') continue;
    if (section !== 'instructions' || !['heading_3', 'numbered_list_item', 'bulleted_list_item', 'paragraph'].includes(type)) {
      const excerpt = Array.isArray(content.rich_text) ? text(content.rich_text).trim().slice(0, 100) : '';
      const fix = section === 'instructions'
        ? 'Use numbered steps, plain text, bullet points or Heading 3 subsections here.'
        : section === 'ingredients'
          ? 'Keep only the Amount / Ingredient table here, followed by a Heading 2 named Instructions. Move extra notes below Instructions.'
          : 'Start with a Heading 2 named Ingredients, followed by the ingredient table.';
      throw invalid(`${where}${excerpt ? ` ${JSON.stringify(excerpt)}` : ''}: unsupported block or section. ${fix}`);
    }
    const value = text(content.rich_text);
    if (type === 'heading_3') {
      if (!value.trim()) throw invalid(`${where}: add a subsection heading or remove the empty heading.`);
      numbered = 0;
      lines.push(`### ${value}`);
    } else if (type === 'numbered_list_item') {
      if (!value.trim()) throw invalid(`${where}: add instruction text or remove the empty numbered step.`);
      steps++;
      lines.push(`${++numbered}. ${value}`);
    } else {
      numbered = 0;
      lines.push(type === 'bulleted_list_item' ? `- ${value}` : value);
    }
  }
  const instructions = lines.join('\n\n').trim();
  if (section !== 'instructions' || !ingredients || !steps || !instructions || instructions.length > 50_000) throw invalid('Include an Ingredients table and numbered Instructions, with at most 50,000 characters of instruction text.');
  return { ...info, ingredients, instructions };
}

export async function readNotionRecipes(token: string, source: string): Promise<{ dataSourceId: string; sourceUrl: string; recipes: NotionRecipe[] }> {
  if (typeof token !== 'string' || !token.trim() || token.length > 4096 || /[\r\n\x00]/.test(token)) throw new NotionError('A valid Notion integration token is required.', 400);
  const input = sourceId(source);
  const reader = new Reader(token);
  const original = await resolveSource(reader, input);
  const dataSourceId = id(original.dataSource.id);
  const pages = await reader.list(`/data_sources/${dataSourceId}/query`, true);
  const recipes: NotionRecipe[] = [];
  const problems: string[] = [];
  for (const page of pages) {
    try { recipes.push(await recipe(reader, page, dataSourceId)); }
    catch (error) {
      if (!(error instanceof RecipeFormatError)) throw error;
      problems.push(error.message);
    }
  }
  if (problems.length) throw new NotionError(`Fix these Notion recipes, then refresh again. No changes were saved.\nFirst problem in each recipe:\n\n${problems.map(problem => `• ${problem}`).join('\n\n')}`, 400);
  // Notion has no transactional snapshot API. Repeat every body read plus the full
  // inventory/metadata scan, and fail closed if an edit/add/remove was observed.
  for (const [blockId, snapshot] of [...reader.snapshots]) {
    if (stable(await reader.children(blockId)) !== snapshot) throw new NotionError('Notion recipes changed during the read. Try syncing again.', 400);
  }
  const endingPages = await reader.list(`/data_sources/${dataSourceId}/query`, true);
  const byId = (values: RecordValue[]) => values.slice().sort((a, b) => id(a.id).localeCompare(id(b.id)));
  const endingSource = await resolveSource(reader, input);
  if (stable(byId(pages)) !== stable(byId(endingPages)) || stable(original) !== stable(endingSource)) throw new NotionError('The Notion source changed during the read. Try syncing again.', 400);
  return { dataSourceId, sourceUrl: `https://www.notion.so/${(original.database ? id(original.database.id) : dataSourceId).replace(/-/g, '')}`, recipes };
}
