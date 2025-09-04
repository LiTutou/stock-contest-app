const express = require("express")
const { query, body, param } = require("express-validator")
const {
  getWeeklyRanking,
  getMonthlyRanking,
  getTotalRanking,
  getUserRanking,
  calculateRankings,
  getRankingHistory,
  getRankingStats,
  getUserRankingTrend,
} = require("../controllers/rankingController")
const {
  authenticate,
  authorize,
  optionalAuth,
} = require("../middleware/authMiddleware")

const router = express.Router()

// 获取周排行榜
router.get(
  "/weekly",
  [
    query("page").optional().isInt({ min: 1 }).withMessage("页码应为正整数"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("limit应在1-100之间"),
    query("period")
      .optional()
      .matches(/^\d{4}-W\d{2}$/)
      .withMessage("周期格式应为YYYY-WXX"),
  ],
  getWeeklyRanking
)

// 获取月排行榜
router.get(
  "/monthly",
  [
    query("page").optional().isInt({ min: 1 }).withMessage("页码应为正整数"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("limit应在1-100之间"),
    query("period")
      .optional()
      .matches(/^\d{4}-\d{2}$/)
      .withMessage("周期格式应为YYYY-MM"),
  ],
  getMonthlyRanking
)

// 获取总排行榜
router.get(
  "/total",
  [
    query("page").optional().isInt({ min: 1 }).withMessage("页码应为正整数"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("limit应在1-100之间"),
  ],
  getTotalRanking
)

// 获取用户排名信息（可选登录）
router.get(
  "/user/:userId?",
  optionalAuth,
  [
    param("userId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("用户ID应为正整数"),
  ],
  getUserRanking
)

// 获取用户排名趋势（可选登录）
router.get(
  "/user/:userId?/trend",
  optionalAuth,
  [
    param("userId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("用户ID应为正整数"),
    query("type")
      .optional()
      .isIn(["weekly", "monthly"])
      .withMessage("排名类型无效"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 24 })
      .withMessage("limit应在1-24之间"),
  ],
  getUserRankingTrend
)

// 获取排行榜统计信息
router.get("/stats", getRankingStats)

// 获取排行榜历史
router.get(
  "/history",
  [
    query("type")
      .isIn(["weekly", "monthly", "total"])
      .withMessage("排行榜类型无效"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("limit应在1-50之间"),
  ],
  getRankingHistory
)

// 手动计算排名（管理员功能）
router.post(
  "/calculate",
  authenticate,
  authorize("admin"),
  [
    body("type")
      .optional()
      .isIn(["all", "weekly", "monthly", "total"])
      .withMessage("排名类型无效"),
    body("period").optional().notEmpty().withMessage("周期不能为空"),
  ],
  calculateRankings
)

module.exports = router
