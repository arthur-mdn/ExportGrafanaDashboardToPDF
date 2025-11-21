const { createLogger, format, transports } = require('winston');

const logLevel = process.env.DEBUG_MODE === 'true' ? 'debug' : 'info';

const logger = createLogger({
    level: logLevel,
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.splat(),
        format.printf(({ timestamp, level, message, stack }) =>
            stack ? `${timestamp} [${level.toUpperCase()}] ${message} - ${stack}` :
                `${timestamp} [${level.toUpperCase()}] ${message}`
        )
    ),
    transports: [new transports.Console()]
});

module.exports = logger;