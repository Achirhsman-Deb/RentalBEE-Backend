const jwt = require("jsonwebtoken");

exports.authMiddleware = (req, res, next) => {
    
    if (req.method === 'OPTIONS') {
        return next();
    }

    try {
        let token = req.cookies.accessToken;

        if (!token) {
            const e = new Error("Unauthorized: No token provided");
            e.statusCode = 401;
            throw e;
        }

        const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET );
        
        req.userId = payload.sub;
        next();
    } catch (err) {
        err.statusCode = 401;
        err.message = "Unauthorized: Invalid or Expired Token";
        next(err);
    }
};