const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Otp = require("../models/Otp");

const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);


// =====================================================
// SMTP
// =====================================================


// =====================================================
// OTP
// =====================================================

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}


async function sendOTPEmail(email, otp, username) {

  console.log("📤 RESEND TRY:", { to: email });

  const { data, error } = await resend.emails.send({
    from: "X Plus <no-reply@xplus.fun>",
    to: [email],
    subject: "رمز التحقق X Plus",

    text: `مرحباً ${username}

رمز التحقق الخاص بك في X Plus: ${otp}

صلاحية الرمز 10 دقائق.`,

    html: `
      <div dir="rtl" style="font-family:Arial,sans-serif">

        <h2>مرحباً ${username}</h2>

        <p>رمز التحقق الخاص بك في X Plus:</p>

        <h1 style="letter-spacing:8px;color:#3b82f6;">
          ${otp}
        </h1>

        <p>صلاحية الرمز 10 دقائق.</p>

      </div>
    `
  });

  if (error) {
    console.error("❌ RESEND ERROR:", error);
    throw new Error(error.message || "Resend email failed");
  }

  console.log("📧 RESEND SEND RESULT:", {
    id: data?.id,
    to: email
  });

  return {
    accepted: true,
    rejected: false,
    messageId: data?.id
  };
}


// =====================================================
// JWT
// =====================================================

function createToken(user) {

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET غير موجود في Environment Variables");
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );
}


// =====================================================
// REGISTER
// =====================================================

exports.register = async (req, res) => {

  try {

    const { username, email, password } = req.body;


    // -------------------------
    // التحقق من البيانات
    // -------------------------

    if (!username || !email || !password) {

      return res.status(400).json({
        success: false,
        message: "جميع الحقول مطلوبة"
      });

    }


    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();


    if (cleanUsername.length < 3) {

      return res.status(400).json({
        success: false,
        message: "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"
      });

    }


    if (password.length < 6) {

      return res.status(400).json({
        success: false,
        message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل"
      });

    }


    // -------------------------
    // تشفير كلمة المرور
    // -------------------------

    const hashedPassword =
      await bcrypt.hash(password, 10);


    // -------------------------
    // إنشاء OTP
    // -------------------------

    const otp = generateOTP();

    const otpHash =
      await bcrypt.hash(otp, 10);


    // -------------------------
    // حفظ طلب التسجيل المؤقت
    // -------------------------

    await Otp.save(
      cleanEmail,

      otpHash,

      {
        username: cleanUsername,
        email: cleanEmail,
        password: hashedPassword
      },

      new Date(
        Date.now() + 10 * 60 * 1000
      )
    );


    // -------------------------
    // إرسال OTP
    // -------------------------

    await sendOTPEmail(
      cleanEmail,
      otp,
      cleanUsername
    );


    return res.status(200).json({

      success: true,

      message:
        "تم إرسال رمز التحقق إلى البريد الإلكتروني",

      email: cleanEmail

    });


  } catch (err) {

    console.error(
      "REGISTER ERROR:",
      err
    );


    return res.status(500).json({

      success: false,

      message: "حدث خطأ في الخادم",

      error:
        process.env.NODE_ENV === "production"
          ? undefined
          : err.message

    });

  }

};


// =====================================================
// LOGIN
// =====================================================

exports.login = async (req, res) => {

  try {

    const { email, password } = req.body;


    // -------------------------
    // التحقق
    // -------------------------

    if (!email || !password) {

      return res.status(400).json({

        success: false,

        message:
          "البريد الإلكتروني وكلمة المرور مطلوبة"

      });

    }


    const cleanEmail =
      email.trim().toLowerCase();


    // -------------------------
    // البحث عن المستخدم
    // -------------------------

    const user =
      await User.findByEmail(cleanEmail);


    if (!user) {

      return res.status(401).json({

        success: false,

        message: "المستخدم غير موجود"

      });

    }


    // -------------------------
    // مقارنة كلمة المرور
    // -------------------------

    const match =
      await bcrypt.compare(
        password,
        user.password
      );


    if (!match) {

      return res.status(401).json({

        success: false,

        message: "كلمة المرور غير صحيحة"

      });

    }


    // -------------------------
    // إنشاء JWT
    // -------------------------

    const token =
      createToken(user);


    // -------------------------
    // الرد
    // -------------------------

    return res.json({

      success: true,

      message:
        "تم تسجيل الدخول بنجاح",

      token,

      user: {

        id: user.id,

        username: user.username,

        email: user.email,
        registration_completed: user.registration_completed === true

      }

    });


  } catch (err) {

    console.error(
      "LOGIN ERROR:",
      err
    );


    return res.status(500).json({

      success: false,

      message: "حدث خطأ في الخادم",

      error:
        process.env.NODE_ENV === "production"
          ? undefined
          : err.message

    });

  }

};


