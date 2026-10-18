const express = require("express");
const pool = require("../config/database");
const auth = require("../middleware/auth");

const router = express.Router();

router.use(auth);

// جلب إشعارات المستخدم الحالي فقط
router.get("/", async (req, res) => {
  try {
    const userId = req.user?.id;

    const result = await pool.query(
      `SELECT id, title, message, type, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 50`,
      [userId]
    );

    return res.json({
      success: true,
      notifications: result.rows
    });
  } catch (error) {
    console.error("Notifications list error:", error.message);
    return res.status(500).json({
      success: false,
      message: "تعذر جلب الإشعارات"
    });
  }
});

// عدد الإشعارات غير المقروءة
router.get("/unread-count", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM notifications
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );

    return res.json({
      success: true,
      count: result.rows[0].count
    });
  } catch (error) {
    console.error("Notifications count error:", error.message);
    return res.status(500).json({
      success: false,
      message: "تعذر جلب عدد الإشعارات"
    });
  }
});

// تعليم إشعار واحد كمقروء مع التحقق من ملكيته
router.patch("/:id/read", async (req, res) => {
  const notificationId = Number(req.params.id);

  if (!Number.isSafeInteger(notificationId) || notificationId < 1) {
    return res.status(400).json({
      success: false,
      message: "رقم الإشعار غير صالح"
    });
  }

  try {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [notificationId, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "الإشعار غير موجود"
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Notification read error:", error.message);
    return res.status(500).json({
      success: false,
      message: "تعذر تحديث الإشعار"
    });
  }
});

// تعليم جميع إشعارات المستخدم الحالي كمقروءة
router.patch("/read-all", async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error("Notifications read-all error:", error.message);
    return res.status(500).json({
      success: false,
      message: "تعذر تحديث الإشعارات"
    });
  }
});

module.exports = router;
