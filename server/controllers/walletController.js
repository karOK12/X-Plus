const pool = require('../config/database'); // يجب أن يصدّر pg Pool الخاص بـ Neon

const NETWORKS = {
  TRC20:{ fee:1,   min:10, time:'~2 دقيقة', confirmations:20, pattern:/^T[1-9A-HJ-NP-Za-km-z]{33}$/ },
  ERC20:{ fee:5,   min:50, time:'~5 دقائق', confirmations:12, pattern:/^0x[0-9a-fA-F]{40}$/ },
  BEP20:{ fee:0.8, min:10, time:'~1 دقيقة', confirmations:15, pattern:/^0x[0-9a-fA-F]{40}$/ },
};
const uid = req => req.user.id ?? req.user.user_id;
const num = r => { for(const k of ['balance','mining_points','amount']) if(k in r) r[k]=+r[k]; return r; };

/* ═══ حالة المحفظة ═══ */
exports.getStatus = async (req,res)=>{
  try{
    const w = await pool.query('SELECT address,balance,mining_points,connected,connected_at FROM wallets WHERE user_id=$1',[uid(req)]);
    const nets = {}; for(const [n,c] of Object.entries(NETWORKS)) nets[n]={fee:c.fee,min:c.min,time:c.time,confirmations:c.confirmations};
    res.json({ ok:true,
      wallet: w.rows[0] ? num(w.rows[0]) : { connected:false, balance:0, mining_points:0 },
      networks: nets });
  }catch(e){ console.error(e); res.status(500).json({ok:false,error:'خطأ في الخادم'}); }
};

/* ═══ الربط — يتم فقط عندما يطلبه المستخدم ═══ */
exports.connectWallet = async (req,res)=>{
  try{
    const { mode='internal', address } = req.body||{};
    let addr = mode==='internal' ? 'XP-INT-'+String(uid(req)).padStart(6,'0') : String(address||'').trim();
    if(mode==='external' && addr.length<10) return res.status(400).json({ok:false,error:'أدخل عنواناً صالحاً'});
    const q = await pool.query(
      `INSERT INTO wallets(user_id,address,connected,connected_at) VALUES($1,$2,true,NOW())
       ON CONFLICT (user_id) DO UPDATE SET address=EXCLUDED.address, connected=true, connected_at=NOW()
       RETURNING address,balance,mining_points,connected`, [uid(req),addr]);
    res.json({ ok:true, wallet:num(q.rows[0]) });
  }catch(e){ console.error(e); res.status(500).json({ok:false,error:'خطأ في الخادم'}); }
};

exports.disconnectWallet = async (req,res)=>{
  await pool.query('UPDATE wallets SET connected=false WHERE user_id=$1',[uid(req)]);
  res.json({ ok:true });
};

/* ═══ الإيداع: العنوان من قاعدة البيانات ═══ */
exports.depositInfo = async (req,res)=>{
  const network = req.query.network || 'TRC20';
  const cfg = NETWORKS[network];
  if(!cfg) return res.status(400).json({ok:false,error:'شبكة غير مدعومة'});
  const a = await pool.query('SELECT address FROM deposit_addresses WHERE user_id=$1 AND network=$2',[uid(req),network]);
  const p = await pool.query(
    `SELECT amount,tx_hash,confirmations,required_conf FROM transactions
     WHERE user_id=$1 AND type='deposit' AND status='pending' ORDER BY id DESC LIMIT 1`,[uid(req)]);
  res.json({ ok:true, network, address:a.rows[0]?.address||null, min:cfg.min,
    confirmations_required:cfg.confirmations, time:cfg.time, pending:p.rows[0]?num(p.rows[0]):null });
};

