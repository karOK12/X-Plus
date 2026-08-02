require("dotenv").config();

const express = require("express");
const app = express();

app.use(express.json());

const authRoutes = require("./routes/auth");

app.use("/api/auth", authRoutes);

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}