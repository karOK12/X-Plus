const express = require("express");
const router = express.Router();

router.get("/profile", (req, res) => {
    res.json({
        success: true,
        profile: {}
    });
});

router.post("/profile", (req, res) => {
    res.json({
        success: true,
        message: "تم حفظ الملف الشخصي"
    });
});

module.exports = router;