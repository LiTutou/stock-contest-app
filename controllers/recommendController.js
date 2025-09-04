const { Recommend, User, Stock, Follow } = require("../models")
const { ApiError } = require("../middleware/errorMiddleware")
const { validationResult } = require("express-validator")
const logger = require("../utils/logger")

// 创建推荐
const createRecommend = async (req, res, next) => {
  try {
    // 验证输入
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      throw new ApiError(
        `输入验证失败: ${errors
          .array()
          .map((e) => e.msg)
          .join(", ")}`,
        400
      )
    }

    const {
      stockCode,
      stockName,
      currentPrice,
      predictChange,
      reason,
      holdPeriod,
      confidence = 3,
      tags = [],
    } = req.body

    const userId = req.user.userId

    // 检查用户是否存在
    const user = await User.findByPk(userId)
    if (!user) {
      throw new ApiError("用户不存在", 404)
    }

    // 检查用户是否已推荐过该股票（活跃状态）
    const existingRecommend = await Recommend.findOne({
      where: {
        user_id: userId,
        stock_code: stockCode,
        status: "active",
      },
    })

    if (existingRecommend) {
      throw new ApiError("您已经推荐过这只股票，请等待结算后再次推荐", 400)
    }

    // 检查或创建股票信息
    let stock = await Stock.findByCode(stockCode)
    if (!stock) {
      // 自动创建股票记录
      const marketInfo = getStockMarketInfo(stockCode)
      stock = await Stock.create({
        code: stockCode,
        name: stockName,
        market: marketInfo.market,
        current_price: currentPrice,
        previous_close: currentPrice,
        change_amount: 0,
        change_percent: 0,
        status: "active",
      })
    }

    // 计算结束时间
    const startDate = new Date()
    const endDate = new Date()

    switch (holdPeriod) {
      case "1week":
        endDate.setDate(endDate.getDate() + 7)
        break
      case "2weeks":
        endDate.setDate(endDate.getDate() + 14)
        break
      case "1month":
        endDate.setMonth(endDate.getMonth() + 1)
        break
      case "3months":
        endDate.setMonth(endDate.getMonth() + 3)
        break
      default:
        endDate.setDate(endDate.getDate() + 7)
    }

    // 创建推荐记录
    const recommend = await Recommend.create({
      user_id: userId,
      stock_code: stockCode,
      predict_change: predictChange,
      reason: reason.trim(),
      confidence,
      hold_period: holdPeriod,
      entry_price: currentPrice,
      current_price: currentPrice,
      current_return: 0,
      start_date: startDate,
      end_date: endDate,
      tags,
      status: "active",
    })

    // 更新股票推荐次数
    await stock.increment("recommend_count")

    logger.info(`用户 ${userId} 创建推荐: ${stockCode} (${predictChange}%)`)

    res.status(201).json({
      code: 201,
      message: "推荐创建成功",
      data: recommend.toJSON(),
    })
  } catch (error) {
    next(error)
  }
}

