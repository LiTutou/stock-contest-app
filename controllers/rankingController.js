const { Ranking, User } = require("../models")
const { ApiError } = require("../middleware/errorMiddleware")
const logger = require("../utils/logger")

// 获取周排行榜
const getWeeklyRanking = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, period } = req.query

    const offset = (page - 1) * limit

    const { count, rows } = await Ranking.getRankingList(
      "weekly",
      period,
      parseInt(limit),
      offset
    )

    res.json({
      code: 200,
      message: "获取成功",
      data: {
        rankings: rows.map((ranking) => ranking.toJSON()),
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
        currentPeriod: period || Ranking.getCurrentPeriod("weekly"),
      },
    })
  } catch (error) {
    next(error)
  }
}

// 获取月排行榜
const getMonthlyRanking = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, period } = req.query

    const offset = (page - 1) * limit

    const { count, rows } = await Ranking.getRankingList(
      "monthly",
      period,
      parseInt(limit),
      offset
    )

    res.json({
      code: 200,
      message: "获取成功",
      data: {
        rankings: rows.map((ranking) => ranking.toJSON()),
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit),
        },
        currentPeriod: period || Ranking.getCurrentPeriod("monthly"),
      },
    })
  } catch (error) {
    next(error)
  }
}

// 获取总排行榜
const getTotalRanking = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query

    const offset = (page - 1) * limit

    const { count, rows } = await Ranking.getRankingList(
      "total",
      "total",
      parseInt(limit),
      offset
    )

    res.json({
      code: 200,
      message: "获取成功",
      data: {
        rankings: rows.map((ranking) => ranking.toJSON()),
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

// 获取用户排名信息
const getUserRanking = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.userId : req.params.userId

    if (!userId) {
      throw new ApiError("用户ID不能为空", 400)
    }

    // 获取用户在各个排行榜中的排名
    const weeklyRanking = await Ranking.getUserRanking(userId, "weekly")
    const monthlyRanking = await Ranking.getUserRanking(userId, "monthly")
    const totalRanking = await Ranking.getUserRanking(userId, "total")

    // 获取用户历史排名
    const allRankings = await Ranking.getUserAllRankings(userId)

    res.json({
      code: 200,
      message: "获取成功",
      data: {
        current: {
          weekly: weeklyRanking ? weeklyRanking.toJSON() : null,
          monthly: monthlyRanking ? monthlyRanking.toJSON() : null,
          total: totalRanking ? totalRanking.toJSON() : null,
        },
        history: allRankings.map((ranking) => ranking.toJSON()),
      },
    })
  } catch (error) {
    next(error)
  }
}

// 手动计算排名（管理员功能）
const calculateRankings = async (req, res, next) => {
  try {
    const { type = "all", period } = req.body

    const results = {}

    if (type === "all" || type === "weekly") {
      try {
        const weeklyResult = await Ranking.calculateRankings("weekly", period)
        results.weekly = {
          success: true,
          count: weeklyResult.length,
          period: period || Ranking.getCurrentPeriod("weekly"),
        }
      } catch (error) {
        results.weekly = {
          success: false,
          error: error.message,
        }
      }
    }

    if (type === "all" || type === "monthly") {
      try {
        const monthlyResult = await Ranking.calculateRankings("monthly", period)
        results.monthly = {
          success: true,
          count: monthlyResult.length,
          period: period || Ranking.getCurrentPeriod("monthly"),
        }
      } catch (error) {
        results.monthly = {
          success: false,
          error: error.message,
        }
      }
    }

    if (type === "all" || type === "total") {
      try {
        const totalResult = await Ranking.calculateRankings("total", "total")
        results.total = {
          success: true,
          count: totalResult.length,
        }
      } catch (error) {
        results.total = {
          success: false,
          error: error.message,
        }
      }
    }

    logger.info(`管理员计算排名: ${type}`)

    res.json({
      code: 200,
      message: "排名计算完成",
      data: results,
    })
  } catch (error) {
    next(error)
  }
}

// 获取排行榜历史
const getRankingHistory = async (req, res, next) => {
  try {
    const { type, limit = 10 } = req.query

    if (!type || !["weekly", "monthly", "total"].includes(type)) {
      throw new ApiError("排行榜类型无效", 400)
    }

    const history = await Ranking.getRankingHistory(type, parseInt(limit))

    res.json({
      code: 200,
      message: "获取成功",
      data: history,
    })
  } catch (error) {
    next(error)
  }
}

// 获取排行榜统计信息
const getRankingStats = async (req, res, next) => {
  try {
    const currentWeekly = Ranking.getCurrentPeriod("weekly")
    const currentMonthly = Ranking.getCurrentPeriod("monthly")

    // 获取各排行榜的参与人数
    const weeklyCount = await Ranking.count({
      where: {
        ranking_type: "weekly",
        period: currentWeekly,
        is_active: true,
      },
    })

    const monthlyCount = await Ranking.count({
      where: {
        ranking_type: "monthly",
        period: currentMonthly,
        is_active: true,
      },
    })

    const totalCount = await Ranking.count({
      where: {
        ranking_type: "total",
        period: "total",
        is_active: true,
      },
    })

    // 获取冠军信息
    const weeklyChampion = await Ranking.findOne({
      where: {
        ranking_type: "weekly",
        period: currentWeekly,
        rank: 1,
        is_active: true,
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "nickname", "avatar", "level"],
        },
      ],
    })

    const monthlyChampion = await Ranking.findOne({
      where: {
        ranking_type: "monthly",
        period: currentMonthly,
        rank: 1,
        is_active: true,
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "nickname", "avatar", "level"],
        },
      ],
    })

    const totalChampion = await Ranking.findOne({
      where: {
        ranking_type: "total",
        period: "total",
        rank: 1,
        is_active: true,
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "nickname", "avatar", "level"],
        },
      ],
    })

    res.json({
      code: 200,
      message: "获取成功",
      data: {
        participants: {
          weekly: weeklyCount,
          monthly: monthlyCount,
          total: totalCount,
        },
        champions: {
          weekly: weeklyChampion ? weeklyChampion.toJSON() : null,
          monthly: monthlyChampion ? monthlyChampion.toJSON() : null,
          total: totalChampion ? totalChampion.toJSON() : null,
        },
        periods: {
          current_weekly: currentWeekly,
          current_monthly: currentMonthly,
        },
      },
    })
  } catch (error) {
    next(error)
  }
}

// 获取用户排名趋势
const getUserRankingTrend = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.userId : req.params.userId
    const { type = "weekly", limit = 12 } = req.query

    if (!userId) {
      throw new ApiError("用户ID不能为空", 400)
    }

    if (!["weekly", "monthly"].includes(type)) {
      throw new ApiError("排行榜类型无效", 400)
    }

    const rankings = await Ranking.findAll({
      where: {
        user_id: userId,
        ranking_type: type,
        is_active: true,
      },
      order: [["period", "DESC"]],
      limit: parseInt(limit),
    })

    // 处理趋势数据
    const trend = rankings
      .map((ranking) => ({
        period: ranking.period,
        rank: ranking.rank,
        score: ranking.score,
        winRate: ranking.win_rate,
        change: ranking.previous_rank
          ? ranking.previous_rank - ranking.rank
          : 0,
      }))
      .reverse() // 按时间正序

    res.json({
      code: 200,
      message: "获取成功",
      data: trend,
    })
  } catch (error) {
    next(error)
  }
}

module.exports = {
  getWeeklyRanking,
  getMonthlyRanking,
  getTotalRanking,
  getUserRanking,
  calculateRankings,
  getRankingHistory,
  getRankingStats,
  getUserRankingTrend,
}
