const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");

const {
  getRating,
  saveRating
} = require("../controllers/ratingController");

router.get("/", auth, getRating);
router.post("/", auth, saveRating);

module.exports = router;
