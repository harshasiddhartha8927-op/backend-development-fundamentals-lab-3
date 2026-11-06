const { DatabaseSync } = require('node:sqlite');

const starterBooks = [
  ['Wings of Fire', 'A. P. J. Abdul Kalam', 250],
  ['The Alchemist', 'Paulo Coelho', 299],
  ['Atomic Habits', 'James Clear', 450],
  ['Ikigai', 'Hector Garcia', 199],
  ['Deep Work', 'Cal Newport', 350],
  ['Rich Dad Poor Dad', 'Robert Kiyosaki', 399],
  ['The Psychology of Money', 'Morgan Housel', 499],
  ['Think and Grow Rich', 'Napoleon Hill', 299],
  ['The Power of Habit', 'Charles Duhigg', 320],
  ['Zero to One', 'Peter Thiel', 280]
];

function createDatabase(databasePath) {
  const database = new DatabaseSync(databasePath);

  database.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      price REAL NOT NULL CHECK (price >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const bookCount = database.prepare('SELECT COUNT(*) AS count FROM books').get().count;
  if (bookCount === 0) {
    const insertBook = database.prepare(
      'INSERT INTO books (title, author, price) VALUES (?, ?, ?)'
    );
    for (const book of starterBooks) {
      insertBook.run(...book);
    }
  }

  return database;
}

module.exports = { createDatabase };
