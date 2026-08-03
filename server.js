require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const auth = require('./server/middleware/auth');

const app = express();

app.use(cors());
app.use(express.json());


// اتصال قاعدة البيانات Neon
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});


// فحص الاتصال وإنشاء الجداول
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



// بيانات المستخدم
app.get('/api/user/init', auth, async(req,res)=>{

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


        const data=user.rows[0];


        let balance=data.balance;


        if(data.mining_start_time){

            const seconds =
            (Date.now()-data.mining_start_time)/1000;


            const profit =
            (data.power*0.5)/3600;


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
app.post('/api/mining/start', auth, async(req,res)=>{

    try{


        const result = await pool.query(
        `
        UPDATE users
        SET mining_start_time=$1
        WHERE id=$2
        RETURNING id
        `,
        [
            Date.now(),
            req.user.id
        ]
        );


        if(result.rows.length===0){

            return res.status(404).json({
                success:false,
                message:"المستخدم غير موجود"
            });

        }


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





// مشاهدة إعلان وإضافة نقاط
app.post('/api/ad/watch', auth, async(req,res)=>{

    try{


        const result = await pool.query(
        `
        UPDATE users
        SET points=points+10
        WHERE id=$1
        RETURNING points
        `,
        [
            req.user.id
        ]
        );


        if(result.rows.length===0){

            return res.status(404).json({
                success:false,
                message:"المستخدم غير موجود"
            });

        }


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





// تشغيل السيرفر

const PORT = 3000;


app.listen(PORT,()=>{

console.log(`🚀 Server running on port ${PORT}`);

});