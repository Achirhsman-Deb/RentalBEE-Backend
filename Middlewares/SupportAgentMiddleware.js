const User = require('../Models/Users_model');

const supportAgentMiddleware = async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Unauthorized: User not authenticated' });
    }

    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role !== 'SUPPORT_AGENT') {
      return res.status(403).json({ message: 'Access denied: Support Agent role required' });
    }

    // Role verified
    next();
  } catch (error) {
    console.error('Support agent middleware error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = supportAgentMiddleware;
