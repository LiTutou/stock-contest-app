const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const compression = require("compression")
const rateLimit = require("express-rate-limit")
require("dotenv").config()

const { sequelize } = require("./config/database")
const logger = require("./utils/logger")
const { errorHandler, notFound } = require("./middleware/errorMiddleware")

// 路由导入
const userRoutes = require("./routes/userRoutes")
const stockRoutes = require("./routes/stockRoutes")
const recommendRoutes = require("./routes/recommendRoutes")
const rankingRoutes = require("./routes/rankingRoutes")

const app = express()
const PORT = process.env.PORT || 3000

// 基础中间件
app.use(helmet()) // 安全头设置
app.use(compression()) // 响应压缩
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    credentials: true,
  })
)

// 请求限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 限制每个IP 15分钟内最多100个请求
  message: {
    code: 429,
    message: "请求过于频繁，请稍后再试",
  },
})
app.use("/api/", limiter)

// 解析请求体
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// 请求日志
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`)
  next()
})

// 健康检查
app.get("/health", (req, res) => {
  res.json({
    code: 200,
    message: "OK",
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  })
})

// API路由
app.use("/api/user", userRoutes)
app.use("/api/stock", stockRoutes)
app.use("/api/recommend", recommendRoutes)
app.use("/api/ranking", rankingRoutes)

// 404处理
app.use(notFound)

// 错误处理
app.use(errorHandler)

// 数据库连接和服务器启动
const startServer = async () => {
  try {
    // 测试数据库连接
    await sequelize.authenticate()
    logger.info("数据库连接成功")

    // 同步数据库表（仅在首次运行时）
    if (process.env.NODE_ENV === "development") {
      // 改为 force: false, alter: false，避免每次重启都重建表
      await sequelize.sync({ force: false, alter: false })
      logger.info("数据库表同步完成")
    }

    // 启动服务器
    app.listen(PORT, () => {
      logger.info(`服务器运行在端口 ${PORT}`)
      logger.info(`环境: ${process.env.NODE_ENV || "development"}`)
    })
  } catch (error) {
    logger.error("服务器启动失败:", error)
    process.exit(1)
  }
}

// 优雅关闭
process.on("SIGTERM", async () => {
  logger.info("收到 SIGTERM 信号，正在关闭服务器...")
  await sequelize.close()
  process.exit(0)
})

process.on("SIGINT", async () => {
  logger.info("收到 SIGINT 信号，正在关闭服务器...")
  await sequelize.close()
  process.exit(0)
})

// 未捕获异常处理
process.on("uncaughtException", (error) => {
  logger.error("未捕获异常:", error)
  process.exit(1)
})

process.on("unhandledRejection", (reason, promise) => {
  logger.error("未处理的 Promise 拒绝:", reason)
  process.exit(1)
})

startServer()

module.exports = app
