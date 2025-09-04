const { Sequelize } = require("sequelize")
require("dotenv").config()

// 数据库连接配置
const sequelize = new Sequelize(
  process.env.DB_NAME || "stock_contest",
  process.env.DB_USER || "root",
  process.env.DB_PASSWORD || "",
  {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    logging: process.env.NODE_ENV === "development" ? console.log : false,
    timezone: "+08:00", // 设置时区为北京时间
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      timestamps: true, // 自动添加 createdAt 和 updatedAt
      underscored: true, // 使用下划线命名
      freezeTableName: true, // 不自动复数化表名
      charset: "utf8mb4",
      collate: "utf8mb4_unicode_ci",
    },
  }
)

module.exports = { sequelize }
