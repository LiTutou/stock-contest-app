const express = require("express")
const { query, body } = require("express-validator")
const {
  searchStock,
  getStockDetail,
  getStockHistory,
  getPopularStocks,
  getStocksByMarket,
  updateStockPrices,
  updateAllStockPrices,
  createOrUpdateStock,
  getStockRecommendRanking,
} = require("../controllers/stockController")
const { authenticate, authorize } = require("../middleware/authMiddleware")

const router = express.Router()

// 搜索股票
router.get(
  "/search",
  [
    query("keyword").notEmpty().withMessage("搜索关键词不能为空"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("limit应在1-100之间"),
  ],
  searchStock
)

// 获取股票详情
router.get("/detail/:code", getStockDetail)

// 获取股票价格历史
router.get(
  "/history",
  [
    query("code").notEmpty().withMessage("股票代码不能为空"),
    query("days")
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage("天数应在1-365之间"),
  ],
  getStockHistory
)

// 获取热门股票
router.get(
  "/popular",
  [
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("limit应在1-50之间"),
  ],
  getPopularStocks
)

// 按市场获取股票
router.get(
  "/market",
  [
    query("market").isIn(["SH", "SZ", "HK", "US"]).withMessage("市场参数无效"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("limit应在1-100之间"),
  ],
  getStocksByMarket
)

// 获取股票推荐排行
router.get(
  "/recommend-ranking",
  [
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("limit应在1-50之间"),
    query("timeRange")
      .optional()
      .isIn(["week", "month", "3months"])
      .withMessage("时间范围参数无效"),
  ],
  getStockRecommendRanking
)

// 批量更新股票价格（管理员功能）
router.post(
  "/update-prices",
  authenticate,
  authorize("admin"),
  [
    body("codes").isArray({ min: 1 }).withMessage("股票代码列表不能为空"),
    body("codes.*").notEmpty().withMessage("股票代码不能为空"),
  ],
  updateStockPrices
)

// 更新所有股票价格（管理员功能或定时任务）
router.post(
  "/update-all-prices",
  authenticate,
  authorize(["admin", "system"]),
  updateAllStockPrices
)

// 临时测试接口 - 添加测试数据
router.get("/init-test-data", async (req, res) => {
  try {
    const { Stock } = require("../models")

    await Stock.findOrCreate({
      where: { code: "600519" },
      defaults: {
        code: "600519",
        name: "贵州茅台",
        market: "SH",
        current_price: 1680.5,
        previous_close: 1650.2,
        change_percent: 1.84,
        status: "active",
        is_popular: true,
      },
    })

    res.json({ code: 200, message: "测试数据添加成功" })
  } catch (error) {
    res.json({ code: 500, message: "添加失败", error: error.message })
  }
})

// 创建或更新股票信息（管理员功能）
router.post(
  "/create-or-update",
  authenticate,
  authorize("admin"),
  [
    body("code").notEmpty().withMessage("股票代码不能为空"),
    body("name").notEmpty().withMessage("股票名称不能为空"),
    body("market").isIn(["SH", "SZ", "HK", "US"]).withMessage("市场参数无效"),
    body("current_price")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("当前价格应为正数"),
    body("previous_close")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("昨收价应为正数"),
  ],
  createOrUpdateStock
)

module.exports = router
