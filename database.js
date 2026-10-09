const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = process.env.DB_PATH || path.resolve(__dirname, 'data.db');
if (dbPath !== ':memory:') require('fs').mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new sqlite3.Database(dbPath);
db.configure('busyTimeout', 5000);
// Existing tables/data are preserved; only users are required by this API.
db.ready = new Promise((resolve, reject) => {
    db.serialize(() => {
        db.run('PRAGMA journal_mode = WAL');
        db.run('PRAGMA foreign_keys = ON');
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, err => err ? reject(err) : resolve());
    });
});
module.exports = db;
