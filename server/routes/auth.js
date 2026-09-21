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

router.get("/google/start", (req, res) => {
  const { googleOAuthStart } = require("../controllers/authController");
  googleOAuthStart(req, res);
});

router.get("/google/callback", (req, res) => {
  const { googleOAuthCallback } = require("../controllers/authController");
  googleOAuthCallback(req, res);
});

router.post("/verify-otp", verifyOTP);

router.post("/resend-otp", resendOTP);
router.post("/change-password", auth, changePassword);


module.exports = router;