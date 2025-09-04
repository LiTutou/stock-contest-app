const { DataTypes, Op } = require("sequelize")
const { sequelize } = require("../config/database")
const bcrypt = require("bcryptjs")

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    // 微信相关信息
    open_id: {
      type: DataTypes.STRING(64),
      unique: true,
      allowNull: false,
      comment: "微信OpenID",
    },

    union_id: {
      type: DataTypes.STRING(64),
      unique: true,
      allowNull: true,
      comment: "微信UnionID",
    },

    // 用户基本信息
    nickname: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "股票达人",
      comment: "用户昵称",
    },

    avatar: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "头像URL",
    },

    phone: {
      type: DataTypes.STRING(11),
      allowNull: true,
      unique: true,
      comment: "手机号",
    },

    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
      validate: {
        isEmail: true,
      },
      comment: "邮箱",
    },

    // 用户等级和积分
    level: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: "用户等级",
    },

    total_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "总积分",
    },

    current_score: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "当前可用积分",
    },

    // 统计信息
    total_recommends: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "总推荐次数",
    },

    success_recommends: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "成功推荐次数",
    },

    failed_recommends: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "失败推荐次数",
    },

    current_streak: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "当前连胜次数",
    },

    max_streak: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "最大连胜次数",
    },

    // 用户设置
    settings: {
      type: DataTypes.JSON,
      defaultValue: {
        pushNotification: true,
        priceAlert: true,
        rankingAlert: false,
        publicRecommends: true,
        showInRanking: true,
        theme: "auto",
        autoRefresh: true,
      },
      comment: "用户设置",
    },

    // 状态信息
    status: {
      type: DataTypes.ENUM("active", "inactive", "banned"),
      defaultValue: "active",
      comment: "用户状态",
    },

    last_login_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "最后登录时间",
    },

    last_active_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "最后活跃时间",
    },
  },
  {
    tableName: "users",
    indexes: [
      {
        fields: ["open_id"],
      },
      {
        fields: ["total_score"],
      },
      {
        fields: ["status"],
      },
      {
        fields: ["created_at"],
      },
    ],
  }
)

// 实例方法
User.prototype.toJSON = function () {
  const values = Object.assign({}, this.get())

  // 计算胜率
  values.winRate =
    values.total_recommends > 0
      ? values.success_recommends / values.total_recommends
      : 0

  // 不返回敏感信息
  delete values.open_id
  delete values.union_id

  return values
}

// 更新用户统计信息
User.prototype.updateStats = async function (isSuccess) {
  if (isSuccess) {
    this.success_recommends += 1
    this.current_streak += 1
    this.max_streak = Math.max(this.max_streak, this.current_streak)

    // 成功推荐获得积分
    let scoreGain = 10 // 基础分
    if (this.current_streak >= 3) scoreGain += 20 // 连胜奖励
    if (this.current_streak >= 5) scoreGain += 50 // 更高连胜奖励

    this.total_score += scoreGain
    this.current_score += scoreGain
  } else {
    this.failed_recommends += 1
    this.current_streak = 0

    // 失败扣少量积分
    this.current_score = Math.max(0, this.current_score - 5)
  }

  this.total_recommends += 1

  // 检查升级
  const newLevel = Math.floor(this.total_score / 1000) + 1
  if (newLevel > this.level) {
    this.level = newLevel
  }

  await this.save()
}

// 类方法
User.findByOpenId = function (openId) {
  return this.findOne({ where: { open_id: openId } })
}

User.getTopUsers = function (limit = 10) {
  return this.findAll({
    where: { status: "active" },
    order: [["total_score", "DESC"]],
    limit,
  })
}

module.exports = User
