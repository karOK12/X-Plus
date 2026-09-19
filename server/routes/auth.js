const express = require("express");
const router = express.Router();

const {
  register,
  login,
  verifyOTP,
  resendOTP,
  changePassword,
  googleLogin,
} = require("../controllers/authController");

const auth = require("../middleware/auth");


router.post("/register", register);

router.post("/login", login);

router.post("/google", googleLogin);

router.post("/verify-otp", verifyOTP);

router.post("/resend-otp", resendOTP);
router.post("/change-password", auth, changePassword);


module.exports = router;