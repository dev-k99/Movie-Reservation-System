const express = require('express');
const router = express.Router();
const { models } = require('../database');
const { authenticate, isAdmin } = require('../middleware');
const { Op } = require('sequelize');



/**
 * @swagger
 * /api/showtimes:
 *   get:
 *     summary: Get showtimes for a specific date (optionally filter by movie)
 *     tags: [Showtimes]
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           example: '2026-01-21'
 *       - in: query
 *         name: movieId
 *         required: false
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of showtimes
 *       400:
 *         description: Missing date parameter
 */
// Get showtimes for a specific date
router.get('/', async (req, res, next) => {
  try {
    const { date, movieId } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required (format: YYYY-MM-DD)'
      });
    }

    const searchDate = new Date(date);
    const nextDay = new Date(searchDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const where = {
      startTime: {
        [Op.gte]: searchDate,
        [Op.lt]: nextDay
      }
    };

    if (movieId) {
      where.movieId = movieId;
    }

    const showtimes = await models.Showtime.findAll({
      where,
      include: [
        {
          model: models.Movie,
          attributes: ['id', 'title', 'posterImage', 'genre', 'duration', 'rating']
        },
        {
          model: models.Theater,
          attributes: ['id', 'name', 'totalSeats']
        }
      ],
      order: [['startTime', 'ASC']]
    });

    res.json({
      success: true,
      data: { showtimes }
    });
  } catch (error) {
    next(error);
  }
});


/**
 * @swagger
 * /api/showtimes/{id}:
 *   get:
 *     summary: Get single showtime with seats availability
 *     tags: [Showtimes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Showtime details with seat availability
 *       404:
 *         description: Showtime not found
 */
// Get single showtime with available seats
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const showtime = await models.Showtime.findByPk(id, {
      include: [
        {
          model: models.Movie,
          attributes: ['id', 'title', 'posterImage', 'genre', 'duration', 'rating']
        },
        {
          model: models.Theater,
          attributes: ['id', 'name', 'totalSeats', 'rows', 'seatsPerRow']
        }
      ]
    });

    if (!showtime) {
      return res.status(404).json({
        success: false,
        message: 'Showtime not found'
      });
    }

    // Get all seats for the theater
    const allSeats = await models.Seat.findAll({
      where: { theaterId: showtime.theaterId },
      order: [['row', 'ASC'], ['column', 'ASC']]
    });

    // Get reserved seats for this showtime
    const reservedSeats = await models.ReservedSeat.findAll({
      where: { showtimeId: id },
      include: [
        {
          model: models.Seat,
          attributes: ['id', 'seatNumber', 'row', 'column', 'type']
        },
        {
          model: models.Reservation,
          where: { status: 'confirmed' },
          attributes: []
        }
      ]
    });

    const reservedSeatIds = reservedSeats.map(rs => rs.seatId);

    // Mark seats as available or reserved
    const seatsWithStatus = allSeats.map(seat => ({
      id: seat.id,
      seatNumber: seat.seatNumber,
      row: seat.row,
      column: seat.column,
      type: seat.type,
      isAvailable: !reservedSeatIds.includes(seat.id)
    }));

    res.json({
      success: true,
      data: {
        showtime,
        seats: seatsWithStatus
      }
    });
  } catch (error) {
    next(error);
  }
});


/**
 * @swagger
 * /api/showtimes:
 *   post:
 *     summary: Create a new showtime (admin only)
 *     tags: [Showtimes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - movieId
 *               - theaterId
 *               - startTime
 *               - price
 *             properties:
 *               movieId:
 *                 type: integer
 *               theaterId:
 *                 type: integer
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               price:
 *                 type: number
 *     responses:
 *       201:
 *         description: Showtime created successfully
 *       400:
 *         description: Invalid input or schedule conflict
 */
// Create showtime (admin only)
router.post('/', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { movieId, theaterId, startTime, price } = req.body;

    // Validation
    if (!movieId || !theaterId || !startTime || !price) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: movieId, theaterId, startTime, price'
      });
    }

    // Get movie to calculate end time
    const movie = await models.Movie.findByPk(movieId);
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }

    // Get theater to set available seats
    const theater = await models.Theater.findByPk(theaterId);
    if (!theater) {
      return res.status(404).json({
        success: false,
        message: 'Theater not found'
      });
    }

    const start = new Date(startTime);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + movie.duration);

    // Check for scheduling conflicts
    const conflictingShowtime = await models.Showtime.findOne({
      where: {
        theaterId,
        [Op.or]: [
          {
            startTime: {
              [Op.between]: [start, end]
            }
          },
          {
            endTime: {
              [Op.between]: [start, end]
            }
          },
          {
            [Op.and]: [
              { startTime: { [Op.lte]: start } },
              { endTime: { [Op.gte]: end } }
            ]
          }
        ]
      }
    });

    if (conflictingShowtime) {
      return res.status(400).json({
        success: false,
        message: 'Theater is already booked for this time slot'
      });
    }

    const showtime = await models.Showtime.create({
      movieId,
      theaterId,
      startTime: start,
      endTime: end,
      price,
      availableSeats: theater.totalSeats
    });

    res.status(201).json({
      success: true,
      message: 'Showtime created successfully',
      data: { showtime }
    });
  } catch (error) {
    next(error);
  }
});



/**
 * @swagger
 * /api/showtimes/{id}:
 *   put:
 *     summary: Update a showtime (admin only)
 *     tags: [Showtimes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startTime:
 *                 type: string
 *                 format: date-time
 *               price:
 *                 type: number
 *     responses:
 *       200:
 *         description: Showtime updated successfully
 *       400:
 *         description: Cannot update showtime with reservations
 */
// Update showtime (admin only)
router.put('/:id', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { startTime, price } = req.body;

    const showtime = await models.Showtime.findByPk(id);
    
    if (!showtime) {
      return res.status(404).json({
        success: false,
        message: 'Showtime not found'
      });
    }

    // Check if showtime has reservations
    const reservationCount = await models.Reservation.count({
      where: { 
        showtimeId: id,
        status: 'confirmed'
      }
    });

    if (reservationCount > 0 && startTime) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change start time for showtime with existing reservations'
      });
    }

    if (startTime) {
      const movie = await models.Movie.findByPk(showtime.movieId);
      const start = new Date(startTime);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + movie.duration);
      
      showtime.startTime = start;
      showtime.endTime = end;
    }

    if (price) {
      showtime.price = price;
    }

    await showtime.save();

    res.json({
      success: true,
      message: 'Showtime updated successfully',
      data: { showtime }
    });
  } catch (error) {
    next(error);
  }
});



/**
 * @swagger
 * /api/showtimes/{id}:
 *   delete:
 *     summary: Delete a showtime (admin only)
 *     tags: [Showtimes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Showtime deleted successfully
 *       400:
 *         description: Cannot delete showtime with reservations
 */
// Delete showtime (admin only)
router.delete('/:id', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const showtime = await models.Showtime.findByPk(id);
    
    if (!showtime) {
      return res.status(404).json({
        success: false,
        message: 'Showtime not found'
      });
    }

    // Check if showtime has confirmed reservations
    const reservationCount = await models.Reservation.count({
      where: { 
        showtimeId: id,
        status: 'confirmed'
      }
    });

    if (reservationCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete showtime with existing reservations'
      });
    }

    await showtime.destroy();

    res.json({
      success: true,
      message: 'Showtime deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;