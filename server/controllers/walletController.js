const pool = require('../config/database');


// =====================================================
// NETWORKS
// =====================================================

const NETWORKS = {
  TRC20: {
    fee: 1,
    min: 10,
    time: '~2 دقيقة',
    confirmations: 20,
    pattern: /^T[1-9A-HJ-NP-Za-km-z]{33}$/
  },

  ERC20: {
    fee: 5,
    min: 50,
    time: '~5 دقائق',
    confirmations: 12,
    pattern: /^0x[0-9a-fA-F]{40}$/
  },

  BEP20: {
    fee: 0.8,
    min: 10,
    time: '~1 دقيقة',
    confirmations: 15,
    pattern: /^0x[0-9a-fA-F]{40}$/
  }
};


// =====================================================
// HELPERS
// =====================================================

const uid = (req) => {
  return req.user?.id ?? req.user?.user_id;
};


const num = (row) => {
  if (!row) return row;

  for (const key of [
    'balance',
    'mining_points',
    'amount',
    'fee',
    'received',
    'new_balance'
  ]) {
    if (key in row && row[key] !== null) {
      row[key] = Number(row[key]);
    }
  }

  return row;
};


// =====================================================
// WALLET STATUS
// =====================================================

exports.getStatus = async (req, res) => {

  try {

    const userId = uid(req);

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: 'هوية المستخدم غير موجودة'
      });
    }


    const wallet = await pool.query(
      `
      SELECT
        address,
        balance,
        mining_points,
        connected,
        connected_at
      FROM wallets
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId]
    );


    const networks = {};

    for (const [name, config] of Object.entries(NETWORKS)) {
      networks[name] = {
        fee: config.fee,
        min: config.min,
        time: config.time,
        confirmations: config.confirmations
      };
    }


    res.json({
      ok: true,

      wallet: wallet.rows[0]
        ? num(wallet.rows[0])
        : {
            connected: false,
            balance: 0,
            mining_points: 0
          },

      networks
    });


  } catch (error) {

    console.error('GET WALLET STATUS ERROR:', error);

    res.status(500).json({
      ok: false,
      error: 'خطأ في الخادم'
    });

  }
};


// =====================================================
// CONNECT WALLET
// =====================================================

exports.connectWallet = async (req, res) => {

  try {

    const userId = uid(req);

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: 'هوية المستخدم غير موجودة'
      });
    }


    const {
      mode = 'internal',
      address
    } = req.body || {};


    let walletAddress;


    if (mode === 'internal') {

      walletAddress =
        'XP-INT-' +
        String(userId).padStart(6, '0');

    } else {

      walletAddress =
        String(address || '').trim();

      if (walletAddress.length < 10) {

        return res.status(400).json({
          ok: false,
          error: 'أدخل عنواناً صالحاً'
        });

      }

    }


    const result = await pool.query(
      `
      INSERT INTO wallets (
        user_id,
        address,
        connected,
        connected_at
      )
      VALUES (
        $1,
        $2,
        TRUE,
        NOW()
      )

      ON CONFLICT (user_id)
      DO UPDATE SET
        address = EXCLUDED.address,
        connected = TRUE,
        connected_at = NOW()

      RETURNING
        address,
        balance,
        mining_points,
        connected,
        connected_at
      `,
      [
        userId,
        walletAddress
      ]
    );


    res.json({
      ok: true,
      wallet: num(result.rows[0])
    });


  } catch (error) {

    console.error('CONNECT WALLET ERROR:', error);

    res.status(500).json({
      ok: false,
      error: 'خطأ في الخادم'
    });

  }
};


// =====================================================
// DISCONNECT WALLET
// =====================================================

exports.disconnectWallet = async (req, res) => {

  try {

    const userId = uid(req);

    await pool.query(
      `
      UPDATE wallets
      SET connected = FALSE
      WHERE user_id = $1
      `,
      [userId]
    );


    res.json({
      ok: true
    });


  } catch (error) {

    console.error('DISCONNECT WALLET ERROR:', error);

    res.status(500).json({
      ok: false,
      error: 'خطأ في الخادم'
    });

  }
};


// =====================================================
// DEPOSIT INFO
// =====================================================

exports.depositInfo = async (req, res) => {
  try {
    const userId = uid(req);

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: 'هوية المستخدم غير موجودة'
      });
    }

    const network = String(
      req.query.network || 'TRC20'
    ).toUpperCase();

    const config = NETWORKS[network];

    if (!config) {
      return res.status(400).json({
        ok: false,
        error: 'شبكة غير مدعومة'
      });
    }

    const addressResult = await pool.query(`
      SELECT deposit_address
      FROM platform_config
      WHERE id = 1
      LIMIT 1
    `);

    const pendingResult = await pool.query(`
      SELECT
        amount,
        tx_hash,
        confirmations,
        status,
        network,
        created_at
      FROM wallet_transactions
      WHERE user_id = $1
        AND type = 'deposit'
        AND status = 'pending'
      ORDER BY id DESC
      LIMIT 1
    `, [userId]);

    res.json({
      ok: true,
      network,
      address: addressResult.rows[0]?.deposit_address || null,
      min: config.min,
      confirmations_required: config.confirmations,
      time: config.time,
      pending: pendingResult.rows[0]
        ? {
            amount: Number(pendingResult.rows[0].amount || 0),
            tx_hash: pendingResult.rows[0].tx_hash,
            confirmations: Number(
              pendingResult.rows[0].confirmations || 0
            ),
            status: pendingResult.rows[0].status,
            network: pendingResult.rows[0].network,
            created_at: pendingResult.rows[0].created_at
          }
        : null
    });

  } catch (error) {
    console.error('DEPOSIT INFO ERROR:', error);

    res.status(500).json({
      ok: false,
      error: 'خطأ في الخادم'
    });
  }
};


// =====================================================
// XP DEPOSIT
// =====================================================

exports.deposit = async (req, res) => {
  const userId = uid(req);

  if (!userId) {
    return res.status(401).json({
      ok: false,
      error: 'هوية المستخدم غير موجودة'
    });
  }

  const network = String(
    req.body?.network || ''
  ).toUpperCase();

  const txHash = String(
    req.body?.tx_hash || ''
  ).trim();

  const amount = Number(req.body?.amount);
  const config = NETWORKS[network];

  if (!config) {
    return res.status(400).json({
      ok: false,
      error: 'اختر شبكة مدعومة'
    });
  }

  if (!Number.isFinite(amount) || amount < config.min) {
    return res.status(400).json({
      ok: false,
      error: `الحد الأدنى للإيداع على ${network} هو $${config.min}`
    });
  }

  if (!txHash || txHash.length < 10) {
    return res.status(400).json({
      ok: false,
      error: 'أدخل TX Hash صحيحاً'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const wallet = await client.query(`
      SELECT user_id
      FROM xp_wallets
      WHERE user_id = $1
      FOR UPDATE
    `, [userId]);

    if (!wallet.rows[0]) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        ok: false,
        error: 'محفظة XP غير موجودة'
      });
    }

    const existing = await client.query(`
      SELECT id, status
      FROM wallet_transactions
      WHERE tx_hash = $1
      LIMIT 1
      FOR UPDATE
    `, [txHash]);

    if (existing.rows[0]) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        ok: false,
        error: 'هذه المعاملة مسجلة مسبقاً'
      });
    }

    const pending = await client.query(`
      SELECT id
      FROM wallet_transactions
      WHERE user_id = $1
        AND type = 'deposit'
        AND status = 'pending'
      LIMIT 1
    `, [userId]);

    if (pending.rows[0]) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        ok: false,
        error: 'لديك إيداع معلق بالفعل'
      });
    }

    const reference =
      'DP-' +
      Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase();

    await client.query(`
      INSERT INTO wallet_transactions (
        user_id,
        type,
        title,
        sub,
        amount,
        unit,
        sign,
        status,
        network,
        tx_hash,
        reference,
        note
      )
      VALUES (
        $1,
        'deposit',
        'إيداع USDT',
        $2,
        $3,
        '$',
        1,
        'pending',
        $4,
        $5,
        $6,
        'بانتظار تأكيد الشبكة'
      )
    `, [
      userId,
      `إيداع عبر ${network}`,
      amount,
      network,
      txHash,
      reference
    ]);

    await client.query('COMMIT');

    res.json({
      ok: true,
      reference,
      amount,
      network,
      status: 'pending'
    });

  } catch (error) {
    await client.query('ROLLBACK');

    console.error('XP DEPOSIT ERROR:', error);

    res.status(500).json({
      ok: false,
      error: 'خطأ في الخادم'
    });

  } finally {
    client.release();
  }
};


// =====================================================
// DEPOSIT CONFIRM
// =====================================================

exports.depositConfirm = async (req, res) => {

  try {

    if (
      req.get('X-Deposit-Secret') !==
      process.env.DEPOSIT_SECRET
    ) {

      return res.status(403).json({
        ok: false,
        error: 'غير مصرح'
      });

    }


    const {
      user_id,
      network,
      tx_hash,
      amount,
      confirmations = 0
    } = req.body || {};


    const config = NETWORKS[network];


    if (
      !user_id ||
      !tx_hash ||
      !(amount > 0) ||
      !config
    ) {

      return res.status(400).json({
        ok: false,
        error: 'بيانات ناقصة'
      });

    }


    const client =
      await pool.connect();


    try {

      await client.query('BEGIN');


      const existing =
        await client.query(
          `
          SELECT
            id,
            status
          FROM transactions
          WHERE tx_hash = $1
            AND type = 'deposit'
          FOR UPDATE
          `,
          [tx_hash]
        );


      let result = 'pending';


      if (existing.rows[0]) {

        const transaction =
          existing.rows[0];


        if (transaction.status === 'completed') {

          await client.query('COMMIT');

          return res.json({
            ok: true,
            result: 'already_credited'
          });

        }


        if (
          confirmations >=
          config.confirmations
        ) {

          await client.query(
            `
            UPDATE wallets
            SET balance = balance + $1
            WHERE user_id = $2
            `,
            [
              amount,
              user_id
            ]
          );


          await client.query(
            `
            UPDATE transactions
            SET
              status = 'completed',
              confirmations = $1
            WHERE id = $2
            `,
            [
              confirmations,
              transaction.id
            ]
          );


          result = 'credited';

        } else {

          await client.query(
            `
            UPDATE transactions
            SET confirmations = $1
            WHERE id = $2
            `,
            [
              confirmations,
              transaction.id
            ]
          );

        }


      } else {

        const completed =
          confirmations >=
          config.confirmations;


        if (completed) {

          await client.query(
            `
            UPDATE wallets
            SET balance = balance + $1
            WHERE user_id = $2
            `,
            [
              amount,
              user_id
            ]
          );

          result = 'credited';

        }


        await client.query(
          `
          INSERT INTO transactions (
            user_id,
            type,
            amount,
            network,
            tx_hash,
            status,
            confirmations,
            required_conf,
            note
          )

          VALUES (
            $1,
            'deposit',
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            'إيداع من الشبكة'
          )
          `,
          [
            user_id,
            amount,
            network,
            tx_hash,
            completed
              ? 'completed'
              : 'pending',
            confirmations,
            config.confirmations
          ]
        );

      }


      await client.query('COMMIT');


      res.json({
        ok: true,
        result
      });


    } catch (error) {

      await client.query('ROLLBACK');

      if (error.code === '23505') {

        return res.json({
          ok: true,
          result: 'already_processed'
        });

      }

      throw error;

    } finally {

      client.release();

    }


  } catch (error) {

    console.error('DEPOSIT CONFIRM ERROR:', error);

    res.status(500).json({
      ok: false,
      error: 'خطأ في الخادم'
    });

  }
};


// =====================================================
// WITHDRAW
// =====================================================

exports.withdraw = async (req, res) => {

  const {
    address,
    amount,
    network
  } = req.body || {};


  const config =
    NETWORKS[network];


  if (!config) {

    return res.status(400).json({
      ok: false,
      error: 'اختر شبكة مدعومة'
    });

  }


  const recipient =
    String(address || '').trim();


  if (!config.pattern.test(recipient)) {

    return res.status(400).json({
      ok: false,
      error:
        'عنوان المستلم غير صالح لشبكة ' +
        network
    });

  }


  const amt = Number(amount);


  if (!(amt >= config.min)) {

    return res.status(400).json({
      ok: false,
      error:
        'الحد الأدنى للسحب هو ' +
        config.min +
        ' USDT'
    });

  }


  if (amt <= config.fee) {

    return res.status(400).json({
      ok: false,
      error: 'المبلغ لا يغطي رسوم الشبكة'
    });

  }


  const userId = uid(req);

  const client =
    await pool.connect();


  try {

    await client.query('BEGIN');


    const wallet =
      await client.query(
        `
        SELECT balance
        FROM wallets
        WHERE user_id = $1
        FOR UPDATE
        `,
        [userId]
      );


    if (!wallet.rows[0]) {

      await client.query('ROLLBACK');

      return res.status(404).json({
        ok: false,
        error: 'اربط محفظتك أولاً'
      });

    }


    const balance =
      Number(wallet.rows[0].balance);


    if (balance < amt) {

      await client.query('ROLLBACK');

      return res.status(400).json({
        ok: false,
        error:
          'الرصيد غير كافٍ — رصيدك الحالي ' +
          balance.toFixed(2)
      });

    }


    const reference =
      'WD-' +
      Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase();


    await client.query(
      `
      UPDATE wallets
      SET balance = balance - $1
      WHERE user_id = $2
      `,
      [
        amt,
        userId
      ]
    );


    await client.query(
      `
      INSERT INTO transactions (
        user_id,
        type,
        amount,
        network,
        address,
        reference,
        status,
        note
      )

      VALUES (
        $1,
        'withdraw',
        $2,
        $3,
        $4,
        $5,
        'pending',
        $6
      )
      `,
      [
        userId,
        amt,
        network,
        recipient,
        reference,
        'يصل للمستلم ' +
        (amt - config.fee).toFixed(2) +
        ' بعد الرسوم'
      ]
    );


    const newWallet =
      await client.query(
        `
        SELECT balance
        FROM wallets
        WHERE user_id = $1
        `,
        [userId]
      );


    await client.query('COMMIT');


    res.json({

      ok: true,

      reference,

      amount: amt,

      fee: config.fee,

      received:
        amt - config.fee,

      network,

      new_balance:
        Number(
          newWallet.rows[0].balance
        )

    });


  } catch (error) {

    await client.query('ROLLBACK');

    console.error(
      'WITHDRAW ERROR:',
      error
    );

    res.status(500).json({
      ok: false,
      error: 'خطأ في الخادم'
    });

  } finally {

    client.release();

  }

};


// =====================================================
// INTERNAL TRANSFER
// البريد الإلكتروني أو XP UID
// =====================================================

exports.transfer = async (req, res) => {

  const {
    to,
    amount
  } = req.body || {};


  const amt =
    Number(amount);


  if (!(amt > 0)) {

    return res.status(400).json({
      ok: false,
      error: 'أدخل مبلغاً صالحاً'
    });

  }


  const target =
    String(to || '').trim();


  if (!target) {

    return res.status(400).json({
      ok: false,
      error: 'أدخل البريد الإلكتروني أو UID'
    });

  }


  let recipientId;


  // -----------------------------------------
  // البحث بالبريد الإلكتروني
  // -----------------------------------------

  if (
    /^\S+@\S+\.\S+$/.test(target)
  ) {

    const result =
      await pool.query(
        `
        SELECT "بطاقة تعريف"
        FROM "المستخدمون"
        WHERE LOWER("بريد إلكتروني")
              = LOWER($1)
        LIMIT 1
        `,
        [target]
      );


    recipientId =
      result.rows[0]?.['بطاقة تعريف'];

  }


  // -----------------------------------------
  // البحث بواسطة XP UID
  // -----------------------------------------

  else if (
    /^xp-?\d{4,}$/i.test(target)
  ) {

    const result =
      await pool.query(
        `
        SELECT "معرف المستخدم"
        FROM "محافظ نقاط الخبرة"
        WHERE LOWER(uid) = LOWER($1)
        LIMIT 1
        `,
        [target]
      );


    recipientId =
      result.rows[0]?.['معرف المستخدم'];

  }


  else {

    return res.status(400).json({
      ok: false,
      error:
        'أدخل UID صحيحاً أو بريداً إلكترونياً صالحاً'
    });

  }


  if (!recipientId) {

    return res.status(404).json({
      ok: false,
      error: 'المستلم غير موجود في المنصة'
    });

  }


  const senderId =
    uid(req);


  if (
    Number(recipientId) ===
    Number(senderId)
  ) {

    return res.status(400).json({
      ok: false,
      error: 'لا يمكنك التحويل لنفسك'
    });

  }


  const client =
    await pool.connect();


  try {

    await client.query('BEGIN');


    // ترتيب المستخدمين لمنع Deadlock
    const ids = [
      Number(senderId),
      Number(recipientId)
    ].sort((a, b) => a - b);


    const wallets =
      await client.query(
        `
        SELECT
          user_id,
          balance
        FROM wallets
        WHERE user_id = ANY($1)
        ORDER BY user_id
        FOR UPDATE
        `,
        [ids]
      );


    const balances = {};


    wallets.rows.forEach(row => {

      balances[row.user_id] =
        Number(row.balance);

    });


    if (
      !(senderId in balances)
    ) {

      await client.query('ROLLBACK');

      return res.status(404).json({
        ok: false,
        error: 'اربط محفظتك أولاً'
      });

    }


    if (
      !(recipientId in balances)
    ) {

      await client.query('ROLLBACK');

      return res.status(404).json({
        ok: false,
        error:
          'محفظة المستلم غير مفعّلة'
      });

    }


    if (
      balances[senderId] < amt
    ) {

      await client.query('ROLLBACK');

      return res.status(400).json({
        ok: false,
        error:
          'الرصيد غير كافٍ — رصيدك الحالي ' +
          balances[senderId].toFixed(2)
      });

    }


    const reference =
      'TR-' +
      Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase();


    await client.query(
      `
      UPDATE wallets
      SET balance = balance - $1
      WHERE user_id = $2
      `,
      [
        amt,
        senderId
      ]
    );


    await client.query(
      `
      UPDATE wallets
      SET balance = balance + $1
      WHERE user_id = $2
      `,
      [
        amt,
        recipientId
      ]
    );


    await client.query(
      `
      INSERT INTO transactions (
        user_id,
        type,
        amount,
        reference,
        status,
        note
      )

      VALUES (
        $1,
        'transfer_out',
        $2,
        $3,
        'completed',
        'تحويل داخلي صادر'
      )
      `,
      [
        senderId,
        amt,
        reference
      ]
    );


    await client.query(
      `
      INSERT INTO transactions (
        user_id,
        type,
        amount,
        reference,
        status,
        note
      )

      VALUES (
        $1,
        'transfer_in',
        $2,
        $3,
        'completed',
        'تحويل داخلي وارد'
      )
      `,
      [
        recipientId,
        amt,
        reference
      ]
    );


    const newWallet =
      await client.query(
        `
        SELECT balance
        FROM wallets
        WHERE user_id = $1
        `,
        [senderId]
      );


    await client.query('COMMIT');


    res.json({

      ok: true,

      reference,

      to: target,

      amount: amt,

      new_balance:
        Number(
          newWallet.rows[0].balance
        )

    });


  } catch (error) {

    await client.query('ROLLBACK');

    console.error(
      'TRANSFER ERROR:',
      error
    );

    res.status(500).json({
      ok: false,
      error: 'خطأ في الخادم'
    });

  } finally {

    client.release();

  }

};


// =====================================================
// TRANSACTION HISTORY
// =====================================================

exports.history = async (req, res) => {

  try {

    const userId =
      uid(req);


    const type =
      req.query.type || 'all';


    const page =
      Math.max(
        1,
        Number(req.query.page || 1)
      );


    const limit = 20;

    const offset =
      (page - 1) * limit;


    let where =
      'user_id = $1';

    const args = [
      userId
    ];


    if (type === 'deposit') {

      where +=
        ` AND type = 'deposit'`;

    } else if (type === 'withdraw') {

      where +=
        ` AND type = 'withdraw'`;

    } else if (type === 'transfer') {

      where +=
        ` AND type IN ('transfer_in','transfer_out')`;

    }


    const count =
      await pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM transactions
        WHERE ${where}
        `,
        args
      );


    const result =
      await pool.query(
        `
        SELECT
          type,
          amount,
          network,
          address,
          tx_hash,
          reference,
          status,
          note,
          created_at
        FROM transactions
        WHERE ${where}
        ORDER BY id DESC
        LIMIT ${limit}
        OFFSET ${offset}
        `,
        args
      );


    res.json({

      ok: true,

      items:
        result.rows.map(num),

      total:
        count.rows[0].total,

      page,

      pages:
        Math.ceil(
          count.rows[0].total /
          limit
        )

    });


  } catch (error) {

    console.error(
      'HISTORY ERROR:',
      error
    );

    res.status(500).json({
      ok: false,
      error: 'خطأ في الخادم'
    });

  }

};

