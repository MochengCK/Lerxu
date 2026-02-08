/**
 * BtLevelMigration - Handles migration of BT level data from localStorage to engine
 */
export class BtLevelMigration {
  constructor (api) {
    this.api = api
  }

  /**
   * Perform migration if needed
   * @returns {Promise<Object>} Migration result
   */
  async migrate () {
    const oldData = this.loadFromLocalStorage()

    if (!oldData || oldData.migrated) {
      return { needed: false }
    }

    try {
      // Validate and extract statistics
      const stats = this.validateAndExtract(oldData)

      // Send to engine
      await this.api.setBtStatistics(stats)

      // Mark as migrated
      this.markAsMigrated(oldData)

      console.log('[BT Migration] Successfully migrated statistics to engine:', stats)

      return {
        needed: true,
        success: true,
        stats
      }
    } catch (error) {
      console.error('[BT Migration] Migration failed:', error)
      return {
        needed: true,
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Validate and extract statistics from old localStorage data
   * @param {Object} oldData - Old localStorage data
   * @returns {Object} Validated statistics
   */
  validateAndExtract (oldData) {
    // Extract raw statistics from localStorage
    // Handle various data formats from different versions
    const stats = {
      downloadBytes: this.parseBigInt(oldData.totalDownloaded || oldData.downloadBytes || 0),
      uploadBytes: this.parseBigInt(oldData.totalUploaded || oldData.uploadBytes || 0),
      seedTimeSeconds: this.parseBigInt(oldData.totalSeedHours ? oldData.totalSeedHours * 3600 : (oldData.seedTimeSeconds || 0)),
      maxPeers: parseInt(oldData.totalPeers || oldData.maxPeers || 0)
    }

    // Validate ranges
    if (stats.downloadBytes < 0n) stats.downloadBytes = 0n
    if (stats.uploadBytes < 0n) stats.uploadBytes = 0n
    if (stats.seedTimeSeconds < 0n) stats.seedTimeSeconds = 0n
    if (stats.maxPeers < 0) stats.maxPeers = 0

    // Cap at reasonable maximums
    const MAX_BYTES = BigInt('18446744073709551615') // MAX_UINT64
    if (stats.downloadBytes > MAX_BYTES) stats.downloadBytes = MAX_BYTES
    if (stats.uploadBytes > MAX_BYTES) stats.uploadBytes = MAX_BYTES
    if (stats.seedTimeSeconds > MAX_BYTES) stats.seedTimeSeconds = MAX_BYTES

    return stats
  }

  /**
   * Parse value to BigInt safely
   * @param {*} value - Value to parse
   * @returns {BigInt} Parsed BigInt value
   */
  parseBigInt (value) {
    try {
      if (typeof value === 'bigint') {
        return value
      }
      if (typeof value === 'number') {
        return BigInt(Math.floor(value))
      }
      if (typeof value === 'string') {
        return BigInt(value)
      }
      return 0n
    } catch (error) {
      console.warn('[BT Migration] Failed to parse BigInt:', value, error)
      return 0n
    }
  }

  /**
   * Load data from localStorage
   * @returns {Object|null} Stored data or null
   */
  loadFromLocalStorage () {
    try {
      const data = localStorage.getItem('bt-user-stats')
      return data ? JSON.parse(data) : null
    } catch (error) {
      console.error('[BT Migration] Failed to parse localStorage data:', error)
      return null
    }
  }

  /**
   * Mark data as migrated in localStorage
   * @param {Object} oldData - Original data
   */
  markAsMigrated (oldData) {
    try {
      const updatedData = {
        ...oldData,
        migrated: true,
        migratedAt: Date.now()
      }
      localStorage.setItem('bt-user-stats', JSON.stringify(updatedData))
      console.log('[BT Migration] Marked as migrated in localStorage')
    } catch (error) {
      console.error('[BT Migration] Failed to mark as migrated:', error)
    }
  }

  /**
   * Check if migration is needed
   * @returns {boolean} True if migration is needed
   */
  isMigrationNeeded () {
    const oldData = this.loadFromLocalStorage()
    return oldData && !oldData.migrated
  }
}

export default BtLevelMigration
