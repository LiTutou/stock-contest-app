const { sequelize } = require("../config/database")

// 导入所有模型
const User = require("./User")
const Stock = require("./Stock")
const Recommend = require("./Recommend")
const Follow = require("./Follow")
const Ranking = require("./Ranking")

// 定义关联关系
// 用户和推荐的关系
User.hasMany(Recommend, {
  foreignKey: "user_id",
  as: "recommends",
})

Recommend.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
})

// 股票和推荐的关系
Stock.hasMany(Recommend, {
  foreignKey: "stock_code",
  sourceKey: "code",
  as: "recommends",
})

Recommend.belongsTo(Stock, {
  foreignKey: "stock_code",
  targetKey: "code",
  as: "stock",
})

// 用户跟投关系
User.hasMany(Follow, {
  foreignKey: "user_id",
  as: "follows",
})

Follow.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
})

User.hasMany(Follow, {
  foreignKey: "target_user_id",
  as: "followers",
})

Follow.belongsTo(User, {
  foreignKey: "target_user_id",
  as: "target_user",
})

// 推荐跟投关系
Recommend.hasMany(Follow, {
  foreignKey: "recommend_id",
  as: "follows",
})

Follow.belongsTo(Recommend, {
  foreignKey: "recommend_id",
  as: "recommend",
})

// 用户排名关系
User.hasMany(Ranking, {
  foreignKey: "user_id",
  as: "rankings",
})

Ranking.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
})

// 导出所有模型和sequelize实例
module.exports = {
  sequelize,
  User,
  Stock,
  Recommend,
  Follow,
  Ranking,
}
