const jwt = require("jsonwebtoken");

exports.authMiddleware = (req, res, next) => {
  try {
    const header = req.headers.authorization;
    const token = header && header.startsWith("Bearer ") ? header.split(" ")[1] : null;
    if (!token) {
      const e = new Error("Unauthorized!!");
      e.statusCode = 401;
      throw e;
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch (err) {
    err.statusCode = 401;
    next(err);
  }
};