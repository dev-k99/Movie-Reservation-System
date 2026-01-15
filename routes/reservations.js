const express = require('express');
const router = express.Router();
const { models, sequelize } = require('../database');
const { authenticate, isAdmin } = require('../middleware');

// Generate booking reference
const generateBookingReference = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let reference = '';
  for (let i = 0; i < 8; i++) {
    reference += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return reference;
};

// Create reservation
router.post('/', authenticate, async (req, res, next) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { showtimeId, seatIds } = req.body;
    const userId = req.user.id;

    // Validation
    if (!showtimeId || !seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Showtime ID and seat IDs are required'
      });
    }

    // Get showtime with lock to prevent race conditions
    const showtime = await models.Showtime.findByPk(showtimeId, {
      include: [models.Movie, models.Theater],
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!showtime) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Showtime not found'
      });
    }

    // Check if showtime is in the future
    if (new Date(showtime.startTime) < new Date()) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot book seats for past showtimes'
      });
    }

    // Verify all seats exist and belong to the correct theater
    const seats = await models.Seat.findAll({
      where: {
        id: seatIds,
        theaterId: showtime.theaterId
      },
      transaction
    });

    if (seats.length !== seatIds.length) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'One or more seats are invalid'
      });
    }

    // Check if seats are already reserved for this showtime
    const existingReservations = await models.ReservedSeat.findAll({
      where: {
        showtimeId,
        seatId: seatIds
      },
      include: [{
        model: models.Reservation,
        where: { status: 'confirmed' }
      }],
      transaction
    });

    if (existingReservations.length > 0) {
      await transaction.rollback();
      const reservedSeatNumbers = existingReservations.map(rs => 
        seats.find(s => s.id === rs.seatId)?.seatNumber
      );
      return res.status(400).json({
        success: false,
        message: `Seats already reserved: ${reservedSeatNumbers.join(', ')}`
      });
    }

    // Check if enough seats are available
    if (showtime.availableSeats < seatIds.length) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Not enough seats available'
      });
    }

    // Calculate total price (can add seat type pricing here)
    const totalPrice = parseFloat(showtime.price) * seatIds.length;

    // Generate unique booking reference
    let bookingReference;
    let isUnique = false;
    while (!isUnique) {
      bookingReference = generateBookingReference();
      const existing = await models.Reservation.findOne({
        where: { bookingReference },
        transaction
      });
      if (!existing) isUnique = true;
    }

    // Create reservation
    const reservation = await models.Reservation.create({
      userId,
      showtimeId,
      totalPrice,
      status: 'confirmed',
      bookingReference
    }, { transaction });

    // Create reserved seats
    const reservedSeats = seatIds.map(seatId => ({
      reservationId: reservation.id,
      seatId,
      showtimeId
    }));

    await models.ReservedSeat.bulkCreate(reservedSeats, { transaction });

    // Update available seats count
    showtime.availableSeats -= seatIds.length;
    await showtime.save({ transaction });

    await transaction.commit();

    // Fetch complete reservation with details
    const completeReservation = await models.Reservation.findByPk(reservation.id, {
      include: [
        {
          model: models.Showtime,
          include: [models.Movie, models.Theater]
        },
        {
          model: models.ReservedSeat,
          include: [models.Seat]
        }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Reservation created successfully',
      data: {
        reservation: {
          id: completeReservation.id,
          bookingReference: completeReservation.bookingReference,
          totalPrice: completeReservation.totalPrice,
          status: completeReservation.status,
          movie: completeReservation.Showtime.Movie,
          theater: completeReservation.Showtime.Theater,
          showtime: {
            startTime: completeReservation.Showtime.startTime,
            endTime: completeReservation.Showtime.endTime
          },
          seats: completeReservation.ReservedSeats.map(rs => ({
            seatNumber: rs.Seat.seatNumber,
            row: rs.Seat.row,
            column: rs.Seat.column,
            type: rs.Seat.type
          }))
        }
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
});

// Get user's reservations
router.get('/my-reservations', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { status, upcoming } = req.query;

    const where = { userId };
    
    if (status) {
      where.status = status;
    }

    const reservations = await models.Reservation.findAll({
      where,
      include: [
        {
          model: models.Showtime,
          include: [models.Movie, models.Theater]
        },
        {
          model: models.ReservedSeat,
          include: [models.Seat]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Filter upcoming if requested
    let filteredReservations = reservations;
    if (upcoming === 'true') {
      const now = new Date();
      filteredReservations = reservations.filter(r => 
        new Date(r.Showtime.startTime) > now && r.status === 'confirmed'
      );
    }

    const formattedReservations = filteredReservations.map(r => ({
      id: r.id,
      bookingReference: r.bookingReference,
      totalPrice: r.totalPrice,
      status: r.status,
      createdAt: r.createdAt,
      movie: {
        id: r.Showtime.Movie.id,
        title: r.Showtime.Movie.title,
        posterImage: r.Showtime.Movie.posterImage,
        genre: r.Showtime.Movie.genre,
        duration: r.Showtime.Movie.duration
      },
      theater: {
        id: r.Showtime.Theater.id,
        name: r.Showtime.Theater.name
      },
      showtime: {
        id: r.Showtime.id,
        startTime: r.Showtime.startTime,
        endTime: r.Showtime.endTime
      },
      seats: r.ReservedSeats.map(rs => ({
        seatNumber: rs.Seat.seatNumber,
        row: rs.Seat.row,
        column: rs.Seat.column,
        type: rs.Seat.type
      }))
    }));

    res.json({
      success: true,
      data: { reservations: formattedReservations }
    });
  } catch (error) {
    next(error);
  }
});

// Get single reservation
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const isUserAdmin = req.user.role === 'admin';

    const where = { id };
    if (!isUserAdmin) {
      where.userId = userId;
    }

    const reservation = await models.Reservation.findOne({
      where,
      include: [
        {
          model: models.Showtime,
          include: [models.Movie, models.Theater]
        },
        {
          model: models.ReservedSeat,
          include: [models.Seat]
        }
      ]
    });

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Reservation not found'
      });
    }

    res.json({
      success: true,
      data: { reservation }
    });
  } catch (error) {
    next(error);
  }
});

