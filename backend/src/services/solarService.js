const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');

/**
 * Solar Energy Monitoring Service
 * Handles interaction with solar monitoring devices and data collection
 */
class SolarService {
  constructor() {
    this.solarApiUrl = process.env.SOLAR_API_URL || 'http://localhost:8080';
    this.solarApiKey = process.env.SOLAR_API_KEY;
  }

  /**
   * Fetch current solar energy production data from monitoring device
   * @returns {Promise<Object>} Current production data
   */
  async getCurrentProduction() {
    try {
      // In production, this would call actual solar monitoring API
      const response = await axios.get(`${this.solarApiUrl}/api/production`, {
        headers: {
          'Authorization': `Bearer ${this.solarApiKey}`
        }
      });

      return {
        production: response.data.production, // kWh
        timestamp: new Date(response.data.timestamp)
      };
    } catch (error) {
      // Fallback to simulated data for development
      console.warn('Solar API unavailable, using simulated data');
      return this.getSimulatedProduction();
    }
  }

  /**
   * Fetch current energy consumption data
   * @returns {Promise<Object>} Current consumption data
   */
  async getCurrentConsumption() {
    try {
      // Calculate total consumption from all active VMs
      const activeVMs = await prisma.virtualMachine.findMany({
        where: { status: 'RUNNING' },
        include: {
          usageRecords: {
            where: {
              timestamp: {
                gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
              }
            }
          }
        }
      });

      // Estimate power consumption based on VM resources
      let totalConsumption = 0;
      activeVMs.forEach(vm => {
        // Rough estimation: CPU cores * 50W + RAM GB * 5W
        const cpuPower = vm.cpu * 50; // Watts per core
        const ramPower = (vm.ram / 1024) * 5; // Watts per GB
        totalConsumption += (cpuPower + ramPower) / 1000; // Convert to kW
      });

      return {
        consumption: totalConsumption,
        vmCount: activeVMs.length,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error calculating consumption:', error);
      throw new Error('Failed to calculate energy consumption');
    }
  }

  /**
   * Calculate solar energy efficiency
   * @param {number} production - Energy produced (kWh)
   * @param {number} consumption - Energy consumed (kWh)
   * @returns {number} Efficiency percentage
   */
  calculateEfficiency(production, consumption) {
    if (production === 0) return 0;
    const efficiency = (consumption / production) * 100;
    return Math.min(efficiency, 100); // Cap at 100%
  }

  /**
   * Calculate environmental impact (CO2 savings)
   * @param {number} solarEnergy - Solar energy used (kWh)
   * @returns {Object} Environmental impact data
   */
  calculateEnvironmentalImpact(solarEnergy) {
    // Average CO2 emission: 0.5 kg per kWh (grid electricity)
    const co2PerKwh = 0.5;
    const co2Saved = solarEnergy * co2PerKwh;
    
    // Equivalent trees planted (1 tree absorbs ~21 kg CO2/year)
    const treesEquivalent = (co2Saved * 365) / 21;

    return {
      co2Saved: parseFloat(co2Saved.toFixed(2)), // kg
      treesEquivalent: parseFloat(treesEquivalent.toFixed(2)),
      solarEnergyUsed: parseFloat(solarEnergy.toFixed(2)) // kWh
    };
  }

  /**
   * Record solar data to database
   * @param {Object} data - Solar data to record
   * @returns {Promise<Object>} Created solar data record
   */
  async recordSolarData(data) {
    try {
      const { production, consumption } = data;
      const efficiency = this.calculateEfficiency(production, consumption);

      const solarData = await prisma.solarData.create({
        data: {
          production: parseFloat(production),
          consumption: parseFloat(consumption),
          efficiency: parseFloat(efficiency.toFixed(2)),
          timestamp: new Date()
        }
      });

      return solarData;
    } catch (error) {
      console.error('Error recording solar data:', error);
      throw new Error('Failed to record solar data');
    }
  }

  /**
   * Get solar data for a specific time period
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Solar data records
   */
  async getSolarDataByPeriod(startDate, endDate) {
    try {
      const solarData = await prisma.solarData.findMany({
        where: {
          timestamp: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: {
          timestamp: 'desc'
        }
      });

      return solarData;
    } catch (error) {
      console.error('Error fetching solar data:', error);
      throw new Error('Failed to fetch solar data');
    }
  }

  /**
   * Get aggregated solar statistics
   * @param {string} period - Period type ('day', 'week', 'month')
   * @returns {Promise<Object>} Aggregated statistics
   */
  async getSolarStatistics(period = 'day') {
    try {
      const now = new Date();
      let startDate;

      switch (period) {
        case 'day':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        default:
          startDate = new Date(now.setHours(0, 0, 0, 0));
      }

      const solarData = await this.getSolarDataByPeriod(startDate, new Date());

      if (solarData.length === 0) {
        return {
          totalProduction: 0,
          totalConsumption: 0,
          averageEfficiency: 0,
          environmentalImpact: this.calculateEnvironmentalImpact(0),
          dataPoints: 0
        };
      }

      const totalProduction = solarData.reduce((sum, record) => sum + parseFloat(record.production), 0);
      const totalConsumption = solarData.reduce((sum, record) => sum + parseFloat(record.consumption), 0);
      const averageEfficiency = solarData.reduce((sum, record) => sum + parseFloat(record.efficiency), 0) / solarData.length;

      return {
        totalProduction: parseFloat(totalProduction.toFixed(2)),
        totalConsumption: parseFloat(totalConsumption.toFixed(2)),
        averageEfficiency: parseFloat(averageEfficiency.toFixed(2)),
        environmentalImpact: this.calculateEnvironmentalImpact(totalProduction),
        dataPoints: solarData.length,
        period
      };
    } catch (error) {
      console.error('Error calculating solar statistics:', error);
      throw new Error('Failed to calculate solar statistics');
    }
  }

  /**
   * Get current solar system status
   * @returns {Promise<Object>} Current system status
   */
  async getSystemStatus() {
    try {
      const production = await this.getCurrentProduction();
      const consumption = await this.getCurrentConsumption();
      const efficiency = this.calculateEfficiency(production.production, consumption.consumption);

      // Check if system is operating normally
      const isHealthy = production.production > 0 && efficiency > 0;
      const batteryLevel = await this.getBatteryLevel();

      return {
        status: isHealthy ? 'operational' : 'warning',
        production: production.production,
        consumption: consumption.consumption,
        efficiency: parseFloat(efficiency.toFixed(2)),
        batteryLevel,
        activeVMs: consumption.vmCount,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting system status:', error);
      return {
        status: 'error',
        message: 'Unable to retrieve system status',
        timestamp: new Date()
      };
    }
  }

  /**
   * Get battery level (for backup power)
   * @returns {Promise<number>} Battery level percentage
   */
  async getBatteryLevel() {
    try {
      const response = await axios.get(`${this.solarApiUrl}/api/battery`, {
        headers: {
          'Authorization': `Bearer ${this.solarApiKey}`
        }
      });

      return response.data.level;
    } catch (error) {
      // Fallback to simulated data
      return Math.floor(Math.random() * 30) + 70; // 70-100%
    }
  }

  /**
   * Collect and record solar data (for scheduled jobs)
   * @returns {Promise<Object>} Recorded data
   */
  async collectAndRecordData() {
    try {
      const production = await this.getCurrentProduction();
      const consumption = await this.getCurrentConsumption();

      const recordedData = await this.recordSolarData({
        production: production.production,
        consumption: consumption.consumption
      });

      console.log('Solar data collected and recorded:', recordedData);
      return recordedData;
    } catch (error) {
      console.error('Error collecting solar data:', error);
      throw error;
    }
  }

  /**
   * Get simulated production data (for development/testing)
   * @returns {Object} Simulated production data
   */
  getSimulatedProduction() {
    const hour = new Date().getHours();
    let production = 0;

    // Simulate solar production based on time of day
    if (hour >= 6 && hour <= 18) {
      // Peak production between 10 AM and 2 PM
      if (hour >= 10 && hour <= 14) {
        production = Math.random() * 5 + 15; // 15-20 kWh
      } else {
        production = Math.random() * 10 + 5; // 5-15 kWh
      }
    }

    return {
      production: parseFloat(production.toFixed(2)),
      timestamp: new Date()
    };
  }
}

module.exports = new SolarService();
