const express = require('express');
const router = express.Router();
const { models } = require('../database');
const { authenticate, isAdmin } = require('../middleware');
const { Op } = require('sequelize');

// Get all movies with optional filters
router.get('/', async (req, res, next) => {
  try {
    const { genre, search, page = 1, limit = 10 } = req.query;
    
    const where = {};
    
    if (genre) {
      where.genre = genre;
    }
    
    if (search) {
      where[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }

    const offset = (page - 1) * limit;

    const { count, rows: movies } = await models.Movie.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['releaseDate', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        movies,
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

// Get single movie
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const movie = await models.Movie.findByPk(id);
    
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }

    res.json({
      success: true,
      data: { movie }
    });
  } catch (error) {
    next(error);
  }
});

// Create movie (admin only)
router.post('/', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { title, description, posterImage, genre, duration, rating, releaseDate } = req.body;

    // Validation
    if (!title || !description || !genre || !duration || !releaseDate) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: title, description, genre, duration, releaseDate'
      });
    }

    const movie = await models.Movie.create({
      title,
      description,
      posterImage,
      genre,
      duration,
      rating: rating || 0.0,
      releaseDate: new Date(releaseDate)
    });

    res.status(201).json({
      success: true,
      message: 'Movie created successfully',
      data: { movie }
    });
  } catch (error) {
    next(error);
  }
});

// Update movie (admin only)
router.put('/:id', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, posterImage, genre, duration, rating, releaseDate } = req.body;

    const movie = await models.Movie.findByPk(id);
    
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }

    // Update fields
    if (title) movie.title = title;
    if (description) movie.description = description;
    if (posterImage !== undefined) movie.posterImage = posterImage;
    if (genre) movie.genre = genre;
    if (duration) movie.duration = duration;
    if (rating !== undefined) movie.rating = rating;
    if (releaseDate) movie.releaseDate = new Date(releaseDate);

    await movie.save();

    res.json({
      success: true,
      message: 'Movie updated successfully',
      data: { movie }
    });
  } catch (error) {
    next(error);
  }
});

// Delete movie (admin only)
router.delete('/:id', authenticate, isAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const movie = await models.Movie.findByPk(id);
    
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: 'Movie not found'
      });
    }

    await movie.destroy();

    res.json({
      success: true,
      message: 'Movie deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Get movie genres
router.get('/meta/genres', async (req, res, next) => {
  try {
    const genres = await models.Movie.findAll({
      attributes: [[models.sequelize.fn('DISTINCT', models.sequelize.col('genre')), 'genre']],
      raw: true
    });

    res.json({
      success: true,
      data: {
        genres: genres.map(g => g.genre)
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;