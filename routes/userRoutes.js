const express = require("express")
const { body } = require("express-validator")
const {
  wechatLogin,
  getUserInfo,
  updateUserInfo,
  getUserStats,
  updateSettings,
  getSettings,
  deleteAccount,
  getUserList,
  refreshToken,
} = require("../controllers/userController")
const { authenticate, authorize } = require("../middleware/authMiddleware")

const router = express.Router()

// 微信登录
router.post(
  "/login",
  [
    body("code").notEmpty().withMessage("微信登录code不能为空"),
    body("userInfo").optional().isObject().withMessage("用户信息格式错误"),
  ],
  wechatLogin
)

// 刷新Token（需要登录）
router.post("/refresh-token", authenticate, refreshToken)

// 获取用户信息（需要登录）
router.get("/info", authenticate, getUserInfo)

// 更新用户信息（需要登录）
router.put(
  "/info",
  authenticate,
  [
    body("nickname")
      .optional()
      .isLength({ min: 1, max: 50 })
      .withMessage("昵称长度应在1-50字符之间"),
    body("phone")
      .optional()
      .isMobilePhone("zh-CN")
      .withMessage("手机号格式错误"),
    body("email").optional().isEmail().withMessage("邮箱格式错误"),
  ],
  updateUserInfo
)

// 获取用户统计（需要登录）
router.get("/stats", authenticate, getUserStats)

// 更新用户设置（需要登录）
router.put(
  "/settings",
  authenticate,
  [
    body("pushNotification").optional().isBoolean(),
    body("priceAlert").optional().isBoolean(),
    body("rankingAlert").optional().isBoolean(),
    body("publicRecommends").optional().isBoolean(),
    body("showInRanking").optional().isBoolean(),
    body("theme").optional().isIn(["auto", "light", "dark"]),
    body("autoRefresh").optional().isBoolean(),
  ],
  updateSettings
)

// 获取用户设置（需要登录）
router.get("/settings", authenticate, getSettings)

// 注销账户（需要登录）
router.delete("/account", authenticate, deleteAccount)

// 获取用户列表（管理员功能）
router.get("/list", authenticate, authorize("admin"), getUserList)

module.exports = router