// =====================================================
// XP WALLET STATE
// =====================================================

exports.state = async (req, res) => {
  try {
    const userId = uid(req);

    if (!userId) {
      return res.status(401).json({
        ok: false,
        message: 'هوية المستخدم غير موجودة'
      });
    }

    const wallet = await pool.query(`
      SELECT
        uid,
        user_id,
        name,
        balance,
        points,
        rate,
        daily_pts,
        last_claim,
        total_converted,
        power,
        mining_start_time
      FROM xp_wallets
      WHERE user_id = $1
      LIMIT 1
    `, [userId]);

    if (!wallet.rows[0]) {
      return res.status(404).json({
        ok: false,
        message: 'محفظة XP غير موجودة'
      });
    }

    const history = await pool.query(`
      SELECT
        type,
        title,
        sub,
        amount,
        unit,
        sign,
        status,
        network,
        address,
        tx_hash,
        reference,
        note,
        created_at
      FROM wallet_transactions
      WHERE user_id = $1
      ORDER BY id DESC
      LIMIT 100
    `, [userId]);

    const w = wallet.rows[0];

    const week = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS points
      FROM wallet_transactions
      WHERE user_id = $1
        AND type = 'earn'
        AND created_at >= NOW() - INTERVAL '7 days'
    `, [userId]);

    res.json({
      ok: true,

      wallet: {
        uid: w.uid,
        user_id: w.user_id,
        name: w.name,
        balance: Number(w.balance || 0),
        points: Number(w.points || 0),
        rate: Number(w.rate || 100),
        dailyPts: Number(w.daily_pts || 320),
        lastClaim: w.last_claim,
        totalConverted: Number(w.total_converted || 0),
        power: Number(w.power || 0),
        miningStartTime: w.mining_start_time,
        weekPoints: Number(week.rows[0]?.points || 0)
      },

      history: history.rows.map(h => ({
        type: h.type,
        title: h.title,
        sub: h.sub,
        amount: Number(h.amount || 0),
        unit: h.unit || '$',
        sign: Number(h.sign || 0),
        status: h.status || 'completed',
        network: h.network,
        address: h.address,
        tx_hash: h.tx_hash,
        reference: h.reference,
        note: h.note,
        created_at: h.created_at
      }))
    });

  } catch (error) {
    console.error('XP WALLET STATE ERROR:', error);

    res.status(500).json({
      ok: false,
      message: 'خطأ في الخادم'
    });
  }
};


// =====================================================
// DAILY CLAIM
// =====================================================

exports.claim = async (req, res) => {
  const userId = uid(req);

  if (!userId) {
    return res.status(401).json({
      ok: false,
      message: 'هوية المستخدم غير موجودة'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(`
      SELECT points, daily_pts, last_claim
      FROM xp_wallets
      WHERE user_id = $1
      FOR UPDATE
    `, [userId]);

    if (!result.rows[0]) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        ok: false,
        message: 'محفظة XP غير موجودة'
      });
    }

    const wallet = result.rows[0];

    const todayUtc = new Date().toISOString().slice(0, 10);

    if (
      wallet.last_claim &&
      String(wallet.last_claim).slice(0, 10) === todayUtc
    ) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        ok: false,
        message: 'استلمت نقاط اليوم'
      });
    }

    const claimed = Number(wallet.daily_pts || 320);

    await client.query(`
      UPDATE xp_wallets
      SET
        points = points + $1,
        last_claim = CURRENT_DATE
      WHERE user_id = $2
    `, [claimed, userId]);

    await client.query(`
      INSERT INTO wallet_transactions
        (user_id, type, title, sub, amount, unit, sign, status, note)
      VALUES
        ($1, 'earn', 'مكافأة يومية', 'استلام نقاط اليوم', $2, 'points', 1, 'completed', 'Daily claim')
    `, [userId, claimed]);

    await client.query('COMMIT');

    res.json({
      ok: true,
      claimed
    });

  } catch (error) {
    await client.query('ROLLBACK');

    console.error('XP CLAIM ERROR:', error);

    res.status(500).json({
      ok: false,
      message: 'خطأ في الخادم'
    });

  } finally {
    client.release();
  }
};


// =====================================================
// POINTS CONVERSION
// =====================================================

exports.convert = async (req, res) => {
  const userId = uid(req);
  const amount = Math.floor(Number(req.body?.amount));

  if (!userId) {
    return res.status(401).json({
      ok: false,
      message: 'هوية المستخدم غير موجودة'
    });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({
      ok: false,
      message: 'أدخل كمية نقاط صحيحة'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(`
      SELECT points, rate
      FROM xp_wallets
      WHERE user_id = $1
      FOR UPDATE
    `, [userId]);

    if (!result.rows[0]) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        ok: false,
        message: 'محفظة XP غير موجودة'
      });
    }

    const wallet = result.rows[0];
    const points = Number(wallet.points || 0);
    const rate = Number(wallet.rate || 100);

    if (amount < rate) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        ok: false,
        message: `الحد الأدنى ${rate} نقطة`
      });
    }

    if (amount > points) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        ok: false,
        message: 'رصيد نقاطك غير كافٍ'
      });
    }

    const got = amount / rate;

    await client.query(`
      UPDATE xp_wallets
      SET
        points = points - $1,
        balance = balance + $2,
        total_converted = total_converted + $1
      WHERE user_id = $3
    `, [amount, got, userId]);

    await client.query(`
      INSERT INTO wallet_transactions
        (user_id, type, title, sub, amount, unit, sign, status, note)
      VALUES
        ($1, 'convert', 'تحويل نقاط', $2, $3, '$', 1, 'completed', 'Points conversion')
    `, [
      userId,
      `${amount} نقطة → $${got.toFixed(2)}`,
      got
    ]);

    await client.query(`
      INSERT INTO wallet_transactions
        (user_id, type, title, sub, amount, unit, sign, status, note)
      VALUES
        ($1, 'points', 'خصم نقاط', 'تم خصم النقاط للتحويل', $2, 'points', -1, 'completed', 'Points conversion')
    `, [userId, amount]);

    await client.query('COMMIT');

    res.json({
      ok: true,
      converted: amount,
      got
    });

  } catch (error) {
    await client.query('ROLLBACK');

    console.error('XP CONVERT ERROR:', error);

    res.status(500).json({
      ok: false,
      message: 'خطأ في الخادم'
    });

  } finally {
    client.release();
  }
};
