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
            * (0.000864::numeric / 150.50::numeric)
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
  let elapsedMilliseconds = 0;
  let balance = storedBalance;

  if (miningStartTime !== null) {
    elapsedMilliseconds = Math.max(0, Date.now() - miningStartTime);
    elapsedSeconds = Math.floor(elapsedMilliseconds / 1000);

    const cappedSeconds = Math.min(elapsedSeconds, 86400);
    balance += (cappedSeconds / 86400) * power * (0.000864 / 150.50);
  }

  const everStarted = user.mining_ever_started === true;

  return {
    success: true,
    balance,
    storedBalance,
    power,
    miningStartTime,
    elapsedSeconds,
    elapsedMilliseconds,
    isMining: miningStartTime !== null,
    everStarted,
    canStart: !everStarted && miningStartTime === null
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

    // تثبيت أي دورات مكتملة دون المساس بوقت الدورة الحالية.
    await settleCompletedCycles(userId, now);

    // يبدأ فقط إذا لم يسبق للمستخدم بدء التعدين.
    await db.query(
      `
      UPDATE users
      SET mining_start_time = $1,
          mining_ever_started = TRUE
      WHERE id = $2
        AND mining_start_time IS NULL
        AND COALESCE(mining_ever_started, FALSE) = FALSE
      `,
      [now, userId]
    );

    const result = await db.query(
      `
      SELECT id, balance, power, mining_start_time, mining_ever_started
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
      SELECT id, balance, power, mining_start_time, mining_ever_started
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


exports.logoutMining = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "جلسة المستخدم غير صالحة"
      });
    }

    const now = Date.now();
    const userId = req.user.id;

    const result = await db.query(
      `
      UPDATE users
      SET
        balance = CASE
          WHEN mining_start_time IS NOT NULL THEN
            (
              COALESCE(balance, 0)::numeric
              + (
                  LEAST(86400000::numeric, GREATEST(0, $1::numeric - mining_start_time::numeric))
                  / 86400000
                )
                * COALESCE(power, 0)::numeric
                * (0.000864::numeric / 150.50::numeric)
            )::real
          ELSE COALESCE(balance, 0)
        END,
        mining_start_time = NULL,
        mining_ever_started = FALSE
      WHERE id = $2
      RETURNING id, balance
      `,
      [now, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    return res.json({
      success: true,
      message: "تم حفظ الأرباح وإيقاف التعدين",
      balance: result.rows[0].balance
    });
  } catch (err) {
    console.error("LOGOUT MINING ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "تعذر حفظ الأرباح وإيقاف التعدين"
    });
  }
};
