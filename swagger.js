const swaggerJsdoc = require('swagger-jsdoc');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Movie Reservation API',
      version: '1.0.0',
      description: 'API documentation for the Movie Reservation System'
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local server'
      },
       {
        url: 'https://movie-reservation-api-h99d.onrender.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },

  // VERY IMPORTANT: where swagger looks for comments
  apis: ['./routes/*.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

module.exports = swaggerSpec;
