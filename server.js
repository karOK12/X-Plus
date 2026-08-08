require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const nodemailer = require("nodemailer");

const pool = require("./server/config/database");
const auth = require("./server/middleware/auth");

const otpRoutes = require("./server/routes/otp");

const authRoutes = require("./server/routes/auth");
const profileRoutes = require("./server/routes/profile");
const walletRoutes = require("./server/routes/wallet");
const uploadRoutes = require("./api/index");

const app = express();


// ══════════════════════════════════════════════════════
// Middleware
// ══════════════════════════════════════════════════════

app.use(cors());

app.use(express.json({
    limit: "10mb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "10mb"
}));


// ══════════════════════════════════════════════════════
// Static Files
// ══════════════════════════════════════════════════════

app.use(express.static(path.join(__dirname)));

app.use(
    "/uploads",
    express.static(path.join(__dirname, "uploads"))
);


// ══════════════════════════════════════════════════════
// OTP Routes
// ══════════════════════════════════════════════════════
//
// المسارات الناتجة:
//
// POST /api/otp/send
// POST /api/otp/verify
// POST /api/otp/resend
//
// حسب المسارات الموجودة داخل:
// server/routes/otp.js
//

app.use(
    "/api/otp",
    otpRoutes
);


// ══════════════════════════════════════════════════════
// HOME PAGE
// ══════════════════════════════════════════════════════

app.get("/", (req, res) => {

    res.sendFile(
        path.join(__dirname, "index.html")
    );

});


// ══════════════════════════════════════════════════════
// SMTP
// ══════════════════════════════════════════════════════

const transporter = nodemailer.createTransport({

    host: process.env.SMTP_HOST,

    port: Number(
        process.env.SMTP_PORT || 587
    ),

    secure: false,

    auth: {

        user: process.env.SMTP_USER,

        pass: process.env.SMTP_PASS

    }

});


if (
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
) {

    transporter.verify()

        .then(() => {

            console.log("✅ SMTP Ready");

        })

        .catch((error) => {

            console.log(
                "❌ SMTP Error:",
                error.message
            );

        });

} else {

    console.log(
        "⚠️ SMTP environment variables are not configured"
    );

}


