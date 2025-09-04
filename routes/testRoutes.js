// routes/testRoutes.js
const express = require("express")
const { User, Stock, Recommend, Ranking } = require("../models")
const jwt = require("jsonwebtoken")
const logger = require("../utils/logger")

const router = express.Router()

// 测试路由只在开发环境可用
if (process.env.NODE_ENV !== "development") {
  router.use((req, res) => {
    res.status(404).json({
      code: 404,
      message: "测试接口仅在开发环境可用",
    })
  })
} else {
  /**
   * 创建测试用户
   */
  router.get("/create-test-user", async (req, res) => {
    try {
      const testUser = await User.create({
        open_id: `test_${Date.now()}`,
        nickname: "测试用户",
        avatar: "/static/images/default-avatar.png",
        total_score: 1000,
        level: 5,
        total_recommends: 10,
        success_recommends: 7,
        failed_recommends: 3,
        current_streak: 3,
        max_streak: 5,
      })

      const token = jwt.sign(
        { userId: testUser.id, openId: testUser.open_id },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      )

      res.json({
        code: 200,
        message: "测试用户创建成功",
        data: { user: testUser.toJSON(), token },
      })
    } catch (error) {
      logger.error("创建测试用户失败:", error)
      res.status(500).json({
        code: 500,
        message: "创建测试用户失败",
        error: error.message,
      })
    }
  })

  /**
   * 创建测试股票数据
   */
  router.get("/create-test-stocks", async (req, res) => {
    try {
      const stocks = [
        {
          code: "600519",
          name: "贵州茅台",
          market: "SH",
          current_price: 1680.5,
          previous_close: 1650.2,
          change_percent: 1.84,
          is_popular: true,
        },
        {
          code: "000858",
          name: "五粮液",
          market: "SZ",
          current_price: 158.2,
          previous_close: 160.5,
          change_percent: -1.43,
          is_popular: true,
        },
        {
          code: "002594",
          name: "比亚迪",
          market: "SZ",
          current_price: 268.88,
          previous_close: 260.15,
          change_percent: 3.36,
          is_popular: true,
        },
      ]

      const created = await Stock.bulkCreate(stocks, { ignoreDuplicates: true })

      res.json({
        code: 200,
        message: "测试股票数据创建成功",
        data: created,
      })
    } catch (error) {
      logger.error("创建测试股票失败:", error)
      res.status(500).json({
        code: 500,
        message: "创建测试股票失败",
        error: error.message,
      })
    }
  })

  /**
   * 创建测试推荐数据
   */
  router.get("/create-test-recommends", async (req, res) => {
    try {
      const testUser = await User.findOne()
      const testStock = await Stock.findOne()

      if (!testUser || !testStock) {
        return res.status(400).json({
          code: 400,
          message: "请先创建测试用户和股票数据",
        })
      }

      const recommends = [
        {
          user_id: testUser.id,
          stock_code: testStock.code,
          recommend_reason: "业绩优异，值得长期持有",
          status: "success",
        },
        {
          user_id: testUser.id,
          stock_code: testStock.code,
          recommend_reason: "短期趋势良好",
          status: "pending",
        },
      ]

      const created = await Recommend.bulkCreate(recommends)

      res.json({
        code: 200,
        message: "测试推荐数据创建成功",
        data: created,
      })
    } catch (error) {
      logger.error("创建测试推荐失败:", error)
      res.status(500).json({
        code: 500,
        message: "创建测试推荐失败",
        error: error.message,
      })
    }
  })

  /**
   * 创建测试排行榜数据
   */
  router.get("/create-test-rankings", async (req, res) => {
    try {
      const users = await User.findAll({ limit: 3 })

      if (users.length === 0) {
        return res.status(400).json({
          code: 400,
          message: "请先创建一些测试用户",
        })
      }

      const rankings = users.map((user, idx) => ({
        user_id: user.id,
        rank: idx + 1,
        score: 1000 - idx * 100,
      }))

      const created = await Ranking.bulkCreate(rankings, {
        ignoreDuplicates: true,
      })

      res.json({
        code: 200,
        message: "测试排行榜数据创建成功",
        data: created,
      })
    } catch (error) {
      logger.error("创建测试排行榜失败:", error)
      res.status(500).json({
        code: 500,
        message: "创建测试排行榜失败",
        error: error.message,
      })
    }
  })
}

module.exports = router
