const logger = require("../utils/logger")

// 404 错误处理
const notFound = (req, res, next) => {
  const error = new Error(`接口不存在 - ${req.originalUrl}`)
  res.status(404)
  next(error)
}

// 通用错误处理
const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode
  let message = err.message

  // Sequelize 验证错误
  if (err.name === "SequelizeValidationError") {
    statusCode = 400
    message = err.errors.map((e) => e.message).join(", ")
  }

  // Sequelize 唯一约束错误
  if (err.name === "SequelizeUniqueConstraintError") {
    statusCode = 400
    message = "数据已存在，请检查输入"
  }

  // JWT 错误
  if (err.name === "JsonWebTokenError") {
    statusCode = 401
    message = "无效的访问令牌"
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401
    message = "访问令牌已过期"
  }

  // 记录错误日志
  logger.error(`错误: ${message}`, {
    statusCode,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  })

  // 返回错误响应
  res.status(statusCode).json({
    code: statusCode,
    message: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  })
}

// 自定义错误类
class ApiError extends Error {
  constructor(message, statusCode = 500) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = true

    Error.captureStackTrace(this, this.constructor)
  }
}

module.exports = {
  notFound,
  errorHandler,
  ApiError,
}
