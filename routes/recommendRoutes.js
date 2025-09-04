const express = require("express")
const { body, query, param } = require("express-validator")
const {
  createRecommend,
  getRecommendList,
  getMyRecommends,
  getRecommendDetail,
  updateRecommend,
  deleteRecommend,
  getFeaturedRecommends,
  followRecommend,
  unfollowRecommend,
  settleRecommend,
  checkExpiredRecommends,
} = require("../controllers/recommendController")
const {
  authenticate,
  authorize,
  optionalAuth,
} = require("../middleware/authMiddleware")

const router = express.Router()

// 根路径 - 返回推荐模块信息
router.get("/", (req, res) => {
  res.json({
    code: 200,
    message: "推荐模块API",
    data: {
      version: "1.0.0",
      endpoints: [
        "GET /list - 获取推荐列表",
        "GET /my - 获取我的推荐",
        "POST /create - 创建推荐",
        "GET /detail/:id - 获取推荐详情",
        "GET /featured - 获取精选推荐",
      ],
    },
  })
})

// 创建推荐（需要登录）
router.post(
  "/create",
  authenticate,
  [
    body("stockCode").notEmpty().withMessage("股票代码不能为空"),
    body("stockName").notEmpty().withMessage("股票名称不能为空"),
    body("currentPrice").isFloat({ min: 0 }).withMessage("当前价格必须为正数"),
    body("predictChange").isFloat().withMessage("预期涨跌幅必须为数字"),
    body("reason")
      .isLength({ min: 10, max: 500 })
      .withMessage("推荐理由应在10-500字符之间"),
    body("holdPeriod")
      .isIn(["1week", "2weeks", "1month", "3months"])
      .withMessage("持有期间参数无效"),
    body("confidence")
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage("信心指数应在1-5之间"),
    body("tags").optional().isArray().withMessage("标签应为数组格式"),
  ],
  createRecommend
)

// 获取推荐列表
router.get(
  "/list",
  [
    query("page").optional().isInt({ min: 1 }).withMessage("页码应为正整数"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("limit应在1-100之间"),
    query("status")
      .optional()
      .isIn(["all", "active", "success", "failed", "expired"])
      .withMessage("状态参数无效"),
    query("stockCode").optional().notEmpty().withMessage("股票代码不能为空"),
    query("userId")
      .optional()
      .isInt({ min: 1 })
      .withMessage("用户ID应为正整数"),
    query("sortBy")
      .optional()
      .isIn(["created_at", "predict_change", "current_return", "follow_count"])
      .withMessage("排序字段无效"),
    query("sortOrder")
      .optional()
      .isIn(["ASC", "DESC"])
      .withMessage("排序方向无效"),
  ],
  getRecommendList
)

// 获取我的推荐（需要登录）
router.get(
  "/my",
  authenticate,
  [
    query("page").optional().isInt({ min: 1 }).withMessage("页码应为正整数"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("limit应在1-100之间"),
    query("status")
      .optional()
      .isIn(["active", "success", "failed", "expired", "cancelled"])
      .withMessage("状态参数无效"),
    query("statsOnly")
      .optional()
      .isBoolean()
      .withMessage("statsOnly应为布尔值"),
  ],
  getMyRecommends
)

// 获取推荐详情（可选登录）
router.get(
  "/detail/:id",
  optionalAuth,
  [param("id").isInt({ min: 1 }).withMessage("推荐ID应为正整数")],
  getRecommendDetail
)

// 更新推荐（需要登录）
router.put(
  "/:id",
  authenticate,
  [
    param("id").isInt({ min: 1 }).withMessage("推荐ID应为正整数"),
    body("reason")
      .optional()
      .isLength({ min: 10, max: 500 })
      .withMessage("推荐理由应在10-500字符之间"),
    body("tags").optional().isArray().withMessage("标签应为数组格式"),
    body("confidence")
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage("信心指数应在1-5之间"),
  ],
  updateRecommend
)

// 删除推荐（需要登录）
router.delete(
  "/:id",
  authenticate,
  [param("id").isInt({ min: 1 }).withMessage("推荐ID应为正整数")],
  deleteRecommend
)

// 获取精选推荐
router.get(
  "/featured",
  [
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("limit应在1-50之间"),
  ],
  getFeaturedRecommends
)

// 跟投推荐（需要登录）
router.post(
  "/:id/follow",
  authenticate,
  [
    param("id").isInt({ min: 1 }).withMessage("推荐ID应为正整数"),
    body("followAmount")
      .optional()
      .isFloat({ min: 1000 })
      .withMessage("跟投金额应不少于1000"),
  ],
  followRecommend
)

// 取消跟投（需要登录）
router.delete(
  "/:id/follow",
  authenticate,
  [param("id").isInt({ min: 1 }).withMessage("推荐ID应为正整数")],
  unfollowRecommend
)

// 手动结算推荐（管理员功能）
router.post(
  "/:id/settle",
  authenticate,
  authorize("admin"),
  [
    param("id").isInt({ min: 1 }).withMessage("推荐ID应为正整数"),
    body("exitPrice")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("结算价格应为正数"),
  ],
  settleRecommend
)

// 批量检查过期推荐（管理员功能或定时任务）
router.post(
  "/check-expired",
  authenticate,
  authorize(["admin", "system"]),
  checkExpiredRecommends
)

module.exports = router
