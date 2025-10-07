// backend/controllers/googleAuth.js
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Verify Google token and return payload
async function verifyGoogleToken(token) {
  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload(); // contains email, name, sub (googleId), picture, etc.
}
// async function verifyGoogleToken(tokenId) {
//   return {
//     email: "testuser@gmail.com",
//     name: "Test User",
//     sub: "1234567890",
//     picture: "https://i.pravatar.cc/150?img=3"
//   };
// }


module.exports = { verifyGoogleToken };
