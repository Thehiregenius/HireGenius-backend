const jwt = require('jsonwebtoken');

const jwtAuthMiddleware = (req, res, next) => {
  // const authorization = req.headers.authorization;
  // if (!authorization) {
  //   return res.status(401).json({ error: 'Token not found' });
  // }

  // const token = authorization.split(' ')[1]; // Bearer <token>
  // if (!token) {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }

  const authorization = req.headers.authorization;
  let token = null;

  if (authorization && typeof authorization === 'string') {
    const parts = authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') token = parts[1];
  }

  // fallback: try cookie (httpOnly cookie set by server)
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Token not found' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT Verification Error:', err.message);
    res.status(401).json({ error: 'Invalid token' });
  }
};

const generateToken = (userData) => {
  return jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '24h' });
};

module.exports = { jwtAuthMiddleware, generateToken };
