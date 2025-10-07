const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // add to .env
    pass: process.env.EMAIL_PASS, // add to .env
  },
});

const sendOTP = async (to, otp) => {
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject: "Your OTP Code",
    text: `Your OTP code is: ${otp}`,
  });
};

module.exports = sendOTP;