/* ═══ تأكيد الإيداع — يستدعيه مراقب البلوكتشين (Idempotent) ═══ */
exports.depositConfirm = async (req,res)=>{
  try{
    if(req.get('X-Deposit-Secret') !== process.env.DEPOSIT_SECRET)
      return res.status(403).json({ok:false,error:'غير مصرح'});
    const { user_id, network, tx_hash, amount, confirmations=0 } = req.body||{};
    const cfg = NETWORKS[network];
    if(!user_id || !tx_hash || !(amount>0) || !cfg)
      return res.status(400).json({ok:false,error:'بيانات ناقصة'});

    const client = await pool.connect();
    try{
      await client.query('BEGIN');
      const ex = await client.query(
        'SELECT id,status FROM transactions WHERE tx_hash=$1 AND type=$2 FOR UPDATE',[tx_hash,'deposit']);
      let result='pending';
      if(ex.rows[0]){
        if(ex.rows[0].status==='completed'){ await client.query('COMMIT');
          return res.json({ok:true,result:'already_credited'}); }
        if(confirmations>=cfg.confirmations){
          await client.query('UPDATE wallets SET balance=balance+$1 WHERE user_id=$2',[amount,user_id]);
          await client.query('UPDATE transactions SET status=$1,confirmations=$2 WHERE id=$3',['completed',confirmations,ex.rows[0].id]);
          result='credited';
        }else await client.query('UPDATE transactions SET confirmations=$1 WHERE id=$2',[confirmations,ex.rows[0].id]);
      }else{
        const done = confirmations>=cfg.confirmations;
        if(done){ await client.query('UPDATE wallets SET balance=balance+$1 WHERE user_id=$2',[amount,user_id]); result='credited'; }
        await client.query(
          `INSERT INTO transactions(user_id,type,amount,network,tx_hash,status,confirmations,required_conf,note)
           VALUES($1,'deposit',$2,$3,$4,$5,$6,$7,'إيداع من الشبكة')`,
          [user_id,amount,network,tx_hash,done?'completed':'pending',confirmations,cfg.confirmations]);
      }
      await client.query('COMMIT');
      res.json({ok:true,result});
    }catch(e){ await client.query('ROLLBACK');
      if(e.code==='23505') return res.json({ok:true,result:'already_processed'}); throw e;
    }finally{ client.release(); }
  }catch(e){ console.error(e); res.status(500).json({ok:false,error:'خطأ في الخادم'}); }
};

/* ═══ السحب — التحقق والخصم على السيرفر ═══ */
exports.withdraw = async (req,res)=>{
  const { address, amount, network } = req.body||{};
  const cfg = NETWORKS[network];
  if(!cfg)                        return res.status(400).json({ok:false,error:'اختر شبكة مدعومة'});
  if(!cfg.pattern.test(String(address||'').trim()))
                                  return res.status(400).json({ok:false,error:'عنوان المستلم غير صالح لشبكة '+network});
  const amt = +amount;
  if(!(amt>=cfg.min))             return res.status(400).json({ok:false,error:'الحد الأدنى للسحب هو '+cfg.min+' USDT'});
  if(amt<=cfg.fee)                return res.status(400).json({ok:false,error:'المبلغ لا يغطي رسوم الشبكة'});

  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    const w = await client.query('SELECT balance FROM wallets WHERE user_id=$1 FOR UPDATE',[uid(req)]);
    if(!w.rows[0])               { await client.query('ROLLBACK'); return res.status(404).json({ok:false,error:'اربط محفظتك أولاً'}); }
    if(+w.rows[0].balance < amt) { await client.query('ROLLBACK'); return res.status(400).json({ok:false,error:'الرصيد غير كافٍ — رصيدك الحالي '+Number(w.rows[0].balance).toFixed(2)}); }
    const ref = 'WD-'+Math.random().toString(36).slice(2,8).toUpperCase();
    await client.query('UPDATE wallets SET balance=balance-$1 WHERE user_id=$2',[amt,uid(req)]);
    await client.query(
      `INSERT INTO transactions(user_id,type,amount,network,address,reference,status,note)
       VALUES($1,'withdraw',$2,$3,$4,$5,'pending',$6)`,
      [uid(req),amt,network,address.trim(),ref,'يصل للمستلم '+(amt-cfg.fee).toFixed(2)+' بعد الرسوم']);
    const nw = await client.query('SELECT balance FROM wallets WHERE user_id=$1',[uid(req)]);
    await client.query('COMMIT');
    res.json({ ok:true, reference:ref, amount:amt, fee:cfg.fee, received:amt-cfg.fee, network, new_balance:+nw.rows[0].balance });
  }catch(e){ await client.query('ROLLBACK'); console.error(e); res.status(500).json({ok:false,error:'خطأ في الخادم'}); }
  finally{ client.release(); }
};

