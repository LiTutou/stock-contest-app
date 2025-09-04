const redis = require("redis")
const logger = require("./logger")

class CacheManager {
  constructor() {
    this.client = null
    this.isConnected = false
    this.defaultTTL = 300 // 默认5分钟过期
  }

  // 初始化Redis连接
  async init() {
    try {
      // 如果没有配置Redis，使用内存缓存
      if (!process.env.REDIS_HOST) {
        logger.info("Redis未配置，使用内存缓存")
        this.useMemoryCache()
        return
      }

      this.client = redis.createClient({
        host: process.env.REDIS_HOST || "localhost",
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        retry_strategy: (options) => {
          if (options.error && options.error.code === "ECONNREFUSED") {
            logger.error("Redis连接被拒绝")
            return new Error("Redis连接被拒绝")
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            logger.error("Redis重试超时")
            return new Error("Redis重试超时")
          }
          if (options.attempt > 10) {
            return undefined
          }
          return Math.min(options.attempt * 100, 3000)
        },
      })

      await this.client.connect()

      this.client.on("connect", () => {
        this.isConnected = true
        logger.info("Redis连接成功")
      })

      this.client.on("error", (err) => {
        this.isConnected = false
        logger.error("Redis错误:", err)
      })
    } catch (error) {
      logger.error("初始化缓存失败:", error)
      this.useMemoryCache()
    }
  }

  // 使用内存缓存作为后备方案
  useMemoryCache() {
    this.memoryCache = new Map()
    this.isConnected = true

    // 定期清理过期缓存
    setInterval(() => {
      const now = Date.now()
      for (const [key, value] of this.memoryCache.entries()) {
        if (value.expireAt && value.expireAt < now) {
          this.memoryCache.delete(key)
        }
      }
    }, 60000) // 每分钟清理一次
  }

  // 获取缓存
  async get(key) {
    try {
      if (this.memoryCache) {
        const item = this.memoryCache.get(key)
        if (item) {
          if (!item.expireAt || item.expireAt > Date.now()) {
            return JSON.parse(item.value)
          }
          this.memoryCache.delete(key)
        }
        return null
      }

      if (!this.isConnected) return null

      const value = await this.client.get(key)
      return value ? JSON.parse(value) : null
    } catch (error) {
      logger.error(`获取缓存失败 [${key}]:`, error)
      return null
    }
  }

  // 设置缓存
  async set(key, value, ttl = this.defaultTTL) {
    try {
      const jsonValue = JSON.stringify(value)

      if (this.memoryCache) {
        this.memoryCache.set(key, {
          value: jsonValue,
          expireAt: ttl > 0 ? Date.now() + ttl * 1000 : null,
        })
        return true
      }

      if (!this.isConnected) return false

      if (ttl > 0) {
        await this.client.setEx(key, ttl, jsonValue)
      } else {
        await this.client.set(key, jsonValue)
      }
      return true
    } catch (error) {
      logger.error(`设置缓存失败 [${key}]:`, error)
      return false
    }
  }

  // 删除缓存
  async del(key) {
    try {
      if (this.memoryCache) {
        return this.memoryCache.delete(key)
      }

      if (!this.isConnected) return false

      await this.client.del(key)
      return true
    } catch (error) {
      logger.error(`删除缓存失败 [${key}]:`, error)
      return false
    }
  }

  // 批量删除缓存（按模式）
  async delPattern(pattern) {
    try {
      if (this.memoryCache) {
        const regex = new RegExp(pattern.replace("*", ".*"))
        for (const key of this.memoryCache.keys()) {
          if (regex.test(key)) {
            this.memoryCache.delete(key)
          }
        }
        return true
      }

      if (!this.isConnected) return false

      const keys = await this.client.keys(pattern)
      if (keys.length > 0) {
        await this.client.del(...keys)
      }
      return true
    } catch (error) {
      logger.error(`批量删除缓存失败 [${pattern}]:`, error)
      return false
    }
  }

  // 缓存装饰器
  cache(keyPrefix, ttl = this.defaultTTL) {
    return (target, propertyName, descriptor) => {
      const originalMethod = descriptor.value

      descriptor.value = async function (...args) {
        const cacheKey = `${keyPrefix}:${JSON.stringify(args)}`

        // 尝试从缓存获取
        const cached = await this.get(cacheKey)
        if (cached) {
          logger.debug(`缓存命中: ${cacheKey}`)
          return cached
        }

        // 执行原方法
        const result = await originalMethod.apply(this, args)

        // 存入缓存
        await this.set(cacheKey, result, ttl)

        return result
      }

      return descriptor
    }
  }

  // 清除所有缓存
  async flush() {
    try {
      if (this.memoryCache) {
        this.memoryCache.clear()
        return true
      }

      if (!this.isConnected) return false

      await this.client.flushAll()
      logger.info("所有缓存已清除")
      return true
    } catch (error) {
      logger.error("清除缓存失败:", error)
      return false
    }
  }

  // 关闭连接
  async close() {
    try {
      if (this.client && this.isConnected) {
        await this.client.quit()
        this.isConnected = false
        logger.info("Redis连接已关闭")
      }

      if (this.memoryCache) {
        this.memoryCache.clear()
      }
    } catch (error) {
      logger.error("关闭缓存连接失败:", error)
    }
  }

  // 检查连接状态
  isConnected() {
    return this.isConnected
  }
}

// 导出单例
module.exports = new CacheManager()
