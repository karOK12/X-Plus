const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.query("SELECT NOW()")
  .then(() => console.log("DATABASE CONNECTED"))
  .catch(err => console.error("DATABASE ERROR:", err.message));

module.exports = pool;