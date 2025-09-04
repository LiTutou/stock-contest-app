const { DataTypes, Op } = require("sequelize")
const { sequelize } = require("../config/database")

const Follow = sequelize.define(
  "Follow",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    // 跟投用户
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      comment: "跟投用户ID",
    },

    // 被跟投的推荐
    recommend_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "recommends",
        key: "id",
      },
      comment: "被跟投的推荐ID",
    },

    // 被跟投的用户（关注功能）
    target_user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
      comment: "被跟投的用户ID",
    },

    // 跟投类型
    follow_type: {
      type: DataTypes.ENUM("recommend", "user"),
      allowNull: false,
      comment: "跟投类型",
    },

    // 跟投金额（虚拟）
    follow_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 10000.0,
      comment: "跟投金额",
    },

    // 跟投时的价格
    follow_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "跟投时价格",
    },

    // 当前收益
    current_return: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: true,
      comment: "当前收益率",
    },

    // 实际收益
    actual_return: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: true,
      comment: "实际收益率",
    },

    // 跟投状态
    status: {
      type: DataTypes.ENUM("active", "completed", "cancelled"),
      defaultValue: "active",
      comment: "跟投状态",
    },

    // 跟投时间
    follow_date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: "跟投时间",
    },

    // 完成时间
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "完成时间",
    },

    // 备注
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "跟投备注",
    },
  },
  {
    tableName: "follows",
    indexes: [
      {
        fields: ["user_id"],
      },
      {
        fields: ["recommend_id"],
      },
      {
        fields: ["target_user_id"],
      },
      {
        fields: ["follow_type"],
      },
      {
        fields: ["status"],
      },
      {
        // 防止重复跟投同一个推荐
        fields: ["user_id", "recommend_id"],
        unique: true,
        where: {
          recommend_id: {
            [Op.ne]: null,
          },
        },
      },
      {
        // 防止重复关注同一个用户
        fields: ["user_id", "target_user_id"],
        unique: true,
        where: {
          target_user_id: {
            [Op.ne]: null,
          },
        },
      },
    ],
  }
)

// 实例方法
Follow.prototype.toJSON = function () {
  const values = Object.assign({}, this.get())

  // 格式化数字
  ;["follow_amount", "follow_price", "current_return", "actual_return"].forEach(
    (field) => {
      if (values[field] !== null) {
        values[field] = parseFloat(values[field])
      }
    }
  )

  return values
}

// 更新当前收益
Follow.prototype.updateCurrentReturn = async function (currentPrice) {
  if (this.follow_price && currentPrice) {
    this.current_return =
      ((currentPrice - this.follow_price) / this.follow_price) * 100
    await this.save()
  }
}

// 完成跟投
Follow.prototype.complete = async function (exitPrice) {
  if (this.follow_price && exitPrice) {
    this.actual_return =
      ((exitPrice - this.follow_price) / this.follow_price) * 100
  }

  this.status = "completed"
  this.completed_at = new Date()
  await this.save()
}

// 类方法
Follow.getByUser = function (userId, type = null, limit = 20, offset = 0) {
  const where = { user_id: userId }

  if (type) {
    where.follow_type = type
  }

  const include = []

  if (!type || type === "recommend") {
    include.push({
      model: require("./Recommend"),
      as: "recommend",
      include: [
        {
          model: require("./Stock"),
          as: "stock",
          attributes: ["name", "current_price"],
        },
        {
          model: require("./User"),
          as: "user",
          attributes: ["nickname", "avatar"],
        },
      ],
    })
  }

  if (!type || type === "user") {
    include.push({
      model: require("./User"),
      as: "target_user",
      attributes: ["id", "nickname", "avatar", "level", "total_score"],
    })
  }

  return this.findAndCountAll({
    where,
    include,
    order: [["created_at", "DESC"]],
    limit,
    offset,
  })
}

Follow.getFollowers = function (targetUserId, limit = 20, offset = 0) {
  return this.findAndCountAll({
    where: {
      target_user_id: targetUserId,
      follow_type: "user",
    },
    include: [
      {
        model: require("./User"),
        as: "user",
        attributes: ["id", "nickname", "avatar", "level"],
      },
    ],
    order: [["created_at", "DESC"]],
    limit,
    offset,
  })
}

Follow.getRecommendFollows = function (recommendId, limit = 20, offset = 0) {
  return this.findAndCountAll({
    where: {
      recommend_id: recommendId,
      follow_type: "recommend",
    },
    include: [
      {
        model: require("./User"),
        as: "user",
        attributes: ["id", "nickname", "avatar", "level"],
      },
    ],
    order: [["created_at", "DESC"]],
    limit,
    offset,
  })
}

// 检查是否已跟投
Follow.isFollowing = async function (
  userId,
  recommendId = null,
  targetUserId = null
) {
  const where = { user_id: userId }

  if (recommendId) {
    where.recommend_id = recommendId
    where.follow_type = "recommend"
  } else if (targetUserId) {
    where.target_user_id = targetUserId
    where.follow_type = "user"
  } else {
    return false
  }

  const follow = await this.findOne({ where })
  return !!follow
}

// 统计方法
Follow.getStats = function (userId) {
  return this.findAll({
    attributes: [
      "follow_type",
      [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      [sequelize.fn("AVG", sequelize.col("actual_return")), "avg_return"],
    ],
    where: { user_id: userId },
    group: ["follow_type"],
    raw: true,
  })
}

module.exports = Follow
