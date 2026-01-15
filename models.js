const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');

module.exports = (sequelize) => {
  // User Model
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('admin', 'user'),
      defaultValue: 'user'
    }
  }, {
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      }
    }
  });

  User.prototype.validatePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
  };

  // Movie Model
  const Movie = sequelize.define('Movie', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    posterImage: {
      type: DataTypes.STRING,
      allowNull: true
    },
    genre: {
      type: DataTypes.STRING,
      allowNull: false
    },
    duration: {
      type: DataTypes.INTEGER, // in minutes
      allowNull: false
    },
    rating: {
      type: DataTypes.DECIMAL(2, 1),
      defaultValue: 0.0
    },
    releaseDate: {
      type: DataTypes.DATE,
      allowNull: false
    }
  });

  // Theater Model
  const Theater = sequelize.define('Theater', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    totalSeats: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    rows: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    seatsPerRow: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  });

  // Showtime Model
  const Showtime = sequelize.define('Showtime', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    movieId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    theaterId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: false
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    availableSeats: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  });

  // Seat Model
  const Seat = sequelize.define('Seat', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    theaterId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    seatNumber: {
      type: DataTypes.STRING,
      allowNull: false
    },
    row: {
      type: DataTypes.STRING,
      allowNull: false
    },
    column: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('standard', 'premium', 'vip'),
      defaultValue: 'standard'
    }
  });

  // Reservation Model
  const Reservation = sequelize.define('Reservation', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    showtimeId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    totalPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('confirmed', 'cancelled'),
      defaultValue: 'confirmed'
    },
    bookingReference: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    }
  });

  // ReservedSeat Model (Junction table with additional info)
  const ReservedSeat = sequelize.define('ReservedSeat', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    reservationId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    seatId: {
      type: DataTypes.UUID,
      allowNull: false
    },
    showtimeId: {
      type: DataTypes.UUID,
      allowNull: false
    }
  });

  // Define Relationships
  
  // Movie - Showtime (One-to-Many)
  Movie.hasMany(Showtime, { foreignKey: 'movieId', onDelete: 'CASCADE' });
  Showtime.belongsTo(Movie, { foreignKey: 'movieId' });

  // Theater - Showtime (One-to-Many)
  Theater.hasMany(Showtime, { foreignKey: 'theaterId', onDelete: 'CASCADE' });
  Showtime.belongsTo(Theater, { foreignKey: 'theaterId' });

  // Theater - Seat (One-to-Many)
  Theater.hasMany(Seat, { foreignKey: 'theaterId', onDelete: 'CASCADE' });
  Seat.belongsTo(Theater, { foreignKey: 'theaterId' });

  // User - Reservation (One-to-Many)
  User.hasMany(Reservation, { foreignKey: 'userId', onDelete: 'CASCADE' });
  Reservation.belongsTo(User, { foreignKey: 'userId' });

  // Showtime - Reservation (One-to-Many)
  Showtime.hasMany(Reservation, { foreignKey: 'showtimeId', onDelete: 'CASCADE' });
  Reservation.belongsTo(Showtime, { foreignKey: 'showtimeId' });

  // Reservation - ReservedSeat (One-to-Many)
  Reservation.hasMany(ReservedSeat, { foreignKey: 'reservationId', onDelete: 'CASCADE' });
  ReservedSeat.belongsTo(Reservation, { foreignKey: 'reservationId' });

  // Seat - ReservedSeat (One-to-Many)
  Seat.hasMany(ReservedSeat, { foreignKey: 'seatId', onDelete: 'CASCADE' });
  ReservedSeat.belongsTo(Seat, { foreignKey: 'seatId' });

  // Showtime - ReservedSeat (One-to-Many)
  Showtime.hasMany(ReservedSeat, { foreignKey: 'showtimeId', onDelete: 'CASCADE' });
  ReservedSeat.belongsTo(Showtime, { foreignKey: 'showtimeId' });

  return {
    User,
    Movie,
    Theater,
    Showtime,
    Seat,
    Reservation,
    ReservedSeat
  };
};