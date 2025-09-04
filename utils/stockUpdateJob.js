// utils/stockUpdateJob.js
const cron = require("node-cron")
const { Stock, Recommend } = require("../models")
const logger = require("./logger")
const axios = require("axios")

class StockUpdateJob {
  constructor() {
    this.isRunning = false
    this.lastUpdateTime = null
  }

  // 初始化定时任务
  init() {
    // 每个交易日 9:30-15:00 每分钟更新一次
    cron.schedule("*/1 9-15 * * 1-5", () => {
      const now = new Date()
      const hours = now.getHours()
      const minutes = now.getMinutes()

      // 11:30-13:00 午休时间不更新
      if (hours === 11 && minutes >= 30) return
      if (hours === 12) return

      this.updateAllStockPrices()
    })

    // 每天 9:00 更新前一日收盘价
    cron.schedule("0 9 * * 1-5", () => {
      this.updatePreviousClose()
    })

    // 每天 15:30 结算到期的推荐
    cron.schedule("30 15 * * 1-5", () => {
      this.settleExpiredRecommends()
    })

    // 每周一凌晨 1:00 计算周排行
    cron.schedule("0 1 * * 1", () => {
      this.calculateWeeklyRanking()
    })

    // 每月1日凌晨 1:00 计算月排行
    cron.schedule("0 1 1 * *", () => {
      this.calculateMonthlyRanking()
    })

    logger.info("股票更新定时任务已启动")
  }

  // 更新所有股票价格
  async updateAllStockPrices() {
    if (this.isRunning) {
      logger.warn("股票价格更新任务正在执行中，跳过本次执行")
      return
    }

    this.isRunning = true
    const startTime = Date.now()

    try {
      logger.info("开始更新股票价格...")

      // 获取所有活跃的股票
      const stocks = await Stock.findAll({
        where: { status: "active" },
        attributes: ["id", "code", "market"],
      })

      // 批量获取股票价格
      const pricePromises = stocks.map((stock) =>
        this.fetchStockPrice(stock.code, stock.market)
      )

      const prices = await Promise.allSettled(pricePromises)

      // 批量更新数据库
      const updatePromises = []
      prices.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value) {
          const stock = stocks[index]
          updatePromises.push(
            stock.update({
              current_price: result.value.price,
              change_amount: result.value.changeAmount,
              change_percent: result.value.changePercent,
              volume: result.value.volume,
              turnover: result.value.turnover,
              high_price: result.value.high,
              low_price: result.value.low,
              price_updated_at: new Date(),
            })
          )
        }
      })

      await Promise.all(updatePromises)

      // 更新推荐的当前收益
      await this.updateRecommendReturns()

      const duration = Date.now() - startTime
      logger.info(
        `股票价格更新完成，耗时: ${duration}ms，更新数量: ${updatePromises.length}`
      )

      this.lastUpdateTime = new Date()
    } catch (error) {
      logger.error("股票价格更新失败:", error)
    } finally {
      this.isRunning = false
    }
  }

  // 从外部API获取股票价格
  async fetchStockPrice(code, market) {
    try {
      // 这里需要替换为实际的股票数据API
      // 示例使用新浪财经接口格式
      let symbol = ""
      if (market === "SH") {
        symbol = `sh${code}`
      } else if (market === "SZ") {
        symbol = `sz${code}`
      } else if (market === "HK") {
        symbol = `hk${code}`
      }

      // 实际项目中需要使用真实的股票API
      // const response = await axios.get(`http://hq.sinajs.cn/list=${symbol}`)

      // 模拟返回数据
      const mockPrice = this.generateMockPrice(code)
      return mockPrice
    } catch (error) {
      logger.error(`获取股票 ${code} 价格失败:`, error.message)
      return null
    }
  }

  // 生成模拟价格数据（开发测试用）
  generateMockPrice(code) {
    const basePrice = parseFloat(code.substring(3)) || 100
    const randomChange = (Math.random() - 0.5) * 10 // -5% 到 +5%
    const price = basePrice * (1 + randomChange / 100)

    return {
      price: parseFloat(price.toFixed(2)),
      changeAmount: parseFloat((price - basePrice).toFixed(2)),
      changePercent: parseFloat(randomChange.toFixed(2)),
      volume: Math.floor(Math.random() * 1000000),
      turnover: Math.floor(Math.random() * 100000000),
      high: parseFloat((price * 1.02).toFixed(2)),
      low: parseFloat((price * 0.98).toFixed(2)),
    }
  }

  // 更新前一日收盘价
  async updatePreviousClose() {
    try {
      logger.info("开始更新前一日收盘价...")

      const stocks = await Stock.findAll({
        where: { status: "active" },
      })

      const updatePromises = stocks.map((stock) =>
        stock.update({
          previous_close: stock.current_price,
        })
      )

      await Promise.all(updatePromises)

      logger.info("前一日收盘价更新完成")
    } catch (error) {
      logger.error("更新前一日收盘价失败:", error)
    }
  }

  // 更新推荐的当前收益
  async updateRecommendReturns() {
    try {
      const activeRecommends = await Recommend.findAll({
        where: { status: "active" },
        include: [
          {
            model: Stock,
            as: "stock",
            attributes: ["current_price"],
          },
        ],
      })

      const updatePromises = activeRecommends.map((recommend) => {
        const currentPrice = recommend.stock.current_price
        const entryPrice = recommend.entry_price
        const currentReturn = ((currentPrice - entryPrice) / entryPrice) * 100

        return recommend.update({
          current_price: currentPrice,
          current_return: currentReturn.toFixed(2),
        })
      })

      await Promise.all(updatePromises)
    } catch (error) {
      logger.error("更新推荐收益失败:", error)
    }
  }

  // 结算到期的推荐
  async settleExpiredRecommends() {
    try {
      logger.info("开始结算到期推荐...")

      const expiredRecommends = await Recommend.findAll({
        where: {
          status: "active",
          end_date: {
            [Op.lte]: new Date(),
          },
        },
      })

      const settlePromises = expiredRecommends.map((recommend) =>
        recommend.settle()
      )

      await Promise.all(settlePromises)

      logger.info(`结算完成，共结算 ${expiredRecommends.length} 条推荐`)
    } catch (error) {
      logger.error("结算推荐失败:", error)
    }
  }

  // 计算周排行
  async calculateWeeklyRanking() {
    try {
      logger.info("开始计算周排行榜...")

      const { Ranking } = require("../models")
      await Ranking.calculateRankings("weekly")

      logger.info("周排行榜计算完成")
    } catch (error) {
      logger.error("计算周排行榜失败:", error)
    }
  }

  // 计算月排行
  async calculateMonthlyRanking() {
    try {
      logger.info("开始计算月排行榜...")

      const { Ranking } = require("../models")
      await Ranking.calculateRankings("monthly")

      logger.info("月排行榜计算完成")
    } catch (error) {
      logger.error("计算月排行榜失败:", error)
    }
  }

  // 停止所有定时任务
  stop() {
    cron.getTasks().forEach((task) => task.stop())
    logger.info("股票更新定时任务已停止")
  }
}

// 导出单例
module.exports = new StockUpdateJob()
