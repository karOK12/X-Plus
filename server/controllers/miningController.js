const db = require("../config/database");

// بدء التعدين
exports.startMining = async (req, res) => {
  try {
    const { userId } = req.body;

    const result = await db.query(
      `UPDATE users
       SET mining_start_time = $1
       WHERE id = $2
       RETURNING id`,
      [Date.now(), userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
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
      `SELECT
        balance,
        power,
        mining_start_time
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    const user = result.rows[0];

    let balance = Number(user.balance);

    if (user.mining_start_time) {

      const hours =
        (Date.now() - Number(user.mining_start_time)) / 3600000;

      balance += hours * Number(user.power) * 0.5;
    }

    res.json({
      success: true,
      balance,
      power: Number(user.power),
      isMining: !!user.mining_start_time
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};