// Cancel reservation
router.delete('/:id', authenticate, async (req, res, next) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const reservation = await models.Reservation.findOne({
      where: { 
        id, 
        userId,
        status: 'confirmed'
      },
      include: [
        {
          model: models.Showtime,
          include: [models.Theater]
        },
        {
          model: models.ReservedSeat
        }
      ],
      lock: transaction.LOCK.UPDATE,
      transaction
    });

    if (!reservation) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Reservation not found or already cancelled'
      });
    }

    // Check if showtime is in the future
    if (new Date(reservation.Showtime.startTime) < new Date()) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel past reservations'
      });
    }

    // Update reservation status
    reservation.status = 'cancelled';
    await reservation.save({ transaction });

    // Return seats to available pool
    const showtime = await models.Showtime.findByPk(reservation.showtimeId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    });
    
    showtime.availableSeats += reservation.ReservedSeats.length;
    await showtime.save({ transaction });

    await transaction.commit();

    res.json({
      success: true,
      message: 'Reservation cancelled successfully'
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
});

// Get all reservations (admin only)
router.get('/admin/all', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const where = {};
    if (status) {
      where.status = status;
    }

    const offset = (page - 1) * limit;

    const { count, rows: reservations } = await models.Reservation.findAndCountAll({
      where,
      include: [
        {
          model: models.User,
          attributes: ['id', 'email', 'firstName', 'lastName']
        },
        {
          model: models.Showtime,
          include: [models.Movie, models.Theater]
        },
        {
          model: models.ReservedSeat,
          include: [models.Seat]
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        reservations,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;