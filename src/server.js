const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('./app');
const { createDatabase } = require('./database');

const port = Number(process.env.PORT || 3000);
const databasePath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'books.sqlite');

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const database = createDatabase(databasePath);
const app = createApp({ database });
const server = app.listen(port, () => {
  console.log(`Books API listening on http://localhost:${port}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Set PORT to an available port and try again.`);
  } else {
    console.error('The API server could not start:', error);
  }
  database.close();
  process.exitCode = 1;
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
