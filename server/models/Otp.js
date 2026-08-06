const db = require("../config/database");

const Otp = {

  // إنشاء أو تحديث رمز OTP
  async save(email, otpHash, userData, expiresAt) {

    const result = await db.query(
      `
      INSERT INTO otp_codes
      (
        email,
        otp_hash,
        user_data,
        expires_at
      )
      VALUES ($1,$2,$3,$4)

      ON CONFLICT(email)
      DO UPDATE SET

      otp_hash = EXCLUDED.otp_hash,
      user_data = EXCLUDED.user_data,
      attempts = 0,
      created_at = NOW(),
      expires_at = EXCLUDED.expires_at

      RETURNING *;
      `,
      [
        email,
        otpHash,
        JSON.stringify(userData),
        expiresAt
      ]
    );

    return result.rows[0];
  },



  // البحث عن رمز OTP
  async findByEmail(email) {

    const result = await db.query(
      `
      SELECT *
      FROM otp_codes
      WHERE email = $1
      `,
      [email]
    );

    return result.rows[0];
  },



  // حذف الرمز
  async delete(email) {

    await db.query(
      `
      DELETE FROM otp_codes
      WHERE email = $1
      `,
      [email]
    );

  },



  // زيادة عدد المحاولات
  async increaseAttempts(email) {

    await db.query(
      `
      UPDATE otp_codes
      SET attempts = attempts + 1
      WHERE email = $1
      `,
      [email]
    );

  }

};

module.exports = Otp;