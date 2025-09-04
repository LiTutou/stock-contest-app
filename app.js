const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const compression = require("compression")
const rateLimit = require("express-rate-limit")
require("dotenv").config()

const { sequelize } = require("./config/database")
const logger = require("./utils/logger")
const { errorHandler, notFound } = require("./middleware/errorMiddleware")
const stockUpdateJob = require("./utils/stockUpdateJob")
const cacheManager = require("./utils/cacheManager")

// 路由导入
const userRoutes = require("./routes/userRoutes")
const stockRoutes = require("./routes/stockRoutes")
const recommendRoutes = require("./routes/recommendRoutes")
const rankingRoutes = require("./routes/rankingRoutes")
const testRoutes = require("./routes/testRoutes")

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
app.get("/health", async (req, res) => {
  const healthcheck = {
    code: 200,
    message: "OK",
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: "checking",
      cache: "checking",
      jobs: "checking",
    },
  }

  try {
    // 检查数据库连接
    await sequelize.authenticate()
    healthcheck.data.database = "connected"
  } catch (error) {
    healthcheck.data.database = "disconnected"
    healthcheck.data.status = "unhealthy"
  }

  // 检查缓存状态
  healthcheck.data.cache = cacheManager.isConnected()
    ? "connected"
    : "disconnected"

  // 检查定时任务状态
  healthcheck.data.jobs = stockUpdateJob.isRunning ? "running" : "stopped"
  healthcheck.data.lastStockUpdate = stockUpdateJob.lastUpdateTime

  res.json(healthcheck)
})

// API路由
app.use("/api/user", userRoutes)
app.use("/api/stock", stockRoutes)
app.use("/api/recommend", recommendRoutes)
app.use("/api/ranking", rankingRoutes)

// 开发环境测试路由
if (process.env.NODE_ENV === "development") {
  app.use("/api/test", testRoutes)

  // 手动触发股票更新
  app.post("/api/admin/update-stocks", async (req, res) => {
    try {
      await stockUpdateJob.updateAllStockPrices()
      res.json({ code: 200, message: "股票价格更新成功" })
    } catch (error) {
      res.status(500).json({ code: 500, message: error.message })
    }
  })

  // 手动触发排行榜计算
  app.post("/api/admin/calculate-ranking", async (req, res) => {
    try {
      const { type = "weekly" } = req.body
      if (type === "weekly") {
        await stockUpdateJob.calculateWeeklyRanking()
      } else if (type === "monthly") {
        await stockUpdateJob.calculateMonthlyRanking()
      }
      res.json({ code: 200, message: `${type}排行榜计算成功` })
    } catch (error) {
      res.status(500).json({ code: 500, message: error.message })
    }
  })
}

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

    // 同步数据库表（仅在开发环境首次运行时）
    if (
      process.env.NODE_ENV === "development" &&
      process.env.DB_SYNC === "true"
    ) {
      await sequelize.sync({ alter: true })
      logger.info("数据库表同步完成")
    }

    // 初始化缓存
    await cacheManager.init()
    logger.info("缓存系统初始化完成")

    // 启动定时任务（仅在生产环境或指定启用时）
    if (process.env.ENABLE_CRON === "true") {
      stockUpdateJob.init()
      logger.info("定时任务已启动")
    } else {
      logger.info("定时任务未启用 (ENABLE_CRON=false)")
    }

    // 启动服务器
    const server = app.listen(PORT, () => {
      logger.info(`服务器运行在端口 ${PORT}`)
      logger.info(`环境: ${process.env.NODE_ENV || "development"}`)
      logger.info(`API文档: http://localhost:${PORT}/api-docs`)
    })

    // 优雅关闭处理
    const gracefulShutdown = async (signal) => {
      logger.info(`收到 ${signal} 信号，正在优雅关闭服务器...`)

      // 停止接收新请求
      server.close(async () => {
        logger.info("HTTP服务器已关闭")

        // 停止定时任务
        if (process.env.ENABLE_CRON === "true") {
          stockUpdateJob.stop()
          logger.info("定时任务已停止")
        }

        // 关闭缓存连接
        await cacheManager.close()
        logger.info("缓存连接已关闭")

        // 关闭数据库连接
        await sequelize.close()
        logger.info("数据库连接已关闭")

        process.exit(0)
      })

      // 如果10秒内没有完成关闭，强制退出
      setTimeout(() => {
        logger.error("无法优雅关闭，强制退出")
        process.exit(1)
      }, 10000)
    }

    // 监听关闭信号
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
    process.on("SIGINT", () => gracefulShutdown("SIGINT"))
  } catch (error) {
    logger.error("服务器启动失败:", error)
    process.exit(1)
  }
}

// 未捕获异常处理
process.on("uncaughtException", (error) => {
  logger.error("未捕获异常:", error)
  process.exit(1)
})

process.on("unhandledRejection", (reason, promise) => {
  logger.error("未处理的 Promise 拒绝:", reason)
  // 在生产环境中不退出，只记录错误
  if (process.env.NODE_ENV === "production") {
    logger.error("Promise rejection handled gracefully")
  } else {
    process.exit(1)
  }
})

// 启动服务器
startServer()

module.exports = app
