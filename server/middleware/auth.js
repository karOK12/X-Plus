const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {

  // ===============================
  // وضع التطوير (Development)
  // تجاوز التحقق من JWT مؤقتًا
  // ===============================

  if (process.env.NODE_ENV !== "production") {

    req.user = {
      id: 1,
      username: "demo",
      email: "demo@xplus.com"
    };

    return next();
  }

  // ===============================
  // وضع الإنتاج (Production)
  // ===============================

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: "لم يتم تسجيل الدخول"
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "التوكن غير موجود"
    });
  }

  try {

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = decoded;

    next();

  } catch (error) {

    return res.status(401).json({
      success: false,
      message: "التوكن غير صالح"
    });

  }

};