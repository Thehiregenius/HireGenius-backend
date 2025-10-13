// backend/controllers/authController.js
const User = require("../models/User");
const { generateToken } = require("../config/jwt");
const { verifyGoogleToken } = require("../services/googleAuth");
const { OAuth2Client } = require("google-auth-library");
const sendOTP = require("../utils/sendEmail");
const bcrypt = require("bcryptjs");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const cookieOptions = require("../config/cookieOptions");
// ------------------ SIGNUP (Email/Password) ------------------
const signup = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    // console.log("User model:", User);
    // console.log("Signup body:", req.body)
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

        // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Save user as unverified
    const user = new User({
      name,
      email,
      password,
      role,
      otp,
      otpExpiry,
      isVerified: false,
    });
    await user.save();

    // Send OTP email
    await sendOTP(email, otp);


    // const token = generateToken({ id: user._id, email: user.email, role: user.role });

    res.status(201).json({ message: "OTP sent to email. Please verify." });
  } catch (err) {
    console.error("Signup error:", err.message);
    res.status(500).json({ error: "Server error during signup" });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "User not found" });
    if (user.isVerified) return res.status(400).json({ error: "User already verified" });
    if (user.otp !== otp || user.otpExpiry < Date.now()) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    const token = generateToken({ id: user._id, email: user.email, role: user.role });
        res
      .cookie("token", token, cookieOptions)
      .json({ message: "Email verified successfully", user });
  } catch (err) {
    console.error("OTP verification error:", err.message);
    res.status(500).json({ error: "Server error during OTP verification" });
  }
};

// ------------------ LOGIN (Email/Password) ------------------
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const token = generateToken({ id: user._id, email: user.email, role: user.role });

  res
      .cookie("token", token, cookieOptions)
      .json({ message: "Login successful", user, token });

  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Server error during login" });
  }
};

// ------------------ GOOGLE SIGNUP ------------------
const googleSignup = async (req, res) => {
  try {
    const { tokenId } = req.body;
    const payload = await verifyGoogleToken(tokenId);
    const { email, name, sub: googleId, picture } = payload;

    let existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "User already exists. Please login." });
    }

    const user = new User({ name, email, googleId, avatar: picture, role: "student" });
    await user.save();

    const token = generateToken({ id: user._id, email: user.email, role: user.role });

    res
      .cookie("token", token, cookieOptions)
      .status(201)
      .json({ message: "Google signup successful", user });
  } catch (err) {
    console.error("Google signup error:", err.message);
    res.status(500).json({ error: "Server error during Google signup" });
  }
};

// ------------------ GOOGLE LOGIN ------------------
const googleLogin = async (req, res) => {
  try {
    const { tokenId } = req.body;
    const payload = await verifyGoogleToken(tokenId);
    const { email, sub: googleId, picture } = payload;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "User not found. Please signup first." });
    }

    if (!user.googleId) {
      user.googleId = googleId;
      user.avatar = picture;
      await user.save();
    }

    const token = generateToken({ id: user._id, email: user.email, role: user.role });

    res
      .cookie("token", token, cookieOptions)
      .status(201)
      .json({ message: "Google login successful", user, token });
  } catch (err) {
    console.error("Google login error:", err.message);
    res.status(500).json({ error: "Server error during Google login" });
  }
};


module.exports = { signup, login, googleSignup, googleLogin, verifyOtp };
