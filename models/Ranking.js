const { DataTypes, Op } = require("sequelize")
const { sequelize } = require("../config/database")

const Ranking = sequelize.define(
  "Ranking",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    // 用户信息
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      comment: "用户ID",
    },

    // 排名信息
    rank: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "排名",
    },

    previous_rank: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "上期排名",
    },

    // 积分信息
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "总积分",
    },

    period_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "本期积分",
    },

    // 统计信息
    total_recommends: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "推荐总数",
    },

    success_recommends: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "成功推荐数",
    },

    win_rate: {
      type: DataTypes.DECIMAL(5, 4),
      defaultValue: 0,
      comment: "胜率",
    },

    avg_return: {
      type: DataTypes.DECIMAL(8, 4),
      defaultValue: 0,
      comment: "平均收益率",
    },

    max_return: {
      type: DataTypes.DECIMAL(8, 4),
      defaultValue: 0,
      comment: "最高收益率",
    },

    current_streak: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "当前连胜",
    },

    max_streak: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "最大连胜",
    },

    // 排名类型和周期
    ranking_type: {
      type: DataTypes.ENUM("weekly", "monthly", "total"),
      allowNull: false,
      comment: "排名类型",
    },

    period: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: "排名周期 (如: 2024-W01, 2024-01, total)",
    },

    // 时间信息
    period_start: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "周期开始时间",
    },

    period_end: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "周期结束时间",
    },

    // 额外信息
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "是否激活",
    },

    badge: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "徽章 (如: 周冠军, 月冠军)",
    },
  },
  {
    tableName: "rankings",
    indexes: [
      {
        fields: ["user_id"],
      },
      {
        fields: ["ranking_type"],
      },
      {
        fields: ["period"],
      },
      {
        fields: ["rank"],
      },
      {
        fields: ["score"],
      },
      {
        // 唯一约束：每个用户在每个周期只能有一条排名记录
        fields: ["user_id", "ranking_type", "period"],
        unique: true,
      },
    ],
  }
)

// 实例方法
Ranking.prototype.toJSON = function () {
  const values = Object.assign({}, this.get())

  // 格式化数字
  ;["win_rate", "avg_return", "max_return"].forEach((field) => {
    if (values[field] !== null) {
      values[field] = parseFloat(values[field])
    }
  })

  // 计算排名变化
  if (values.previous_rank) {
    values.rank_change = values.previous_rank - values.rank
  } else {
    values.rank_change = 0
  }

  return values
}

// 类方法
Ranking.getRankingList = function (
  type,
  period = null,
  limit = 50,
  offset = 0
) {
  const where = {
    ranking_type: type,
    is_active: true,
  }

  if (period) {
    where.period = period
  } else {
    // 获取最新周期的排名
    where.period = type === "total" ? "total" : this.getCurrentPeriod(type)
  }

  return this.findAndCountAll({
    where,
    include: [
      {
        model: require("./User"),
        as: "user",
        attributes: ["id", "nickname", "avatar", "level", "status"],
        where: { status: "active" },
      },
    ],
    order: [["rank", "ASC"]],
    limit,
    offset,
  })
}

Ranking.getUserRanking = function (userId, type, period = null) {
  const where = {
    user_id: userId,
    ranking_type: type,
    is_active: true,
  }

  if (period) {
    where.period = period
  } else {
    where.period = type === "total" ? "total" : this.getCurrentPeriod(type)
  }

  return this.findOne({
    where,
    include: [
      {
        model: require("./User"),
        as: "user",
        attributes: ["nickname", "avatar", "level"],
      },
    ],
  })
}

// 获取当前周期标识
Ranking.getCurrentPeriod = function (type) {
  const now = new Date()

  if (type === "weekly") {
    // 获取年份和周数
    const year = now.getFullYear()
    const startOfYear = new Date(year, 0, 1)
    const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000))
    const week = Math.ceil((days + startOfYear.getDay() + 1) / 7)
    return `${year}-W${week.toString().padStart(2, "0")}`
  } else if (type === "monthly") {
    // 获取年份和月份
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    return `${year}-${month.toString().padStart(2, "0")}`
  } else {
    return "total"
  }
}

