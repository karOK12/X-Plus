const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const C       = require('../controllers/walletController');

console.log("Wallet Controller:", C);


// ══════════════════════════════════════════════════════
// Wallet
// ══════════════════════════════════════════════════════

router.get('/status', auth, C.getStatus);

router.post('/connect', auth, C.connectWallet);

router.post('/disconnect', auth, C.disconnectWallet);

router.get('/deposit', auth, C.depositInfo);

router.post('/withdraw', auth, C.withdraw);

router.post('/transfer', auth, C.transfer);

router.get('/history', auth, C.history);


// ══════════════════════════════════════════════════════
// Blockchain Deposit Confirm
// يستدعيه نظام مراقبة البلوكتشين
// ══════════════════════════════════════════════════════

router.post('/deposit/confirm', C.depositConfirm);


module.exports = router;