// ══════════════════════════════════════════════════════
// Database Initialization
// ══════════════════════════════════════════════════════

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
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS full_name TEXT,
            ADD COLUMN IF NOT EXISTS last_name TEXT,
            ADD COLUMN IF NOT EXISTS birth_date DATE,
            ADD COLUMN IF NOT EXISTS country TEXT,
            ADD COLUMN IF NOT EXISTS phone TEXT,
            ADD COLUMN IF NOT EXISTS city TEXT,
            ADD COLUMN IF NOT EXISTS state TEXT,
            ADD COLUMN IF NOT EXISTS id_type TEXT,
            ADD COLUMN IF NOT EXISTS id_name TEXT,
            ADD COLUMN IF NOT EXISTS id_number TEXT,
            ADD COLUMN IF NOT EXISTS id_image TEXT,
            ADD COLUMN IF NOT EXISTS profile_image TEXT;
        `);


        await pool.query(`
            INSERT INTO platform_config
            (
                id,
                deposit_address
            )
            VALUES
            (
                1,
                '0xA1B2C3D4E5F678901234567890ABCDEF12345678'
            )
            ON CONFLICT (id)
            DO NOTHING;
        `);


        console.log("✅ Neon Database Connected");

    } catch (error) {

        console.error(
            "❌ Database Error:",
            error.message
        );

    }

}


initDatabase();


// ══════════════════════════════════════════════════════
// Health Check
// ══════════════════════════════════════════════════════

app.get(
    "/api/health",
    async (req, res) => {

        try {

            await pool.query("SELECT 1");

            res.json({

                success: true,

                server: "online",

                database: "connected"

            });

        } catch (error) {

            res.status(500).json({

                success: false,

                server: "online",

                database: "error",

                error: error.message

            });

        }

    }
);


// ══════════════════════════════════════════════════════
// User Init
// ══════════════════════════════════════════════════════

app.get(
    "/api/user/init",
    auth,
    async (req, res) => {

        try {

            const user = await pool.query(
                `
                SELECT
                    balance,
                    points,
                    power,
                    mining_start_time
                FROM users
                WHERE id = $1
                `,
                [req.user.id]
            );


            if (user.rows.length === 0) {

                return res.status(404).json({

                    success: false,

                    message:
                        "المستخدم غير موجود"

                });

            }


            const data = user.rows[0];

            let balance =
                Number(data.balance || 0);


            if (data.mining_start_time) {

                const seconds =
                    (
                        Date.now() -
                        Number(data.mining_start_time)
                    ) / 1000;


                const profit =
                    (
                        Number(data.power || 0) *
                        0.5
                    ) / 3600;


                balance +=
                    seconds * profit;

            }


            const config =
                await pool.query(
                    `
                    SELECT deposit_address
                    FROM platform_config
                    WHERE id = 1
                    `
                );


            const depositAddress =
                config.rows.length > 0
                    ? config.rows[0].deposit_address
                    : null;


            res.json({

                success: true,

                balance,

                points:
                    Number(data.points || 0),

                power:
                    Number(data.power || 0),

                depositAddress

            });

        } catch (error) {

            console.error(
                "❌ /api/user/init:",
                error
            );

            res.status(500).json({

                success: false,

                error: error.message

            });

        }

    }
);


// ══════════════════════════════════════════════════════
// Start Mining
// ══════════════════════════════════════════════════════

app.post(
    "/api/mining/start",
    auth,
    async (req, res) => {

        try {

            await pool.query(
                `
                UPDATE users
                SET mining_start_time = $1
                WHERE id = $2
                `,
                [
                    Date.now(),
                    req.user.id
                ]
            );


            res.json({

                success: true,

                message:
                    "تم بدء التعدين"

            });

        } catch (error) {

            console.error(
                "❌ /api/mining/start:",
                error
            );

            res.status(500).json({

                success: false,

                error: error.message

            });

        }

    }
);


// ══════════════════════════════════════════════════════
// Watch Advertisement
// ══════════════════════════════════════════════════════

app.post(
    "/api/ad/watch",
    auth,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    UPDATE users
                    SET points = points + 10
                    WHERE id = $1
                    RETURNING points
                    `,
                    [req.user.id]
                );


            if (result.rows.length === 0) {

                return res.status(404).json({

                    success: false,

                    message:
                        "المستخدم غير موجود"

                });

            }


            res.json({

                success: true,

                points:
                    result.rows[0].points

            });

        } catch (error) {

            console.error(
                "❌ /api/ad/watch:",
                error
            );

            res.status(500).json({

                success: false,

                error: error.message

            });

        }

    }
);


// ══════════════════════════════════════════════════════
// Authentication Routes
// ══════════════════════════════════════════════════════

app.use(
    "/api/auth",
    authRoutes
);


// ══════════════════════════════════════════════════════
// Profile Routes
// ══════════════════════════════════════════════════════

app.use(
    "/api",
    profileRoutes
);


// ══════════════════════════════════════════════════════
// Upload Routes
// ══════════════════════════════════════════════════════

app.use(
    "/api",
    uploadRoutes
);


// ══════════════════════════════════════════════════════
// Wallet Routes
// ══════════════════════════════════════════════════════

app.use(
    "/api/wallet",
    walletRoutes
);


// ══════════════════════════════════════════════════════
// 404 API
// ══════════════════════════════════════════════════════

app.use(
    "/api",
    (req, res) => {

        res.status(404).json({

            success: false,

            message:
                "API endpoint غير موجود",

            path: req.path

        });

    }
);


// ══════════════════════════════════════════════════════
// Error Handler
// ══════════════════════════════════════════════════════

app.use(
    (error, req, res, next) => {

        console.error(
            "❌ Server Error:",
            error
        );


        if (res.headersSent) {

            return next(error);

        }


        res.status(500).json({

            success: false,

            message:
                "خطأ داخلي في الخادم",

            error:
                process.env.NODE_ENV === "production"
                    ? undefined
                    : error.message

        });

    }
);


// ══════════════════════════════════════════════════════
// Vercel / Local Server
// ══════════════════════════════════════════════════════

const PORT =
    process.env.PORT || 3000;


if (require.main === module) {

    app.listen(
        PORT,
        () => {

            console.log(
                `🚀 Server running on port ${PORT}`
            );

        }
    );

}


module.exports = app;