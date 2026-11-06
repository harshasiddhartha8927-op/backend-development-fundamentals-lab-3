const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { once } = require('node:events');
const { createApp } = require('../src/app');
const { createDatabase } = require('../src/database');

let database;
let server;
let baseUrl;

before(async () => {
  database = createDatabase(':memory:');
  database.prepare('INSERT INTO books (title, author, price) VALUES (?, ?, ?)').run(
    'The Pragmatic Programmer', 'Andy Hunt', 45
  );
  database.prepare('INSERT INTO books (title, author, price) VALUES (?, ?, ?)').run(
    'Clean Code', 'Robert Martin', 40
  );
  database.prepare('INSERT INTO books (title, author, price) VALUES (?, ?, ?)').run(
    'Pragmatic Thinking', 'Andy Hunt', 25
  );
  server = createApp({ database }).listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  database.close();
});

async function request(path, options) {
  return fetch(`${baseUrl}${path}`, options);
}

test('lists books with search, sorting, price filters, limit, and offset', async () => {
  const response = await request(
    '/books?search_q=Pragmatic&order_by=price&order=DESC&limit=1&offset=0&min_price=20&max_price=50'
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.message, 'Books retrieved successfully.');
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].title, 'The Pragmatic Programmer');
  assert.equal(body.data[0].price, 45);
});

test('rejects invalid query parameters with JSON errors', async () => {
  for (const path of [
    '/books?order_by=title%20DESC',
    '/books?order=sideways',
    '/books?limit=0',
    '/books?offset=-1',
    '/books?min_price=30&max_price=20',
    '/books?min_price=not-a-number'
  ]) {
    const response = await request(path);
    const body = await response.json();
    assert.equal(response.status, 400, path);
    assert.equal(typeof body.message, 'string', path);
  }
});

test('creates, reads, updates, and deletes a book with the expected status codes', async () => {
  const createdResponse = await request('/books', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'API Design', author: 'Sam Newman', price: 32.5 })
  });
  const created = await createdResponse.json();
  assert.equal(createdResponse.status, 201);
  assert.equal(created.data.title, 'API Design');

  const id = created.data.id;
  const readResponse = await request(`/books/${id}`);
  assert.equal(readResponse.status, 200);

  const updatedResponse = await request(`/books/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'API Design Updated', author: 'Sam Newman', price: 35 })
  });
  const updated = await updatedResponse.json();
  assert.equal(updatedResponse.status, 200);
  assert.equal(updated.data.title, 'API Design Updated');

  const deletedResponse = await request(`/books/${id}`, { method: 'DELETE' });
  assert.equal(deletedResponse.status, 200);

  const missingResponse = await request(`/books/${id}`);
  const missing = await missingResponse.json();
  assert.equal(missingResponse.status, 404);
  assert.equal(missing.message, 'Book not found.');
});

test('validates required fields and numeric prices', async () => {
  const invalidBodies = [
    {},
    { title: 'No author', price: 10 },
    { title: 'String price', author: 'Writer', price: '10' },
    { title: 'Negative price', author: 'Writer', price: -1 }
  ];

  for (const body of invalidBodies) {
    const response = await request('/books', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    assert.equal(response.status, 400);
    assert.equal(typeof result.message, 'string');
  }
});

test('returns 404 for missing books on update and delete', async () => {
  const updateResponse = await request('/books/99999', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Missing', author: 'Writer', price: 10 })
  });
  const deleteResponse = await request('/books/99999', { method: 'DELETE' });

  assert.equal(updateResponse.status, 404);
  assert.equal(deleteResponse.status, 404);
});