// =====================================================
// VERIFY OTP
// =====================================================

exports.verifyOTP = async (req, res) => {

  try {

    const { email, otp } = req.body;


    // -------------------------
    // التحقق من البيانات
    // -------------------------

    if (!email || !otp) {

      return res.status(400).json({

        success: false,

        message:
          "البريد الإلكتروني والرمز مطلوبان"

      });

    }


    const cleanEmail =
      email.trim().toLowerCase();

    const cleanOtp =
      String(otp).trim();

    console.log("🔎 OTP VERIFY:", {
      receivedEmail: email,
      cleanEmail,
      otpLength: cleanOtp.length,
      otpType: typeof otp
    });


    // -------------------------
    // البحث عن OTP
    // -------------------------

    const otpData =
      await Otp.findByEmail(cleanEmail);


    if (!otpData) {

      return res.status(400).json({

        success: false,

        message:
          "لا يوجد رمز تحقق لهذا البريد"

      });

    }


    // -------------------------
    // التحقق من انتهاء الصلاحية
    // -------------------------

    if (
      new Date() >
      new Date(otpData.expires_at)
    ) {

      return res.status(400).json({

        success: false,

        message:
          "انتهت صلاحية رمز التحقق، أرسل رمزاً جديداً"

      });

    }


    // -------------------------
    // التحقق من الرمز
    // -------------------------

    const match =
      await bcrypt.compare(
        cleanOtp,
        otpData.otp_hash
      );


    if (!match) {

      await Otp.increaseAttempts(
        cleanEmail
      );


      return res.status(400).json({

        success: false,

        message:
          "رمز التحقق غير صحيح"

      });

    }


    // -------------------------
    console.log("✅ OTP CODE MATCHED:", { email: cleanEmail, attempts: otpData.attempts, expiresAt: otpData.expires_at });
    // قراءة بيانات المستخدم
    // -------------------------

    const data =
      typeof otpData.user_data === "string"
        ? JSON.parse(otpData.user_data)
        : otpData.user_data;


    if (
      !data ||
      !data.username ||
      !data.email ||
      !data.password
    ) {

      return res.status(400).json({

        success: false,

        message:
          "بيانات التسجيل غير مكتملة"

      });

    }


    // -------------------------
    // التحقق من وجود الحساب مسبقاً
    // -------------------------

    const existingUser =
      await User.findByEmail(cleanEmail);

    if (existingUser) {

      console.log("ℹ️ ACCOUNT ALREADY EXISTS:", {
        id: existingUser.id,
        email: existingUser.email
      });

      // تحديث كلمة المرور التي أدخلها المستخدم أثناء التسجيل
      const updatedUser = await User.updatePassword(
        cleanEmail,
        data.password
      );

      if (!updatedUser) {
        throw new Error("فشل تحديث كلمة مرور الحساب");
      }

      console.log("✅ PASSWORD UPDATED:", {
        id: updatedUser.id,
        email: updatedUser.email
      });

      await Otp.delete(cleanEmail);

      return res.status(200).json({
        success: true,
        accountExists: true,
        passwordUpdated: true,
        message: "تم التحقق وتحديث كلمة المرور، يرجى تسجيل الدخول",
        email: cleanEmail
      });
    }


    // -------------------------
    // إنشاء المستخدم الجديد
    // -------------------------

    console.log("🔎 BEFORE USER CREATE:", {
      username: data.username,
      email: data.email
    });

    let user;

    try {
      user = await User.create(
        data.username,
        data.email,
        data.password
      );

      console.log("✅ USER CREATED:", {
        id: user?.id,
        email: user?.email
      });

    } catch (userErr) {
      console.error("❌ USER CREATE ERROR:", {
        message: userErr.message,
        code: userErr.code,
        detail: userErr.detail,
        constraint: userErr.constraint
      });

      throw userErr;
    }


    // -------------------------
    // حذف OTP
    // -------------------------

    await Otp.delete(
      cleanEmail
    );


    // -------------------------
    // إنشاء JWT مباشرة
    // -------------------------

    const token =
      createToken(user);


    // -------------------------
    // الرد
    // -------------------------

    return res.json({

      success: true,

      message:
        "تم تفعيل الحساب وتسجيل الدخول بنجاح",

      token,

      user: {

        id: user.id,

        username: user.username,

        email: user.email

      }

    });


  } catch (err) {

    console.error(
      "VERIFY OTP ERROR:",
      err
    );


    return res.status(500).json({

      success: false,

      message: "خطأ في الخادم",

      error:
        process.env.NODE_ENV === "production"
          ? undefined
          : err.message

    });

  }

};


