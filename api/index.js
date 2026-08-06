const express = require("express");
const router = express.Router();

const fs = require("fs");
const path = require("path");

const uploadDir = path.join(__dirname, "../uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

router.post("/upload", (req, res) => {

    try {

        const { image } = req.body;

        if (!image) {
            return res.status(400).json({
                success:false,
                message:"لم يتم إرسال صورة"
            });
        }

        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

        const fileName = "profile_" + Date.now() + ".jpg";

        const filePath = path.join(uploadDir, fileName);

        fs.writeFileSync(
            filePath,
            base64Data,
            "base64"
        );


        res.json({
            success:true,
            url:"/uploads/" + fileName
        });


    } catch(error){

        res.status(500).json({
            success:false,
            message:error.message
        });

    }

});


module.exports = router;