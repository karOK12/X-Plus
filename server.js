require("dotenv").config();


const express = require("express");
const cors = require("cors");

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");

const pool = require("./server/config/database");

const auth = require("./server/middleware/auth");

const app = express();

app.use(cors());
app.use(express.json());

const path = require("path");

app.use(express.static(path.join(__dirname)));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));



const JWT_SECRET = process.env.JWT_SECRET || "xplus_secret_key_2026";

// إعداد إرسال البريد
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// التحقق من إعداد SMTP
transporter.verify()
.then(() => {
    console.log("✅ SMTP Ready");
})
.catch((err) => {
    console.log("❌ SMTP Error:", err.message);
});



// إنشاء الجداول
async function initDatabase() {
  




    try {

        await pool.query(`
            CREATE TABLE IF NOT EXISTS platform_config (
                id INT PRIMARY KEY,
                deposit_address TEXT
            );

            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT DEFAULT 'demo',
                email TEXT DEFAULT 'demo@xplus.com',
                password TEXT DEFAULT 'demo123',
                balance REAL DEFAULT 0,
                points INT DEFAULT 0,
                power REAL DEFAULT 150.50,
                mining_start_time BIGINT
            );
        `);


        await pool.query(`
            INSERT INTO platform_config
            (id, deposit_address)
            VALUES
            (
                1,
                '0xA1B2C3D4E5F678901234567890ABCDEF12345678'
            )
            ON CONFLICT (id) DO NOTHING;
        `);


        console.log("✅ Neon Database Connected");


    } catch(error){

        console.log("❌ Database Error:", error.message);

    }

}


initDatabase();



// جلب بيانات المستخدم
app.get("/api/user/init", auth, async(req,res)=>{

    try {

        const user = await pool.query(
        `
        SELECT 
        balance,
        points,
        power,
        mining_start_time
        FROM users
        WHERE id=$1
        `,
        [req.user.id]
        );


        if(user.rows.length === 0){

            return res.status(404).json({
                success:false,
                message:"المستخدم غير موجود"
            });

        }


        const data = user.rows[0];


        let balance = data.balance;


        if(data.mining_start_time){

            const seconds =
            (Date.now() - data.mining_start_time) / 1000;


            const profit =
            (data.power * 0.5) / 3600;


            balance += seconds * profit;

        }



        const config = await pool.query(
        `
        SELECT deposit_address
        FROM platform_config
        WHERE id=1
        `
        );


        res.json({

            success:true,
            balance,
            points:data.points,
            power:data.power,
            depositAddress:
            config.rows[0].deposit_address

        });



    }catch(error){

        res.status(500).json({
            success:false,
            error:error.message
        });

    }

});




// بدء التعدين
app.post("/api/mining/start", auth, async(req,res)=>{

    try{

        await pool.query(
        `
        UPDATE users
        SET mining_start_time=$1
        WHERE id=$2
        `,
        [
            Date.now(),
            req.user.id
        ]);


        res.json({
            success:true,
            message:"تم بدء التعدين"
        });


    }catch(error){

        res.status(500).json({
            success:false,
            error:error.message
        });

    }

});




// مشاهدة إعلان
app.post("/api/ad/watch", auth, async(req,res)=>{

    try{

        const result = await pool.query(
        `
        UPDATE users
        SET points = points + 10
        WHERE id=$1
        RETURNING points
        `,
        [
            req.user.id
        ]);


        res.json({

            success:true,
            points:result.rows[0].points

        });


    }catch(error){

        res.status(500).json({
            success:false,
            error:error.message
        });

    }

});


const authRoutes = require("./server/routes/auth");
app.use("/api/auth", authRoutes);


// Upload API
const uploadRoutes = require("./api/index");
app.use("/api", uploadRoutes);


// تشغيل السيرفر
const PORT = 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});