const express = require('express');
const { createDatabase } = require('./database');

const SORT_COLUMNS = new Set(['id', 'title', 'author', 'price', 'created_at']);

function parseInteger(value, name, { min, max } = {}) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return { error: `${name} must be an integer.` };
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (min !== undefined && parsed < min)) {
    return { error: `${name} must be an integer greater than or equal to ${min}.` };
  }
  if (max !== undefined && parsed > max) {
    return { error: `${name} must be no greater than ${max}.` };
  }

  return { value: parsed };
}

function parsePrice(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    return { error: `${name} must be a non-negative number.` };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { error: `${name} must be a non-negative number.` };
  }

  return { value: parsed };
}

function validateBookBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object.' };
  }
  if (typeof body.title !== 'string' || body.title.trim() === '') {
    return { error: 'title is required and must be a non-empty string.' };
  }
  if (typeof body.author !== 'string' || body.author.trim() === '') {
    return { error: 'author is required and must be a non-empty string.' };
  }
  if (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0) {
    return { error: 'price is required and must be a non-negative number.' };
  }

  return {
    value: {
      title: body.title.trim(),
      author: body.author.trim(),
      price: body.price
    }
  };
}

function createApp({ database = createDatabase(':memory:') } = {}) {
  const app = express();
  app.locals.database = database;
  app.use(express.json());

  app.get('/books', (req, res) => {
    const search = req.query.search_q;
    if (search !== undefined && typeof search !== 'string') {
      return res.status(400).json({ message: 'search_q must be a string.' });
    }

    const orderBy = req.query.order_by === undefined ? 'id' : req.query.order_by;
    if (typeof orderBy !== 'string' || !SORT_COLUMNS.has(orderBy)) {
      return res.status(400).json({
        message: `order_by must be one of: ${Array.from(SORT_COLUMNS).join(', ')}.`
      });
    }

    const rawOrder = req.query.order === undefined ? 'ASC' : req.query.order;
    const order = typeof rawOrder === 'string' ? rawOrder.toUpperCase() : rawOrder;
    if (typeof order !== 'string' || !['ASC', 'DESC'].includes(order)) {
      return res.status(400).json({ message: 'order must be ASC or DESC.' });
    }

    const limitResult = req.query.limit === undefined
      ? { value: 10 }
      : parseInteger(req.query.limit, 'limit', { min: 1, max: 100 });
    if (limitResult.error) {
      return res.status(400).json({ message: limitResult.error });
    }

    const offsetResult = req.query.offset === undefined
      ? { value: 0 }
      : parseInteger(req.query.offset, 'offset', { min: 0 });
    if (offsetResult.error) {
      return res.status(400).json({ message: offsetResult.error });
    }

    const minPriceResult = req.query.min_price === undefined
      ? null
      : parsePrice(req.query.min_price, 'min_price');
    if (minPriceResult && minPriceResult.error) {
      return res.status(400).json({ message: minPriceResult.error });
    }

    const maxPriceResult = req.query.max_price === undefined
      ? null
      : parsePrice(req.query.max_price, 'max_price');
    if (maxPriceResult && maxPriceResult.error) {
      return res.status(400).json({ message: maxPriceResult.error });
    }

    const minPrice = minPriceResult && minPriceResult.value;
    const maxPrice = maxPriceResult && maxPriceResult.value;
    if (minPrice !== null && minPrice !== undefined &&
        maxPrice !== null && maxPrice !== undefined && minPrice > maxPrice) {
      return res.status(400).json({ message: 'min_price must not be greater than max_price.' });
    }

    const conditions = [];
    const parameters = [];
    if (search !== undefined && search !== '') {
      conditions.push('title LIKE ?');
      parameters.push(`%${search}%`);
    }
    if (minPrice !== null && minPrice !== undefined) {
      conditions.push('price >= ?');
      parameters.push(minPrice);
    }
    if (maxPrice !== null && maxPrice !== undefined) {
      conditions.push('price <= ?');
      parameters.push(maxPrice);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const books = database.prepare(
      `SELECT id, title, author, price, created_at FROM books ${whereClause} ORDER BY ${orderBy} ${order} LIMIT ? OFFSET ?`
    ).all(...parameters, limitResult.value, offsetResult.value);

    return res.status(200).json({ message: 'Books retrieved successfully.', data: books });
  });

  app.get('/books/:id', (req, res) => {
    const idResult = parseInteger(req.params.id, 'id', { min: 1 });
    if (idResult.error) {
      return res.status(400).json({ message: idResult.error });
    }

    const book = database.prepare(
      'SELECT id, title, author, price, created_at FROM books WHERE id = ?'
    ).get(idResult.value);

    if (!book) {
      return res.status(404).json({ message: 'Book not found.' });
    }

    return res.status(200).json({ message: 'Book retrieved successfully.', data: book });
  });

  app.post('/books', (req, res) => {
    const validation = validateBookBody(req.body);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const result = database.prepare(
      'INSERT INTO books (title, author, price) VALUES (?, ?, ?)'
    ).run(validation.value.title, validation.value.author, validation.value.price);
    const book = database.prepare(
      'SELECT id, title, author, price, created_at FROM books WHERE id = ?'
    ).get(Number(result.lastInsertRowid));

    return res.status(201).json({ message: 'Book created successfully.', data: book });
  });

  app.put('/books/:id', (req, res) => {
    const idResult = parseInteger(req.params.id, 'id', { min: 1 });
    if (idResult.error) {
      return res.status(400).json({ message: idResult.error });
    }

    const validation = validateBookBody(req.body);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const result = database.prepare(
      'UPDATE books SET title = ?, author = ?, price = ? WHERE id = ?'
    ).run(validation.value.title, validation.value.author, validation.value.price, idResult.value);

    if (result.changes === 0) {
      return res.status(404).json({ message: 'Book not found.' });
    }

    const book = database.prepare(
      'SELECT id, title, author, price, created_at FROM books WHERE id = ?'
    ).get(idResult.value);

    return res.status(200).json({ message: 'Book updated successfully.', data: book });
  });

  app.delete('/books/:id', (req, res) => {
    const idResult = parseInteger(req.params.id, 'id', { min: 1 });
    if (idResult.error) {
      return res.status(400).json({ message: idResult.error });
    }

    const result = database.prepare('DELETE FROM books WHERE id = ?').run(idResult.value);
    if (result.changes === 0) {
      return res.status(404).json({ message: 'Book not found.' });
    }

    return res.status(200).json({ message: 'Book deleted successfully.' });
  });

  app.use((req, res) => res.status(404).json({ message: 'Endpoint not found.' }));

  app.use((error, req, res, next) => {
    console.error(error);
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ message: 'Request body must contain valid JSON.' });
    }
    return res.status(500).json({ message: 'Internal server error.' });
  });

  return app;
}

module.exports = { createApp };
