const express = require("express");
const router = express.Router();

const pool = require("../config/database");
const auth = require("../middleware/auth");


/*
  إنشاء جدول تثبيتات التطبيق.

  user_id:
  يمنع نفس الحساب من احتساب التثبيت أكثر من مرة.

  install_id:
  يمنع نفس المتصفح من احتساب التثبيت أكثر من مرة.
*/
async function ensureInstallTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_installs (
      id BIGSERIAL PRIMARY KEY,

      user_id INT NOT NULL UNIQUE
        REFERENCES users(id) ON DELETE CASCADE,

      install_id TEXT NOT NULL UNIQUE,

      installed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}


/*
  تسجيل تثبيت جديد.

  يجب أن يكون المستخدم مسجل دخول.
*/
router.post("/", auth, async (req, res) => {
  try {
    const userId = Number(req.user.id);
    const installId =
      typeof req.body?.installId === "string"
        ? req.body.installId.trim()
        : "";

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "المستخدم غير صالح"
      });
    }

    if (!installId || installId.length < 10 || installId.length > 200) {
      return res.status(400).json({
        success: false,
        message: "معرف التثبيت غير صالح"
      });
    }

    await ensureInstallTable();


    /*
      نتحقق أولاً من install_id.
      إذا كان هذا المتصفح محسوباً سابقاً،
      لا نضيف تثبيت جديد.
    */
    const existingInstall = await pool.query(
      `
      SELECT id, user_id
      FROM app_installs
      WHERE install_id = $1
      LIMIT 1
      `,
      [installId]
    );

    if (existingInstall.rowCount > 0) {
      const countResult = await pool.query(`
        SELECT COUNT(*)::BIGINT AS count
        FROM app_installs
      `);

      return res.json({
        success: true,
        counted: false,
        reason: "browser_already_counted",
        count: Number(countResult.rows[0].count)
      });
    }


    /*
      إذا كان الحساب نفسه محسوباً سابقاً
      من متصفح آخر، لا نضيفه مرة ثانية.
    */
    const existingUser = await pool.query(
      `
      SELECT id
      FROM app_installs
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );

    if (existingUser.rowCount > 0) {
      const countResult = await pool.query(`
        SELECT COUNT(*)::BIGINT AS count
        FROM app_installs
      `);

      return res.json({
        success: true,
        counted: false,
        reason: "user_already_counted",
        count: Number(countResult.rows[0].count)
      });
    }


    /*
      التثبيت جديد فعلاً.
    */
    try {
      await pool.query(
        `
        INSERT INTO app_installs (
          user_id,
          install_id
        )
        VALUES ($1, $2)
        `,
        [userId, installId]
      );
    } catch (insertError) {

      /*
        حماية إضافية من حالة وصول طلبين
        في نفس اللحظة.
      */
      if (
        insertError.code === "23505"
      ) {
        const countResult = await pool.query(`
          SELECT COUNT(*)::BIGINT AS count
          FROM app_installs
        `);

        return res.json({
          success: true,
          counted: false,
          reason: "already_counted",
          count: Number(countResult.rows[0].count)
        });
      }

      throw insertError;
    }


    const countResult = await pool.query(`
      SELECT COUNT(*)::BIGINT AS count
      FROM app_installs
    `);

    return res.json({
      success: true,
      counted: true,
      count: Number(countResult.rows[0].count)
    });

  } catch (error) {
    console.error("❌ /api/install:", error);

    return res.status(500).json({
      success: false,
      message: "خطأ في الخادم"
    });
  }
});


/*
  جلب العدد الحقيقي للتثبيتات.
*/
router.get("/count", async (req, res) => {
  try {
    await ensureInstallTable();

    const result = await pool.query(`
      SELECT COUNT(*)::BIGINT AS count
      FROM app_installs
    `);

    return res.json({
      success: true,
      count: Number(result.rows[0].count)
    });

  } catch (error) {
    console.error("❌ /api/install/count:", error);

    return res.status(500).json({
      success: false,
      message: "تعذر تحميل عدد التثبيتات"
    });
  }
});


module.exports = router;