/* ═══ التحويل الداخلي عبر UID أو البريد ═══ */
exports.transfer = async (req,res)=>{
  const { to, amount } = req.body||{};
  const amt = +amount;
  if(!(amt>0)) return res.status(400).json({ok:false,error:'أدخل مبلغاً صالحاً'});

  let q;
  if(/^\S+@\S+\.\S+$/.test(to))      q = await pool.query('SELECT id FROM users WHERE email=$1',[to]);
  else if(/^xp-?\d{4,}$/i.test(to))  q = await pool.query('SELECT id FROM users WHERE uid=$1',[to.toUpperCase()]);
  else return res.status(400).json({ok:false,error:'أدخل UID صحيحاً أو بريداً إلكترونياً صالحاً'});

  const rcid = q.rows[0]?.id;
  if(!rcid)            return res.status(404).json({ok:false,error:'المستلم غير موجود في المنصة'});
  if(rcid===uid(req))  return res.status(400).json({ok:false,error:'لا يمكنك التحويل لنفسك'});

  const client = await pool.connect();
  try{
    await client.query('BEGIN');
    const ids=[uid(req),rcid].sort((a,b)=>a-b); /* ترتيب القفل لمنع Deadlock */
    const ws = await client.query('SELECT user_id,balance FROM wallets WHERE user_id=ANY($1) ORDER BY user_id FOR UPDATE',[ids]);
    const bal = {}; ws.rows.forEach(r=>bal[r.user_id]=+r.balance);
    if(!(uid(req) in bal)) { await client.query('ROLLBACK'); return res.status(404).json({ok:false,error:'اربط محفظتك أولاً'}); }
    if(!(rcid in bal))     { await client.query('ROLLBACK'); return res.status(404).json({ok:false,error:'محفظة المستلم غير مفعّلة'}); }
    if(bal[uid(req)]<amt)  { await client.query('ROLLBACK'); return res.status(400).json({ok:false,error:'الرصيد غير كافٍ — رصيدك الحالي '+bal[uid(req)].toFixed(2)}); }
    const ref='TR-'+Math.random().toString(36).slice(2,8).toUpperCase();
    await client.query('UPDATE wallets SET balance=balance-$1 WHERE user_id=$2',[amt,uid(req)]);
    await client.query('UPDATE wallets SET balance=balance+$1 WHERE user_id=$2',[amt,rcid]);
    await client.query(`INSERT INTO transactions(user_id,type,amount,reference,status,note) VALUES($1,'transfer_out',$2,$3,'completed','تحويل داخلي صادر')`,[uid(req),amt,ref]);
    await client.query(`INSERT INTO transactions(user_id,type,amount,reference,status,note) VALUES($1,'transfer_in',$2,$3,'completed','تحويل داخلي وارد')`,[rcid,amt,ref]);
    const nw = await client.query('SELECT balance FROM wallets WHERE user_id=$1',[uid(req)]);
    await client.query('COMMIT');
    res.json({ ok:true, reference:ref, to, amount:amt, new_balance:+nw.rows[0].balance });
  }catch(e){ await client.query('ROLLBACK'); console.error(e); res.status(500).json({ok:false,error:'خطأ في الخادم'}); }
  finally{ client.release(); }
};

/* ═══ السجل ═══ */
exports.history = async (req,res)=>{
  const type = req.query.type||'all', page = Math.max(1,+(req.query.page||1)), limit=20, off=(page-1)*limit;
  let where='user_id=$1', args=[uid(req)];
  if(type==='deposit')      where+=" AND type='deposit'";
  else if(type==='withdraw')where+=" AND type='withdraw'";
  else if(type==='transfer')where+=" AND type IN ('transfer_in','transfer_out')";
  const c = await pool.query(`SELECT COUNT(*)::int AS n FROM transactions WHERE ${where}`,args);
  const r = await pool.query(
    `SELECT type,amount,network,address,tx_hash,reference,status,note,created_at
     FROM transactions WHERE ${where} ORDER BY id DESC LIMIT ${limit} OFFSET ${off}`,args);
  res.json({ ok:true, items:r.rows.map(num), total:c.rows[0].n, page, pages:Math.ceil(c.rows[0].n/limit) });
};