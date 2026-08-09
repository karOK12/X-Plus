const express = require("express");

const {
    sendOTP,
    verifyOTP,
    resendOTP
} = require("../controllers/authController");

const router = express.Router();


// ══════════════════════════════════════════════════════
// إرسال OTP
// ══════════════════════════════════════════════════════

router.post(
    "/send",
    sendOTP
);


// ══════════════════════════════════════════════════════
// التحقق من OTP
// ══════════════════════════════════════════════════════

router.post(
    "/verify",
    verifyOTP
);


// ══════════════════════════════════════════════════════
// إعادة إرسال OTP
// ══════════════════════════════════════════════════════

router.post(
    "/resend",
    resendOTP
);


module.exports = router;