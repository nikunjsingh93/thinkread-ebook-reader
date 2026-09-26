import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheBook, getCachedBookResponse, getCachedBooks, removeCachedBook } from '../src/lib/serviceWorker.js';

function memoryCache() {
  const entries = new Map();
  const keyOf = (key) => new URL(key.url || key, 'https://thinkread.test').pathname;
  return {
    async match(key) { return entries.get(keyOf(key))?.clone(); },
    async put(key, response) { entries.set(keyOf(key), response.clone()); },
    async delete(key) { return entries.delete(keyOf(key)); },
    async keys() { return [...entries.keys()].map((key) => new Request(`https://thinkread.test${key}`)); },
  };
}

test('offline badge requires the complete book file, not metadata or a range', async () => {
  const cache = memoryCache();
  globalThis.window = { caches: true };
  globalThis.caches = { open: async () => cache };
  const books = [{ id: 'one', sizeBytes: 8 }, { id: 'two', sizeBytes: 8 }];

  await cache.put('/api/books/one/metadata', new Response('{"title":"One"}'));
  await cache.put('/api/books/two/file', new Response('part', {
    status: 206, headers: { 'Content-Range': 'bytes 0-3/8' },
  }));
  assert.deepEqual(await getCachedBooks(books), []);

  await cache.put('/api/books/one/file', new Response('complete'));
  assert.deepEqual(await getCachedBooks(books), ['one']);
  assert.equal((await getCachedBookResponse('one', 8)).status, 200);
  assert.equal(await getCachedBookResponse('one', 9), null);
});

test('removing an offline copy clears only that book across caches', async () => {
  const bookCache = memoryCache();
  const appCache = memoryCache();
  const byName = new Map([
    ['thinkread-books-v1', bookCache],
    ['thinkread-app-test', appCache],
  ]);
  globalThis.window = { caches: true };
  globalThis.caches = {
    open: async (name) => byName.get(name),
    keys: async () => [...byName.keys()],
  };
  await bookCache.put('/api/books/one/file', new Response('complete'));
  await bookCache.put('/api/books/one/metadata', new Response('{}'));
  await appCache.put('/api/books/one/contents/chapter.xhtml', new Response('chapter'));
  await appCache.put('/api/books/one/cover', new Response('cover'));
  await bookCache.put('/api/books/two/file', new Response('another!'));

  assert.equal(await removeCachedBook('one'), true);
  assert.equal(await getCachedBookResponse('one', 8), null);
  assert.equal(await bookCache.match('/api/books/one/metadata'), undefined);
  assert.equal(await appCache.match('/api/books/one/contents/chapter.xhtml'), undefined);
  assert.equal(await appCache.match('/api/books/one/cover'), undefined);
  assert.equal((await getCachedBookResponse('two', 8)).status, 200);
});

test('cacheBook saves and verifies all bytes before reporting success', async () => {
  const cache = memoryCache();
  globalThis.window = { caches: true };
  globalThis.caches = { open: async () => cache };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/books/book/file');
    assert.equal(options.headers['X-ThinkRead-Cache-Download'], '1');
    assert.equal(options.cache, 'no-store');
    return new Response('abcdefgh', {
      status: 200, headers: { 'Content-Length': '8' },
    });
  };

  assert.equal(await cacheBook('book', '/api/books/book/file', 8), true);
  assert.deepEqual(await getCachedBooks([{ id: 'book', sizeBytes: 8 }]), ['book']);
  assert.equal((await cache.match('/api/books/book/file')).headers.get('X-ThinkRead-Complete-Size'), '8');

  globalThis.fetch = async () => new Response('part', {
    status: 206, headers: { 'Content-Range': 'bytes 0-3/8' },
  });
  assert.equal(await cacheBook('partial', '/api/books/partial/file', 8), false);
  assert.equal(await getCachedBookResponse('partial', 8), null);

  globalThis.fetch = async () => new Response('short', {
    status: 200, headers: { 'Content-Length': '8' },
  });
  assert.equal(await cacheBook('short', '/api/books/short/file', 8), false);
  assert.equal(await getCachedBookResponse('short', 8), null);
});
