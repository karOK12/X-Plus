const db = require("../config/database");

const CYCLE_MS = 86400000;

// تثبيت أرباح كل دورة مكتملة مرة واحدة، مع المحافظة على الوقت المتبقي.
async function settleCompletedCycles(userId, now) {
  await db.query(
    `
    UPDATE users
    SET
      balance = (
        COALESCE(balance, 0)::numeric
        + FLOOR(
            ($1::numeric - mining_start_time::numeric) / 86400000
          ) * COALESCE(power, 0)::numeric
            * (2::numeric / 150.50::numeric)
      )::real,
      mining_start_time = mining_start_time
        + (
            FLOOR(
              ($1::numeric - mining_start_time::numeric) / 86400000
            )::bigint * 86400000
          )
    WHERE id = $2
      AND mining_start_time IS NOT NULL
      AND mining_start_time <= $1::bigint - 86400000::bigint
    `,
    [now, userId]
  );
}

// حساب الرصيد المعروض: الرصيد المحفوظ + ربح الدورة الحالية فقط.
function makeStatus(user) {
  const storedBalance = Number(user.balance || 0);
  const power = Number(user.power || 0);
  const miningStartTime = user.mining_start_time == null
    ? null
    : Number(user.mining_start_time);

  let elapsedSeconds = 0;
  let balance = storedBalance;

  if (miningStartTime !== null) {
    elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - miningStartTime) / 1000)
    );

    const cappedSeconds = Math.min(elapsedSeconds, 86400);
    balance += (cappedSeconds / 86400) * power * (2 / 150.50);
  }

  return {
    success: true,
    balance,
    power,
    miningStartTime,
    elapsedSeconds,
    isMining: miningStartTime !== null
  };
}

// بدء التعدين: يبدأ لأول مرة فقط؛ لا يعيد ضبط دورة قائمة.
exports.startMining = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "جلسة المستخدم غير صالحة"
      });
    }

    const userId = req.user.id;
    const now = Date.now();

    const started = await db.query(
      `
      UPDATE users
      SET mining_start_time = $1
      WHERE id = $2
        AND mining_start_time IS NULL
      RETURNING id, balance, power, mining_start_time
      `,
      [now, userId]
    );

    // إذا كان التعدين قد بدأ سابقاً، ثبّت الدورات المكتملة دون إعادة ضبط الوقت.
    if (started.rows.length === 0) {
      const exists = await db.query(
        "SELECT id FROM users WHERE id = $1",
        [userId]
      );

      if (exists.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "المستخدم غير موجود"
        });
      }

      await settleCompletedCycles(userId, Date.now());
    }

    const result = await db.query(
      `
      SELECT id, balance, power, mining_start_time
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

    const status = makeStatus(result.rows[0]);

    return res.json({
      ...status,
      message: "تم تحميل حالة التعدين"
    });
  } catch (err) {
    console.error("START MINING ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "فشل بدء التعدين",
      error: err.message
    });
  }
};

// جلب الحالة: يحفظ الدورات المكتملة ثم يرجع حالة الدورة الحالية.
exports.getMiningStatus = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "جلسة المستخدم غير صالحة"
      });
    }

    const userId = req.user.id;

    await settleCompletedCycles(userId, Date.now());

    const result = await db.query(
      `
      SELECT id, balance, power, mining_start_time
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

    return res.json(makeStatus(result.rows[0]));
  } catch (err) {
    console.error("GET MINING STATUS ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "فشل جلب حالة التعدين",
      error: err.message
    });
  }
};