// =====================================================
// SEND OTP — إرسال الكود فقط بدون إنشاء مستخدم
// =====================================================

exports.sendOTP = async (req, res) => {

  console.log("🔥 SEND OTP REQUEST RECEIVED:", req.body);

  try {

    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "جميع الحقول مطلوبة"
      });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanUsername.length < 3) {
      return res.status(400).json({
        success: false,
        message: "اسم المستخدم يجب أن يكون 3 أحرف على الأقل"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل"
      });
    }

    // مهم:
    // لا نفحص users هنا.
    // إرسال OTP لا يعني إنشاء حساب.

    const otp = generateOTP();

    const otpHash = await bcrypt.hash(otp, 10);

    await Otp.save(
      cleanEmail,
      otpHash,
      {
        username: cleanUsername,
        email: cleanEmail,
        password: await bcrypt.hash(password, 10)
      },
      new Date(Date.now() + 10 * 60 * 1000)
    );

    const mailResult = await sendOTPEmail(
      cleanEmail,
      otp,
      cleanUsername
    );

    return res.status(200).json({
  success: true,
  message: "تم إرسال رمز التحقق إلى البريد الإلكتروني",
  email: cleanEmail,
  mailResult
});

  } catch (err) {

    console.error("SEND OTP ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "خطأ في الخادم",
      error:
        process.env.NODE_ENV === "production"
          ? undefined
          : err.message
    });
  }
};

// =====================================================
// RESEND OTP
// =====================================================

exports.resendOTP = async (req, res) => {

  try {

    const { email } = req.body;


    if (!email) {

      return res.status(400).json({

        success: false,

        message: "البريد الإلكتروني مطلوب"

      });

    }


    const cleanEmail =
      email.trim().toLowerCase();


    // -------------------------
    // البحث عن الطلب
    // -------------------------

    const otpData =
      await Otp.findByEmail(cleanEmail);


    if (!otpData) {

      return res.status(400).json({

        success: false,

        message:
          "لا يوجد طلب تسجيل بهذا البريد"

      });

    }


    // -------------------------
    // بيانات المستخدم
    // -------------------------

    const userData =
      typeof otpData.user_data === "string"
        ? JSON.parse(otpData.user_data)
        : otpData.user_data;


    if (!userData) {

      return res.status(400).json({

        success: false,

        message:
          "بيانات التسجيل غير موجودة"

      });

    }


    // -------------------------
    // إنشاء OTP جديد
    // -------------------------

    const otp =
      generateOTP();


    const otpHash =
      await bcrypt.hash(
        otp,
        10
      );


    // -------------------------
    // حفظ OTP الجديد
    // -------------------------

    await Otp.save(

      cleanEmail,

      otpHash,

      userData,

      new Date(
        Date.now() + 10 * 60 * 1000
      )

    );


    // -------------------------
    // إرسال البريد
    // -------------------------

    await sendOTPEmail(

      cleanEmail,

      otp,

      userData.username

    );


    return res.json({

      success: true,

      message:
        "تم إرسال رمز تحقق جديد"

    });


  } catch (err) {

    console.error(
      "RESEND OTP ERROR:",
      err
    );


    return res.status(500).json({

      success: false,

      message: "خطأ في الخادم",

      error:
        process.env.NODE_ENV === "production"
          ? undefined
          : err.message

    });

  }

};
// =====================================================
// CHANGE PASSWORD
// =====================================================
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "كلمة المرور الحالية والجديدة مطلوبة"
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل"
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    const currentMatch = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!currentMatch) {
      return res.status(401).json({
        success: false,
        message: "كلمة المرور الحالية غير صحيحة"
      });
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    const updatedUser = await User.updatePasswordById(
      req.user.id,
      newHash
    );

    if (!updatedUser) {
      return res.status(500).json({
        success: false,
        message: "تعذر تحديث كلمة المرور"
      });
    }

    return res.json({
      success: true,
      message: "تم تغيير كلمة المرور بنجاح"
    });

  } catch (err) {
    console.error("CHANGE PASSWORD ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "حدث خطأ في الخادم"
    });
  }
};
