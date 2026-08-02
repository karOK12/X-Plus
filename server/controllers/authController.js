const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");


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


    // إنشاء المستخدم في قاعدة البيانات
    const user = await User.create(
      username.trim(),
      email.trim().toLowerCase(),
      hashedPassword
    );


    return res.status(201).json({

      success: true,

      message: "تم إنشاء الحساب بنجاح",

      user

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