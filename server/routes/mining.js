const express = require("express");
const router = express.Router();

const {
  startMining,
  getMiningStatus,
} = require("../controllers/miningController");

router.post("/start", startMining);
router.get("/status", getMiningStatus);

module.exports = router;