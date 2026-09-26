const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");

const {
  getRating,
  saveRating,
  replyToReview
} = require("../controllers/ratingController");

router.get("/", auth, getRating);
router.post("/", auth, saveRating);
router.post("/reply", auth, replyToReview);

module.exports = router;
