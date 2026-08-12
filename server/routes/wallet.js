const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const C = require('../controllers/walletController');

router.get('/state', auth, C.state);
router.post('/claim', auth, C.claim);
router.post('/convert', auth, C.convert);

router.get('/deposit', auth, C.depositInfo);
router.post('/deposit', auth, C.deposit);
router.post('/withdraw', auth, C.withdraw);
router.post('/transfer', auth, C.transfer);
router.get('/history', auth, C.history);

router.post('/deposit/confirm', C.depositConfirm);

module.exports = router;
