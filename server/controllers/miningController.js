const db = require("../config/database");

// بدء التعدين
exports.startMining = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "معرف المستخدم مطلوب"
      });
    }

    const user = await db.query(
      "SELECT id FROM users WHERE id = $1",
      [userId]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    const mining = await db.query(
      "SELECT * FROM mining WHERE user_id = $1",
      [userId]
    );

    if (mining.rows.length === 0) {
      await db.query(
        `INSERT INTO mining
        (user_id, balance, power, is_mining, started_at, updated_at)
        VALUES ($1, 0, 150.50, true, NOW(), NOW())`,
        [userId]
      );
    } else {
      await db.query(
        `UPDATE mining
         SET is_mining = true,
             started_at = NOW(),
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId]
      );
    }

    res.json({
      success: true,
      message: "تم بدء التعدين"
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// حالة التعدين
exports.getMiningStatus = async (req, res) => {
  try {
    const { userId } = req.query;

    const result = await db.query(
      "SELECT * FROM mining WHERE user_id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "لا توجد بيانات تعدين"
      });
    }

    const mining = result.rows[0];

    if (mining.is_mining && mining.started_at) {

      const hours =
        (Date.now() - new Date(mining.started_at).getTime()) / 3600000;

      const earned = hours * mining.power * 0.5;

      await db.query(
        `UPDATE mining
         SET balance = $1,
             updated_at = NOW()
         WHERE user_id = $2`,
        [earned, userId]
      );

      mining.balance = earned;
    }

    res.json({
      success: true,
      balance: Number(mining.balance),
      power: Number(mining.power),
      isMining: mining.is_mining
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};