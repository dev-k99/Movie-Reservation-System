const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { testConnection, syncDatabase, seedData } = require('./database');
const { errorHandler, requestLogger } = require('./middleware');

// Import routes
const authRoutes = require('./routes/auth');
const movieRoutes = require('./routes/movies');
const showtimeRoutes = require('./routes/showtimes');
const reservationRoutes = require('./routes/reservations');
const reportRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Movie Reservation API is running',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/showtimes', showtimeRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/reports', reportRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Initialize database and start server
const startServer = async () => {
  try {
    // Test database connection
    await testConnection();

    // Sync database (set force: true to reset database)
    await syncDatabase(process.env.DB_FORCE_SYNC === 'true');

    // Seed initial data
    await seedData();

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📝 API Documentation: http://localhost:${PORT}/health`);
      console.log(`\n📧 Admin credentials:`);
      console.log(`   Email: admin@moviereservation.com`);
      console.log(`   Password: Admin123!\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;