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

    // 通过code获取openid
    const wechatResponse = await axios.get(
      "https://api.weixin.qq.com/sns/jscode2session",
      {
        params: {
          appid: process.env.WECHAT_APPID,
          secret: process.env.WECHAT_APP_SECRET,
          js_code: code,
          grant_type: "authorization_code",
        },
      }
    )

    const { openid, unionid, session_key } = wechatResponse.data

    if (!openid) {
      throw new ApiError("微信登录失败", 400)
    }

    // 查找或创建用户
    let user = await User.findByOpenId(openid)

    if (!user) {
      // 创建新用户
      user = await User.create({
        open_id: openid,
        union_id: unionid,
        nickname: userInfo?.nickName || "股票达人",
        avatar: userInfo?.avatarUrl || null,
        last_login_at: new Date(),
        last_active_at: new Date(),
      })

      logger.info(`新用户注册: ${user.id}`)
    } else {
      // 更新登录时间和用户信息
      await user.update({
        nickname: userInfo?.nickName || user.nickname,
        avatar: userInfo?.avatarUrl || user.avatar,
        last_login_at: new Date(),
        last_active_at: new Date(),
      })
    }

    // 生成JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        openId: openid,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || "7d" }
    )

    res.json({
      code: 200,
      message: "登录成功",
      data: {
        token,
        userInfo: user.toJSON(),
      },
    })
  } catch (error) {
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

    // 检查手机号是否重复
    if (phone && phone !== user.phone) {
      const existingUser = await User.findOne({
        where: {
          phone,
          id: { [require("sequelize").Op.ne]: user.id },
        },
      })

      if (existingUser) {
        throw new ApiError("手机号已被使用", 400)
      }
    }

    // 更新用户信息
    await user.update({
      nickname: nickname || user.nickname,
      avatar: avatar || user.avatar,
      phone: phone || user.phone,
      email: email || user.email,
      last_active_at: new Date(),
    })

    logger.info(`用户信息更新: ${user.id}`)

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
    const user = await User.findByPk(req.user.userId)

    if (!user) {
      throw new ApiError("用户不存在", 404)
    }

    // 获取详细统计信息
    const recommendStats = await Recommend.getStats(user.id)
    const followStats = await Follow.getStats(user.id)

    // 获取当前排名
    const Ranking = require("../models/Ranking")
    const weeklyRanking = await Ranking.getUserRanking(user.id, "weekly")
    const monthlyRanking = await Ranking.getUserRanking(user.id, "monthly")
    const totalRanking = await Ranking.getUserRanking(user.id, "total")

    const stats = {
      // 基本信息
      totalScore: user.total_score,
      currentScore: user.current_score,
      level: user.level,

      // 推荐统计
      totalRecommends: user.total_recommends,
      successRecommends: user.success_recommends,
      failedRecommends: user.failed_recommends,
      winRate:
        user.total_recommends > 0
          ? user.success_recommends / user.total_recommends
          : 0,
      currentStreak: user.current_streak,
      maxStreak: user.max_streak,

      // 详细统计
      avgReturn: parseFloat(recommendStats?.avg_return) || 0,
      maxReturn: parseFloat(recommendStats?.max_return) || 0,
      minReturn: parseFloat(recommendStats?.min_return) || 0,

      // 跟投统计
      followStats: followStats.reduce((acc, stat) => {
        acc[stat.follow_type] = {
          count: parseInt(stat.count),
          avgReturn: parseFloat(stat.avg_return) || 0,
        }
        return acc
      }, {}),

      // 排名信息
      rankings: {
        weekly: weeklyRanking
          ? {
              rank: weeklyRanking.rank,
              score: weeklyRanking.score,
              change: weeklyRanking.previous_rank
                ? weeklyRanking.previous_rank - weeklyRanking.rank
                : 0,
            }
          : null,
        monthly: monthlyRanking
          ? {
              rank: monthlyRanking.rank,
              score: monthlyRanking.score,
              change: monthlyRanking.previous_rank
                ? monthlyRanking.previous_rank - monthlyRanking.rank
                : 0,
            }
          : null,
        total: totalRanking
          ? {
              rank: totalRanking.rank,
              score: totalRanking.score,
              change: totalRanking.previous_rank
                ? totalRanking.previous_rank - totalRanking.rank
                : 0,
            }
          : null,
      },
    }

    res.json({
      code: 200,
      message: "获取成功",
      data: stats,
    })
  } catch (error) {
    next(error)
  }
}

// 更新用户设置
const updateSettings = async (req, res, next) => {
  try {
    const settings = req.body

    const user = await User.findByPk(req.user.userId)

    if (!user) {
      throw new ApiError("用户不存在", 404)
    }

    // 合并设置
    const newSettings = {
      ...user.settings,
      ...settings,
    }

    await user.update({
      settings: newSettings,
      last_active_at: new Date(),
    })

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
    const user = await User.findByPk(req.user.userId)

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
    const { password } = req.body // 如果需要密码确认

    const user = await User.findByPk(req.user.userId)

    if (!user) {
      throw new ApiError("用户不存在", 404)
    }

    // 软删除：修改状态而不是真正删除
    await user.update({
      status: "inactive",
      nickname: `已注销用户_${user.id}`,
      avatar: null,
      phone: null,
      email: null,
      last_active_at: new Date(),
    })

    logger.info(`用户注销: ${user.id}`)

    res.json({
      code: 200,
      message: "账户注销成功",
    })
  } catch (error) {
    next(error)
  }
}

// 获取用户列表（管理员功能）
const getUserList = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = "active",
      keyword = "",
      sortBy = "total_score",
      sortOrder = "DESC",
    } = req.query

    const offset = (page - 1) * limit
    const where = {}

    if (status !== "all") {
      where.status = status
    }

    if (keyword) {
      where[Op.or] = [
        { nickname: { [Op.like]: `%${keyword}%` } },
        { phone: { [Op.like]: `%${keyword}%` } },
      ]
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      order: [[sortBy, sortOrder]],
      limit: parseInt(limit),
      offset,
      attributes: { exclude: ["open_id", "union_id"] },
    })

    res.json({
      code: 200,
      message: "获取成功",
      data: {
        users: rows.map((user) => user.toJSON()),
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

module.exports = {
  wechatLogin,
  getUserInfo,
  updateUserInfo,
  getUserStats,
  updateSettings,
  getSettings,
  deleteAccount,
  getUserList,
}
