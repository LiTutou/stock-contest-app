const { DataTypes } = require("sequelize")
const { sequelize } = require("../config/database")

const Recommend = sequelize.define(
  "Recommend",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    // 关联信息
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      comment: "推荐用户ID",
    },

    stock_code: {
      type: DataTypes.STRING(10),
      allowNull: false,
      references: {
        model: "stocks",
        key: "code",
      },
      comment: "股票代码",
    },

    // 推荐信息
    predict_change: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: false,
      comment: "预期涨跌幅(%)",
    },

    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "推荐理由",
    },

    confidence: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
      validate: {
        min: 1,
        max: 5,
      },
      comment: "信心指数(1-5)",
    },

    hold_period: {
      type: DataTypes.ENUM("1week", "2weeks", "1month", "3months"),
      allowNull: false,
      comment: "建议持有时间",
    },

    // 价格信息
    entry_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "推荐时价格",
    },

    current_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "当前价格",
    },

    exit_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "结算价格",
    },

    // 收益信息
    current_return: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: true,
      comment: "当前收益率(%)",
    },

    actual_return: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: true,
      comment: "实际收益率(%)",
    },

    // 时间信息
    start_date: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: "推荐开始时间",
    },

    end_date: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: "推荐结束时间",
    },

    settled_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "结算时间",
    },

    // 状态信息
    status: {
      type: DataTypes.ENUM(
        "active",
        "success",
        "failed",
        "expired",
        "cancelled"
      ),
      defaultValue: "active",
      comment: "推荐状态",
    },

    // 统计信息
    follow_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "跟投人数",
    },

    like_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "点赞数",
    },

    view_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "查看次数",
    },

    // 额外信息
    tags: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: "推荐标签",
    },

    is_featured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "是否精选推荐",
    },

    admin_comment: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "管理员备注",
    },
  },
  {
    tableName: "recommends",
    indexes: [
      {
        fields: ["user_id"],
      },
      {
        fields: ["stock_code"],
      },
      {
        fields: ["status"],
      },
      {
        fields: ["start_date"],
      },
      {
        fields: ["end_date"],
      },
      {
        fields: ["actual_return"],
      },
      {
        fields: ["is_featured"],
      },
    ],
  }
)

// 实例方法
Recommend.prototype.toJSON = function () {
  const values = Object.assign({}, this.get())

  // 格式化数字
  ;[
    "predict_change",
    "entry_price",
    "current_price",
    "exit_price",
    "current_return",
    "actual_return",
  ].forEach((field) => {
    if (values[field] !== null) {
      values[field] = parseFloat(values[field])
    }
  })

  // 计算剩余时间
  if (values.status === "active") {
    const now = new Date()
    const endDate = new Date(values.end_date)
    values.remaining_time = Math.max(0, endDate - now)
    values.progress = Math.min(
      100,
      ((now - new Date(values.start_date)) /
        (endDate - new Date(values.start_date))) *
        100
    )
  }

  return values
}

// 更新当前收益
Recommend.prototype.updateCurrentReturn = async function (currentPrice) {
  this.current_price = currentPrice
  this.current_return =
    ((currentPrice - this.entry_price) / this.entry_price) * 100
  await this.save()
}

// 结算推荐
Recommend.prototype.settle = async function (exitPrice = null) {
  const finalPrice = exitPrice || this.current_price

  if (!finalPrice) {
    throw new Error("无法获取结算价格")
  }

  this.exit_price = finalPrice
  this.actual_return =
    ((finalPrice - this.entry_price) / this.entry_price) * 100
  this.settled_at = new Date()

  // 判断推荐是否成功
  const predictDirection = this.predict_change > 0 ? "up" : "down"
  const actualDirection = this.actual_return > 0 ? "up" : "down"

  if (predictDirection === actualDirection) {
    // 方向预测正确
    const accuracyScore =
      100 - Math.abs(this.actual_return - this.predict_change)

    if (accuracyScore >= 80) {
      this.status = "success"
    } else if (accuracyScore >= 50) {
      this.status = "success" // 方向对就算成功，但积分会不同
    } else {
      this.status = "failed"
    }
  } else {
    this.status = "failed"
  }

  await this.save()

  // 更新用户统计
  const User = require("./User")
  const user = await User.findByPk(this.user_id)
  if (user) {
    await user.updateStats(this.status === "success")
  }

  // 更新股票统计
  const Stock = require("./Stock")
  const stock = await Stock.findByCode(this.stock_code)
  if (stock) {
    await stock.updateStats()
  }
}

// 检查是否过期
Recommend.prototype.checkExpired = async function () {
  if (this.status === "active" && new Date() > new Date(this.end_date)) {
    await this.settle()
    if (this.status === "active") {
      this.status = "expired"
      await this.save()
    }
  }
}

// 增加查看次数
Recommend.prototype.incrementView = async function () {
  await this.increment("view_count")
}

// 类方法
Recommend.getActiveRecommends = function (limit = 20, offset = 0) {
  return this.findAndCountAll({
    where: { status: "active" },
    include: [
      {
        model: require("./User"),
        as: "user",
        attributes: ["id", "nickname", "avatar", "level"],
      },
      {
        model: require("./Stock"),
        as: "stock",
        attributes: ["name", "current_price", "change_percent"],
      },
    ],
    order: [["created_at", "DESC"]],
    limit,
    offset,
  })
}

Recommend.getByUser = function (userId, status = null, limit = 20, offset = 0) {
  const where = { user_id: userId }
  if (status) {
    where.status = status
  }

  return this.findAndCountAll({
    where,
    include: [
      {
        model: require("./Stock"),
        as: "stock",
        attributes: ["name", "current_price", "change_percent"],
      },
    ],
    order: [["created_at", "DESC"]],
    limit,
    offset,
  })
}

Recommend.getByStock = function (stockCode, limit = 10) {
  return this.findAll({
    where: { stock_code: stockCode },
    include: [
      {
        model: require("./User"),
        as: "user",
        attributes: ["id", "nickname", "avatar", "level"],
      },
    ],
    order: [["created_at", "DESC"]],
    limit,
  })
}

Recommend.getFeatured = function (limit = 10) {
  return this.findAll({
    where: {
      is_featured: true,
      status: ["active", "success"],
    },
    include: [
      {
        model: require("./User"),
        as: "user",
        attributes: ["id", "nickname", "avatar", "level"],
      },
      {
        model: require("./Stock"),
        as: "stock",
        attributes: ["name", "current_price", "change_percent"],
      },
    ],
    order: [["created_at", "DESC"]],
    limit,
  })
}

// 统计方法
Recommend.getStats = function (userId = null, timeRange = null) {
  const where = {}

  if (userId) {
    where.user_id = userId
  }

  if (timeRange) {
    const now = new Date()
    let startDate

    switch (timeRange) {
      case "week":
        startDate = new Date(now.setDate(now.getDate() - 7))
        break
      case "month":
        startDate = new Date(now.setMonth(now.getMonth() - 1))
        break
      case "3months":
        startDate = new Date(now.setMonth(now.getMonth() - 3))
        break
    }

    if (startDate) {
      where.created_at = {
        [sequelize.Op.gte]: startDate,
      }
    }
  }

  return this.findOne({
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
          "COUNT",
          sequelize.literal('CASE WHEN status = "failed" THEN 1 END')
        ),
        "failed",
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
      [sequelize.fn("MIN", sequelize.col("actual_return")), "min_return"],
    ],
    where,
    raw: true,
  })
}

module.exports = Recommend
