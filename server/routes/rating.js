const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");

const {
  getRating,
  saveRating,
  getComments,
  saveComment,
  replyToReview
} = require("../controllers/ratingController");

router.get("/", auth, getRating);

router.post("/", auth, saveRating);

router.get("/comments", auth, getComments);

router.post("/comments", auth, saveComment);

router.post("/reply", auth, replyToReview);

module.exports = router;
