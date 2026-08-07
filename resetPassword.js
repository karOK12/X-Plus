require("dotenv").config();

const bcrypt = require("bcryptjs");
const User = require("./server/models/User");

async function reset() {
  const email = "hfsmrkarar1993@gmail.com";
  const newPassword = "Xplus@1993";

  const hash = await bcrypt.hash(newPassword, 10);

  const user = await User.updatePassword(email, hash);

  console.log("تم تغيير كلمة المرور:", user);

  process.exit();
}

reset();