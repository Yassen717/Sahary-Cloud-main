const cron = require('node-cron');
const solarService = require('../services/solarService');

/**
 * Solar Data Collector Job
 * Collects and records solar energy data at regular intervals
 */
class SolarDataCollector {
  constructor() {
    this.task = null;
    this.isRunning = false;
    // Collect data every 15 minutes
    this.schedule = process.env.SOLAR_COLLECTION_SCHEDULE || '*/15 * * * *';
  }

  /**
   * Start the solar data collection job
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️  Solar data collector is already running');
      return;
    }

    this.task = cron.schedule(this.schedule, async () => {
      try {
        console.log('🌞 Starting solar data collection...');
        const data = await solarService.collectAndRecordData();
        console.log('✅ Solar data collected successfully:', {
          production: data.production,
          consumption: data.consumption,
          efficiency: data.efficiency,
          timestamp: data.timestamp
        });
      } catch (error) {
        console.error('❌ Error collecting solar data:', error.message);
      }
    });

    this.isRunning = true;
    console.log(`🌞 Solar data collector started (Schedule: ${this.schedule})`);
    
    // Collect initial data immediately
    this.collectNow();
  }

  /**
   * Stop the solar data collection job
   */
  stop() {
    if (this.task) {
      this.task.stop();
      this.isRunning = false;
      console.log('🛑 Solar data collector stopped');
    }
  }

  /**
   * Manually trigger data collection
   */
  async collectNow() {
    try {
      console.log('🌞 Manual solar data collection triggered...');
      const data = await solarService.collectAndRecordData();
      console.log('✅ Solar data collected:', data);
      return data;
    } catch (error) {
      console.error('❌ Error in manual collection:', error.message);
      throw error;
    }
  }

  /**
   * Get collector status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      schedule: this.schedule,
      nextRun: this.task ? this.task.nextDate() : null
    };
  }
}

module.exports = new SolarDataCollector();
