const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const C       = require('../controllers/walletController');

router.get ('/status',             auth, C.getStatus);
router.post('/connect',            auth, C.connectWallet);
router.post('/disconnect',         auth, C.disconnectWallet);
router.get ('/deposit',            auth, C.depositInfo);
router.post('/withdraw',           auth, C.withdraw);
router.post('/transfer',           auth, C.transfer);
router.get ('/history',            auth, C.history);

/* ===== التعدين ===== */
router.post('/mining/start', auth, C.startMining);
router.get('/mining/status', auth, C.getMiningStatus);

/* ===== واجهة محفظة X Plus ===== */
router.get('/state', auth, C.state);
router.post('/claim', auth, C.claim);
router.post('/convert', auth, C.convertPoints);

/* يستدعيه نظام مراقبة البلوكتشين فقط — لإضافة الإيداعات الحقيقية */
router.post('/deposit/confirm', C.depositConfirm);

module.exports = router;