// 获取推荐列表
const getRecommendList = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = "active",
      stockCode,
      userId,
      sortBy = "created_at",
      sortOrder = "DESC",
    } = req.query

    const offset = (page - 1) * limit
    const where = {}

    if (status !== "all") {
      where.status = status
    }

    if (stockCode) {
      where.stock_code = stockCode
    }

    if (userId) {
      where.user_id = userId
    }

    const { count, rows } = await Recommend.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "nickname", "avatar", "level"],
        },
        {
          model: Stock,
          as: "stock",
          attributes: ["name", "current_price", "change_percent", "market"],
        },
      ],
      order: [[sortBy, sortOrder]],
      limit: parseInt(limit),
      offset,
    })

    res.json({
      code: 200,
      message: "获取成功",
      data: {
        recommends: rows.map((recommend) => recommend.toJSON()),
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

// 获取我的推荐
const getMyRecommends = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, statsOnly = false } = req.query

    const userId = req.user.userId

    if (statsOnly === "true") {
      // 只返回统计信息
      const stats = await Recommend.getStats(userId)
      return res.json({
        code: 200,
        message: "获取成功",
        data: { stats },
      })
    }

    const { count, rows } = await Recommend.getByUser(
      userId,
      status,
      parseInt(limit),
      (page - 1) * limit
    )

    res.json({
      code: 200,
      message: "获取成功",
      data: {
        list: rows.map((recommend) => recommend.toJSON()),
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

// 获取推荐详情
const getRecommendDetail = async (req, res, next) => {
  try {
    const { id } = req.params

    const recommend = await Recommend.findByPk(id, {
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "nickname", "avatar", "level", "total_score"],
        },
        {
          model: Stock,
          as: "stock",
          attributes: [
            "name",
            "current_price",
            "change_percent",
            "market",
            "industry",
          ],
        },
      ],
    })

    if (!recommend) {
      throw new ApiError("推荐不存在", 404)
    }

    // 增加查看次数
    await recommend.incrementView()

    // 获取跟投信息
    const followCount = await Follow.count({
      where: {
        recommend_id: id,
        follow_type: "recommend",
      },
    })

    // 检查当前用户是否已跟投
    let isFollowed = false
    if (req.user) {
      isFollowed = await Follow.isFollowing(req.user.userId, id)
    }

    const result = recommend.toJSON()
    result.follow_count = followCount
    result.is_followed = isFollowed

    res.json({
      code: 200,
      message: "获取成功",
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

// 更新推荐
const updateRecommend = async (req, res, next) => {
  try {
    const { id } = req.params
    const { reason, tags, confidence } = req.body
    const userId = req.user.userId

    const recommend = await Recommend.findByPk(id)

    if (!recommend) {
      throw new ApiError("推荐不存在", 404)
    }

    if (recommend.user_id !== userId) {
      throw new ApiError("无权限修改此推荐", 403)
    }

    if (recommend.status !== "active") {
      throw new ApiError("只能修改活跃状态的推荐", 400)
    }

    // 只允许修改推荐理由、标签和信心指数
    await recommend.update({
      reason: reason || recommend.reason,
      tags: tags || recommend.tags,
      confidence: confidence || recommend.confidence,
    })

    logger.info(`用户 ${userId} 更新推荐: ${id}`)

    res.json({
      code: 200,
      message: "更新成功",
      data: recommend.toJSON(),
    })
  } catch (error) {
    next(error)
  }
}

// 删除推荐
const deleteRecommend = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.userId

    const recommend = await Recommend.findByPk(id)

    if (!recommend) {
      throw new ApiError("推荐不存在", 404)
    }

    if (recommend.user_id !== userId) {
      throw new ApiError("无权限删除此推荐", 403)
    }

    if (recommend.status !== "active") {
      throw new ApiError("只能删除活跃状态的推荐", 400)
    }

    // 软删除：修改状态为取消
    await recommend.update({ status: "cancelled" })

    logger.info(`用户 ${userId} 删除推荐: ${id}`)

    res.json({
      code: 200,
      message: "删除成功",
    })
  } catch (error) {
    next(error)
  }
}

// 获取精选推荐
const getFeaturedRecommends = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query

    const recommends = await Recommend.getFeatured(parseInt(limit))

    res.json({
      code: 200,
      message: "获取成功",
      data: recommends.map((recommend) => recommend.toJSON()),
    })
  } catch (error) {
    next(error)
  }
}

// 跟投推荐
const followRecommend = async (req, res, next) => {
  try {
    const { id } = req.params
    const { followAmount = 10000 } = req.body
    const userId = req.user.userId

    const recommend = await Recommend.findByPk(id, {
      include: [
        {
          model: Stock,
          as: "stock",
          attributes: ["current_price"],
        },
      ],
    })

    if (!recommend) {
      throw new ApiError("推荐不存在", 404)
    }

    if (recommend.status !== "active") {
      throw new ApiError("只能跟投活跃状态的推荐", 400)
    }

    if (recommend.user_id === userId) {
      throw new ApiError("不能跟投自己的推荐", 400)
    }

    // 检查是否已跟投
    const existingFollow = await Follow.findOne({
      where: {
        user_id: userId,
        recommend_id: id,
        follow_type: "recommend",
      },
    })

    if (existingFollow) {
      throw new ApiError("已经跟投过此推荐", 400)
    }

    // 创建跟投记录
    const follow = await Follow.create({
      user_id: userId,
      recommend_id: id,
      follow_type: "recommend",
      follow_amount: followAmount,
      follow_price: recommend.stock.current_price || recommend.current_price,
      status: "active",
    })

    // 更新推荐的跟投计数
    await recommend.increment("follow_count")

    logger.info(`用户 ${userId} 跟投推荐: ${id}`)

    res.status(201).json({
      code: 201,
      message: "跟投成功",
      data: follow.toJSON(),
    })
  } catch (error) {
    next(error)
  }
}

// 取消跟投
const unfollowRecommend = async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.userId

    const follow = await Follow.findOne({
      where: {
        user_id: userId,
        recommend_id: id,
        follow_type: "recommend",
        status: "active",
      },
    })

    if (!follow) {
      throw new ApiError("未找到跟投记录", 404)
    }

    // 取消跟投
    await follow.update({ status: "cancelled" })

    // 更新推荐的跟投计数
    const recommend = await Recommend.findByPk(id)
    if (recommend) {
      await recommend.decrement("follow_count")
    }

    logger.info(`用户 ${userId} 取消跟投: ${id}`)

    res.json({
      code: 200,
      message: "取消跟投成功",
    })
  } catch (error) {
    next(error)
  }
}

// 手动结算推荐（管理员功能）
const settleRecommend = async (req, res, next) => {
  try {
    const { id } = req.params
    const { exitPrice } = req.body

    const recommend = await Recommend.findByPk(id)

    if (!recommend) {
      throw new ApiError("推荐不存在", 404)
    }

    if (recommend.status !== "active") {
      throw new ApiError("只能结算活跃状态的推荐", 400)
    }

    await recommend.settle(exitPrice)

    logger.info(`管理员结算推荐: ${id}`)

    res.json({
      code: 200,
      message: "结算成功",
      data: recommend.toJSON(),
    })
  } catch (error) {
    next(error)
  }
}

// 批量检查过期推荐
const checkExpiredRecommends = async (req, res, next) => {
  try {
    const expiredRecommends = await Recommend.findAll({
      where: {
        status: "active",
        end_date: {
          [Op.lt]: new Date(),
        },
      },
    })

    const results = []

    for (const recommend of expiredRecommends) {
      try {
        await recommend.checkExpired()
        results.push({
          id: recommend.id,
          status: "processed",
          finalStatus: recommend.status,
        })
      } catch (error) {
        results.push({
          id: recommend.id,
          status: "error",
          error: error.message,
        })
      }
    }

    logger.info(`批量检查过期推荐: 处理 ${results.length} 条记录`)

    res.json({
      code: 200,
      message: "检查完成",
      data: results,
    })
  } catch (error) {
    next(error)
  }
}

// 工具函数：获取股票市场信息
function getStockMarketInfo(code) {
  if (code.startsWith("6")) {
    return { market: "SH", name: "上海证券交易所" }
  } else if (code.startsWith("0") || code.startsWith("3")) {
    return { market: "SZ", name: "深圳证券交易所" }
  } else if (code.length === 5) {
    return { market: "HK", name: "香港证券交易所" }
  } else {
    return { market: "US", name: "美国证券交易所" }
  }
}

module.exports = {
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
}
