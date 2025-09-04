// 初始化股票数据脚本
const { Stock } = require("../models")

const stockData = [
  {
    code: "600519",
    name: "贵州茅台",
    market: "SH",
    industry: "白酒",
    sector: "消费",
    current_price: 1680.5,
    previous_close: 1650.2,
    change_amount: 30.3,
    change_percent: 1.84,
    tags: ["白酒", "消费", "蓝筹"],
    is_popular: true,
  },
  {
    code: "000858",
    name: "五粮液",
    market: "SZ",
    industry: "白酒",
    sector: "消费",
    current_price: 158.2,
    previous_close: 160.5,
    change_amount: -2.3,
    change_percent: -1.43,
    tags: ["白酒", "消费"],
    is_popular: true,
  },
  {
    code: "002594",
    name: "比亚迪",
    market: "SZ",
    industry: "汽车",
    sector: "新能源",
    current_price: 268.88,
    previous_close: 260.15,
    change_amount: 8.73,
    change_percent: 3.36,
    tags: ["新能源", "汽车", "电池"],
    is_popular: true,
  },
  {
    code: "000001",
    name: "平安银行",
    market: "SZ",
    industry: "银行",
    sector: "金融",
    current_price: 12.85,
    previous_close: 12.76,
    change_amount: 0.09,
    change_percent: 0.71,
    tags: ["银行", "金融"],
  },
  {
    code: "600036",
    name: "招商银行",
    market: "SH",
    industry: "银行",
    sector: "金融",
    current_price: 42.5,
    previous_close: 42.1,
    change_amount: 0.4,
    change_percent: 0.95,
    tags: ["银行", "金融", "蓝筹"],
    is_popular: true,
  },
  {
    code: "300750",
    name: "宁德时代",
    market: "SZ",
    industry: "电池",
    sector: "新能源",
    current_price: 185.3,
    previous_close: 189.2,
    change_amount: -3.9,
    change_percent: -2.06,
    tags: ["电池", "新能源", "锂电"],
    is_popular: true,
  },
  {
    code: "000002",
    name: "万科A",
    market: "SZ",
    industry: "房地产",
    sector: "地产",
    current_price: 8.95,
    previous_close: 9.12,
    change_amount: -0.17,
    change_percent: -1.86,
    tags: ["房地产", "地产"],
  },
  {
    code: "600000",
    name: "浦发银行",
    market: "SH",
    industry: "银行",
    sector: "金融",
    current_price: 8.45,
    previous_close: 8.38,
    change_amount: 0.07,
    change_percent: 0.84,
    tags: ["银行", "金融"],
  },
]

async function initStockData() {
  try {
    console.log("开始初始化股票数据...")

    for (const stock of stockData) {
      const [stockRecord, created] = await Stock.findOrCreate({
        where: { code: stock.code },
        defaults: {
          ...stock,
          price_updated_at: new Date(),
        },
      })

      if (created) {
        console.log(`✅ 创建股票: ${stock.name} (${stock.code})`)
      } else {
        console.log(`⚠️  股票已存在: ${stock.name} (${stock.code})`)
      }
    }

    console.log("🎉 股票数据初始化完成！")
    console.log(`📊 共处理 ${stockData.length} 只股票`)

    // 显示统计
    const totalCount = await Stock.count()
    const popularCount = await Stock.count({ where: { is_popular: true } })

    console.log(`📈 数据库中共有 ${totalCount} 只股票`)
    console.log(`🔥 其中热门股票 ${popularCount} 只`)
  } catch (error) {
    console.error("❌ 初始化股票数据失败:", error)
  }
}

module.exports = { initStockData }

// 如果直接运行此脚本
if (require.main === module) {
  const { sequelize } = require("../config/database")

  sequelize
    .authenticate()
    .then(() => {
      console.log("数据库连接成功")
      return initStockData()
    })
    .then(() => {
      process.exit(0)
    })
    .catch((error) => {
      console.error("执行失败:", error)
      process.exit(1)
    })
}
