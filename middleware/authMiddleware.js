const jwt = require("jsonwebtoken")
const { User } = require("../models")
const { ApiError } = require("./errorMiddleware")
const logger = require("../utils/logger")

// 验证JWT token
const authenticate = async (req, res, next) => {
  try {
    let token

    // 从请求头获取token
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1]
    }

    if (!token) {
      throw new ApiError("未提供访问令牌", 401)
    }

    // 验证token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // 查找用户
    const user = await User.findByPk(decoded.userId)

    if (!user) {
      throw new ApiError("用户不存在", 401)
    }

    if (user.status !== "active") {
      throw new ApiError("用户账户已被禁用", 401)
    }

    // 更新最后活跃时间
    await user.update({ last_active_at: new Date() })

    // 将用户信息添加到请求对象
    req.user = {
      userId: user.id,
      openId: decoded.openId,
      nickname: user.nickname,
      level: user.level,
      role: user.role || "user",
    }

    next()
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      next(new ApiError("无效的访问令牌", 401))
    } else if (error.name === "TokenExpiredError") {
      next(new ApiError("访问令牌已过期", 401))
    } else {
      next(error)
    }
  }
}

// 可选认证中间件（不强制登录）
const optionalAuth = async (req, res, next) => {
  try {
    let token

    // 从请求头获取token
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1]
    }

    if (token) {
      try {
        // 验证token
        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        // 查找用户
        const user = await User.findByPk(decoded.userId)

        if (user && user.status === "active") {
          // 更新最后活跃时间
          await user.update({ last_active_at: new Date() })

          // 将用户信息添加到请求对象
          req.user = {
            userId: user.id,
            openId: decoded.openId,
            nickname: user.nickname,
            level: user.level,
            role: user.role || "user",
          }
        }
      } catch (tokenError) {
        // token无效时不抛出错误，继续执行
        logger.warn("可选认证中token无效:", tokenError.message)
      }
    }

    next()
  } catch (error) {
    next(error)
  }
}

// 权限验证中间件
const authorize = (roles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new ApiError("需要登录后访问", 401)
      }

      // 将角色转换为数组
      const allowedRoles = Array.isArray(roles) ? roles : [roles]

      // 检查用户角色
      if (!allowedRoles.includes(req.user.role)) {
        throw new ApiError("权限不足", 403)
      }

      next()
    } catch (error) {
      next(error)
    }
  }
}

// 检查用户等级的中间件
const requireLevel = (minLevel) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw new ApiError("需要登录后访问", 401)
      }

      if (req.user.level < minLevel) {
        throw new ApiError(`需要达到${minLevel}级才能使用此功能`, 403)
      }

      next()
    } catch (error) {
      next(error)
    }
  }
}

// 检查用户是否为资源所有者的中间件
const requireOwnership = (getResourceUserId) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new ApiError("需要登录后访问", 401)
      }

      const resourceUserId = await getResourceUserId(req)

      if (req.user.userId !== resourceUserId && req.user.role !== "admin") {
        throw new ApiError("只能访问自己的资源", 403)
      }

      next()
    } catch (error) {
      next(error)
    }
  }
}

// 限流中间件
const rateLimit = (maxRequests, windowMs) => {
  const requests = new Map()

  return (req, res, next) => {
    const key = req.user ? `user:${req.user.userId}` : `ip:${req.ip}`
    const now = Date.now()
    const windowStart = now - windowMs

    // 获取用户的请求记录
    if (!requests.has(key)) {
      requests.set(key, [])
    }

    const userRequests = requests.get(key)

    // 清理过期的请求记录
    const validRequests = userRequests.filter(
      (timestamp) => timestamp > windowStart
    )
    requests.set(key, validRequests)

    // 检查是否超过限制
    if (validRequests.length >= maxRequests) {
      const error = new ApiError("请求过于频繁，请稍后再试", 429)
      error.retryAfter = Math.ceil(windowMs / 1000)
      return next(error)
    }

    // 记录当前请求
    validRequests.push(now)

    next()
  }
}

// 验证API密钥中间件（用于系统任务）
const validateApiKey = (req, res, next) => {
  try {
    const apiKey = req.headers["x-api-key"]

    if (!apiKey) {
      throw new ApiError("缺少API密钥", 401)
    }

    if (apiKey !== process.env.SYSTEM_API_KEY) {
      throw new ApiError("无效的API密钥", 401)
    }

    // 设置系统用户角色
    req.user = {
      userId: 0,
      role: "system",
      nickname: "System",
    }

    next()
  } catch (error) {
    next(error)
  }
}

// 检查用户状态的中间件
const checkUserStatus = (req, res, next) => {
  try {
    if (!req.user) {
      throw new ApiError("需要登录后访问", 401)
    }

    // 这里可以添加更多的用户状态检查
    // 比如检查用户是否被临时封禁等

    next()
  } catch (error) {
    next(error)
  }
}

// 记录用户操作的中间件
const logUserAction = (action) => {
  return (req, res, next) => {
    if (req.user) {
      logger.info(`用户操作: ${req.user.userId} - ${action}`, {
        userId: req.user.userId,
        action,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        timestamp: new Date().toISOString(),
      })
    }
    next()
  }
}

module.exports = {
  authenticate,
  optionalAuth,
  authorize,
  requireLevel,
  requireOwnership,
  rateLimit,
  validateApiKey,
  checkUserStatus,
  logUserAction,
}
