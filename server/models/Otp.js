const db = require("../config/database");

const Otp = {

  // ===============================
  // إنشاء أو تحديث OTP
  // ===============================
  async save(email, otpHash, userData, expiresAt) {

    const normalizedEmail =
      email.trim().toLowerCase();

    const result = await db.query(
      `
      INSERT INTO otp_codes (
        email,
        otp_hash,
        user_data,
        attempts,
        created_at,
        expires_at
      )
      VALUES (
        $1,
        $2,
        $3,
        0,
        NOW(),
        $4
      )

      ON CONFLICT (email)
      DO UPDATE SET
        otp_hash = EXCLUDED.otp_hash,
        user_data = EXCLUDED.user_data,
        attempts = 0,
        created_at = NOW(),
        expires_at = EXCLUDED.expires_at

      RETURNING *;
      `,
      [
        normalizedEmail,
        otpHash,
        JSON.stringify(userData),
        expiresAt
      ]
    );

    return result.rows[0];
  },


  // ===============================
  // البحث عن OTP
  // ===============================
  async findByEmail(email) {

    const normalizedEmail =
      email.trim().toLowerCase();

    const result = await db.query(
      `
      SELECT *
      FROM otp_codes
      WHERE email = $1
      LIMIT 1
      `,
      [normalizedEmail]
    );

    return result.rows[0] || null;
  },


  // ===============================
  // حذف OTP
  // ===============================
  async delete(email) {

    const normalizedEmail =
      email.trim().toLowerCase();

    await db.query(
      `
      DELETE FROM otp_codes
      WHERE email = $1
      `,
      [normalizedEmail]
    );

  },


  // ===============================
  // زيادة محاولات OTP
  // ===============================
  async increaseAttempts(email) {

    const normalizedEmail =
      email.trim().toLowerCase();

    const result = await db.query(
      `
      UPDATE otp_codes
      SET attempts = attempts + 1
      WHERE email = $1
      RETURNING attempts
      `,
      [normalizedEmail]
    );

    return result.rows[0] || null;
  }

};

module.exports = Otp;