const jwt = require("jsonwebtoken")
const axios = require("axios")
const { User, Recommend, Follow } = require("../models")
const { ApiError } = require("../middleware/errorMiddleware")
const logger = require("../utils/logger")

// 微信登录
const wechatLogin = async (req, res, next) => {
  try {
    const { code, userInfo } = req.body

    if (!code) {
      throw new ApiError("缺少微信登录code", 400)
    }

    // 检查环境变量
    if (!process.env.WECHAT_APPID || !process.env.WECHAT_APP_SECRET) {
      logger.error("微信配置缺失: WECHAT_APPID 或 WECHAT_APP_SECRET 未配置")
      throw new ApiError("服务器配置错误，请联系管理员", 500)
    }

    logger.info(`开始微信登录，code: ${code.substring(0, 10)}...`)

    // 通过code获取openid
    let wechatResponse
    try {
      const url = "https://api.weixin.qq.com/sns/jscode2session"
      const params = {
        appid: process.env.WECHAT_APPID,
        secret: process.env.WECHAT_APP_SECRET,
        js_code: code,
        grant_type: "authorization_code",
      }

      logger.info(`调用微信API: ${url}`)
      logger.info(`AppID: ${process.env.WECHAT_APPID}`)

      wechatResponse = await axios.get(url, { params })

      logger.info(`微信API响应: ${JSON.stringify(wechatResponse.data)}`)
    } catch (wxError) {
      logger.error(`微信API调用失败: ${wxError.message}`)
      throw new ApiError("微信服务器连接失败", 500)
    }

    const { openid, unionid, session_key, errcode, errmsg } =
      wechatResponse.data

    // 检查微信API返回的错误
    if (errcode) {
      logger.error(`微信API返回错误: ${errcode} - ${errmsg}`)

      // 根据不同错误码给出提示
      if (errcode === 40029) {
        throw new ApiError("登录码无效，请重新登录", 400)
      } else if (errcode === 40013) {
        throw new ApiError("AppID配置错误", 500)
      } else if (errcode === 40125) {
        throw new ApiError("AppSecret配置错误", 500)
      } else {
        throw new ApiError(`微信登录失败: ${errmsg}`, 400)
      }
    }

    if (!openid) {
      logger.error("未获取到openid")
      throw new ApiError("微信登录失败，未获取到用户标识", 400)
    }

    logger.info(`获取到openid: ${openid}`)

    // 查找或创建用户
    let user = await User.findOne({ where: { open_id: openid } })

    if (!user) {
      // 创建新用户
      const userData = {
        open_id: openid,
        union_id: unionid || null,
        nickname: userInfo?.nickName || "股票达人",
        avatar: userInfo?.avatarUrl || null,
        status: "active",
        role: "user",
        level: 1,
        total_score: 0,
        total_recommends: 0,
        success_recommends: 0,
        failed_recommends: 0,
        current_streak: 0,
        max_streak: 0,
        last_login_at: new Date(),
        last_active_at: new Date(),
      }

      user = await User.create(userData)
      logger.info(`新用户注册成功: ${user.id}`)
    } else {
      // 更新登录时间和用户信息
      await user.update({
        nickname: userInfo?.nickName || user.nickname,
        avatar: userInfo?.avatarUrl || user.avatar,
        last_login_at: new Date(),
        last_active_at: new Date(),
      })
      logger.info(`用户登录成功: ${user.id}`)
    }

    // 生成JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        openId: openid,
      },
      process.env.JWT_SECRET || "default-secret-key",
      { expiresIn: process.env.JWT_EXPIRE || "7d" }
    )

    // 返回用户信息（过滤敏感信息）
    const safeUserInfo = {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      level: user.level,
      total_score: user.total_score,
      total_recommends: user.total_recommends,
      success_recommends: user.success_recommends,
      current_streak: user.current_streak,
    }

    res.json({
      code: 200,
      message: "登录成功",
      data: {
        token,
        userInfo: safeUserInfo,
      },
    })
  } catch (error) {
    logger.error(`登录失败: ${error.message}`, error.stack)
    next(error)
  }
}

// 获取用户信息
const getUserInfo = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.userId, {
      attributes: { exclude: ["open_id", "union_id"] },
    })

    if (!user) {
      throw new ApiError("用户不存在", 404)
    }

    res.json({
      code: 200,
      message: "获取成功",
      data: user.toJSON(),
    })
  } catch (error) {
    next(error)
  }
}

// 更新用户信息
const updateUserInfo = async (req, res, next) => {
  try {
    const { nickname, avatar, phone, email } = req.body

    const user = await User.findByPk(req.user.userId)

    if (!user) {
      throw new ApiError("用户不存在", 404)
    }

    // 检查昵称是否重复
    if (nickname && nickname !== user.nickname) {
      const existingUser = await User.findOne({
        where: {
          nickname,
          id: { [require("sequelize").Op.ne]: user.id },
        },
      })

      if (existingUser) {
        throw new ApiError("昵称已被使用", 400)
      }
    }

    // 更新用户信息
    await user.update({
      nickname: nickname || user.nickname,
      avatar: avatar || user.avatar,
      phone: phone || user.phone,
      email: email || user.email,
    })

    logger.info(`用户 ${user.id} 更新信息`)

    res.json({
      code: 200,
      message: "更新成功",
      data: user.toJSON(),
    })
  } catch (error) {
    next(error)
  }
}

