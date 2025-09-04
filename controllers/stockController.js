const { Stock, Recommend, User } = require("../models")
const { ApiError } = require("../middleware/errorMiddleware")
const logger = require("../utils/logger")
const axios = require("axios")

// 搜索股票
const searchStock = async (req, res, next) => {
  try {
    const { keyword, limit = 20 } = req.query

    if (!keyword || keyword.trim().length < 1) {
      throw new ApiError("搜索关键词不能为空", 400)
    }

    const stocks = await Stock.search(keyword.trim(), parseInt(limit))

    res.json({
      code: 200,
      message: "搜索成功",
      data: stocks.map((stock) => stock.toJSON()),
    })
  } catch (error) {
    next(error)
  }
}

// 获取股票详情
const getStockDetail = async (req, res, next) => {
  try {
    const { code } = req.params

    const stock = await Stock.findByCode(code)

    if (!stock) {
      throw new ApiError("股票不存在", 404)
    }

    // 获取该股票的推荐统计
    const recommendStats = await Recommend.findOne({
      attributes: [
        [
          require("sequelize").fn("COUNT", require("sequelize").col("id")),
          "total_recommends",
        ],
        [
          require("sequelize").fn(
            "COUNT",
            require("sequelize").literal(
              'CASE WHEN status = "success" THEN 1 END'
            )
          ),
          "success_recommends",
        ],
        [
          require("sequelize").fn(
            "AVG",
            require("sequelize").literal(
              "CASE WHEN actual_return IS NOT NULL THEN actual_return END"
            )
          ),
          "avg_return",
        ],
        [
          require("sequelize").fn(
            "MAX",
            require("sequelize").col("actual_return")
          ),
          "max_return",
        ],
        [
          require("sequelize").fn(
            "MIN",
            require("sequelize").col("actual_return")
          ),
          "min_return",
        ],
      ],
      where: { stock_code: code },
      raw: true,
    })

    // 获取最近的推荐
    const recentRecommends = await Recommend.getByStock(code, 5)

    const result = stock.toJSON()
    result.recommend_stats = {
      total: parseInt(recommendStats.total_recommends) || 0,
      success: parseInt(recommendStats.success_recommends) || 0,
      success_rate:
        recommendStats.total_recommends > 0
          ? recommendStats.success_recommends / recommendStats.total_recommends
          : 0,
      avg_return: parseFloat(recommendStats.avg_return) || 0,
      max_return: parseFloat(recommendStats.max_return) || 0,
      min_return: parseFloat(recommendStats.min_return) || 0,
    }
    result.recent_recommends = recentRecommends.map((rec) => rec.toJSON())

    res.json({
      code: 200,
      message: "获取成功",
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

// 获取股票价格历史
const getStockHistory = async (req, res, next) => {
  try {
    const { code, days = 7 } = req.query

    if (!code) {
      throw new ApiError("股票代码不能为空", 400)
    }

    // 这里应该调用真实的股票API获取历史数据
    // 暂时返回模拟数据
    const history = generateMockPriceHistory(code, parseInt(days))

    res.json({
      code: 200,
      message: "获取成功",
      data: history,
    })
  } catch (error) {
    next(error)
  }
}

// 获取热门股票
const getPopularStocks = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query

    const stocks = await Stock.getPopular(parseInt(limit))

    res.json({
      code: 200,
      message: "获取成功",
      data: stocks.map((stock) => stock.toJSON()),
    })
  } catch (error) {
    next(error)
  }
}

// 按市场获取股票
const getStocksByMarket = async (req, res, next) => {
  try {
    const { market, limit = 50 } = req.query

    if (!market || !["SH", "SZ", "HK", "US"].includes(market)) {
      throw new ApiError("市场参数无效", 400)
    }

    const stocks = await Stock.getByMarket(market, parseInt(limit))

    res.json({
      code: 200,
      message: "获取成功",
      data: stocks.map((stock) => stock.toJSON()),
    })
  } catch (error) {
    next(error)
  }
}

// 更新股票价格（管理员功能或定时任务）
const updateStockPrices = async (req, res, next) => {
  try {
    const { codes } = req.body // 股票代码数组

    if (!codes || !Array.isArray(codes)) {
      throw new ApiError("股票代码列表无效", 400)
    }

    const results = []

    for (const code of codes) {
      try {
        const stock = await Stock.findByCode(code)

        if (!stock) {
          results.push({
            code,
            status: "not_found",
          })
          continue
        }

        // 获取最新价格数据
        const priceData = await fetchStockPrice(code)

        if (priceData) {
          await stock.updatePrice(priceData)
          results.push({
            code,
            status: "updated",
            price: priceData.current_price,
            change: priceData.change_percent,
          })
        } else {
          results.push({
            code,
            status: "no_data",
          })
        }
      } catch (error) {
        results.push({
          code,
          status: "error",
          error: error.message,
        })
      }
    }

    logger.info(`批量更新股票价格: 处理 ${results.length} 只股票`)

    res.json({
      code: 200,
      message: "更新完成",
      data: results,
    })
  } catch (error) {
    next(error)
  }
}

// 批量更新所有活跃股票价格（定时任务）
const updateAllStockPrices = async (req, res, next) => {
  try {
    const stocks = await Stock.findAll({
      where: { status: "active" },
      attributes: ["code"],
    })

    const codes = stocks.map((s) => s.code)
    const batchSize = 50 // 每批处理50只股票
    const results = []

    for (let i = 0; i < codes.length; i += batchSize) {
      const batch = codes.slice(i, i + batchSize)

      const batchPromises = batch.map(async (code) => {
        try {
          const stock = await Stock.findByCode(code)
          const priceData = await fetchStockPrice(code)

          if (priceData && stock) {
            await stock.updatePrice(priceData)
            return { code, status: "updated", price: priceData.current_price }
          } else {
            return { code, status: "no_data" }
          }
        } catch (error) {
          return { code, status: "error", error: error.message }
        }
      })

      const batchResults = await Promise.allSettled(batchPromises)
      results.push(...batchResults.map((r) => r.value || r.reason))

      // 批次间短暂延迟，避免API限流
      if (i + batchSize < codes.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    const successCount = results.filter((r) => r.status === "updated").length

    logger.info(`定时更新所有股票价格: 成功 ${successCount}/${results.length}`)

    res.json({
      code: 200,
      message: `价格更新完成，成功更新 ${successCount} 只股票`,
      data: {
        total: results.length,
        success: successCount,
        details: results,
      },
    })
  } catch (error) {
    next(error)
  }
}

// 创建或更新股票信息
const createOrUpdateStock = async (req, res, next) => {
  try {
    const {
      code,
      name,
      market,
      industry,
      sector,
      tags = [],
      current_price,
      previous_close,
    } = req.body

    if (!code || !name || !market) {
      throw new ApiError("股票代码、名称和市场不能为空", 400)
    }

    const change_amount =
      current_price && previous_close ? current_price - previous_close : 0
    const change_percent =
      previous_close && previous_close > 0
        ? ((current_price - previous_close) / previous_close) * 100
        : 0

    const [stock, created] = await Stock.findOrCreate({
      where: { code },
      defaults: {
        code,
        name,
        market,
        industry,
        sector,
        tags,
        current_price,
        previous_close,
        change_amount,
        change_percent,
        price_updated_at: new Date(),
      },
    })

    if (!created) {
      // 更新现有股票信息
      await stock.update({
        name,
        market,
        industry: industry || stock.industry,
        sector: sector || stock.sector,
        tags: tags.length > 0 ? tags : stock.tags,
        current_price: current_price || stock.current_price,
        previous_close: previous_close || stock.previous_close,
        change_amount,
        change_percent,
        price_updated_at: new Date(),
      })
    }

    logger.info(`${created ? "创建" : "更新"}股票: ${code}`)

    res.status(created ? 201 : 200).json({
      code: created ? 201 : 200,
      message: `股票${created ? "创建" : "更新"}成功`,
      data: stock.toJSON(),
    })
  } catch (error) {
    next(error)
  }
}

// 获取股票推荐排行
const getStockRecommendRanking = async (req, res, next) => {
  try {
    const { limit = 20, timeRange } = req.query

    let whereClause = {}

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
        whereClause.created_at = {
          [Op.gte]: startDate,
        }
      }
    }

    const stockRanking = await Recommend.findAll({
      attributes: [
        "stock_code",
        [
          require("sequelize").fn(
            "COUNT",
            require("sequelize").col("Recommend.id")
          ),
          "recommend_count",
        ],
        [
          require("sequelize").fn(
            "COUNT",
            require("sequelize").literal(
              'CASE WHEN status = "success" THEN 1 END'
            )
          ),
          "success_count",
        ],
        [
          require("sequelize").fn(
            "AVG",
            require("sequelize").literal(
              "CASE WHEN actual_return IS NOT NULL THEN actual_return END"
            )
          ),
          "avg_return",
        ],
      ],
      where: whereClause,
      include: [
        {
          model: Stock,
          as: "stock",
          attributes: ["name", "current_price", "change_percent", "market"],
        },
      ],
      group: ["stock_code"],
      order: [[require("sequelize").literal("recommend_count"), "DESC"]],
      limit: parseInt(limit),
      raw: false,
    })

    const result = stockRanking.map((item) => {
      const data = item.get({ plain: true })
      return {
        stock_code: data.stock_code,
        stock_name: data.stock.name,
        current_price: data.stock.current_price,
        change_percent: data.stock.change_percent,
        market: data.stock.market,
        recommend_count: parseInt(data.recommend_count),
        success_count: parseInt(data.success_count),
        success_rate:
          data.recommend_count > 0
            ? data.success_count / data.recommend_count
            : 0,
        avg_return: parseFloat(data.avg_return) || 0,
      }
    })

    res.json({
      code: 200,
      message: "获取成功",
      data: result,
    })
  } catch (error) {
    next(error)
  }
}

// 工具函数：获取股票价格数据
async function fetchStockPrice(code) {
  try {
    // 这里应该调用真实的股票API
    // 目前返回模拟数据

    // 示例：调用新浪财经API（免费但不稳定）
    // const response = await axios.get(`https://hq.sinajs.cn/list=${getStockPrefix(code)}${code}`);

    // 示例：调用腾讯股票API
    // const response = await axios.get(`https://qt.gtimg.cn/q=${getStockPrefix(code)}${code}`);

    // 模拟数据
    const basePrice = 100 + Math.random() * 50
    const changePercent = (Math.random() - 0.5) * 10 // -5% 到 +5%
    const currentPrice = basePrice * (1 + changePercent / 100)

    return {
      current_price: parseFloat(currentPrice.toFixed(2)),
      previous_close: parseFloat(basePrice.toFixed(2)),
      change_amount: parseFloat((currentPrice - basePrice).toFixed(2)),
      change_percent: parseFloat(changePercent.toFixed(2)),
      volume: Math.floor(Math.random() * 1000000),
      turnover: parseFloat((currentPrice * Math.random() * 1000000).toFixed(2)),
    }
  } catch (error) {
    logger.error(`获取股票价格失败 ${code}:`, error)
    return null
  }
}

// 工具函数：生成模拟价格历史数据
function generateMockPriceHistory(code, days) {
  const history = []
  const basePrice = 100 + Math.random() * 50
  let currentPrice = basePrice

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)

    // 随机价格波动
    const change = (Math.random() - 0.5) * 0.1 // 10% 范围内波动
    currentPrice = currentPrice * (1 + change)

    history.push({
      date: date.toISOString().split("T")[0],
      open: parseFloat(currentPrice.toFixed(2)),
      high: parseFloat((currentPrice * 1.02).toFixed(2)),
      low: parseFloat((currentPrice * 0.98).toFixed(2)),
      close: parseFloat(currentPrice.toFixed(2)),
      volume: Math.floor(Math.random() * 1000000),
    })
  }

  return history
}

// 工具函数：获取股票前缀
function getStockPrefix(code) {
  if (code.startsWith("6")) {
    return "sh" // 上海
  } else if (code.startsWith("0") || code.startsWith("3")) {
    return "sz" // 深圳
  } else {
    return "hk" // 港股
  }
}

module.exports = {
  searchStock,
  getStockDetail,
  getStockHistory,
  getPopularStocks,
  getStocksByMarket,
  updateStockPrices,
  updateAllStockPrices,
  createOrUpdateStock,
  getStockRecommendRanking,
  fetchStockPrice, // 导出供定时任务使用
}
