const { Sequelize } = require('sequelize');
require('dotenv').config();

// PostgreSQL connection (works with both local and Render)
const sequelize = new Sequelize(
  process.env.DATABASE_URL || `postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'postgres'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'movie_reservation'}`,
  {
    dialect: 'postgres',
    dialectOptions: process.env.NODE_ENV === 'production' ? {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    } : {},
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Import models
const models = require('./models')(sequelize);

// Test connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
  }
};

// Sync database (safe & flexible)
const syncDatabase = async ({ force = false, alter = false } = {}) => {
  try {
    await sequelize.sync({ force, alter });

    console.log(
      `✅ Database synced successfully (force=${force}, alter=${alter})`
    );
  } catch (error) {
    console.error('❌ Error syncing database:', error);
    throw error; // important so server startup fails properly
  }
};


// Seed initial data
const seedData = async () => {
  const { User, Theater, Movie, Seat, Showtime } = models;

  try {
    // Create admin user if not exists
    const adminExists = await User.findOne({ where: { email: 'admin@moviereservation.com' } });
    
    if (!adminExists) {
      await User.create({
        email: 'admin@moviereservation.com',
        password: 'Admin123!',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin'
      });
      console.log('✅ Admin user created');
    }

    // Create theaters if not exist
    const theaterCount = await Theater.count();
    if (theaterCount === 0) {
      const theater1 = await Theater.create({
        name: 'Theater 1',
        totalSeats: 100,
        rows: 10,
        seatsPerRow: 10
      });

      const theater2 = await Theater.create({
        name: 'Theater 2',
        totalSeats: 60,
        rows: 6,
        seatsPerRow: 10
      });

      // Create seats for Theater 1
      const seats1 = [];
      const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      for (let i = 0; i < 10; i++) {
        for (let j = 1; j <= 10; j++) {
          let type = 'standard';
          if (i >= 7) type = 'premium'; // Last 3 rows are premium
          if (i === 9 && (j === 5 || j === 6)) type = 'vip'; // Center seats in last row are VIP

          seats1.push({
            theaterId: theater1.id,
            seatNumber: `${rows[i]}${j}`,
            row: rows[i],
            column: j,
            type
          });
        }
      }
      await Seat.bulkCreate(seats1);

      // Create seats for Theater 2
      const seats2 = [];
      for (let i = 0; i < 6; i++) {
        for (let j = 1; j <= 10; j++) {
          let type = 'standard';
          if (i >= 4) type = 'premium';

          seats2.push({
            theaterId: theater2.id,
            seatNumber: `${rows[i]}${j}`,
            row: rows[i],
            column: j,
            type
          });
        }
      }
      await Seat.bulkCreate(seats2);

      console.log('✅ Theaters and seats created');
    }

    // Create sample movies if not exist
    const movieCount = await Movie.count();
    if (movieCount === 0) {
      const movie1 = await Movie.create({
        title: 'The Dark Knight',
        description: 'Batman faces the Joker, a criminal mastermind who wants to plunge Gotham City into anarchy.',
        posterImage: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
        genre: 'Action',
        duration: 152,
        rating: 9.0,
        releaseDate: new Date('2008-07-18')
      });

      const movie2 = await Movie.create({
        title: 'Inception',
        description: 'A thief who steals corporate secrets through dream-sharing technology.',
        posterImage: 'https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg',
        genre: 'Sci-Fi',
        duration: 148,
        rating: 8.8,
        releaseDate: new Date('2010-07-16')
      });

      const movie3 = await Movie.create({
        title: 'The Shawshank Redemption',
        description: 'Two imprisoned men bond over a number of years, finding solace and eventual redemption.',
        posterImage: 'https://image.tmdb.org/t/p/w500/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
        genre: 'Drama',
        duration: 142,
        rating: 9.3,
        releaseDate: new Date('1994-09-23')
      });

      // Create showtimes for next 7 days
      const theaters = await Theater.findAll();
      const movies = [movie1, movie2, movie3];
      
      for (let day = 0; day < 7; day++) {
        const date = new Date();
        date.setDate(date.getDate() + day);
        date.setHours(0, 0, 0, 0);

        // Morning, afternoon, and evening shows
        const times = [
          { hour: 10, minute: 0 },
          { hour: 14, minute: 30 },
          { hour: 19, minute: 0 }
        ];

        for (const movie of movies) {
          for (const time of times) {
            const theater = theaters[Math.floor(Math.random() * theaters.length)];
            const startTime = new Date(date);
            startTime.setHours(time.hour, time.minute, 0, 0);
            
            const endTime = new Date(startTime);
            endTime.setMinutes(endTime.getMinutes() + movie.duration);

            await Showtime.create({
              movieId: movie.id,
              theaterId: theater.id,
              startTime,
              endTime,
              price: 10.00 + (Math.random() * 5), // $10-$15
              availableSeats: theater.totalSeats
            });
          }
        }
      }

      console.log('✅ Sample movies and showtimes created');
    }

    console.log('✅ Database seeded successfully');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
  }
};

module.exports = {
  sequelize,
  models,
  testConnection,
  syncDatabase,
  seedData
};