// 获取用户统计
const getUserStats = async (req, res, next) => {
  try {
    const userId = req.user.userId

    const user = await User.findByPk(userId)
    if (!user) {
      throw new ApiError("用户不存在", 404)
    }

    // 获取推荐统计
    const recommendStats = await Recommend.findAll({
      where: { user_id: userId },
      attributes: [
        [
          require("sequelize").fn("COUNT", require("sequelize").col("id")),
          "total",
        ],
        [
          require("sequelize").fn(
            "SUM",
            require("sequelize").literal(
              "CASE WHEN status = 'success' THEN 1 ELSE 0 END"
            )
          ),
          "success",
        ],
        [
          require("sequelize").fn(
            "SUM",
            require("sequelize").literal(
              "CASE WHEN status = 'failed' THEN 1 ELSE 0 END"
            )
          ),
          "failed",
        ],
        [
          require("sequelize").fn(
            "AVG",
            require("sequelize").col("actual_return")
          ),
          "avg_return",
        ],
      ],
      raw: true,
    })

    // 获取跟投统计
    const followStats = await Follow.findAll({
      where: { user_id: userId },
      attributes: [
        [
          require("sequelize").fn("COUNT", require("sequelize").col("id")),
          "total",
        ],
        [
          require("sequelize").fn(
            "AVG",
            require("sequelize").col("actual_return")
          ),
          "avg_return",
        ],
      ],
      raw: true,
    })

    res.json({
      code: 200,
      message: "获取成功",
      data: {
        user: {
          level: user.level,
          total_score: user.total_score,
          current_streak: user.current_streak,
          max_streak: user.max_streak,
        },
        recommends: recommendStats[0] || {},
        follows: followStats[0] || {},
      },
    })
  } catch (error) {
    next(error)
  }
}

// 更新用户设置
const updateSettings = async (req, res, next) => {
  try {
    const userId = req.user.userId
    const settings = req.body

    const user = await User.findByPk(userId)
    if (!user) {
      throw new ApiError("用户不存在", 404)
    }

    // 合并设置
    const currentSettings = user.settings || {}
    const newSettings = { ...currentSettings, ...settings }

    await user.update({ settings: newSettings })

    logger.info(`用户 ${userId} 更新设置`)

    res.json({
      code: 200,
      message: "设置更新成功",
      data: newSettings,
    })
  } catch (error) {
    next(error)
  }
}

// 获取用户设置
const getSettings = async (req, res, next) => {
  try {
    const userId = req.user.userId

    const user = await User.findByPk(userId)
    if (!user) {
      throw new ApiError("用户不存在", 404)
    }

    res.json({
      code: 200,
      message: "获取成功",
      data: user.settings || {},
    })
  } catch (error) {
    next(error)
  }
}

// 注销账户
const deleteAccount = async (req, res, next) => {
  try {
    const userId = req.user.userId

    const user = await User.findByPk(userId)
    if (!user) {
      throw new ApiError("用户不存在", 404)
    }

    // 软删除：只是将状态改为deleted
    await user.update({ status: "deleted" })

    logger.info(`用户 ${userId} 注销账户`)

    res.json({
      code: 200,
      message: "账户已注销",
    })
  } catch (error) {
    next(error)
  }
}

// 获取用户列表（管理员功能）
const getUserList = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status = "active" } = req.query

    const { count, rows } = await User.findAndCountAll({
      where: { status },
      limit: parseInt(limit),
      offset: (page - 1) * limit,
      order: [["created_at", "DESC"]],
      attributes: { exclude: ["open_id", "union_id"] },
    })

    res.json({
      code: 200,
      message: "获取成功",
      data: {
        list: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
      },
    })
  } catch (error) {
    next(error)
  }
}

// 刷新Token
const refreshToken = async (req, res, next) => {
  try {
    const userId = req.user.userId
    const openId = req.user.openId

    // 生成新的token
    const newToken = jwt.sign(
      {
        userId: userId,
        openId: openId,
      },
      process.env.JWT_SECRET || "default-secret-key",
      { expiresIn: process.env.JWT_EXPIRE || "7d" }
    )

    res.json({
      code: 200,
      message: "Token刷新成功",
      data: {
        token: newToken,
      },
    })
  } catch (error) {
    next(error)
  }
}

module.exports = {
  wechatLogin,
  getUserInfo,
  updateUserInfo,
  getUserStats,
  updateSettings,
  getSettings,
  deleteAccount,
  getUserList,
  refreshToken,
}
