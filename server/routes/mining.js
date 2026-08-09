const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");

const {
  startMining,
  getMiningStatus,
} = require("../controllers/miningController");

router.post("/start", auth, startMining);
router.get("/status", auth, getMiningStatus);

module.exports = router;
