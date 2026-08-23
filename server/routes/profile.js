const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const pool = require("../config/database");
const auth = require("../middleware/auth");
const Otp = require("../models/Otp");


// ===============================
// توليد OTP
// ===============================
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}


// ===============================
// إرسال OTP
// ===============================
router.post("/otp/send-data", auth, async (req, res) => {
  try {

    const result = await pool.query(
      `SELECT email, username
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    const user = result.rows[0];

    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);

    await Otp.save(
      user.email.trim().toLowerCase(),
      otpHash,
      {
        action: "update_profile",
        userId: req.user.id
      },
      new Date(Date.now() + 10 * 60 * 1000)
    );

    const { data, error } = await resend.emails.send({
      from: "X Plus <no-reply@xplus.fun>",
      to: [user.email],
      subject: "رمز التحقق - X Plus",
      text: `مرحباً ${user.username}

رمز التحقق لتحديث بياناتك في X Plus: ${otp}

صلاحية الرمز 10 دقائق.`,
      html: `
        <div style="font-family:Arial;direction:rtl;padding:20px">
          <h2>مرحباً ${user.username}</h2>
          <p>رمز التحقق لتحديث بياناتك:</p>

          <div style="
            background:#1877f2;
            color:white;
            font-size:32px;
            text-align:center;
            padding:15px;
            border-radius:8px;
            letter-spacing:8px;
            font-weight:bold;
          ">
            ${otp}
          </div>

          <p>صلاحية الرمز: 10 دقائق</p>
        </div>
      `
    });

    if (error) {
      console.error("❌ PROFILE RESEND ERROR:", error);
      throw new Error(error.message || "Resend email failed");
    }

    console.log("📧 Profile OTP sent:", {
      id: data?.id,
      to: user.email
    });

    console.log(`📧 Profile OTP sent to ${user.email}`);

    res.json({
      success: true,
      message: `تم إرسال رمز التحقق إلى ${user.email}`
    });

  } catch (error) {

    console.error("SEND PROFILE OTP ERROR:", error);

    res.status(500).json({
      success: false,
      message: "فشل إرسال رمز التحقق",
      error: error.message
    });
  }
});


// ===============================
// التحقق من OTP
// ===============================
router.post("/otp/verify-data", auth, async (req, res) => {
  try {

    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "الرمز مطلوب"
      });
    }

    const userResult = await pool.query(
      `SELECT email
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    const email = userResult.rows[0].email
      .trim()
      .toLowerCase();

    const otpData = await Otp.findByEmail(email);

    if (!otpData) {
      return res.status(400).json({
        success: false,
        message: "لا يوجد رمز تحقق، أرسل رمزاً جديداً"
      });
    }

    if (new Date() > new Date(otpData.expires_at)) {

      await Otp.delete(email);

      return res.status(400).json({
        success: false,
        message: "انتهت صلاحية الرمز"
      });
    }

    const match = await bcrypt.compare(
      otp,
      otpData.otp_hash
    );

    if (!match) {

      await Otp.increaseAttempts(email);

      return res.status(400).json({
        success: false,
        message: "رمز التحقق غير صحيح"
      });
    }

    await Otp.delete(email);

    res.json({
      success: true,
      message: "تم التحقق بنجاح"
    });

  } catch (error) {

    console.error("VERIFY PROFILE OTP ERROR:", error);

    res.status(500).json({
      success: false,
      message: "خطأ في الخادم",
      error: error.message
    });
  }
});


// ===============================
// جلب بيانات الملف الشخصي
// ===============================
router.get("/user/profile", auth, async (req, res) => {
  try {

    const result = await pool.query(
      `SELECT
        id,
        username,
        email,
        full_name,
        last_name,
        birth_date,
        country,
        phone,
        city,
        state,
        id_type,
        id_name,
        id_number,
        id_image,
        profile_image,
        registration_completed
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });

  } catch (error) {

    console.error("GET PROFILE ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


// ===============================
// حفظ بيانات الملف الشخصي
// ===============================
router.put("/user/profile", auth, async (req, res) => {
  try {

    const {
      fullName,
      lastName,
      birthDate,
      country,
      phone,
      city,
      state,
      idType,
      idName,
      idNumber,
      idImage,
      profileImage
    } = req.body;


    await pool.query(
      `UPDATE users SET
        full_name = $1,
        last_name = $2,
        birth_date = $3,
        country = $4,
        phone = $5,
        city = $6,
        state = $7,
        id_type = $8,
        id_name = $9,
        id_number = $10,
        id_image = $11,
        profile_image = $12,
        registration_completed = TRUE
       WHERE id = $13`,
      [
        fullName || null,
        lastName || null,
        birthDate || null,
        country || null,
        phone || null,
        city || null,
        state || null,
        idType || null,
        idName || null,
        idNumber || null,
        idImage || null,
        profileImage || null,
        req.user.id
      ]
    );


    res.json({
      success: true,
      message: "تم حفظ البيانات بنجاح"
    });

  } catch (error) {

    console.error("SAVE PROFILE ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});


module.exports = router;