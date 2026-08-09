const db = require("../config/database");

// =====================================================
// بدء التعدين
// =====================================================
exports.startMining = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "جلسة المستخدم غير صالحة"
      });
    }

    const userId = req.user.id;
    const startTime = Date.now();

    const result = await db.query(
      `
      UPDATE users
      SET mining_start_time = $1
      WHERE id = $2
      RETURNING
        id,
        balance,
        power,
        mining_start_time
      `,
      [startTime, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    const user = result.rows[0];

    console.log("⛏️ MINING START:", {
      userId,
      miningStartTime: user.mining_start_time
    });

    return res.json({
      success: true,
      message: "تم بدء التعدين بنجاح",
      miningStartTime: Number(user.mining_start_time),
      balance: Number(user.balance || 0),
      power: Number(user.power || 0),
      isMining: true
    });

  } catch (err) {
    console.error("❌ START MINING ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "فشل بدء التعدين",
      error: err.message
    });
  }
};


// =====================================================
// حالة التعدين
// =====================================================
exports.getMiningStatus = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "جلسة المستخدم غير صالحة"
      });
    }

    const userId = req.user.id;

    const result = await db.query(
      `
      SELECT
        id,
        balance,
        power,
        mining_start_time
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    const user = result.rows[0];

    const storedBalance = Number(user.balance || 0);
    const power = Number(user.power || 0);
    const miningStartTime = user.mining_start_time
      ? Number(user.mining_start_time)
      : null;

    let balance = storedBalance;
    let elapsedSeconds = 0;

    if (miningStartTime) {
      elapsedSeconds = Math.max(
        0,
        Math.floor((Date.now() - miningStartTime) / 1000)
      );

      const hours = elapsedSeconds / 3600;

      balance += hours * power * 0.5;
    }

    return res.json({
      success: true,
      balance,
      power,
      miningStartTime,
      elapsedSeconds,
      isMining: !!miningStartTime
    });

  } catch (err) {
    console.error("❌ GET MINING STATUS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "فشل جلب حالة التعدين",
      error: err.message
    });
  }
};
