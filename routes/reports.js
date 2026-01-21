const express = require('express');
const router = express.Router();
const { models, sequelize } = require('../database');
const { authenticate, isAdmin } = require('../middleware');
const { Op } = require('sequelize');

/**
 * @swagger
 * /api/reports/stats:
 *   get:
 *     summary: Get overall system statistics
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Overall statistics retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
// Get overall statistics
router.get('/stats', authenticate, isAdmin, async (req, res, next) => {
  try {
    // Total users
    const totalUsers = await models.User.count();

    // Total movies
    const totalMovies = await models.Movie.count();

    // Total reservations
    const totalReservations = await models.Reservation.count({
      where: { status: 'confirmed' }
    });

    // Total revenue
    const revenueResult = await models.Reservation.findOne({
      where: { status: 'confirmed' },
      attributes: [[sequelize.fn('SUM', sequelize.col('totalPrice')), 'totalRevenue']],
      raw: true
    });

    // Recent reservations
    const recentReservations = await models.Reservation.count({
      where: {
        status: 'confirmed',
        createdAt: {
          [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      }
    });

    res.json({
      success: true,
      data: {
        totalUsers,
        totalMovies,
        totalReservations,
        totalRevenue: parseFloat(revenueResult?.totalRevenue || 0),
        recentReservations
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/reports/revenue:
 *   get:
 *     summary: Get revenue report for a date range
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Revenue report generated successfully
 *       400:
 *         description: Missing or invalid dates
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
// Get revenue report
router.get('/revenue', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Get revenue by showtime
    const revenueData = await models.Reservation.findAll({
      where: {
        status: 'confirmed',
        createdAt: {
          [Op.between]: [start, end]
        }
      },
      include: [
        {
          model: models.Showtime,
          include: [
            {
              model: models.Movie,
              attributes: ['id', 'title']
            }
          ]
        }
      ],
      attributes: [
        'showtimeId',
        [sequelize.fn('COUNT', sequelize.col('Reservation.id')), 'totalBookings'],
        [sequelize.fn('SUM', sequelize.col('Reservation.totalPrice')), 'totalRevenue']
      ],
      group: ['showtimeId', 'Showtime.id', 'Showtime.Movie.id'],
      raw: false
    });

    // Calculate totals
    const summary = {
      totalBookings: 0,
      totalRevenue: 0
    };

    const formattedData = revenueData.map(item => {
      const bookings = parseInt(item.dataValues.totalBookings);
      const revenue = parseFloat(item.dataValues.totalRevenue);
      
      summary.totalBookings += bookings;
      summary.totalRevenue += revenue;

      return {
        movie: {
          id: item.Showtime.Movie.id,
          title: item.Showtime.Movie.title
        },
        showtime: {
          id: item.Showtime.id,
          startTime: item.Showtime.startTime
        },
        totalBookings: bookings,
        totalRevenue: revenue
      };
    });

    res.json({
      success: true,
      data: {
        summary,
        details: formattedData
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/reports/capacity:
 *   get:
 *     summary: Get theater capacity and occupancy report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Capacity report generated successfully
 *       400:
 *         description: Missing date parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
// Get capacity report
router.get('/capacity', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const showtimes = await models.Showtime.findAll({
      where: {
        startTime: {
          [Op.between]: [start, end]
        }
      },
      include: [
        {
          model: models.Movie,
          attributes: ['id', 'title']
        },
        {
          model: models.Theater,
          attributes: ['id', 'name', 'totalSeats']
        }
      ],
      order: [['startTime', 'ASC']]
    });

    const capacityData = showtimes.map(showtime => {
      const totalSeats = showtime.Theater.totalSeats;
      const bookedSeats = totalSeats - showtime.availableSeats;
      const occupancyRate = (bookedSeats / totalSeats) * 100;

      return {
        showtimeId: showtime.id,
        movie: {
          id: showtime.Movie.id,
          title: showtime.Movie.title
        },
        theater: {
          id: showtime.Theater.id,
          name: showtime.Theater.name
        },
        startTime: showtime.startTime,
        totalSeats,
        bookedSeats,
        availableSeats: showtime.availableSeats,
        occupancyRate: occupancyRate.toFixed(2)
      };
    });

    // Calculate average occupancy
    const avgOccupancy = capacityData.length > 0
      ? capacityData.reduce((sum, item) => sum + parseFloat(item.occupancyRate), 0) / capacityData.length
      : 0;

    res.json({
      success: true,
      data: {
        averageOccupancy: avgOccupancy.toFixed(2),
        showtimes: capacityData
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/reports/popular-movies:
 *   get:
 *     summary: Get most popular movies by bookings
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Popular movies retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
// Get popular movies report
router.get('/popular-movies', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { startDate, endDate, limit = 10 } = req.query;

    const where = { status: 'confirmed' };

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      where.createdAt = {
        [Op.between]: [start, end]
      };
    }

    const popularMovies = await models.Reservation.findAll({
      where,
      include: [
        {
          model: models.Showtime,
          include: [
            {
              model: models.Movie,
              attributes: ['id', 'title', 'genre', 'posterImage']
            }
          ]
        }
      ],
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('Reservation.id')), 'totalBookings'],
        [sequelize.fn('SUM', sequelize.col('Reservation.totalPrice')), 'totalRevenue']
      ],
      group: ['Showtime.Movie.id'],
      order: [[sequelize.literal('totalBookings'), 'DESC']],
      limit: parseInt(limit),
      raw: false,
      subQuery: false
    });

    const formattedData = popularMovies.map(item => ({
      movie: {
        id: item.Showtime.Movie.id,
        title: item.Showtime.Movie.title,
        genre: item.Showtime.Movie.genre,
        posterImage: item.Showtime.Movie.posterImage
      },
      totalBookings: parseInt(item.dataValues.totalBookings),
      totalRevenue: parseFloat(item.dataValues.totalRevenue)
    }));

    res.json({
      success: true,
      data: { popularMovies: formattedData }
    });
  } catch (error) {
    next(error);
  }
});


/**
 * @swagger
 * /api/reports/peak-times:
 *   get:
 *     summary: Get peak booking times
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Peak times retrieved successfully
 *       400:
 *         description: Missing date parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
// Get peak times report
router.get('/peak-times', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const bookingsByHour = await models.Reservation.findAll({
      where: {
        status: 'confirmed',
        createdAt: {
          [Op.between]: [start, end]
        }
      },
      include: [
        {
          model: models.Showtime,
          attributes: ['startTime']
        }
      ],
      attributes: [
        [sequelize.fn('HOUR', sequelize.col('Showtime.startTime')), 'hour'],
        [sequelize.fn('COUNT', sequelize.col('Reservation.id')), 'totalBookings']
      ],
      group: [sequelize.fn('HOUR', sequelize.col('Showtime.startTime'))],
      order: [[sequelize.literal('totalBookings'), 'DESC']],
      raw: true
    });

    const formattedData = bookingsByHour.map(item => ({
      hour: parseInt(item.hour),
      timeSlot: `${item.hour}:00 - ${parseInt(item.hour) + 1}:00`,
      totalBookings: parseInt(item.totalBookings)
    }));

    res.json({
      success: true,
      data: { peakTimes: formattedData }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;