const db = require("../config/database");

const User = {
  async create(username, email, password) {
    const result = await db.query(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, username, email`,
      [username, email, password]
    );

    return result.rows[0];
  },

  async findByEmail(email) {
    const result = await db.query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    return result.rows[0];
  },
};

module.exports = User;