// 获取周期时间范围
Ranking.getPeriodRange = function (type, period) {
  if (type === "total") {
    return { start: null, end: null }
  }

  if (type === "weekly") {
    const [year, week] = period.split("-W")
    const startOfYear = new Date(parseInt(year), 0, 1)
    const startOfWeek = new Date(
      startOfYear.getTime() + (parseInt(week) - 1) * 7 * 24 * 60 * 60 * 1000
    )
    const endOfWeek = new Date(
      startOfWeek.getTime() +
        6 * 24 * 60 * 60 * 1000 +
        23 * 60 * 60 * 1000 +
        59 * 60 * 1000 +
        59 * 1000
    )

    return { start: startOfWeek, end: endOfWeek }
  }

  if (type === "monthly") {
    const [year, month] = period.split("-")
    const startOfMonth = new Date(parseInt(year), parseInt(month) - 1, 1)
    const endOfMonth = new Date(
      parseInt(year),
      parseInt(month),
      0,
      23,
      59,
      59,
      999
    )

    return { start: startOfMonth, end: endOfMonth }
  }

  return { start: null, end: null }
}

// 计算并更新排名
Ranking.calculateRankings = async function (type, period = null) {
  const currentPeriod = period || this.getCurrentPeriod(type)
  const { start, end } = this.getPeriodRange(type, currentPeriod)

  // 获取所有活跃用户
  const User = require("./User")
  const Recommend = require("./Recommend")

  const users = await User.findAll({
    where: { status: "active" },
    attributes: ["id", "nickname", "avatar", "level", "total_score"],
  })

  const rankings = []

  for (const user of users) {
    // 构建查询条件
    const recommendWhere = { user_id: user.id }

    if (start && end) {
      recommendWhere.created_at = {
        [Op.between]: [start, end],
      }
    }

    // 计算用户在当前周期的统计数据
    const stats = await Recommend.findOne({
      attributes: [
        [sequelize.fn("COUNT", sequelize.col("id")), "total"],
        [
          sequelize.fn(
            "COUNT",
            sequelize.literal('CASE WHEN status = "success" THEN 1 END')
          ),
          "success",
        ],
        [
          sequelize.fn(
            "AVG",
            sequelize.literal(
              "CASE WHEN actual_return IS NOT NULL THEN actual_return END"
            )
          ),
          "avg_return",
        ],
        [sequelize.fn("MAX", sequelize.col("actual_return")), "max_return"],
        [
          sequelize.fn(
            "SUM",
            sequelize.literal(
              'CASE WHEN status = "success" THEN 10 + (CASE WHEN current_streak >= 3 THEN 20 ELSE 0 END) + (CASE WHEN current_streak >= 5 THEN 50 ELSE 0 END) ELSE -5 END'
            )
          ),
          "period_score",
        ],
      ],
      where: recommendWhere,
      raw: true,
    })

    const totalRecommends = parseInt(stats.total) || 0
    const successRecommends = parseInt(stats.success) || 0
    const winRate =
      totalRecommends > 0 ? successRecommends / totalRecommends : 0
    const avgReturn = parseFloat(stats.avg_return) || 0
    const maxReturn = parseFloat(stats.max_return) || 0
    const periodScore = parseInt(stats.period_score) || 0

    // 计算总积分（根据类型）
    let totalScore
    if (type === "total") {
      totalScore = user.total_score
    } else {
      totalScore = periodScore
    }

    // 计算连胜
    const recentRecommends = await Recommend.findAll({
      where: {
        ...recommendWhere,
        status: { [Op.in]: ["success", "failed"] },
      },
      order: [["settled_at", "DESC"]],
      limit: 20,
    })

    let currentStreak = 0
    let maxStreak = 0
    let tempStreak = 0

    for (const rec of recentRecommends) {
      if (rec.status === "success") {
        tempStreak++
        if (currentStreak === 0) currentStreak = tempStreak
      } else {
        maxStreak = Math.max(maxStreak, tempStreak)
        tempStreak = 0
        if (currentStreak > 0) break
      }
    }
    maxStreak = Math.max(maxStreak, tempStreak)

    rankings.push({
      user_id: user.id,
      ranking_type: type,
      period: currentPeriod,
      score: totalScore,
      period_score: periodScore,
      total_recommends: totalRecommends,
      success_recommends: successRecommends,
      win_rate: winRate,
      avg_return: avgReturn,
      max_return: maxReturn,
      current_streak: currentStreak,
      max_streak: maxStreak,
      period_start: start,
      period_end: end,
    })
  }

  // 按积分排序
  rankings.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.win_rate !== a.win_rate) return b.win_rate - a.win_rate
    return b.avg_return - a.avg_return
  })

  // 获取上期排名
  const previousPeriod = this.getPreviousPeriod(type, currentPeriod)
  const previousRankings = await this.findAll({
    where: {
      ranking_type: type,
      period: previousPeriod,
    },
    attributes: ["user_id", "rank"],
  })

  const previousRankMap = {}
  previousRankings.forEach((r) => {
    previousRankMap[r.user_id] = r.rank
  })

  // 分配排名和徽章
  for (let i = 0; i < rankings.length; i++) {
    rankings[i].rank = i + 1
    rankings[i].previous_rank = previousRankMap[rankings[i].user_id] || null

    // 分配徽章
    if (i === 0) {
      rankings[i].badge =
        type === "weekly" ? "周冠军" : type === "monthly" ? "月冠军" : "总冠军"
    } else if (i === 1) {
      rankings[i].badge = "亚军"
    } else if (i === 2) {
      rankings[i].badge = "季军"
    } else if (i < 10) {
      rankings[i].badge = "前十"
    }
  }

  // 批量更新数据库
  await this.destroy({
    where: {
      ranking_type: type,
      period: currentPeriod,
    },
  })

  if (rankings.length > 0) {
    await this.bulkCreate(rankings)
  }

  return rankings
}

