const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Otp = require("../models/Otp");

const nodemailer = require("nodemailer");




const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}


async function sendOTPEmail(email, otp, username) {

    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: email,
        subject: "رمز التحقق X Plus",
        html: `
            <h2>مرحباً ${username}</h2>
            <p>رمز التحقق الخاص بك:</p>
            <h1>${otp}</h1>
            <p>صلاحية الرمز 10 دقائق</p>
        `
    });

}



// =======================
// تسجيل مستخدم جديد
// =======================
exports.register = async (req, res) => {
  try {

    const { username, email, password } = req.body;


    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "جميع الحقول مطلوبة",
      });
    }






    // التأكد من عدم وجود المستخدم
    const existingUser = await User.findByEmail(email);


    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "البريد الإلكتروني مستخدم مسبقاً",
      });
    }


    // تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 10);

const otp = generateOTP();

const otpHash = await bcrypt.hash(otp, 10);

await Otp.save(
  email.trim().toLowerCase(),
  otpHash,
  {
    username: username.trim(),
    email: email.trim().toLowerCase(),
    password: hashedPassword
  },
  new Date(Date.now() + 10 * 60 * 1000)
);

await sendOTPEmail(
  email.trim().toLowerCase(),
  otp,
  username.trim()
);


    return res.status(200).json({
  success: true,
  message: "تم إرسال رمز التحقق إلى البريد الإلكتروني"
});


  } catch (err) {

    console.error("REGISTER ERROR:", err);


    return res.status(500).json({

      success: false,

      message: "حدث خطأ في الخادم",

      error: err.message

    });

  }
};




// =======================
// تسجيل الدخول
// =======================
exports.login = async (req, res) => {

  try {

    const { email, password } = req.body;


    if (!email || !password) {

      return res.status(400).json({

        success: false,

        message: "البريد وكلمة المرور مطلوبة"

      });

    }



    // البحث عن المستخدم
    const user = await User.findByEmail(
      email.trim().toLowerCase()
    );


    if (!user) {

      return res.status(401).json({

        success: false,

        message: "المستخدم غير موجود"

      });

    }



    // مقارنة كلمة المرور
    const match = await bcrypt.compare(
      password,
      user.password
    );


    if (!match) {

      return res.status(401).json({

        success: false,

        message: "كلمة المرور غير صحيحة"

      });

    }



    if (!process.env.JWT_SECRET) {

      return res.status(500).json({

        success: false,

        message: "JWT_SECRET غير موجود"

      });

    }



    // إنشاء التوكن
    const token = jwt.sign(

      {
        id: user.id,
        email: user.email
      },

      process.env.JWT_SECRET,

      {
        expiresIn: "7d"
      }

    );



    return res.json({

      success: true,

      message: "تم تسجيل الدخول بنجاح",

      token,

      user: {

        id: user.id,

        username: user.username,

        email: user.email

      }

    });



  } catch (err) {


    console.error("LOGIN ERROR:", err);


    return res.status(500).json({

      success: false,

      message: "حدث خطأ في الخادم",

      error: err.message

    });


  }

};


// =======================
// التحقق من OTP
// =======================
exports.verifyOTP = async (req, res) => {

  try {

    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "البريد والرمز مطلوبان"
      });
    }

    const otpData = await Otp.findByEmail(
      email.trim().toLowerCase()
    );

    if (!otpData) {
      return res.status(400).json({
        success: false,
        message: "لا يوجد رمز تحقق"
      });
    }

    if (new Date() > new Date(otpData.expires_at)) {
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
      await Otp.increaseAttempts(
        email.trim().toLowerCase()
      );

      return res.status(400).json({
        success:false,
        message:"رمز التحقق غير صحيح"
      });
    }


// هنا تضعه
const data = typeof otpData.user_data === "string"
  ? JSON.parse(otpData.user_data)
  : otpData.user_data;

const user = await User.create(
  data.username,
  data.email,
  data.password
);

await Otp.delete(
  email.trim().toLowerCase()
);

    res.json({
      success:true,
      message:"تم تفعيل الحساب بنجاح",
      user
    });

  } catch(err) {

    console.error("VERIFY OTP ERROR:", err);

    res.status(500).json({
      success:false,
      message:"خطأ في الخادم",
      error:err.message
    });

  }

};


// =======================
// إعادة إرسال OTP
// =======================
exports.resendOTP = async (req, res) => {

  try {

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success:false,
        message:"البريد مطلوب"
      });
    }


    const otpData = await Otp.findByEmail(
      email.trim().toLowerCase()
    );


    if (!otpData) {
      return res.status(400).json({
        success:false,
        message:"لا يوجد طلب تسجيل بهذا البريد"
      });
    }


    const otp = generateOTP();

    const otpHash = await bcrypt.hash(otp, 10);


    await Otp.save(
      email.trim().toLowerCase(),
      otpHash,
      typeof otpData.user_data === "string"
        ? JSON.parse(otpData.user_data)
        : otpData.user_data,
      new Date(Date.now() + 10 * 60 * 1000)
    );


const userData = typeof otpData.user_data === "string"
  ? JSON.parse(otpData.user_data)
  : otpData.user_data;

await sendOTPEmail(
  email.trim().toLowerCase(),
  otp,
  userData.username
);


    res.json({
      success:true,
      message:"تم إرسال رمز جديد"
    });


  } catch(err) {

    console.error("RESEND OTP ERROR:", err);

    res.status(500).json({
      success:false,
      message:"خطأ في الخادم",
      error:err.message
    });

  }

};