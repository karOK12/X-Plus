const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: "لم يتم تسجيل الدخول"
    });
  }

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "صيغة التوكن غير صحيحة"
    });
  }

  const token = authHeader.substring(7).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "التوكن غير موجود"
    });
  }

  if (!process.env.JWT_SECRET) {
    console.error("❌ JWT_SECRET غير موجود");

    return res.status(500).json({
      success: false,
      message: "إعدادات المصادقة غير مكتملة"
    });
  }

  try {

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    if (!decoded.id) {
      return res.status(401).json({
        success: false,
        message: "هوية المستخدم غير موجودة في التوكن"
      });
    }

    req.user = decoded;

    next();

  } catch (error) {

    console.error("❌ JWT ERROR:", error.message);

    return res.status(401).json({
      success: false,
      message: "جلسة الدخول غير صالحة أو منتهية"
    });

  }

};