// 获取上一个周期
Ranking.getPreviousPeriod = function (type, currentPeriod) {
  if (type === "total") return "total"

  if (type === "weekly") {
    const [year, week] = currentPeriod.split("-W")
    const weekNum = parseInt(week)

    if (weekNum > 1) {
      return `${year}-W${(weekNum - 1).toString().padStart(2, "0")}`
    } else {
      return `${parseInt(year) - 1}-W52`
    }
  }

  if (type === "monthly") {
    const [year, month] = currentPeriod.split("-")
    const monthNum = parseInt(month)

    if (monthNum > 1) {
      return `${year}-${(monthNum - 1).toString().padStart(2, "0")}`
    } else {
      return `${parseInt(year) - 1}-12`
    }
  }

  return currentPeriod
}

// 获取用户在所有排行榜中的表现
Ranking.getUserAllRankings = function (userId) {
  return this.findAll({
    where: {
      user_id: userId,
      is_active: true,
    },
    order: [
      ["ranking_type", "ASC"],
      ["period", "DESC"],
    ],
  })
}

// 获取排行榜历史
Ranking.getRankingHistory = function (type, limit = 10) {
  return this.findAll({
    attributes: [
      "period",
      [sequelize.fn("COUNT", sequelize.col("id")), "participant_count"],
      [sequelize.fn("MAX", sequelize.col("score")), "top_score"],
      [sequelize.fn("AVG", sequelize.col("score")), "avg_score"],
    ],
    where: {
      ranking_type: type,
      is_active: true,
    },
    group: ["period"],
    order: [["period", "DESC"]],
    limit,
    raw: true,
  })
}

module.exports = Ranking
