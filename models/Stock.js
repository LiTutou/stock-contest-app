const { DataTypes, Op } = require("sequelize")
const { sequelize } = require("../config/database")

const Stock = sequelize.define(
  "Stock",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    // 股票基本信息
    code: {
      type: DataTypes.STRING(10),
      unique: true,
      allowNull: false,
      comment: "股票代码",
    },

    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: "股票名称",
    },

    market: {
      type: DataTypes.ENUM("SH", "SZ", "HK", "US"),
      allowNull: false,
      comment: "市场类型",
    },

    // 股票分类信息
    industry: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "所属行业",
    },

    sector: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "所属板块",
    },

    tags: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: "股票标签",
    },

    // 当前价格信息
    current_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "当前价格",
    },

    previous_close: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "昨收价",
    },

    change_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "涨跌额",
    },

    change_percent: {
      type: DataTypes.DECIMAL(8, 4),
      allowNull: true,
      comment: "涨跌幅(%)",
    },

    // 交易信息
    volume: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: "成交量",
    },

    turnover: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: true,
      comment: "成交额",
    },

    market_cap: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: true,
      comment: "总市值",
    },

    // 统计信息
    recommend_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "被推荐次数",
    },

    success_rate: {
      type: DataTypes.DECIMAL(5, 4),
      defaultValue: 0,
      comment: "预测成功率",
    },

    avg_return: {
      type: DataTypes.DECIMAL(8, 4),
      defaultValue: 0,
      comment: "平均收益率",
    },

    // 数据更新时间
    price_updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "价格更新时间",
    },

    // 状态信息
    status: {
      type: DataTypes.ENUM("active", "suspended", "delisted"),
      defaultValue: "active",
      comment: "股票状态",
    },

    is_popular: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "是否热门股票",
    },
  },
  {
    tableName: "stocks",
    indexes: [
      {
        fields: ["code"],
        unique: true,
      },
      {
        fields: ["market"],
      },
      {
        fields: ["industry"],
      },
      {
        fields: ["recommend_count"],
      },
      {
        fields: ["success_rate"],
      },
      {
        fields: ["is_popular"],
      },
    ],
  }
)

// 实例方法
Stock.prototype.toJSON = function () {
  const values = Object.assign({}, this.get())

  // 格式化数字
  if (values.current_price) {
    values.current_price = parseFloat(values.current_price)
  }
  if (values.change_percent) {
    values.change_percent = parseFloat(values.change_percent)
  }
  if (values.success_rate) {
    values.success_rate = parseFloat(values.success_rate)
  }

  return values
}

// 更新价格信息
Stock.prototype.updatePrice = async function (priceData) {
  this.current_price = priceData.current_price
  this.previous_close = priceData.previous_close
  this.change_amount = priceData.change_amount
  this.change_percent = priceData.change_percent
  this.volume = priceData.volume
  this.turnover = priceData.turnover
  this.price_updated_at = new Date()

  await this.save()
}

// 更新统计信息
Stock.prototype.updateStats = async function () {
  const Recommend = require("./Recommend")

  // 计算推荐统计
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
            'CASE WHEN status = "success" THEN actual_return END'
          )
        ),
        "avg_return",
      ],
    ],
    where: { stock_code: this.code },
    raw: true,
  })

  this.recommend_count = stats.total || 0
  this.success_rate = stats.total > 0 ? (stats.success || 0) / stats.total : 0
  this.avg_return = stats.avg_return || 0

  await this.save()
}

// 类方法
Stock.findByCode = function (code) {
  return this.findOne({ where: { code } })
}

Stock.search = function (keyword, limit = 20) {
  // 在方法内重新导入Op，确保作用域正确
  const { Op } = require("sequelize")

  return this.findAll({
    where: {
      [Op.or]: [
        { code: { [Op.like]: `%${keyword}%` } },
        { name: { [Op.like]: `%${keyword}%` } },
      ],
      status: "active",
    },
    limit,
    order: [["recommend_count", "DESC"]],
  })
}

Stock.getPopular = function (limit = 10) {
  return this.findAll({
    where: {
      status: "active",
      is_popular: true,
    },
    order: [["recommend_count", "DESC"]],
    limit,
  })
}

Stock.getByMarket = function (market, limit = 50) {
  return this.findAll({
    where: {
      market,
      status: "active",
    },
    order: [["market_cap", "DESC"]],
    limit,
  })
}

module.exports = Stock
