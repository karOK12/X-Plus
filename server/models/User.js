const db = require("../config/database");

const User = {

  // ===============================
  // إنشاء مستخدم جديد
  // ===============================
  async create(username, email, password) {

    const result = await db.query(
      `
      INSERT INTO users (
        username,
        email,
        password,
        balance,
        points,
        power,
        mining_start_time
      )
      VALUES ($1, $2, $3, 0, 0, 150.50, NULL)
      RETURNING
        id,
        username,
        email,
        balance,
        points,
        power,
        mining_start_time
      `,
      [
        username.trim(),
        email.trim().toLowerCase(),
        password
      ]
    );

    return result.rows[0];
  },


  // ===============================
  // البحث عن مستخدم بالبريد
  // ===============================
  async findByEmail(email) {

    const result = await db.query(
      `
      SELECT *
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [
        email.trim().toLowerCase()
      ]
    );

    return result.rows[0] || null;
  },


  // ===============================
  // البحث عن مستخدم بالـ ID
  // ===============================
  async findById(id) {

    const result = await db.query(
      `
      SELECT *
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    return result.rows[0] || null;
  },


  // ===============================
  // تحديث كلمة المرور
  // ===============================
  async updatePassword(email, password) {

    const result = await db.query(
      `
      UPDATE users
      SET password = $1
      WHERE LOWER(email) = LOWER($2)
      RETURNING
        id,
        username,
        email
      `,
      [
        password,
        email.trim().toLowerCase()
      ]
    );

    return result.rows[0] || null;
  },


  // ===============================
  // تحديث كلمة المرور بواسطة ID
  // ===============================
  async updatePasswordById(userId, password) {

    const result = await db.query(
      `
      UPDATE users
      SET password = $1
      WHERE id = $2
      RETURNING
        id,
        username,
        email
      `,
      [password, userId]
    );

    return result.rows[0] || null;
  },

  // ===============================
  // تحديث وقت بدء التعدين
  // ===============================
  async startMining(userId) {

    const result = await db.query(
      `
      UPDATE users
      SET mining_start_time = $1
      WHERE id = $2
      RETURNING
        id,
        username,
        email,
        balance,
        points,
        power,
        mining_start_time
      `,
      [
        Date.now(),
        userId
      ]
    );

    return result.rows[0] || null;
  }

};

module.exports = User;