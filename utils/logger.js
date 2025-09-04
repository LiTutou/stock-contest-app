const winston = require("winston")
const path = require("path")

// 创建日志目录
const logDir = "logs"
require("fs").mkdirSync(logDir, { recursive: true })

// 自定义日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${stack || message}`
  })
)

// 创建 logger 实例
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  transports: [
    // 写入所有日志到 app.log
    new winston.transports.File({
      filename: path.join(logDir, "app.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // 单独写入错误日志
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
})

// 开发环境下同时输出到控制台
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  )
}

module.exports = logger
