const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");

const {
  startMining,
  getMiningStatus,
  logoutMining,
} = require("../controllers/miningController");

router.post("/start", auth, startMining);
router.get("/status", auth, getMiningStatus);
router.post("/logout", auth, logoutMining);

module.exports = router;
